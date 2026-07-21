import { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppContext } from '../context/AppContext'
import AnalysisCard from '../components/AnalysisCard'

const History = () => {
    const { userAnalyses, fetchUserAnalyses } = useContext(AppContext)
    const navigate = useNavigate()
    const [fetching, setFetching]   = useState(false)
    const [search, setSearch]       = useState('')
    const [compareMode, setCompareMode] = useState(false)
    const [selectedIds, setSelectedIds] = useState([])

    const load = async () => {
        setFetching(true)
        await fetchUserAnalyses()
        setFetching(false)
    }

    useEffect(() => { load() }, [])

    const toggleCompareMode = () => {
        setCompareMode(p => !p)
        setSelectedIds([])
    }

    const handleView = (id) => {
        window.open(`/dashboard/analysis/${id}`, '_blank')
    }

    const handleRerun = (analysis) => {
        const mode = analysis.mode === 'manual' ? 'manual' : 'auto'
        const params = new URLSearchParams({ url: analysis.url, mode })
        if (analysis.totalDuration) params.set('totalDuration', analysis.totalDuration)
        const sequence = analysis.sequence ?? []
        if (mode === 'manual') {
            const block = sequence.find(i => i.type === 'analyse')
            if (block?.intervalTime) params.set('intervalTime', block.intervalTime)
            if (block?.intervals)    params.set('totalRuns', block.intervals)
        } else if (sequence.length > 0) {
            params.set('sequence', JSON.stringify(sequence))
        }
        navigate(`/dashboard?${params.toString()}`)
    }

    const handleCardClick = (id) => {
        setSelectedIds(prev => {
            if (prev.includes(id)) return prev.filter(x => x !== id)
            if (prev.length >= 2)  return prev
            return [...prev, id]
        })
    }

    const handleCompare = () => {
        if (selectedIds.length !== 2) return
        window.open(`/dashboard/compare/${selectedIds[0]}/${selectedIds[1]}`, '_blank')
        setCompareMode(false)
        setSelectedIds([])
    }

    /* ── loading ── */
    if (fetching) return (
        <div className="flex items-center justify-center py-32">
            <span className="w-6 h-6 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
        </div>
    )

    /* ── empty ── */
    if (userAnalyses.length === 0) return (
        <div className="flex flex-col items-center justify-center min-h-full px-6 py-32 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-5">
                <svg width="24" height="24" fill="none" stroke="#9ca3af" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path d="M12 8v4l3 3" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="12" r="10" />
                </svg>
            </div>
            <p className="text-gray-900 font-semibold text-lg mb-1">No analyses yet</p>
            <p className="text-gray-400 text-sm">Run your first analysis to see results here.</p>
        </div>
    )

    const filtered = userAnalyses.filter(a =>
        a.url.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <div className="min-h-full px-8 py-10">
            <div className="max-w-7xl mx-auto">

                {/* ── Header ─────────────────────────────────── */}
                <div className="flex items-start justify-between mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Past Results</h1>
                        <p className="text-gray-500 text-sm mt-1">
                            {userAnalyses.length} scan{userAnalyses.length !== 1 ? 's' : ''} recorded
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {compareMode && selectedIds.length === 2 && (
                            <button
                                onClick={handleCompare}
                                className="flex items-center gap-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl transition-colors shadow-sm shadow-blue-200"
                            >
                                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                Compare Selected
                            </button>
                        )}
                        <button
                            onClick={toggleCompareMode}
                            className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border transition-colors ${
                                compareMode
                                    ? 'text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100'
                                    : 'text-gray-600 bg-white border-gray-200 hover:border-gray-300 hover:text-gray-900'
                            }`}
                        >
                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            {compareMode ? 'Cancel' : 'Compare'}
                        </button>
                        <button
                            onClick={load}
                            className="flex items-center gap-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:border-gray-300 hover:text-gray-900 px-4 py-2 rounded-xl transition-colors"
                        >
                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path d="M23 4v6h-6M1 20v-6h6" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Refresh
                        </button>
                    </div>
                </div>

                {/* ── Compare mode banner ─────────────────────── */}
                {compareMode && (
                    <div className="mb-5 flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-5 py-3.5">
                        <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                            <svg width="14" height="14" fill="none" stroke="#2563eb" strokeWidth="2" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" strokeLinecap="round" />
                            </svg>
                        </div>
                        <p className="text-sm text-blue-700 font-medium">
                            {selectedIds.length === 0 && 'Select 2 scans to compare.'}
                            {selectedIds.length === 1 && (
                                <>Select <strong>1 more scan</strong> to compare.</>
                            )}
                            {selectedIds.length === 2 && (
                                <>2 scans selected — click <strong>Compare Selected</strong> to view.</>
                            )}
                        </p>
                        {selectedIds.length > 0 && (
                            <button
                                onClick={() => setSelectedIds([])}
                                className="ml-auto text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                )}

                {/* ── Search ─────────────────────────────────── */}
                <div className="relative mb-5">
                    <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                        width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" />
                    </svg>
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by URL..."
                        className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-10 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all shadow-sm"
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                            </svg>
                        </button>
                    )}
                </div>

                {/* ── Results count when searching ────────────── */}
                {search && (
                    <p className="text-xs text-gray-400 mb-4">
                        {filtered.length === 0
                            ? `No results for "${search}"`
                            : `${filtered.length} result${filtered.length !== 1 ? 's' : ''} for "${search}"`}
                    </p>
                )}

                {/* ── Cards ──────────────────────────────────── */}
                <div className="flex flex-col gap-3">
                    {filtered.length === 0 && !search && null}
                    {filtered.map(analysis => (
                        <AnalysisCard
                            key={analysis._id}
                            analysis={analysis}
                            onClick={() => handleCardClick(analysis._id)}
                            onView={() => handleView(analysis._id)}
                            onRerun={() => handleRerun(analysis)}
                            compareMode={compareMode}
                            isSelected={selectedIds.includes(analysis._id)}
                        />
                    ))}
                </div>

            </div>
        </div>
    )
}

export default History
