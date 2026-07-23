import puppeteer from 'puppeteer';
import lighthouse from 'lighthouse';
import pidusage from 'pidusage';
import dns from 'node:dns/promises';
import net from 'node:net';
import analysisModel from '../models/analysisModel.js';

// Keep in sync with STEP_TIME / PAGE_LOAD_ESTIMATE_SECONDS / LIGHTHOUSE_AUDIT_SECONDS on the client (Home.jsx / AppContext.jsx)
const STEP_TIME_SECONDS = { scroll: 1, hover: 0.5, click: 3, search: 2, login: 8, goBack: 3 };
const PAGE_LOAD_ESTIMATE_SECONDS = 8;
const LIGHTHOUSE_AUDIT_SECONDS = 7;

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

async function runStep(page, step) {
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
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {}),
                    page.keyboard.press('Enter'),
                ]);
            } else {
                return `Search: "${step.selector}" not found`;
            }
            break;
        }

        case 'goBack':
            await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 });
            break;
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

async function runLighthouse(url) {
    const lhBrowser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    try {
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
    } finally {
        await lhBrowser.close();
    }
}

async function runSequence(url, sequence, totalDurationMs, mode) {
    const results = [];
    const warnings = [];
    let runCounter = 0;
    let loginFailed = false;
    let browserDisconnected = false;

    const browser = await puppeteer.launch({
        headless: mode === 'manual' ? false : 'new',
        // Chrome keeps a warm "spare" renderer process around for the next navigation,
        // separate from any tab's actual renderer — left enabled, SystemInfo.getProcessInfo
        // reports it alongside our page's renderer and inflates the memory reading below.
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-features=SpareRendererForSitePerProcess']
    });
    try {
        // Reuse Chromium's own default tab instead of opening a second one via
        // newPage() — with two tabs open, SystemInfo.getProcessInfo can't tell which
        // renderer is "ours", so we'd be summing in an idle blank tab's memory too.
        const page = (await browser.pages())[0];
        // SystemInfo.getProcessInfo is a browser-level CDP method — a page-level
        // session (page.target().createCDPSession()) rejects it with "only supported
        // on the browser target".
        const client = await browser.target().createCDPSession();
        const sessionStart = Date.now();

        // A URL can pass the upfront assertPublicUrl check in analyzeWebsite and still
        // redirect to an internal address once Chrome actually navigates — re-validate
        // every main-frame navigation (including each redirect hop) here, not just the
        // original request.
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
                assertPublicUrl(request.url()).then(() => request.continue(), () => request.abort('blockedbyclient'));
            } else {
                request.continue();
            }
        });

        await page.goto(url, { waitUntil: 'networkidle2' });

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
                        if (timedOut) return;
                        const slotStart = Date.now();
                        let metrics;
                        try {
                            metrics = await page.metrics();
                        } catch (e) {
                            if (timedOut) return;
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
                            url:              page.url(),
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
                        const warning = await runStep(page, item);
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
        await Promise.race([sequenceDone, timeout]);

        if (browserDisconnected) {
            // Nothing left to capture or wait for — the page/browser is already gone.
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

async function analyzeOverTime(url, sequence, totalDurationMs, mode) {
    const [lighthouseData, { results: runtimeData, warnings }] = await Promise.all([
        runLighthouse(url),
        runSequence(url, sequence, totalDurationMs, mode),
    ]);

    return { url, totalRuns: runtimeData.length, lighthouseData, runtimeData, warnings };
}

const analyzeWebsite = async (req, res) => {
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

        // Same floor in both modes: even a trivial request still needs a page load and
        // a full Lighthouse audit, so nothing gets accepted below that regardless of
        // how little the rest of the sequence needs.
        const minDurationSeconds = PAGE_LOAD_ESTIMATE_SECONDS + LIGHTHOUSE_AUDIT_SECONDS;

        if (mode === 'manual') {
            // A live session is an intentionally-unbounded capture block, so the
            // fixed-cost budget check below doesn't apply — just make sure the
            // duration covers page load + Lighthouse, and there's a usable interval.
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
        } else {
            const actionSeconds = sequence
                .filter(item => item.type !== 'analyse')
                .reduce((sum, item) => sum + (STEP_TIME_SECONDS[item.type] || 1), 0);

            const captureSeconds = sequence
                .filter(item => item.type === 'analyse')
                .reduce((sum, item) => sum + Number(item.intervals) * (Number(item.intervalTime) || 1), 0);

            const neededSeconds = Math.max(minDurationSeconds, PAGE_LOAD_ESTIMATE_SECONDS + actionSeconds + captureSeconds);

            if (neededSeconds > totalDurationSeconds) {
                return res.status(400).json({
                    success: false,
                    message: `Sequence needs ~${neededSeconds}s to complete, which exceeds the ${totalDurationSeconds}s total duration. Increase the duration or review your sequence.`,
                });
            }
        }

        const data = await analyzeOverTime(url, sequence, totalDurationSeconds * 1000, mode);
        const { warnings, ...dbData } = data;
        // The raw `sequence` (with real credentials, needed above to drive the login
        // step) must never be persisted or sent back — only this redacted copy is.
        const safeSequence = redactSequence(sequence);
        await analysisModel.create({ ...dbData, sequence: safeSequence, mode, totalDuration: totalDurationSeconds, userId: req.userId });
        return res.json({ success: true, data: { ...data, sequence: safeSequence, mode, totalDuration: totalDurationSeconds } });

    } catch (error) {
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
        res.status(500).json({ success: false, message: e.message });
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
        res.status(500).json({ success: false, message: e.message });
    }
};

export const deleteAnalysis = async (req, res) => {
    try {
        const analysis = await analysisModel.findOneAndDelete({ _id: req.params.id, userId: req.userId });
        if (!analysis) return res.status(404).json({ success: false, message: 'Not found' });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

export default analyzeWebsite;
