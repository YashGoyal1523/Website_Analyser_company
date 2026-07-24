import { lighthouseMetrics } from '../assets/assets'
import { formatElapsed } from '../utils/blocks'

const getStatus = (key, value) => {
    if (value == null) return null
    const m = lighthouseMetrics.find(m => m.key === key)
    if (!m) return null
    if (value <= m.good) return 'good'
    if (value <= m.warn) return 'warn'
    return 'poor'
}

const STATUS_COLOR = { good: 'text-green-700', warn: 'text-amber-600', poor: 'text-red-600' }
const STATUS_BADGE = {
    good: 'bg-green-50 text-green-700 border-green-200',
    warn: 'bg-amber-50 text-amber-600 border-amber-200',
    poor: 'bg-red-50 text-red-600 border-red-200',
}
const STATUS_LABEL = { good: 'Good', warn: 'Fair', poor: 'Poor' }

const METRICS = [
    { key: 'lcp', label: 'LCP', fmt: v => `${Math.round(v)} ms` },
    { key: 'tbt', label: 'TBT', fmt: v => `${Math.round(v)} ms` },
    { key: 'cls', label: 'CLS', fmt: v => v.toFixed(3) },
]

const AnalysisCard = ({ analysis, onClick, onView, onRerun, onDelete, compareMode = false, isSelected = false }) => {
    const { url, lighthouseData, createdAt, mode, totalDuration } = analysis
    const date    = new Date(createdAt)
    const domain  = url.replace(/^https?:\/\//, '').replace(/\/$/, '')
    const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

    return (
        <div
            onClick={compareMode ? onClick : undefined}
            className={`bg-white border rounded-2xl px-6 py-5 shadow-sm transition-all ${
                compareMode
                    ? `cursor-pointer ${isSelected ? 'border-blue-400 ring-2 ring-blue-50' : 'border-gray-100 hover:border-blue-200 hover:shadow-md'}`
                    : 'border-gray-100 hover:shadow-md hover:border-gray-200'
            }`}
        >
            {/* Top row */}
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                    {compareMode && (
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                            isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                        }`}>
                            {isSelected && (
                                <svg width="10" height="10" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            )}
                        </div>
                    )}
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                            <p className={`text-sm font-semibold truncate ${isSelected ? 'text-blue-600' : 'text-gray-900'}`}>
                                {domain}
                            </p>
                            {mode === 'manual' && (
                                <span className="shrink-0 text-[10px] font-semibold text-purple-600 bg-purple-50 border border-purple-100 px-1.5 py-0.5 rounded-full">Live Session</span>
                            )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                            {dateStr} · {timeStr}
                            {totalDuration != null && ` · ${formatElapsed(totalDuration)}`}
                        </p>
                    </div>
                </div>
                {!compareMode && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete?.() }}
                        className="text-gray-300 hover:text-red-400 transition-colors shrink-0"
                        title="Delete"
                    >
                        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Metrics row */}
            <div className="flex items-center gap-6 mt-4 pt-4 border-t border-gray-50">
                {METRICS.map(({ key, label, fmt }) => {
                    const value  = lighthouseData?.[key]
                    const status = getStatus(key, value)
                    return (
                        <div key={key} className="flex items-center gap-2">
                            <span className="text-xs text-gray-400 font-medium w-7">{label}</span>
                            <span className={`text-sm font-bold ${status ? STATUS_COLOR[status] : 'text-gray-400'}`}>
                                {value != null ? fmt(value) : '—'}
                            </span>
                            {status && (
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${STATUS_BADGE[status]}`}>
                                    {STATUS_LABEL[status]}
                                </span>
                            )}
                        </div>
                    )
                })}

                {/* Action buttons — pushed to the right */}
                {!compareMode && (
                    <div className="ml-auto flex items-center gap-2">
                        <button
                            onClick={onView}
                            className="text-xs font-medium text-gray-600 border border-gray-200 hover:border-gray-300 hover:text-gray-900 px-3 py-1.5 rounded-lg transition-colors"
                        >
                            View
                        </button>
                        <button
                            onClick={onRerun}
                            className="text-xs font-medium text-blue-600 border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
                        >
                            Re-run
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

export default AnalysisCard
