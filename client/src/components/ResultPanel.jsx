import { useEffect, useRef, useState } from 'react'
import {
    LineChart, Line, AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { lighthouseMetrics } from '../assets/assets'
import { buildBlocks, withTiming, formatElapsed } from '../utils/blocks'

/* ── helpers ─────────────────────────────────────────────── */

// Minimum Y-axis span per metric family (see zoomedDomain below) — how tight the axis
// is allowed to zoom before a flat-looking line is just noise being exaggerated.
const MIN_SPAN_MS    = 40  // Script/Task/Layout Duration
const MIN_SPAN_MB    = 2   // JS Heap / Process Memory
const MIN_SPAN_COUNT = 20  // DOM Nodes / Event Listeners

const getStatus = (key, value) => {
    const m = lighthouseMetrics.find(m => m.key === key)
    if (!m) return 'neutral'
    if (value <= m.good) return 'good'
    if (value <= m.warn) return 'warn'
    return 'poor'
}

const STATUS = {
    good:    { value: 'text-green-700',  badge: 'text-green-700 bg-green-50 border-green-200',  border: 'border-l-green-500',  label: 'Good' },
    warn:    { value: 'text-amber-600',  badge: 'text-amber-600 bg-amber-50 border-amber-200',  border: 'border-l-amber-400',  label: 'Needs Improvement' },
    poor:    { value: 'text-red-600',    badge: 'text-red-600 bg-red-50 border-red-200',        border: 'border-l-red-500',    label: 'Poor' },
    neutral: { value: 'text-gray-600',   badge: 'text-gray-500 bg-gray-50 border-gray-200',    border: 'border-l-gray-200',   label: '' },
}

const scoreColor  = s => s >= 90 ? '#16a34a' : s >= 50 ? '#d97706' : '#dc2626'
const scoreBadge  = s => s >= 90
    ? 'text-green-700 bg-green-50 border-green-200'
    : s >= 50
        ? 'text-amber-600 bg-amber-50 border-amber-200'
        : 'text-red-600 bg-red-50 border-red-200'
const scoreLabel  = s => s >= 90 ? 'Good' : s >= 50 ? 'Needs Improvement' : 'Poor'

const tooltipStyle = {
    // whiteSpace overrides recharts' own default of 'nowrap', which otherwise
    // gets inherited by the URL text below and silently defeats break-all.
    contentStyle: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 12, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.07)', whiteSpace: 'normal' },
    labelStyle:   { color: '#111827', fontWeight: 600 },
    itemStyle:    { color: '#374151' },
    // Pin to the top of the chart instead of following the cursor vertically —
    // with full (non-truncated) URLs the box can span several lines, and
    // tracking the cursor would let it sit right on top of the hovered point.
    position: { y: 0 },
    // Prefer the left side of the cursor. Our charts scroll horizontally past
    // their visible width, and recharts only knows the *full* chart's bounds
    // (not our external scroll clipping) — placing right-first regularly pushed
    // the box into the not-yet-scrolled-into-view (and thus clipped) region.
    // Everything to the left of the cursor has already been scrolled past, so
    // it's always visible.
    reverseDirection: { x: true },
}
const axisProps = { stroke: 'transparent', tick: { fill: '#9ca3af', fontSize: 11 } }
const intervalAxisProps = {
    ...axisProps,
    type: 'number',
    domain: ['dataMin', 'dataMax'],
    allowDecimals: false,
    interval: 0,
    tickFormatter: v => `#${v}`,
}
// Used only inside the fixed y-axis panel's own chart, to keep its x-scale/margins
// identical to the scrollable chart without rendering a second visible x-axis.
// hide:true skips reserving the axis's layout height entirely (regardless of the height
// prop's value), while the real chart's visible XAxis does reserve its default 30px — so
// the two side-by-side charts ended up with different plot heights despite identical
// margins, and this panel's "0" gridline sat 30px below the real chart's. Disabling the
// visible pieces individually (instead of `hide`) keeps this axis "active" for layout so
// both charts reserve the same space, while still rendering nothing.
const hiddenXAxisProps = { type: 'number', domain: ['dataMin', 'dataMax'], tick: false, axisLine: false, tickLine: false }

const Y_TICK_COUNT = 5

// Rounds a rough step (span / (tickCount-1)) to a "nice" 1/2/5 × power-of-ten value.
const niceStep = (span) => {
    const rough = span / (Y_TICK_COUNT - 1)
    if (rough <= 0) return 1
    const exp = Math.floor(Math.log10(rough))
    const base = 10 ** exp
    const frac = rough / base
    const niceFrac = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10
    return niceFrac * base
}

// Zooms the axis to the data's actual range (with headroom) rather than forcing a 0
// baseline — for a metric like Task Duration hovering at 60-65ms, a 0-800ms axis
// flattens a real 5ms drift into an invisible sliver. The one thing that makes zooming
// risky is a metric that's naturally just noisy — a ±2ms wobble in an otherwise flat
// line would get blown up into what looks like a dramatic spike if the domain zoomed in
// arbitrarily tight. minSpan is the floor against that: the axis never zooms in past a
// range of that size, however flat the actual data is, so jitter can't be mistaken for
// a trend. Values here can't go negative, so the low end never drops below 0 even when
// headroom would otherwise push it there.
//
// Ticks are computed here too, from the same step, instead of leaving Recharts to pick
// its own — its internal "nice step" algorithm doesn't use our 1/2/5 rule, so a domain
// boundary we've already rounded (say, top = 500) can end up out of step with where its
// own tick generator wants to land (stepping by 150: 0, 150, 300, 450, 600) — 600 gets
// clipped for exceeding our domain, and the survivor closest to the boundary (450) then
// gets dropped too for sitting too close to the 500 label, leaving uneven gaps. Deriving
// the step and the domain together means there's nothing left for the two to disagree on.
const zoomedTicks = (data, keys, minSpan) => {
    const values = data.flatMap(d => keys.map(k => d[k])).filter(v => typeof v === 'number' && !Number.isNaN(v))
    let lo = 0
    let hi = minSpan
    if (values.length) {
        lo = Math.min(...values)
        hi = Math.max(...values)
        if (hi - lo < minSpan) {
            const pad = (minSpan - (hi - lo)) / 2
            lo -= pad
            hi += pad
        }
        const headroom = (hi - lo) * 0.1
        lo = Math.max(0, lo - headroom)
        hi += headroom
    }
    const step = niceStep(hi - lo)
    const niceLo = Math.max(0, Math.floor(lo / step) * step)
    // Round off float dust (e.g. 0.1 + 0.2) rather than trusting raw arithmetic.
    return Array.from({ length: Y_TICK_COUNT }, (_, i) => Math.round((niceLo + step * i) * 100) / 100)
}

const zoomedDomain = (data, keys, minSpan) => {
    const ticks = zoomedTicks(data, keys, minSpan)
    return [ticks[0], ticks[ticks.length - 1]]
}

// Caption shown once, centered under the whole chart (fixed axis + scroll area) —
// stays put regardless of horizontal scroll position, unlike an axis label baked
// into the scrollable SVG would.
const IntervalCaption = () => (
    <p className="text-center text-[11px] text-gray-300 mt-1">Interval</p>
)

// One pixel width per interval tick, so with interval=0 (every label forced on)
// there's always enough room for every "#N" label — the chart scrolls
// horizontally instead of crowding or dropping labels on long sessions.
const PX_PER_TICK = 40

// Native scrollbars are unreliable here — macOS/Chrome overlay scrollbars stay
// invisible regardless of CSS. Draw our own track + thumb from actual scroll
// state instead, so the affordance renders identically on every browser/OS.
const ChartScroll = ({ tickCount, children }) => {
    const scrollRef = useRef(null)
    const [overflowing, setOverflowing] = useState(false)
    const [thumb, setThumb] = useState({ left: 0, width: 100 })

    useEffect(() => {
        const el = scrollRef.current
        if (!el) return
        const update = () => {
            const isOverflowing = el.scrollWidth > el.clientWidth + 1
            setOverflowing(isOverflowing)
            if (isOverflowing) {
                setThumb({
                    left: (el.scrollLeft / el.scrollWidth) * 100,
                    width: (el.clientWidth / el.scrollWidth) * 100,
                })
            }
        }
        update()
        el.addEventListener('scroll', update)
        window.addEventListener('resize', update)
        return () => {
            el.removeEventListener('scroll', update)
            window.removeEventListener('resize', update)
        }
    }, [tickCount])

    return (
        <div className="flex-1 min-w-0">
            <div ref={scrollRef} className="overflow-x-auto no-native-scrollbar">
                <div style={{ width: `max(100%, ${tickCount * PX_PER_TICK}px)` }}>
                    {children}
                </div>
            </div>
            {overflowing && (
                <div className="relative h-1 mt-2 rounded-full bg-gray-50 overflow-hidden">
                    <div
                        className="absolute top-0 h-full rounded-full bg-gray-200"
                        style={{ left: `${thumb.left}%`, width: `${thumb.width}%` }}
                    />
                </div>
            )}
        </div>
    )
}

// Renders just the y-axis, pinned outside the horizontally-scrolling chart so it
// never scrolls off screen. Needs an invisible series matching the real chart's
// dataKey(s) — Recharts computes an "auto" domain from the plotted series, not
// the raw data, so without one this axis's scale wouldn't match the real chart.
const FixedYAxis = ({ data, series, unit, tickFormatter, width = 65, height, area = false, minSpan }) => {
    const Chart = area ? AreaChart : LineChart
    const Series = area ? Area : Line
    return (
        <ResponsiveContainer className="shrink-0" width={width} height={height}>
            <Chart data={data} margin={{ top: 10, bottom: 22, right: 0, left: 0 }}>
                <XAxis dataKey="run" {...hiddenXAxisProps} />
                <YAxis {...axisProps} unit={unit} tickFormatter={tickFormatter} width={width}
                    domain={zoomedDomain(data, series, minSpan)} ticks={zoomedTicks(data, series, minSpan)} />
                {series.map(dataKey => (
                    <Series key={dataKey} dataKey={dataKey} stroke="none" fill="none" dot={false} isAnimationActive={false} />
                ))}
            </Chart>
        </ResponsiveContainer>
    )
}

// Shows the interval number and the page URL that was being monitored at that
// point, e.g. "Interval #6" / "https://example.com"
const intervalTooltipLabel = (v, payload) => {
    const p = payload?.[0]?.payload
    return (
        <>
            <span style={{ display: 'block' }}>{`Interval #${v}`}</span>
            {p?.url && (
                <span className="break-all max-w-70" style={{ display: 'block', color: '#9ca3af', fontWeight: 400, marginTop: 2 }}>
                    {p.url}
                </span>
            )}
        </>
    )
}

/* ── sub-components ──────────────────────────────────────── */

const MetricCard = ({ label, value, unit, status, decimals }) => {
    const s = STATUS[status] ?? STATUS.neutral
    return (
        <div className={`bg-white border border-gray-100 border-l-4 ${s.border} rounded-2xl p-5 shadow-sm`}>
            <div className="flex items-start justify-between mb-3">
                <p className="text-xs text-gray-500 leading-snug pr-2">{label}</p>
                <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${s.badge}`}>
                    {s.label}
                </span>
            </div>
            <p className={`text-2xl font-bold leading-none ${s.value}`}>
                {typeof value === 'number' ? value.toFixed(decimals) : value}
                {unit && <span className="text-sm font-normal text-gray-400 ml-1.5">{unit}</span>}
            </p>
        </div>
    )
}

const ScoreGauge = ({ label, score }) => {
    const color = scoreColor(score)
    const r = 30
    const circ = 2 * Math.PI * r
    const offset = circ - (score / 100) * circ

    return (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex items-center gap-5">
            <svg width="80" height="80" viewBox="0 0 80 80" className="shrink-0">
                <circle cx="40" cy="40" r={r} fill="none" stroke="#f3f4f6" strokeWidth="8" />
                <circle
                    cx="40" cy="40" r={r} fill="none"
                    stroke={color} strokeWidth="8"
                    strokeDasharray={circ}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    transform="rotate(-90 40 40)"
                />
                <text x="40" y="45" textAnchor="middle" fill="#111827" fontSize="17" fontWeight="700">{score}</text>
            </svg>
            <div>
                <p className="text-sm font-semibold text-gray-800">{label}</p>
                <span className={`inline-block mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${scoreBadge(score)}`}>
                    {scoreLabel(score)}
                </span>
            </div>
        </div>
    )
}

const SectionHeader = ({ icon, title, subtitle }) => (
    <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-gray-100">
            {icon}
        </div>
        <div>
            <p className="text-base font-bold text-gray-900">{title}</p>
            <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        </div>
    </div>
)

const ChartCard = ({ title, children, subtitle }) => (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <div className="mb-4">
            <p className="text-sm font-semibold text-gray-800">{title}</p>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {children}
    </div>
)

const BlockDividers = ({ blocks }) =>
    blocks.slice(1).map(block => (
        <ReferenceLine key={block.index} x={block.startRun - 0.5}
            stroke="#cbd5e1" strokeDasharray="4 3" strokeWidth={1.5} />
    ))

const MetricLine = ({ data, dataKey, color, unit, ticks, height = 180, blocks = [], minSpan }) => (
    <div>
        <div className="flex">
            <FixedYAxis data={data} series={[dataKey]} unit={unit} height={height} minSpan={minSpan} />
            <ChartScroll tickCount={ticks.length}>
                <ResponsiveContainer width="100%" height={height}>
                    <LineChart data={data} margin={{ top: 10, bottom: 22, right: 10, left: 15 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis dataKey="run" {...intervalAxisProps} ticks={ticks} />
                        <YAxis hide domain={zoomedDomain(data, [dataKey], minSpan)} />
                        <Tooltip {...tooltipStyle} labelFormatter={intervalTooltipLabel} />
                        <BlockDividers blocks={blocks} />
                        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2}
                            dot={{ r: 3, fill: color, strokeWidth: 0 }} activeDot={{ r: 5 }} />
                    </LineChart>
                </ResponsiveContainer>
            </ChartScroll>
        </div>
        <IntervalCaption />
    </div>
)

/* ── main ─────────────────────────────────────────────────── */

const ResultPanel = ({ data }) => {
    const { url, lighthouseData, runtimeData = [] } = data

    const blocks = withTiming(buildBlocks(data.sequence), runtimeData)
    const ticks = runtimeData.map(r => r.run)

    const cpuData = runtimeData.map(r => ({
        run:    r.run,
        url:    r.url ?? url,
        Script: +(r.scriptDuration  * 1000).toFixed(2),
        Task:   +(r.taskDuration    * 1000).toFixed(2),
        Layout: +(r.layoutDuration  * 1000).toFixed(2),
    }))

    const memData = runtimeData.map(r => ({
        run: r.run,
        url: r.url ?? url,
        'Heap MB': +(r.jsHeapUsedSize / 1024 / 1024).toFixed(2),
    }))

    // OS-level RSS of the page's Chrome renderer process(es) — the same figure
    // Chrome's own Task Manager shows for a tab, distinct from the V8 heap above.
    const procMemData = runtimeData.map(r => ({
        run: r.run,
        url: r.url ?? url,
        'Process RSS MB': r.processMemoryMB,
    }))

    const domData = runtimeData.map(r => ({
        run:               r.run,
        url:               r.url ?? url,
        'DOM Nodes':       r.domNodes,
        'Event Listeners': r.jsEventListeners,
    }))

    const dateLabel = data.createdAt
        ? new Date(data.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
            + ' · ' + new Date(data.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        : null

    return (
        <div className="bg-gray-50 min-h-screen px-6 py-10">
            <div className="max-w-4xl mx-auto">

                {/* ── Header ──────────────────────────────────── */}
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm px-7 py-6 mb-8 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-1">Analysis Results</h1>
                        <p className="text-sm text-blue-600 font-medium truncate">{url}</p>
                        {(dateLabel || data.totalDuration != null || data.mode === 'manual') && (
                            <div className="flex flex-wrap items-center gap-2 mt-3">
                                {dateLabel && (
                                    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-full">
                                        <span className="text-gray-400">⌗</span>
                                        {dateLabel}
                                    </span>
                                )}
                                {data.totalDuration != null && (
                                    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-full">
                                        <span className="text-gray-400">⏱</span>
                                        {formatElapsed(data.totalDuration)}
                                    </span>
                                )}
                                {data.mode === 'manual' && (
                                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-600 bg-purple-50 border border-purple-100 px-2.5 py-1 rounded-full">
                                        Live Session
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => window.print()}
                        className="no-print shrink-0 flex items-center gap-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:border-gray-300 hover:text-gray-900 px-4 py-2 rounded-xl transition-colors shadow-sm"
                    >
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M12 15V3m0 12-4-4m4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M2 17v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
                        </svg>
                        Download PDF
                    </button>
                </div>

                {/* ── Lighthouse Audit ────────────────────────── */}
                <section className="mb-8">
                    <SectionHeader
                        icon={
                            <svg width="16" height="16" fill="none" stroke="#ca8a04" strokeWidth="2.5" viewBox="0 0 24 24">
                                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        }
                        title="Lighthouse Audit"
                        subtitle="Core Web Vitals measured via Google Lighthouse v11"
                    />

                    <div className="grid grid-cols-3 gap-4 mb-4">
                        {lighthouseMetrics.map(({ key, label, unit, decimals }) => {
                            const value  = lighthouseData[key]
                            const status = getStatus(key, value)
                            return (
                                <MetricCard
                                    key={key}
                                    label={label}
                                    value={decimals === 0 ? Math.round(value) : value}
                                    unit={unit}
                                    status={status}
                                    decimals={decimals}
                                />
                            )
                        })}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <ScoreGauge label="SEO Score"           score={lighthouseData.seoScore} />
                        <ScoreGauge label="Accessibility Score" score={lighthouseData.accessibilityScore} />
                    </div>
                </section>

                {/* ── Runtime Monitoring ──────────────────────── */}
                {runtimeData?.length > 0 && (
                <section>
                    <SectionHeader
                        icon={
                            <svg width="16" height="16" fill="none" stroke="#2563eb" strokeWidth="2.5" viewBox="0 0 24 24">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        }
                        title="Runtime Monitoring"
                        subtitle="JS heap, DOM nodes, event listeners and CPU timings over time"
                    />

                    <div className="flex flex-col gap-4">

                        <ChartCard title="Script Duration" subtitle="Time executing JS (ms)">
                            <MetricLine data={cpuData} dataKey="Script" color="#6366f1" unit="ms" ticks={ticks} blocks={blocks} minSpan={MIN_SPAN_MS} />
                        </ChartCard>

                        <ChartCard title="Task Duration" subtitle="Main-thread task time (ms)">
                            <MetricLine data={cpuData} dataKey="Task" color="#f59e0b" unit="ms" ticks={ticks} blocks={blocks} minSpan={MIN_SPAN_MS} />
                        </ChartCard>

                        <ChartCard title="Layout Duration" subtitle="Time spent on layout & paint (ms)">
                            <MetricLine data={cpuData} dataKey="Layout" color="#ec4899" unit="ms" ticks={ticks} height={200} blocks={blocks} minSpan={MIN_SPAN_MS} />
                        </ChartCard>

                        <ChartCard title="JS Heap Memory" subtitle="JavaScript memory in use (MB)">
                            <div className="flex">
                                <FixedYAxis data={memData} series={['Heap MB']} tickFormatter={v => `${(+v).toFixed(2)} MB`} width={80} height={220} area minSpan={MIN_SPAN_MB} />
                                <ChartScroll tickCount={ticks.length}>
                                    <ResponsiveContainer width="100%" height={220}>
                                        <AreaChart data={memData} margin={{ top: 10, bottom: 22, right: 10, left: 15 }}>
                                            <defs>
                                                <linearGradient id="heapGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.2} />
                                                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                                            <XAxis dataKey="run" {...intervalAxisProps} ticks={ticks} />
                                            <YAxis hide domain={zoomedDomain(memData, ['Heap MB'], MIN_SPAN_MB)} />
                                            <Tooltip {...tooltipStyle} labelFormatter={intervalTooltipLabel} />
                                            <BlockDividers blocks={blocks} />
                                            <Area type="monotone" dataKey="Heap MB" stroke="#22c55e" fill="url(#heapGrad)"
                                                strokeWidth={2} dot={{ r: 3, fill: '#22c55e', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </ChartScroll>
                            </div>
                            <IntervalCaption />
                        </ChartCard>

                        <ChartCard title="Process Memory (RSS)" subtitle="Real OS memory of the page's Chrome renderer process (MB)">
                            <div className="flex">
                                <FixedYAxis data={procMemData} series={['Process RSS MB']} tickFormatter={v => `${(+v).toFixed(0)} MB`} width={80} height={220} area minSpan={MIN_SPAN_MB} />
                                <ChartScroll tickCount={ticks.length}>
                                    <ResponsiveContainer width="100%" height={220}>
                                        <AreaChart data={procMemData} margin={{ top: 10, bottom: 22, right: 10, left: 15 }}>
                                            <defs>
                                                <linearGradient id="procMemGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%"  stopColor="#f97316" stopOpacity={0.2} />
                                                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                                            <XAxis dataKey="run" {...intervalAxisProps} ticks={ticks} />
                                            <YAxis hide domain={zoomedDomain(procMemData, ['Process RSS MB'], MIN_SPAN_MB)} />
                                            <Tooltip {...tooltipStyle} labelFormatter={intervalTooltipLabel} />
                                            <BlockDividers blocks={blocks} />
                                            <Area type="monotone" dataKey="Process RSS MB" stroke="#f97316" fill="url(#procMemGrad)"
                                                strokeWidth={2} dot={{ r: 3, fill: '#f97316', strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </ChartScroll>
                            </div>
                            <IntervalCaption />
                        </ChartCard>

                        <ChartCard title="DOM Nodes" subtitle="Total nodes in the document">
                            <MetricLine data={domData} dataKey="DOM Nodes" color="#38bdf8" ticks={ticks} blocks={blocks} minSpan={MIN_SPAN_COUNT} />
                        </ChartCard>

                        <ChartCard title="Event Listeners" subtitle="Active JS event listeners">
                            <MetricLine data={domData} dataKey="Event Listeners" color="#a78bfa" ticks={ticks} blocks={blocks} minSpan={MIN_SPAN_COUNT} />
                        </ChartCard>

                    </div>
                </section>
                )}

            </div>
        </div>
    )
}

export default ResultPanel
