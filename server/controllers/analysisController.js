import puppeteer from 'puppeteer';
import lighthouse from 'lighthouse';
import pidusage from 'pidusage';
import dns from 'node:dns/promises';
import net from 'node:net';
import analysisModel from '../models/analysisModel.js';

// Keep in sync with STEP_TIME / LIGHTHOUSE_AUDIT_SECONDS on the client (Home.jsx / AppContext.jsx)
const STEP_TIME_SECONDS = { scroll: 1, hover: 0.5, click: 3, search: 2, login: 8, goBack: 3, switchTab: 0.5 };
// A search step's flat estimate above assumes no submit — a submit button or Enter
// checkbox adds a navigation wait, same ballpark as login's, so budget it like login
// instead of undercounting it as a plain 2s type-and-click.
const stepTimeSeconds = (item) =>
    item.type === 'search' && (item.submitSelector || item.pressEnter)
        ? STEP_TIME_SECONDS.login
        : (STEP_TIME_SECONDS[item.type] || 1);
// Measured directly against real sites (browser launch + a 3-category audit:
// performance/accessibility/seo) — ranged ~9-18.5s; 12 is a middle-ground estimate,
// not a tight bound. Lighthouse timing is inherently variable per-site, so this is
// informational (shown to the user, used as Total Duration's floor) rather than
// something the request is ever strictly bounded by.
const LIGHTHOUSE_AUDIT_SECONDS = 12;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Blocks Puppeteer/Lighthouse from being pointed at internal infrastructure
// (loopback, private LAN ranges, link-local/cloud metadata addresses like
// 169.254.169.254) — without this, "analyze any URL" is a server-side request
// forgery primitive that lets any registered user probe the internal network
// through this server.
function isPrivateIp(ip) {
    if (net.isIPv4(ip)) {
        const [a, b] = ip.split('.').map(Number);
        return a === 10
            || (a === 172 && b >= 16 && b <= 31)
            || (a === 192 && b === 168)
            || a === 127
            || (a === 169 && b === 254)
            || a === 0
            || (a === 100 && b >= 64 && b <= 127); // carrier-grade NAT
    }
    if (net.isIPv6(ip)) {
        const lower = ip.toLowerCase();
        return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
    }
    return true; // unrecognized address shape — block rather than risk it
}

async function assertPublicUrl(rawUrl) {
    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch {
        throw new Error('Invalid URL');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Only http:// and https:// URLs are allowed');
    }
    let addresses;
    try {
        addresses = await dns.lookup(parsed.hostname, { all: true });
    } catch {
        throw new Error('Could not resolve host');
    }
    if (!addresses.length || addresses.some(a => isPrivateIp(a.address))) {
        throw new Error('URL resolves to a disallowed address');
    }
}

async function runStep(tabState, step) {
    const page = tabState.active;
    const pagesBefore = tabState.pages.length;
    switch (step.type) {

        case 'login': {
            const emailEl = await page.waitForSelector(step.emailSelector, { timeout: 10000 });
            await emailEl.type(step.email);
            const passwordEl = await page.waitForSelector(step.passwordSelector, { timeout: 10000 });
            await passwordEl.type(step.password);
            const submitEl = await page.waitForSelector(step.submitSelector, { timeout: 10000 });
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
                submitEl.click(),
            ]);
            break;
        }

        case 'scroll':
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await sleep(500);
            await page.evaluate(() => window.scrollTo(0, 0));
            break;

        case 'hover': {
            const el = await page.waitForSelector(step.selector, { timeout: 10000 }).catch(() => null);
            if (el) await el.hover();
            else return `Hover: "${step.selector}" not found`;
            break;
        }

        case 'click': {
            const el = await page.waitForSelector(step.selector, { timeout: 10000 }).catch(() => null);
            if (el) await el.click();
            else return `Click: "${step.selector}" not found`;
            break;
        }

        case 'search': {
            const el = await page.waitForSelector(step.selector, { timeout: 10000 }).catch(() => null);
            if (el) {
                await el.click();
                await el.type(step.query);
            } else {
                return `Search: "${step.selector}" not found`;
            }
            // Submitting is optional — some sites search on Enter, some need a button
            // click, and some don't need submitting at all (e.g. live-filtering a list).
            // A submit button, if given, takes priority over pressing Enter — the client
            // already disables the Enter checkbox once a button selector is entered.
            if (step.submitSelector) {
                const submitEl = await page.waitForSelector(step.submitSelector, { timeout: 10000 }).catch(() => null);
                if (submitEl) {
                    await Promise.all([
                        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {}),
                        submitEl.click(),
                    ]);
                } else {
                    return `Search: submit button "${step.submitSelector}" not found`;
                }
            } else if (step.pressEnter) {
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {}),
                    page.keyboard.press('Enter'),
                ]);
            }
            break;
        }

        case 'goBack':
            await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 });
            break;

        case 'switchTab': {
            const idx = Number(step.tabIndex);
            // A tab opened by the step right before this one may not be registered
            // yet — targetcreated is an async browser event that can land a beat
            // after the step that triggered it already resolved — so give it a
            // short window rather than failing immediately.
            const deadline = Date.now() + 5000;
            let target = tabState.pages[idx];
            while (!target && Date.now() < deadline) {
                await sleep(100);
                target = tabState.pages[idx];
            }
            if (!target || target.isClosed()) {
                return `Switch Tab: tab ${step.tabIndex} is not open`;
            }
            await target.bringToFront();
            tabState.active = target;
            break;
        }
    }
    // click/search/login are the step types that involve a real user-gesture-style
    // interaction, so they're the ones that can trigger a new tab opening — give the
    // browser's async targetcreated event a short, bounded window (typically landing
    // within tens of milliseconds) to arrive before moving on, so the *next* step or
    // analyse sample reliably reflects a tab that just opened, without needing an
    // explicit 'switchTab' step for the common case. A no-op almost instantly if
    // nothing new opened, since it only waits while the tab count hasn't changed yet.
    if (['click', 'search', 'login'].includes(step.type)) {
        const deadline = Date.now() + 300;
        while (tabState.pages.length === pagesBefore && Date.now() < deadline) {
            await sleep(25);
        }
    }
    return null;
}

// Chrome's per-tab "Memory footprint" column in Task Manager isn't exposed by
// page.metrics() — that only reports the V8 JS heap. The real OS-level figure
// is the RSS of the renderer process(es) backing this page, which we get by
// asking CDP's SystemInfo domain for the renderer PID(s), then reading actual
// OS memory for those PIDs via pidusage (CDP alone doesn't return RSS bytes).
async function getRendererMemoryMB(client) {
    try {
        const { processInfo } = await client.send('SystemInfo.getProcessInfo');
        const rendererPids = processInfo.filter(p => p.type === 'renderer').map(p => p.id);
        if (!rendererPids.length) return null;
        const stats = await pidusage(rendererPids);
        const totalBytes = Object.values(stats).reduce((sum, s) => sum + (s?.memory || 0), 0);
        return +(totalBytes / 1024 / 1024).toFixed(2);
    } catch {
        // A renderer PID can exit between SystemInfo.getProcessInfo and pidusage
        // (e.g. mid-navigation) — treat that as "no reading this tick" rather
        // than failing the whole capture.
        return null;
    }
}

async function runLighthouse(url, res) {
    // req's 'close' event fires as soon as the request body is fully received — which
    // happens almost instantly, regardless of whether the client is still around — so it
    // can't tell us anything about the client leaving. res's 'close' event is the real
    // signal: per Node's docs it fires when the underlying connection was terminated
    // *before* the response could be sent, which is exactly "client walked away mid-request."
    // The listener is attached before the first await so a disconnect during browser launch
    // isn't missed.
    let clientDisconnected = false;
    let lhBrowser;
    const onClientClose = () => {
        if (res.writableEnded) return; // connection closing after a normal response, not a real disconnect
        clientDisconnected = true;
        lhBrowser?.close().catch(() => {});
    };
    res?.on('close', onClientClose);
    try {
        lhBrowser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        if (clientDisconnected) return null;
        const lhr = await lighthouse(url, {
            port: new URL(lhBrowser.wsEndpoint()).port,
            output: 'json',
            onlyCategories: ['performance', 'accessibility', 'seo']
        });
        return {
            lcp:                lhr.lhr.audits['largest-contentful-paint'].numericValue,
            cls:                lhr.lhr.audits['cumulative-layout-shift'].numericValue,
            ttfb:               lhr.lhr.audits['server-response-time'].numericValue,
            fcp:                lhr.lhr.audits['first-contentful-paint'].numericValue,
            tbt:                lhr.lhr.audits['total-blocking-time'].numericValue,
            speedIndex:         lhr.lhr.audits['speed-index'].numericValue,
            seoScore:           Math.round(lhr.lhr.categories.seo.score * 100),
            accessibilityScore: Math.round(lhr.lhr.categories.accessibility.score * 100),
        };
    } catch (e) {
        if (clientDisconnected) return null;
        throw e;
    } finally {
        res?.off('close', onClientClose);
        // Closing an already-closed browser (disconnect path above already closed it)
        // is expected and fine; anything else is worth a trace since it's otherwise invisible.
        try { await lhBrowser?.close(); } catch (e) { console.error('lhBrowser.close() failed:', e.message); }
    }
}

async function runSequence(url, sequence, totalDurationMs, mode, res) {
    const results = [];
    const warnings = [];
    let runCounter = 0;
    let loginFailed = false;
    let browserDisconnected = false;
    let browser;

    // Attached before any await (including the browser launch below) so a disconnect
    // during startup isn't missed. See runLighthouse for why this listens on `res`
    // rather than `req`.
    let clientDisconnected = false;
    let resolveDisconnect;
    const disconnected = new Promise(resolve => { resolveDisconnect = resolve; });
    const onClientClose = () => {
        if (res.writableEnded) return; // connection closing after a normal response, not a real disconnect
        clientDisconnected = true;
        resolveDisconnect();
        // Close immediately rather than waiting for the Promise.race below, so a disconnect
        // during page load (before that race even starts) doesn't leave Chrome running.
        browser?.close().catch(() => {});
    };
    res?.on('close', onClientClose);

    browser = await puppeteer.launch({
        headless: mode === 'manual' ? false : 'new',
        // Without this, Puppeteer pins the page viewport to its 800x600 default
        // regardless of the actual Chrome window size — null lets the page fill
        // whatever window Chrome opens (maximized, below).
        defaultViewport: mode === 'manual' ? null : undefined,
        // Chrome keeps a warm "spare" renderer process around for the next navigation,
        // separate from any tab's actual renderer — left enabled, SystemInfo.getProcessInfo
        // reports it alongside our page's renderer and inflates the memory reading below.
        args: [
            '--no-sandbox', '--disable-setuid-sandbox', '--disable-features=SpareRendererForSitePerProcess',
            ...(mode === 'manual' ? ['--start-maximized'] : []),
        ]
    });
    if (clientDisconnected) {
        res?.off('close', onClientClose);
        return { results, warnings };
    }
    try {
        // Start from Chromium's own default tab; more may join below if the site
        // itself opens new ones (target="_blank", window.open, a form target).
        const page = (await browser.pages())[0];
        // SystemInfo.getProcessInfo is a browser-level CDP method — a page-level
        // session (page.target().createCDPSession()) rejects it with "only supported
        // on the browser target". It also reports every renderer process in the
        // browser, not just one tab's — since every tab tracked in tabState (below)
        // is meant to be part of this analysis, that's the desired total, though it
        // means processMemoryMB is a whole-browser figure, not a per-tab one; Chrome
        // doesn't expose a reliable tab→renderer-PID mapping to attribute it more
        // precisely than that.
        const client = await browser.target().createCDPSession();

        // A URL can pass the upfront assertPublicUrl check in analyzeWebsite and still
        // redirect to an internal address once Chrome actually navigates — re-validate
        // every main-frame navigation (including each redirect hop) here, not just the
        // original request. Applied to every tracked tab via attachTab below, not just
        // this one, since a popup can navigate anywhere too.
        const guardNavigation = async (p) => {
            await p.setRequestInterception(true);
            p.on('request', (request) => {
                if (request.isNavigationRequest() && request.frame() === p.mainFrame()) {
                    assertPublicUrl(request.url()).then(() => request.continue(), () => request.abort('blockedbyclient'));
                } else {
                    request.continue();
                }
            });
        };

        // Tracks every tab seen so far (by the order it was opened, so a 'switchTab'
        // step can address one by index) and which one is currently "active" — the
        // one runStep acts on and the analyse loop below samples. A tab reports
        // itself active via its own Visibility API: that fires both when a human
        // switches tabs directly in a live/manual session's visible Chrome window
        // and when page.bringToFront() runs (used by the 'switchTab' step), so
        // scripted and human-driven switching both flow through this one mechanism.
        //
        // A brand-new tab is handled separately (see targetcreated below) rather
        // than relying on that same visibility script: evaluateOnNewDocument only
        // affects *future* navigations, and a popup's target is typically already
        // mid-navigation (or done) by the time our targetcreated handler gets a
        // Page object for it, so the injected listener never fires on that tab's
        // first document at all. New tabs are focused by default when opened via
        // target="_blank"/window.open — the previously-active tab reliably reports
        // itself hidden the instant the new one is created — so it's set active
        // immediately instead.
        // Remembers each tab's opener (the tab it was opened from, one level only —
        // not the full chain) so a closed tab can fall back to the specific tab that
        // spawned it, rather than always jumping straight to the original tab.
        const tabState = { pages: [page], active: page, openerOf: new Map() };

        // If the currently-active tab closes (site-closed, user-closed, or a popup
        // that closes itself — Puppeteer/CDP doesn't distinguish why), picks
        // somewhere sensible to fall back to: the tab that opened it, if that's
        // still around, else the original tab, else whatever else is still open.
        // Used both reactively (the 'close' listener below, for the common case)
        // and as a backstop (the analyse loop's catch block, for a tab that closes
        // too fast for its own 'close' listener to even get attached).
        const pickFallbackTab = (closedPage) => {
            const opener = tabState.openerOf.get(closedPage);
            if (opener && !opener.isClosed()) return opener;
            if (!tabState.pages[0].isClosed()) return tabState.pages[0];
            return tabState.pages.find(p => !p.isClosed()) ?? null;
        };

        const attachTab = async (p) => {
            await guardNavigation(p);
            await p.exposeFunction('__reportTabVisibility', (state) => {
                if (state === 'visible') tabState.active = p;
            });
            const trackVisibility = () => {
                document.addEventListener('visibilitychange', () => window.__reportTabVisibility(document.visibilityState));
                window.__reportTabVisibility(document.visibilityState);
            };
            await p.evaluateOnNewDocument(trackVisibility);
            // Also attach directly to whatever's already loaded right now — covers
            // both the original tab (already loaded before this runs) and a new
            // tab whose first navigation evaluateOnNewDocument above missed.
            await p.evaluate(trackVisibility).catch(() => {});
            p.on('close', () => {
                if (tabState.active !== p) return;
                const fallback = pickFallbackTab(p);
                if (fallback) tabState.active = fallback;
            });
        };
        await attachTab(page);
        browser.on('targetcreated', async (target) => {
            if (target.type() !== 'page') return;
            const newPage = await target.page();
            if (!newPage) return;
            tabState.pages.push(newPage);
            const openerTarget = target.opener();
            if (openerTarget) {
                const openerPage = await openerTarget.page().catch(() => null);
                if (openerPage) tabState.openerOf.set(newPage, openerPage);
            }
            // Set active immediately (see comment above) rather than waiting on
            // attachTab's several CDP round-trips to finish.
            tabState.active = newPage;
            await attachTab(newPage).catch(() => {});
        });

        try {
            // Total Duration doesn't bound page load (its clock starts once loading
            // finishes — see sessionStart below), so navigation needs its own explicit
            // ceiling here — otherwise a page that never quite goes network-idle
            // (persistent polling, websockets, etc.) could hang the request indefinitely.
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
        } catch (e) {
            // A disconnect mid-load closes the browser above, which makes this reject —
            // that's expected and not a real failure, so don't let it escape as one.
            if (clientDisconnected) return { results, warnings };
            throw e;
        }

        // Total Duration's clock starts here, once the page has actually finished
        // loading — not at browser launch or navigation start — so the sequence and
        // analyse block below get the *full* configured duration for themselves,
        // regardless of how long this particular site took to load.
        const sessionStart = Date.now();

        const runAllItems = async () => {
            for (const item of sequence) {
                if (item.type === 'analyse') {
                    const intervalMs = (Number(item.intervalTime) || 1) * 1000;
                    const unbounded = item.intervals === 'unbounded';
                    const count = unbounded ? Infinity : Number(item.intervals);
                    let captured = 0;
                    // Normalize the sentinel to a real number immediately, so a live
                    // session that captures zero samples (e.g. the window is closed
                    // before the first interval) is still saved/returned as `0`,
                    // never as the literal string 'unbounded'.
                    if (unbounded) item.intervals = captured;
                    for (let i = 0; i < count; i++) {
                        // The deadline already fired: stop before attempting another
                        // capture instead of letting this loop run past runSequence's
                        // own browser.close() and misreport a real disconnect.
                        if (timedOut || clientDisconnected) return;
                        const slotStart = Date.now();
                        // Snapshot which tab is active for this whole tick, so a switch that
                        // lands mid-capture can't mix metrics from one tab with the URL of
                        // another.
                        const activePage = tabState.active;
                        let metrics;
                        try {
                            metrics = await activePage.metrics();
                        } catch (e) {
                            if (timedOut || clientDisconnected) return;
                            // The active tab may have just closed (site-closed, user-closed,
                            // or a self-closing popup that beat its own 'close' listener —
                            // see pickFallbackTab) rather than the whole browser being gone.
                            // Recover onto another still-open tab if one exists; only treat
                            // this as a real disconnect once nothing tracked is left open.
                            const fallback = pickFallbackTab(activePage);
                            if (fallback) {
                                tabState.active = fallback;
                                warnings.push(`A tracked tab closed mid-capture; run ${runCounter + 1} was skipped, continuing on another tab. (${e.message})`);
                                const remaining = intervalMs - (Date.now() - slotStart);
                                if (remaining > 0) await sleep(remaining);
                                continue;
                            }
                            browserDisconnected = true;
                            warnings.push(mode === 'manual'
                                ? `Browser window was closed before Total Duration elapsed; results reflect runtime up to that point. (${e.message})`
                                : `Lost connection to the page before Total Duration elapsed; results reflect runtime up to that point. (${e.message})`);
                            return;
                        }
                        const processMemoryMB = await getRendererMemoryMB(client);
                        runCounter++;
                        captured++;
                        // Keep the sequence's declared count in sync with what was actually
                        // captured, so an 'unbounded' live-session block (and any run cut
                        // short by the deadline race below) is saved/returned with a real
                        // number instead of the sentinel string.
                        if (unbounded) item.intervals = captured;
                        results.push({
                            run:              runCounter,
                            timestamp:        new Date().toISOString(),
                            url:              activePage.url(),
                            scriptDuration:   metrics.ScriptDuration,
                            taskDuration:     metrics.TaskDuration,
                            layoutDuration:   metrics.LayoutDuration,
                            jsHeapUsedSize:   metrics.JSHeapUsedSize,
                            domNodes:         metrics.Nodes,
                            jsEventListeners: metrics.JSEventListeners,
                            processMemoryMB,
                        });
                        // intervalTime is measured start-to-start, so the metrics capture
                        // itself eats into the interval rather than extending it.
                        const remaining = intervalMs - (Date.now() - slotStart);
                        if (remaining > 0) await sleep(remaining);
                    }
                } else if (loginFailed) {
                    warnings.push(`${item.type} skipped: an earlier login step failed`);
                } else {
                    try {
                        const warning = await runStep(tabState, item);
                        if (warning) warnings.push(warning);
                    } catch (e) {
                        warnings.push(`${item.type} failed: ${e.message}`);
                        if (item.type === 'login') loginFailed = true;
                    }
                }
            }
        };

        // Total Duration is a hard ceiling: race the sequence against the deadline so a
        // slow/hung step (or an unbounded live-session analyse block) can't push the real
        // session past what the user requested. If the deadline wins, we stop waiting on
        // the sequence (its in-flight step, if any, gets cut short once the browser closes
        // below) instead of only checking after the fact.
        let timedOut = false;

        const deadlineMs = Math.max(0, totalDurationMs - (Date.now() - sessionStart));
        const timeout = sleep(deadlineMs).then(() => { timedOut = true; });
        const sequenceDone = runAllItems().catch(e => { warnings.push(`Sequence error: ${e.message}`); });
        await Promise.race([sequenceDone, timeout, disconnected]);

        if (browserDisconnected || clientDisconnected) {
            // Nothing left to capture or wait for — the page/browser or the client is already gone.
        } else if (timedOut) {
            // For a manual live session the analyse block is deliberately unbounded, so
            // running out the clock is the normal/expected way it ends, not a fault.
            if (mode !== 'manual') {
                warnings.push('Sequence did not finish within the Total Duration budget; remaining steps were skipped.');
            }
        } else {
            // Keep the site open until the user's requested total duration has elapsed
            const remainingSessionTime = totalDurationMs - (Date.now() - sessionStart);
            if (remainingSessionTime > 0) await sleep(remainingSessionTime);
        }
    } finally {
        res?.off('close', onClientClose);
        // Closing an already-closed browser (e.g. the user closed the window) is expected
        // and fine; anything else is worth a trace since it's otherwise invisible.
        try { await browser.close(); } catch (e) { console.error('browser.close() failed:', e.message); }
    }

    return { results, warnings };
}

// Login-step credentials are only needed transiently, to drive Puppeteer through
// runStep() — they must never reach the database or a response body, or a user
// testing a real login-gated page ends up with that site's real password sitting
// in our DB in plaintext and echoed back over the network on every fetch.
const redactSequence = (sequence) =>
    sequence.map(item => {
        if (item.type !== 'login') return item;
        const { email, password, ...rest } = item;
        return rest;
    });

async function analyzeOverTime(url, sequence, totalDurationMs, mode, res) {
    const [lighthouseData, { results: runtimeData, warnings }] = await Promise.all([
        runLighthouse(url, res),
        runSequence(url, sequence, totalDurationMs, mode, res),
    ]);

    return { url, totalRuns: runtimeData.length, lighthouseData, runtimeData, warnings };
}

const analyzeWebsite = async (req, res) => {
    // A reload/close mid-analysis is treated as a full cancel: nothing gets saved and
    // nothing gets sent back, rather than trying to persist whatever partial data was
    // captured before the disconnect.
    let clientLeft = false;
    res.on('close', () => { if (!res.writableEnded) clientLeft = true; });
    try {
        const { url, sequence = [], totalDuration, mode: rawMode } = req.body;
        const mode = rawMode === 'manual' ? 'manual' : 'auto';

        if (!url) return res.status(400).json({ success: false, message: 'url is required' });

        try {
            await assertPublicUrl(url);
        } catch (e) {
            return res.status(400).json({ success: false, message: e.message });
        }

        const totalDurationSeconds = Number(totalDuration);
        if (!totalDurationSeconds || totalDurationSeconds < 1) {
            return res.status(400).json({ success: false, message: 'totalDuration (seconds) is required' });
        }

        // Total Duration doesn't need to cover page load — the session's clock only
        // starts once the page has actually finished loading (see sessionStart in
        // runSequence), so the floor here is just "long enough for a full Lighthouse
        // audit," which runs independently and in parallel regardless.
        const minDurationSeconds = LIGHTHOUSE_AUDIT_SECONDS;

        if (mode === 'manual') {
            // A live session is an intentionally-unbounded capture block, so the
            // fixed-cost budget check below doesn't apply — just make sure the
            // duration covers a full Lighthouse audit, and there's a usable interval.
            if (totalDurationSeconds < minDurationSeconds) {
                return res.status(400).json({ success: false, message: `totalDuration must be at least ${minDurationSeconds}s` });
            }
            if (sequence.some(item => item.type !== 'analyse')) {
                return res.status(400).json({ success: false, message: 'A live session only supports a single analyse block, not action steps' });
            }
            const analyseItem = sequence.find(item => item.type === 'analyse');
            if (!analyseItem || !(Number(analyseItem.intervalTime) >= 1)) {
                return res.status(400).json({ success: false, message: 'intervalTime (seconds) is required for a live session' });
            }
            // Without this, an interval longer than the whole session produces at
            // most one sample, silently — better to reject it upfront.
            if (Number(analyseItem.intervalTime) > totalDurationSeconds) {
                return res.status(400).json({ success: false, message: 'intervalTime cannot be longer than totalDuration' });
            }
        } else {
            const actionSeconds = sequence
                .filter(item => item.type !== 'analyse')
                .reduce((sum, item) => sum + stepTimeSeconds(item), 0);

            const captureSeconds = sequence
                .filter(item => item.type === 'analyse')
                .reduce((sum, item) => sum + Number(item.intervals) * (Number(item.intervalTime) || 1), 0);

            // Two distinct reasons Total Duration can be too short — kept separate so
            // the error actually matches the problem, instead of always blaming the
            // sequence for what's really the Lighthouse-audit floor.
            if (totalDurationSeconds < minDurationSeconds) {
                return res.status(400).json({
                    success: false,
                    message: `Total Duration must be at least ${minDurationSeconds}s (Lighthouse audit). Increase the duration.`,
                });
            }

            const neededSeconds = actionSeconds + captureSeconds;
            if (neededSeconds > totalDurationSeconds) {
                return res.status(400).json({
                    success: false,
                    message: `Sequence needs ~${neededSeconds}s to complete, which exceeds the ${totalDurationSeconds}s total duration. Increase the duration or review your sequence.`,
                });
            }
        }

        const data = await analyzeOverTime(url, sequence, totalDurationSeconds * 1000, mode, res);
        if (clientLeft) return; // nothing to save or send — the client already cancelled
        const { warnings, ...dbData } = data;
        // The raw `sequence` (with real credentials, needed above to drive the login
        // step) must never be persisted or sent back — only this redacted copy is.
        const safeSequence = redactSequence(sequence);
        await analysisModel.create({ ...dbData, sequence: safeSequence, mode, totalDuration: totalDurationSeconds, userId: req.userId });
        return res.json({ success: true, data: { ...data, sequence: safeSequence, mode, totalDuration: totalDurationSeconds } });

    } catch (error) {
        if (clientLeft) return; // the disconnect itself can surface as a rejected promise here — expected, not a real failure
        console.error('Analysis error:', error.message);
        return res.status(500).json({ success: false, message: 'Failed to analyze URL', details: error.message });
    }
};

export const getSingleAnalysis = async (req, res) => {
    try {
        const analysis = await analysisModel.findOne({ _id: req.params.id, userId: req.userId });
        if (!analysis) return res.status(404).json({ success: false, message: 'Not found' });
        res.json({ success: true, data: analysis });
    } catch (e) {
        console.error('Failed to load analysis:', e.message);
        res.status(500).json({ success: false, message: 'Failed to load analysis' });
    }
};

export const getUserAnalyses = async (req, res) => {
    try {
        const analyses = await analysisModel
            .find({ userId: req.userId })
            .sort({ createdAt: -1 })
            .select('url lighthouseData createdAt totalRuns sequence mode totalDuration');
        res.json({ success: true, data: analyses });
    } catch (e) {
        console.error('Failed to load analyses:', e.message);
        res.status(500).json({ success: false, message: 'Failed to load analyses' });
    }
};

export const deleteAnalysis = async (req, res) => {
    try {
        const analysis = await analysisModel.findOneAndDelete({ _id: req.params.id, userId: req.userId });
        if (!analysis) return res.status(404).json({ success: false, message: 'Not found' });
        res.json({ success: true });
    } catch (e) {
        console.error('Failed to delete analysis:', e.message);
        res.status(500).json({ success: false, message: 'Failed to delete analysis' });
    }
};

export default analyzeWebsite;
