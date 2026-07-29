import { useEffect, useRef, useState } from 'react'
import {
    LineChart, Line, AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { lighthouseMetrics } from '../assets/assets'
import { buildBlocks, withTiming, formatElapsed } from '../utils/blocks'

// FixedYAxis (a fixed pixel `width` number) always renders correctly in a
// printed/PDF export; the main chart right next to it (Recharts'
// ResponsiveContainer with width="100%" inside a flex child) reliably does
// not — real exported PDFs confirm every runtime chart's line and x-axis go
// missing while its own y-axis panel renders fine. Recharts resolving
// width="100%" via its own ResizeObserver is the common thread between every
// broken chart. Measuring the container ourselves with a plain ResizeObserver
// and always handing Recharts a concrete pixel number — for both screen and
// print, not just conditionally at print time — bypasses that resolution path
// entirely instead of trying to catch it after the fact.
const useContainerWidth = () => {
    const ref = useRef(null)
    const [width, setWidth] = useState(null)
    useEffect(() => {
        const el = ref.current
        if (!el) return
        const observer = new ResizeObserver(([entry]) => {
            const w = entry.contentRect.width
            if (w > 0) setWidth(w)
        })
        observer.observe(el)
        return () => observer.disconnect()
    }, [])
    return [ref, width]
}

const COLOR_A = '#6366f1'
const COLOR_B = '#f59e0b'

/* ── helpers  ─────────────────────────────────── */

// Minimum Y-axis span per metric family (see zoomedDomain below): how tight the axis
// is allowed to zoom before a flat-looking line is just noise being exaggerated.
const MIN_SPAN_MS    = 40  // Script/Task/Layout Duration
const MIN_SPAN_MB    = 2   // JS Heap / Process Memory
const MIN_SPAN_COUNT = 20  // DOM Nodes / Event Listeners

const tooltipStyle = {
    // whiteSpace overrides recharts' own default of 'nowrap', which otherwise
    // gets inherited by the URL text below and silently defeats break-all.
    contentStyle: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 12, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.07)', whiteSpace: 'normal' },
    labelStyle: { color: '#111827', fontWeight: 600 },
    itemStyle: { color: '#374151' },
    // Pin to the top of the chart instead of following the cursor vertically.
    // With full (non-truncated) URLs the box can span several lines, and
    // tracking the cursor would let it sit right on top of the hovered point.
    position: { y: 0 },
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
    // The first/last tick's label is centered directly on the plot's edge (the domain
    // has no padding), so its text otherwise hangs half off the chart and gets clipped
    // by the SVG's own bounds — worse the more digits the run number has (e.g. #118
    // clips more than #6). Padding insets the plotted range from the axis's pixel
    // width without touching the data domain, giving both edge labels room to render
    // in full.
    padding: { left: 12, right: 12 },
}

const MAX_TICK_LABELS = 15
// Recharts' numeric XAxis `interval` prop just skips a fixed count starting
// from the first tick, so it doesn't reliably land back on the last one —
// with many intervals packed into a fixed-width chart we still want the
// first and last "#N" always visible, thinning only what's between them.
const thinTicks = (ticks) => {
    if (ticks.length <= MAX_TICK_LABELS) return ticks
    const step = Math.ceil((ticks.length - 1) / (MAX_TICK_LABELS - 1))
    const kept = []
    for (let i = 0; i < ticks.length; i += step) kept.push(ticks[i])
    if (kept[kept.length - 1] !== ticks[ticks.length - 1]) kept.push(ticks[ticks.length - 1])
    return kept
}
// Used only inside the y-axis panel's own chart, to keep its x-scale/margins
// identical to the real chart without rendering a second visible x-axis.
// hide:true skips reserving the axis's layout height entirely (regardless of the height
// prop's value), while the real chart's visible XAxis does reserve its default 30px, so
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
// baseline. For a metric like Task Duration hovering at 60-65ms, a 0-800ms axis
// flattens a real 5ms drift into an invisible sliver. The one thing that makes zooming
// risky is a metric that's naturally just noisy: a ±2ms wobble in an otherwise flat
// line would get blown up into what looks like a dramatic spike if the domain zoomed in
// arbitrarily tight. minSpan is the floor against that: the axis never zooms in past a
// range of that size, however flat the actual data is, so jitter can't be mistaken for
// a trend. Values here can't go negative, so the low end never drops below 0 even when
// headroom would otherwise push it there.
//
// Ticks are computed here too, from the same step, instead of leaving Recharts to pick
// its own. Its internal "nice step" algorithm doesn't use our 1/2/5 rule, so a domain
// boundary we've already rounded (say, top = 500) can end up out of step with where its
// own tick generator wants to land (stepping by 150: 0, 150, 300, 450, 600). 600 gets
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

const IntervalCaption = () => (
    <p className="text-center text-[11px] text-gray-400 mt-1">Interval</p>
)

// Renders just the y-axis as its own small chart alongside the real one. Needs
// invisible series matching the real chart's dataKey(s) — Recharts computes an
// "auto" domain from the plotted series, not the raw data, so without them
// this axis's scale wouldn't match the real chart.
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
                    <Series key={dataKey} dataKey={dataKey} stroke="none" fill="none" dot={false} isAnimationActive={false} connectNulls />
                ))}
            </Chart>
        </ResponsiveContainer>
    )
}

const scoreColor = s => s >= 90 ? '#16a34a' : s >= 50 ? '#d97706' : '#dc2626'

const getStatus = (key, value) => {
    const metric = lighthouseMetrics.find(m => m.key === key)
    if (!metric) return 'neutral'
    if (value <= metric.good) return 'good'
    if (value <= metric.warn) return 'warn'
    return 'poor'
}

const statusValueColor = s =>
    s === 'good' ? 'text-green-700' : s === 'warn' ? 'text-amber-600' : s === 'poor' ? 'text-red-600' : 'text-gray-600'

const avg = (data, key) => {
    const vals = data.map(d => d[key]).filter(v => v !== null && v !== undefined)
    if (!vals.length) return null
    return vals.reduce((a, b) => a + b, 0) / vals.length
}

// Merge Scan A and Scan B by interval index (run number) rather than elapsed time —
// each x position is "the Nth sample of each scan". Each point is tagged with that
// sample's own captured URL, falling back to the scan's overall URL if missing.
const buildMergedData = (rdA, rdB, key, transform, fallbackUrlA, fallbackUrlB) => {
    const map = new Map()
    ;(rdA ?? []).forEach(r => {
        if (!map.has(r.run)) map.set(r.run, { run: r.run, A: null, B: null, urlA: null, urlB: null })
        const entry = map.get(r.run)
        entry.A = transform ? transform(r[key]) : r[key]
        entry.urlA = r.url ?? fallbackUrlA
    })
    ;(rdB ?? []).forEach(r => {
        if (!map.has(r.run)) map.set(r.run, { run: r.run, A: null, B: null, urlA: null, urlB: null })
        const entry = map.get(r.run)
        entry.B = transform ? transform(r[key]) : r[key]
        entry.urlB = r.url ?? fallbackUrlB
    })
    return [...map.values()].sort((a, b) => a.run - b.run)
}

// Shows the interval number and each scan's URL — e.g. "Interval #6" plus one line per scan.
const compareTooltipLabel = (v, payload) => {
    const p = payload?.[0]?.payload
    return (
        <>
            <span style={{ display: 'block' }}>{`Interval #${v}`}</span>
            {p?.urlA && (
                <span className="break-all max-w-70" style={{ display: 'block', color: COLOR_A, fontWeight: 400, marginTop: 2 }}>A: {p.urlA}</span>
            )}
            {p?.urlB && (
                <span className="break-all max-w-70" style={{ display: 'block', color: COLOR_B, fontWeight: 400, marginTop: 2 }}>B: {p.urlB}</span>
            )}
        </>
    )
}

/* ── sub-components ──────────────────────────────────────── */

const ScoreGauge = ({ label, score }) => {
    const color = scoreColor(score)
    const r = 34
    const circ = 2 * Math.PI * r
    const offset = circ - (score / 100) * circ
    const statusLabel = score >= 90 ? 'Good' : score >= 50 ? 'Needs Improvement' : 'Poor'
    const statusClass = score >= 90 ? 'text-green-600' : score >= 50 ? 'text-yellow-600' : 'text-red-600'
    return (
        <div className="flex flex-col items-center gap-2">
            <svg width="90" height="90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r={r} fill="none" stroke="#e5e7eb" strokeWidth="9" />
                <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9"
                    strokeDasharray={circ} strokeDashoffset={offset}
                    strokeLinecap="round" transform="rotate(-90 50 50)" />
                <text x="50" y="56" textAnchor="middle" fill="#111827" fontSize="18" fontWeight="700">{score}</text>
            </svg>
            <p className="text-xs text-gray-600 text-center">{label}</p>
            <p className={`text-xs font-medium ${statusClass}`}>{statusLabel}</p>
        </div>
    )
}

const WinnerBadge = ({ winner }) => {
    if (!winner) return null
    const isA = winner === 'A'
    return (
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isA ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
            Scan {winner} performed better
        </span>
    )
}

const DeltaBadge = ({ delta, lowerIsBetter }) => {
    if (delta == null) return <span className="text-xs text-gray-400">N/A</span>
    if (delta === 0) return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Tied</span>
    const better = lowerIsBetter ? delta < 0 : delta > 0
    const sign = delta > 0 ? '+' : ''
    return (
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${better ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {sign}{delta} {better ? '▲ better' : '▼ worse'}
        </span>
    )
}

const SectionHeader = ({ icon, title, subtitle }) => (
    <div className="section-header flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-gray-100">
            {icon}
        </div>
        <div>
            <p className="text-base font-bold text-gray-900">{title}</p>
            <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        </div>
    </div>
)

const ExpandButton = ({ onClick }) => (
    <button
        onClick={onClick}
        className="no-print shrink-0 w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="Expand chart"
        title="Expand chart"
    >
        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    </button>
)

// Re-renders the same chart at a larger size in an overlay rather than
// building a separate "expanded" chart implementation — every chart already
// takes `height` as a prop, so the modal just mounts it again with a bigger one.
const ChartExpandModal = ({ title, subtitle, onClose, winner, avgA, avgB, unit, children }) => {
    useEffect(() => {
        const onKey = e => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        const prevOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            window.removeEventListener('keydown', onKey)
            document.body.style.overflow = prevOverflow
        }
    }, [onClose])

    return (
        <div
            className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
            <div className="bg-white rounded-2xl w-full max-w-[95vw] xl:max-w-350 shadow-2xl p-6 relative max-h-[92vh] overflow-y-auto">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    aria-label="Close"
                >
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                    </svg>
                </button>
                <div className="flex items-start justify-between mb-4 gap-3 pr-8">
                    <div className="min-w-0">
                        <p className="text-base font-semibold text-gray-900">{title}</p>
                        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
                    </div>
                    {(winner || (avgA !== undefined && avgA !== null && avgB !== null)) && (
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                            {avgA !== undefined && avgA !== null && avgB !== null && (
                                <p className="text-xs text-gray-400">
                                    <span style={{ color: COLOR_A }}>A: {avgA}{unit ?? ''}</span>
                                    <span className="mx-1.5 text-gray-300">·</span>
                                    <span style={{ color: COLOR_B }}>B: {avgB}{unit ?? ''}</span>
                                </p>
                            )}
                            <WinnerBadge winner={winner} />
                        </div>
                    )}
                </div>
                {children}
            </div>
        </div>
    )
}

const ChartCard = ({ title, subtitle, winner, avgA, avgB, unit, children, onExpand }) => (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <div className="flex items-start justify-between mb-4 gap-3">
            <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800">{title}</p>
                {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
            </div>
            <div className="flex items-start gap-2 shrink-0 ml-3">
                <div className="flex flex-col items-end gap-1.5">
                    {avgA !== null && avgB !== null && (
                        <p className="text-xs text-gray-400">
                            <span style={{ color: COLOR_A }}>A: {avgA}{unit ?? ''}</span>
                            <span className="mx-1.5 text-gray-300">·</span>
                            <span style={{ color: COLOR_B }}>B: {avgB}{unit ?? ''}</span>
                        </p>
                    )}
                    <WinnerBadge winner={winner} />
                </div>
                {onExpand && <ExpandButton onClick={onExpand} />}
            </div>
        </div>
        {children}
    </div>
)

const BlockDividers = ({ blocksA = [], blocksB = [] }) => (
    <>
        {blocksA.slice(1).map(block => (
            <ReferenceLine key={`a-${block.index}`} x={block.startRun - 0.5 - 0.15}
                stroke={COLOR_A} strokeDasharray="4 3" strokeWidth={1.5} />
        ))}
        {blocksB.slice(1).map(block => (
            <ReferenceLine key={`b-${block.index}`} x={block.startRun - 0.5 + 0.15}
                stroke={COLOR_B} strokeDasharray="4 3" strokeWidth={1.5} />
        ))}
    </>
)

// Chart body pulled out of DualLineChart so it can be mounted a second time
// (at a larger height) inside the expand modal — each mount gets its own
// useContainerWidth measurement, which is what we want for the modal's own width.
const DualLineChartBody = ({ chartData, ticks, blocksA, blocksB, minSpan, unit, height }) => {
    const [printRef, printWidth] = useContainerWidth()
    return (
        <div className="flex">
            <FixedYAxis data={chartData} series={['A', 'B']} unit={unit} height={height} minSpan={minSpan} />
            <div ref={printRef} className="flex-1 min-w-0">
                <ResponsiveContainer width={printWidth ?? '100%'} height={height}>
                    <LineChart data={chartData} margin={{ top: 10, bottom: 22, right: 10, left: 15 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis dataKey="run" {...intervalAxisProps} ticks={thinTicks(ticks)} />
                        <YAxis hide domain={zoomedDomain(chartData, ['A', 'B'], minSpan)} />
                        <Tooltip {...tooltipStyle} labelFormatter={compareTooltipLabel} />
                        <BlockDividers blocksA={blocksA} blocksB={blocksB} />
                        <Line type="monotone" dataKey="A" stroke={COLOR_A} strokeWidth={2} dot={{ r: 3, fill: COLOR_A, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls />
                        <Line type="monotone" dataKey="B" stroke={COLOR_B} strokeWidth={2} dot={{ r: 3, fill: COLOR_B, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}

const DualLineChart = ({ title, subtitle, dataA, dataB, urlA, urlB, dataKey, transform, unit, height = 180, blocksA, blocksB, minSpan }) => {
    const [expanded, setExpanded] = useState(false)
    const chartData = buildMergedData(dataA, dataB, dataKey, transform, urlA, urlB)
    const ticks = chartData.map(d => d.run)
    const avgAVal = avg(chartData, 'A')
    const avgBVal = avg(chartData, 'B')
    const winner = avgAVal !== null && avgBVal !== null ? (avgAVal < avgBVal ? 'A' : avgAVal > avgBVal ? 'B' : null) : null
    const fmtAvg = v => v !== null ? (Number.isInteger(v) ? v : +v.toFixed(2)) : null

    return (
        <>
            <ChartCard title={title} subtitle={subtitle} winner={winner} avgA={fmtAvg(avgAVal)} avgB={fmtAvg(avgBVal)} unit={unit} onExpand={() => setExpanded(true)}>
                <DualLineChartBody chartData={chartData} ticks={ticks} blocksA={blocksA} blocksB={blocksB} minSpan={minSpan} unit={unit} height={height} />
                <IntervalCaption />
            </ChartCard>
            {expanded && (
                <ChartExpandModal title={title} subtitle={subtitle} winner={winner} avgA={fmtAvg(avgAVal)} avgB={fmtAvg(avgBVal)} unit={unit} onClose={() => setExpanded(false)}>
                    <DualLineChartBody chartData={chartData} ticks={ticks} blocksA={blocksA} blocksB={blocksB} minSpan={minSpan} unit={unit} height={520} />
                    <IntervalCaption />
                </ChartExpandModal>
            )}
        </>
    )
}

// Dual (A/B) JS Heap Memory chart body, pulled out of ChartCard's children so
// it can be mounted a second time (at a larger height) inside the expand modal
// without duplicating the gradient/axis/tooltip setup.
const HeapAreaChart = ({ data, ticks, blocksA, blocksB, height = 220, gradIdA = 'gradA', gradIdB = 'gradB' }) => {
    const [printRef, printWidth] = useContainerWidth()
    return (
        <div className="flex">
            <FixedYAxis data={data} series={['A', 'B']} tickFormatter={v => `${(+v).toFixed(2)} MB`} width={80} height={height} area minSpan={MIN_SPAN_MB} />
            <div ref={printRef} className="flex-1 min-w-0">
                <ResponsiveContainer width={printWidth ?? '100%'} height={height}>
                    <AreaChart data={data} margin={{ top: 10, bottom: 22, right: 10, left: 15 }}>
                        <defs>
                            <linearGradient id={gradIdA} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={COLOR_A} stopOpacity={0.15} />
                                <stop offset="95%" stopColor={COLOR_A} stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id={gradIdB} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={COLOR_B} stopOpacity={0.15} />
                                <stop offset="95%" stopColor={COLOR_B} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis dataKey="run" {...intervalAxisProps} ticks={thinTicks(ticks)} />
                        <YAxis hide domain={zoomedDomain(data, ['A', 'B'], MIN_SPAN_MB)} />
                        <Tooltip {...tooltipStyle} labelFormatter={compareTooltipLabel} />
                        <BlockDividers blocksA={blocksA} blocksB={blocksB} />
                        <Area type="monotone" dataKey="A" stroke={COLOR_A} fill={`url(#${gradIdA})`} strokeWidth={2} dot={{ r: 3, fill: COLOR_A, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls />
                        <Area type="monotone" dataKey="B" stroke={COLOR_B} fill={`url(#${gradIdB})`} strokeWidth={2} dot={{ r: 3, fill: COLOR_B, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}

// Dual (A/B) OS-level RSS chart body — same rationale as HeapAreaChart above.
const ProcMemAreaChart = ({ data, ticks, blocksA, blocksB, height = 220, gradIdA = 'procGradA', gradIdB = 'procGradB' }) => {
    const [printRef, printWidth] = useContainerWidth()
    return (
        <div className="flex">
            <FixedYAxis data={data} series={['A', 'B']} tickFormatter={v => `${(+v).toFixed(0)} MB`} width={80} height={height} area minSpan={MIN_SPAN_MB} />
            <div ref={printRef} className="flex-1 min-w-0">
                <ResponsiveContainer width={printWidth ?? '100%'} height={height}>
                    <AreaChart data={data} margin={{ top: 10, bottom: 22, right: 10, left: 15 }}>
                        <defs>
                            <linearGradient id={gradIdA} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={COLOR_A} stopOpacity={0.15} />
                                <stop offset="95%" stopColor={COLOR_A} stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id={gradIdB} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={COLOR_B} stopOpacity={0.15} />
                                <stop offset="95%" stopColor={COLOR_B} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis dataKey="run" {...intervalAxisProps} ticks={thinTicks(ticks)} />
                        <YAxis hide domain={zoomedDomain(data, ['A', 'B'], MIN_SPAN_MB)} />
                        <Tooltip {...tooltipStyle} labelFormatter={compareTooltipLabel} />
                        <BlockDividers blocksA={blocksA} blocksB={blocksB} />
                        <Area type="monotone" dataKey="A" stroke={COLOR_A} fill={`url(#${gradIdA})`} strokeWidth={2} dot={{ r: 3, fill: COLOR_A, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls />
                        <Area type="monotone" dataKey="B" stroke={COLOR_B} fill={`url(#${gradIdB})`} strokeWidth={2} dot={{ r: 3, fill: COLOR_B, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}

/* ── main ─────────────────────────────────────────────────── */

const ComparePanel = ({ dataA, dataB }) => {
    const [heapExpanded, setHeapExpanded] = useState(false)
    const [procMemExpanded, setProcMemExpanded] = useState(false)
    const fmtDate = iso => {
        const d = new Date(iso)
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
            ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    }


    const blocksA = withTiming(buildBlocks(dataA.sequence), dataA.runtimeData)
    const blocksB = withTiming(buildBlocks(dataB.sequence), dataB.runtimeData)

    /* heap area chart data */
    const heapData = buildMergedData(
        dataA.runtimeData, dataB.runtimeData,
        'jsHeapUsedSize', v => +(v / 1024 / 1024).toFixed(2),
        dataA.url, dataB.url
    )
    const heapTicks = heapData.map(d => d.run)
    const heapAvgA = avg(heapData, 'A')
    const heapAvgB = avg(heapData, 'B')
    const heapWinner = heapAvgA !== null && heapAvgB !== null ? (heapAvgA < heapAvgB ? 'A' : heapAvgA > heapAvgB ? 'B' : null) : null

    // OS-level RSS of each scan's Chrome renderer process — the figure Chrome's
    // own Task Manager shows for a tab, distinct from the V8 heap above.
    const procMemData = buildMergedData(
        dataA.runtimeData, dataB.runtimeData,
        'processMemoryMB', null,
        dataA.url, dataB.url
    )
    const procMemTicks = procMemData.map(d => d.run)
    const procMemAvgA = avg(procMemData, 'A')
    const procMemAvgB = avg(procMemData, 'B')
    const procMemWinner = procMemAvgA !== null && procMemAvgB !== null ? (procMemAvgA < procMemAvgB ? 'A' : procMemAvgA > procMemAvgB ? 'B' : null) : null

    return (
        <div className="bg-gray-50 min-h-screen px-6 py-8">
            <div className="max-w-340 mx-auto">

                {/* ── Header ──────────────────────────────────── */}
                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm px-7 py-6 mb-8">
                    <div className="flex items-start justify-between mb-6">
                        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Comparison</h1>
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

                    {/* Scan cards */}
                    <div className="grid grid-cols-[1fr_40px_1fr] gap-3 items-stretch">
                        <div className="border-t-4 border-indigo-500 bg-gray-50 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                                <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Scan A</p>
                                {dataA.mode === 'manual' && (
                                    <span className="text-[10px] font-semibold text-purple-600 bg-purple-50 border border-purple-100 px-1.5 py-0.5 rounded-full">Live Session</span>
                                )}
                            </div>
                            <p className="text-sm font-semibold text-gray-900 truncate mb-1" title={dataA.url}>
                                {dataA.url.replace(/^https?:\/\//, '')}
                            </p>
                            <p className="text-xs text-gray-400">
                                {fmtDate(dataA.createdAt)}
                                {dataA.totalDuration != null && ` · ${formatElapsed(dataA.totalDuration)}`}
                            </p>
                        </div>
                        <div className="flex items-center justify-center">
                            <span className="text-sm font-bold text-gray-300">vs</span>
                        </div>
                        <div className="border-t-4 border-amber-400 bg-gray-50 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="w-2 h-2 rounded-full bg-amber-400" />
                                <p className="text-xs font-bold uppercase tracking-wider text-amber-600">Scan B</p>
                                {dataB.mode === 'manual' && (
                                    <span className="text-[10px] font-semibold text-purple-600 bg-purple-50 border border-purple-100 px-1.5 py-0.5 rounded-full">Live Session</span>
                                )}
                            </div>
                            <p className="text-sm font-semibold text-gray-900 truncate mb-1" title={dataB.url}>
                                {dataB.url.replace(/^https?:\/\//, '')}
                            </p>
                            <p className="text-xs text-gray-400">
                                {fmtDate(dataB.createdAt)}
                                {dataB.totalDuration != null && ` · ${formatElapsed(dataB.totalDuration)}`}
                            </p>
                        </div>
                    </div>
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
                        subtitle="Core Web Vitals side-by-side with delta per metric"
                    />

                    <div className="lh-compare-grid grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4 items-start">

                        {/* Individual parameter comparison */}
                        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                            {/* Table column headers */}
                            <div className="grid grid-cols-[1fr_auto_1fr] text-[11px] font-bold uppercase tracking-wider px-6 py-3 border-b border-gray-100 bg-gray-50/80">
                                <span className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full" style={{ background: COLOR_A }} />Scan A
                                </span>
                                <span className="w-40 text-center text-gray-400">Metric</span>
                                <span className="flex items-center justify-end gap-2">
                                    Scan B <span className="w-2 h-2 rounded-full" style={{ background: COLOR_B }} />
                                </span>
                            </div>

                            {lighthouseMetrics.map(({ key, label, unit, decimals }) => {
                                const vA = dataA.lighthouseData[key]
                                const vB = dataB.lighthouseData[key]
                                const sA = getStatus(key, vA)
                                const sB = getStatus(key, vB)
                                const rawDelta = +(vB - vA).toFixed(decimals)
                                const displayDelta = decimals === 0 ? Math.round(rawDelta) : rawDelta
                                const fmt = v => decimals === 0 ? Math.round(v) : v.toFixed(decimals)

                                return (
                                    <div key={key} className="grid grid-cols-[1fr_auto_1fr] px-6 py-4 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors items-center">
                                        <span className={`text-base font-bold ${statusValueColor(sA)}`}>
                                            {fmt(vA)}{unit && <span className="text-xs font-normal text-gray-400 ml-1">{unit}</span>}
                                        </span>
                                        <div className="w-40 flex flex-col items-center gap-1.5">
                                            <span className="text-xs text-gray-500">{label}</span>
                                            <DeltaBadge delta={displayDelta} lowerIsBetter={true} />
                                        </div>
                                        <span className={`text-base font-bold text-right ${statusValueColor(sB)}`}>
                                            {fmt(vB)}{unit && <span className="text-xs font-normal text-gray-400 ml-1">{unit}</span>}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>

                        {/* SEO & Accessibility scores, stacked to align with the table on the left */}
                        <div className="score-group flex flex-col gap-4">
                            {[
                                { label: 'SEO Score', keyA: 'seoScore', keyB: 'seoScore' },
                                { label: 'Accessibility Score', keyA: 'accessibilityScore', keyB: 'accessibilityScore' },
                            ].map(({ label, keyA, keyB }) => {
                                const sA = dataA.lighthouseData[keyA]
                                const sB = dataB.lighthouseData[keyB]
                                const delta = sB - sA
                                return (
                                    <div key={label} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                                        <div className="flex items-center justify-between mb-4">
                                            <p className="text-sm font-semibold text-gray-800">{label}</p>
                                            <DeltaBadge delta={delta} lowerIsBetter={false} />
                                        </div>
                                        <div className="flex justify-around">
                                            <div className="flex flex-col items-center gap-1">
                                                <span className="w-2 h-2 rounded-full" style={{ background: COLOR_A }} />
                                                <ScoreGauge label="Scan A" score={sA} />
                                            </div>
                                            <div className="flex flex-col items-center gap-1">
                                                <span className="w-2 h-2 rounded-full" style={{ background: COLOR_B }} />
                                                <ScoreGauge label="Scan B" score={sB} />
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </section>

                {/* ── Runtime Monitoring ──────────────────────── */}
                {(dataA.runtimeData?.length > 0 || dataB.runtimeData?.length > 0) && (
                <section>
                    <SectionHeader
                        icon={
                            <svg width="16" height="16" fill="none" stroke="#2563eb" strokeWidth="2.5" viewBox="0 0 24 24">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        }
                        title="Runtime Monitoring"
                        subtitle="Dual-line charts: Scan A (indigo) vs Scan B (amber)"
                    />

                    <div className="chart-grid grid grid-cols-1 lg:grid-cols-2 gap-4">

                        <DualLineChart title="Script Duration" subtitle="JS execution time (ms)"
                            dataA={dataA.runtimeData} dataB={dataB.runtimeData} urlA={dataA.url} urlB={dataB.url} blocksA={blocksA} blocksB={blocksB} dataKey="scriptDuration" transform={v => +(v * 1000).toFixed(2)} unit="ms" minSpan={MIN_SPAN_MS} />

                        <DualLineChart title="Task Duration" subtitle="Main-thread tasks (ms)"
                            dataA={dataA.runtimeData} dataB={dataB.runtimeData} urlA={dataA.url} urlB={dataB.url} blocksA={blocksA} blocksB={blocksB} dataKey="taskDuration" transform={v => +(v * 1000).toFixed(2)} unit="ms" minSpan={MIN_SPAN_MS} />

                        {/* Layout — full */}
                        <DualLineChart title="Layout Duration" subtitle="Layout & paint time (ms)"
                            dataA={dataA.runtimeData} dataB={dataB.runtimeData} urlA={dataA.url} urlB={dataB.url} blocksA={blocksA} blocksB={blocksB} dataKey="layoutDuration" transform={v => +(v * 1000).toFixed(2)} unit="ms" height={200} minSpan={MIN_SPAN_MS} />

                        {/* Heap memory — full, area */}
                        <ChartCard title="JS Heap Memory" subtitle="JavaScript memory usage (MB)"
                            winner={heapWinner} avgA={heapAvgA !== null ? +heapAvgA.toFixed(2) : null} avgB={heapAvgB !== null ? +heapAvgB.toFixed(2) : null} unit=" MB"
                            onExpand={() => setHeapExpanded(true)}>
                            <HeapAreaChart data={heapData} ticks={heapTicks} blocksA={blocksA} blocksB={blocksB} />
                            <IntervalCaption />
                        </ChartCard>

                        {/* Process memory (RSS) — full, area */}
                        <ChartCard title="Process Memory (RSS)" subtitle="Real OS memory of each scan's Chrome renderer process (MB)"
                            winner={procMemWinner} avgA={procMemAvgA !== null ? +procMemAvgA.toFixed(2) : null} avgB={procMemAvgB !== null ? +procMemAvgB.toFixed(2) : null} unit=" MB"
                            onExpand={() => setProcMemExpanded(true)}>
                            <ProcMemAreaChart data={procMemData} ticks={procMemTicks} blocksA={blocksA} blocksB={blocksB} />
                            <IntervalCaption />
                        </ChartCard>

                        <DualLineChart title="DOM Nodes" subtitle="Document node count"
                            dataA={dataA.runtimeData} dataB={dataB.runtimeData} urlA={dataA.url} urlB={dataB.url} blocksA={blocksA} blocksB={blocksB} dataKey="domNodes" minSpan={MIN_SPAN_COUNT} />

                        {/* Odd chart out (7th), centered instead of hugging the left column */}
                        <div className="chart-span-2 lg:col-span-2 flex justify-center">
                            <div className="chart-half w-full lg:w-[calc(50%-0.5rem)]">
                                <DualLineChart title="Event Listeners" subtitle="Active JS listeners"
                                    dataA={dataA.runtimeData} dataB={dataB.runtimeData} urlA={dataA.url} urlB={dataB.url} blocksA={blocksA} blocksB={blocksB} dataKey="jsEventListeners" minSpan={MIN_SPAN_COUNT} />
                            </div>
                        </div>

                    </div>
                </section>
                )}

                {heapExpanded && (
                    <ChartExpandModal title="JS Heap Memory" subtitle="JavaScript memory usage (MB)"
                        winner={heapWinner} avgA={heapAvgA !== null ? +heapAvgA.toFixed(2) : null} avgB={heapAvgB !== null ? +heapAvgB.toFixed(2) : null} unit=" MB"
                        onClose={() => setHeapExpanded(false)}>
                        <HeapAreaChart data={heapData} ticks={heapTicks} blocksA={blocksA} blocksB={blocksB} height={520} gradIdA="gradAModal" gradIdB="gradBModal" />
                        <IntervalCaption />
                    </ChartExpandModal>
                )}

                {procMemExpanded && (
                    <ChartExpandModal title="Process Memory (RSS)" subtitle="Real OS memory of each scan's Chrome renderer process (MB)"
                        winner={procMemWinner} avgA={procMemAvgA !== null ? +procMemAvgA.toFixed(2) : null} avgB={procMemAvgB !== null ? +procMemAvgB.toFixed(2) : null} unit=" MB"
                        onClose={() => setProcMemExpanded(false)}>
                        <ProcMemAreaChart data={procMemData} ticks={procMemTicks} blocksA={blocksA} blocksB={blocksB} height={520} gradIdA="procGradAModal" gradIdB="procGradBModal" />
                        <IntervalCaption />
                    </ChartExpandModal>
                )}

            </div>
        </div>
    )
}

export default ComparePanel
