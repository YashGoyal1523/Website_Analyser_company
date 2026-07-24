import { useContext, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import { AppContext, PAGE_LOAD_ESTIMATE_SECONDS, LIGHTHOUSE_AUDIT_SECONDS } from '../context/AppContext'
import { lighthouseMetrics } from '../assets/assets'
import { formatElapsed as formatDuration } from '../utils/blocks'
import StepTypeSelect from '../components/StepTypeSelect'

const STEP_TIME = { scroll: 1, hover: 0.5, click: 3, search: 2, login: 8, goBack: 3 }

const DEFAULT_STEP = {
    scroll:  { type: 'scroll' },
    hover:   { type: 'hover',  selector: '' },
    click:   { type: 'click',  selector: '' },
    search:  { type: 'search', selector: '', query: '' },
    goBack:  { type: 'goBack' },
    login:   { type: 'login',  emailSelector: '', passwordSelector: '', submitSelector: '', email: '', password: '' },
}

const STEP_LABELS = {
    scroll: 'Scroll', hover: 'Hover', click: 'Click',
    search: 'Search', goBack: 'Go Back', login: 'Login',
}

const STEP_BORDER = {
    login: 'border-l-blue-400', scroll: 'border-l-violet-400',
    hover: 'border-l-amber-400', click: 'border-l-emerald-400',
    search: 'border-l-cyan-400', goBack: 'border-l-gray-300',
}

const STEP_DOT = {
    login: 'bg-blue-500', scroll: 'bg-violet-500',
    hover: 'bg-amber-500', click: 'bg-emerald-500',
    search: 'bg-cyan-500', goBack: 'bg-gray-400',
}

const smInput = 'w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50'

const metricColor = (key, value) => {
    if (value == null) return 'text-gray-400'
    const m = lighthouseMetrics.find(m => m.key === key)
    if (!m) return 'text-gray-700'
    if (value <= m.good) return 'text-green-600'
    if (value <= m.warn) return 'text-yellow-600'
    return 'text-red-600'
}

const RUNTIME_METRICS = [
    { label: 'JS Heap Used',       desc: 'JavaScript memory in use' },
    { label: 'DOM Nodes',          desc: 'Total nodes in the document' },
    { label: 'Event Listeners',    desc: 'Active JS event listeners' },
    { label: 'Script Duration',    desc: 'Time spent executing scripts' },
    { label: 'Task Duration',      desc: 'Total main-thread task time' },
    { label: 'Layout Duration',    desc: 'Time spent on layout & paint' },
]

const LIGHTHOUSE_DISPLAY = [
    { label: 'LCP',   desc: 'Largest Contentful Paint' },
    { label: 'FCP',   desc: 'First Contentful Paint' },
    { label: 'TTFB',  desc: 'Time to First Byte' },
    { label: 'TBT',   desc: 'Total Blocking Time' },
    { label: 'SI',    desc: 'Speed Index' },
    { label: 'CLS',   desc: 'Cumulative Layout Shift' },
]

const Home = () => {
    const { analyzeWebsite, loading, progress, userAnalyses, fetchUserAnalyses } = useContext(AppContext)
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()

    const [url, setUrl] = useState('')
    const [mode, setMode] = useState('auto')
    const [sequence, setSequence] = useState([])
    const [showPasswords, setShowPasswords] = useState({})
    const [intervalTimeMin, setIntervalTimeMin] = useState('')
    const [intervalTimeSec, setIntervalTimeSec] = useState('')
    const [durationMin, setDurationMin] = useState('')
    const [durationSec, setDurationSec] = useState('')

    const minDurationSeconds = PAGE_LOAD_ESTIMATE_SECONDS + LIGHTHOUSE_AUDIT_SECONDS

    const setIntervalTimeFromSeconds = (totalSeconds) => {
        const s = Number(totalSeconds) || 0
        setIntervalTimeMin(Math.floor(s / 60))
        setIntervalTimeSec(s % 60)
    }
    const setDurationFromSeconds = (totalSeconds) => {
        const s = Math.max(minDurationSeconds, Math.ceil(Number(totalSeconds) || 0))
        setDurationMin(Math.floor(s / 60))
        setDurationSec(s % 60)
    }

    useEffect(() => {
        if (userAnalyses.length === 0) fetchUserAnalyses()
        const paramUrl = searchParams.get('url')
        if (paramUrl) {
            setUrl(paramUrl)
            const paramMode = searchParams.get('mode') === 'manual' ? 'manual' : 'auto'
            setMode(paramMode)
            const td = searchParams.get('totalDuration')
            if (td) setDurationFromSeconds(td)
            if (paramMode === 'manual') {
                const it = searchParams.get('intervalTime')
                const tr = searchParams.get('totalRuns')
                if (it) setIntervalTimeFromSeconds(it)
                if (!td) {
                    const secs = it && tr ? Math.max(minDurationSeconds, Math.round(Number(it) * Number(tr))) : minDurationSeconds
                    setDurationMin(Math.floor(secs / 60))
                    setDurationSec(secs % 60)
                }
            } else {
                try {
                    const s = searchParams.get('sequence')
                    if (s) setSequence(JSON.parse(s))
                } catch { /* ignore malformed sequence */ }
            }
            setSearchParams({}, { replace: true })
        }
    }, [])

    const addActionStep   = () => setSequence([...sequence, { ...DEFAULT_STEP.scroll }])
    const addAnalyseBlock = () => setSequence([...sequence, { type: 'analyse', intervals: '' }])
    const removeItem      = (i) => setSequence(sequence.filter((_, j) => j !== i))

    const changeStepType = (i, type) => {
        const copy = [...sequence]; copy[i] = { ...DEFAULT_STEP[type] }; setSequence(copy)
    }
    const updateItem = (i, field, value) => {
        const copy = [...sequence]; copy[i] = { ...copy[i], [field]: value }; setSequence(copy)
    }

    const rerun = (analysis) => {
        const analysisMode = analysis.mode === 'manual' ? 'manual' : 'auto'
        const seq = analysis.sequence ?? []
        setUrl(analysis.url)
        setMode(analysisMode)

        // Prefer the actual Total Duration that was submitted; only reconstruct an
        // estimate for older saved analyses that predate the stored field.
        if (analysis.totalDuration) setDurationFromSeconds(analysis.totalDuration)

        if (analysisMode === 'manual') {
            const block = seq.find(i => i.type === 'analyse')
            setSequence([])
            setIntervalTimeFromSeconds(block?.intervalTime)
            if (!analysis.totalDuration) {
                setDurationFromSeconds((Number(block?.intervalTime) || 0) * (Number(block?.intervals) || 0))
            }
        } else {
            setSequence(seq)
            const firstAnalyse = seq.find(i => i.type === 'analyse')
            setIntervalTimeFromSeconds(firstAnalyse?.intervalTime)
            if (!analysis.totalDuration) {
                const actionTime  = seq.filter(i => i.type !== 'analyse').reduce((s, i) => s + (STEP_TIME[i.type] || 1), 0)
                const captureTime = seq.filter(i => i.type === 'analyse').reduce((s, i) => s + (Number(i.intervals) || 0) * (Number(i.intervalTime) || 0), 0)
                setDurationFromSeconds(PAGE_LOAD_ESTIMATE_SECONDS + actionTime + captureTime)
            }
        }
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    const onSubmitHandler = async (e) => {
        e.preventDefault()

        if (mode === 'manual') {
            if (totalDurationSeconds < minDurationSeconds) {
                toast.error(`Total duration must be at least ${minDurationSeconds}s.`); return
            }
            if (!intervalTime || Number(intervalTime) < 1) {
                toast.error('Interval time must be at least 1s.'); return
            }
            const manualSequence = [{ type: 'analyse', intervals: 'unbounded', intervalTime: Number(intervalTime) }]
            const success = await analyzeWebsite(url, manualSequence, totalDurationSeconds, 'manual')
            if (success) navigate('/dashboard/result')
            return
        }

        const hasAnalyse = sequence.some(item => item.type === 'analyse')
        if (hasAnalyse && (!intervalTime || intervalTime < 1)) {
            toast.error('Interval time must be at least 1s.'); return
        }

        if (totalDurationSeconds < 1) {
            toast.error('Total duration must be at least 1 second.'); return
        }

        for (let i = 0; i < sequence.length; i++) {
            const item = sequence[i]; const num = i + 1

            if (item.type === 'analyse') {
                if (!item.intervals || item.intervals < 1) { toast.error(`Item ${num} (Analyse): must have at least 1 interval.`); return }
                continue
            }

            if ((item.type === 'hover' || item.type === 'click') && !item.selector.trim()) {
                toast.error(`Item ${num} (${item.type}): selector is required.`); return
            }
            if (item.type === 'search') {
                if (!item.selector.trim()) { toast.error(`Item ${num} (search): selector is required.`); return }
                if (!item.query.trim())    { toast.error(`Item ${num} (search): query is required.`); return }
            }
            if (item.type === 'login') {
                if (!item.emailSelector.trim())    { toast.error(`Item ${num} (login): email field selector is required.`); return }
                if (!item.passwordSelector.trim()) { toast.error(`Item ${num} (login): password field selector is required.`); return }
                if (!item.submitSelector.trim())   { toast.error(`Item ${num} (login): submit button selector is required.`); return }
                if (!item.email.trim())            { toast.error(`Item ${num} (login): email is required.`); return }
                if (!item.password.trim())         { toast.error(`Item ${num} (login): password is required.`); return }
            }
        }

        if (rawEstimatedSeconds > totalDurationSeconds) {
            toast.error(`This sequence needs about ${formatDuration(rawEstimatedSeconds)} to run, but Total Duration is only ${formatDuration(totalDurationSeconds)}. Increase the duration, or trim your steps to fit.`)
            return
        }

        const sequenceToSubmit = sequence.map(item =>
            item.type === 'analyse' ? { ...item, intervalTime } : item
        )

        const success = await analyzeWebsite(url, sequenceToSubmit, totalDurationSeconds, 'auto')
        if (success) navigate('/dashboard/result')
    }

    const percent = progress.total > 0 ? Math.min(99, (progress.elapsed / progress.total) * 100) : 0
    const remaining = progress.total > 0 ? Math.max(0, Math.round(progress.total - progress.elapsed)) : 0
    const remainingText = remaining >= 60 ? `${Math.floor(remaining / 60)}m ${remaining % 60}s` : `${remaining}s`

    const analyseBlockCount = sequence.filter(i => i.type === 'analyse').length
    const intervalTime = Number(intervalTimeMin || 0) * 60 + Number(intervalTimeSec || 0)

    const rawEstimatedSeconds = (() => {
        const actionTime  = sequence.filter(i => i.type !== 'analyse').reduce((s, i) => s + (STEP_TIME[i.type] || 1), 0)
        const captureTime = sequence.filter(i => i.type === 'analyse').reduce((s, i) => s + (Number(i.intervals) || 0) * (Number(intervalTime) || 0), 0)
        const minSeconds = PAGE_LOAD_ESTIMATE_SECONDS + LIGHTHOUSE_AUDIT_SECONDS
        return Math.max(minSeconds, PAGE_LOAD_ESTIMATE_SECONDS + actionTime + captureTime)
    })()

    const totalDurationSeconds = Number(durationMin || 0) * 60 + Number(durationSec || 0)
    const overBudget = totalDurationSeconds > 0 && rawEstimatedSeconds > totalDurationSeconds

    const estimatedSeconds = `~${formatDuration(rawEstimatedSeconds)}`

    const recent = userAnalyses.slice(0, 3)
    const canSubmit = mode === 'manual'
        ? !loading && url && totalDurationSeconds >= minDurationSeconds && Number(intervalTime) >= 1
        : !loading && url && totalDurationSeconds >= 1
            && (analyseBlockCount === 0 || Number(intervalTime) >= 1)
            && sequence.filter(i => i.type === 'analyse').every(i => Number(i.intervals) >= 1)
            && !overBudget

    return (
        <div className="min-h-full px-6 py-12">
            <div className="max-w-7xl mx-auto">

                {/* Page header */}
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">New Analysis</h1>
                    <p className="text-gray-500 text-sm mt-1">
                        {mode === 'manual'
                            ? 'Open a live browser window and profile your website while you use it yourself'
                            : 'Build a sequence of actions and analysis captures to profile your website'}
                    </p>
                </div>

                {/* Main grid: form + sidebar */}
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">

                    {/* ── Form card ──────────────────────────────────── */}
                    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                        <form onSubmit={onSubmitHandler}>

                            {/* Mode toggle */}
                            <div className="px-7 pt-6 flex gap-2">
                                <button type="button" onClick={() => setMode('auto')} disabled={loading}
                                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors disabled:opacity-50 ${
                                        mode === 'auto'
                                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-200'
                                            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700'
                                    }`}>
                                    Automated Sequence
                                </button>
                                <button type="button" onClick={() => setMode('manual')} disabled={loading}
                                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors disabled:opacity-50 ${
                                        mode === 'manual'
                                            ? 'bg-purple-600 text-white border-purple-600 shadow-sm shadow-purple-200'
                                            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700'
                                    }`}>
                                    Live Session
                                </button>
                            </div>

                            {/* URL */}
                            <div className="px-7 py-6 border-b border-gray-100">
                                <label className="block text-sm font-semibold text-gray-700 mb-3">Website URL</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                                        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <circle cx="12" cy="12" r="10" />
                                            <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" strokeLinecap="round" />
                                        </svg>
                                    </span>
                                    <input
                                        type="url" value={url} onChange={e => setUrl(e.target.value)}
                                        placeholder="https://example.com" required disabled={loading}
                                        className="w-full bg-gray-50 focus:bg-white border border-gray-200 rounded-xl pl-11 pr-4 py-3 text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all disabled:opacity-50"
                                    />
                                </div>

                                <label className="block text-sm font-semibold text-gray-700 mt-4 mb-3">Total Duration</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number" min="0"
                                        value={durationMin} onChange={e => setDurationMin(e.target.value)}
                                        disabled={loading}
                                        className="w-20 bg-gray-50 focus:bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all disabled:opacity-50"
                                    />
                                    <span className="text-xs text-gray-400">min</span>
                                    <input
                                        type="number" min="0" max="59"
                                        value={durationSec} onChange={e => setDurationSec(e.target.value)}
                                        disabled={loading}
                                        className="w-20 bg-gray-50 focus:bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all disabled:opacity-50"
                                    />
                                    <span className="text-xs text-gray-400">sec</span>
                                </div>
                                <p className="text-xs text-gray-400 mt-1.5">
                                    Minimum {minDurationSeconds}s (page load + Lighthouse audit)
                                </p>
                                {mode === 'auto' && overBudget && (
                                    <p className="text-xs text-red-500 font-medium mt-2">
                                        This sequence needs about {formatDuration(rawEstimatedSeconds)} to run, but Total Duration is only {formatDuration(totalDurationSeconds)}. Increase the duration, or trim your steps to fit.
                                    </p>
                                )}
                                {mode === 'manual' && totalDurationSeconds > 0 && totalDurationSeconds < minDurationSeconds && (
                                    <p className="text-xs text-red-500 font-medium mt-2">
                                        Total Duration must be at least {minDurationSeconds}s (page load + Lighthouse audit).
                                    </p>
                                )}
                            </div>

                            {/* Live session */}
                            {mode === 'manual' && (
                                <div className="px-7 py-6 border-b border-gray-100">
                                    <p className="text-sm font-semibold text-gray-700">Live Session</p>
                                    <p className="text-xs text-gray-400 mt-0.5 mb-4">
                                        A Chrome window will open, interact with the site yourself. Runtime metrics are captured automatically in the background until Total Duration ends.
                                    </p>

                                    <div className="flex items-center gap-2 bg-purple-50 border border-purple-100 rounded-xl px-4 py-2.5 flex-wrap">
                                        <span className="text-xs font-medium text-purple-700">Interval Time</span>
                                        <input
                                            type="number" min="0" max="5"
                                            value={intervalTimeMin}
                                            onChange={e => setIntervalTimeMin(e.target.value)}
                                            disabled={loading}
                                            className="w-14 bg-white border border-purple-200 rounded-lg px-2 py-1 text-sm text-center font-semibold text-purple-700 focus:outline-none focus:border-purple-500 disabled:opacity-50"
                                        />
                                        <span className="text-xs text-gray-500">m</span>
                                        <input
                                            type="number" min="0" max="59"
                                            value={intervalTimeSec}
                                            onChange={e => setIntervalTimeSec(e.target.value)}
                                            disabled={loading}
                                            className="w-14 bg-white border border-purple-200 rounded-lg px-2 py-1 text-sm text-center font-semibold text-purple-700 focus:outline-none focus:border-purple-500 disabled:opacity-50"
                                        />
                                        <span className="text-xs text-gray-500">s : how often runtime metrics are sampled</span>
                                    </div>

                                    {Number(intervalTime) >= 1 && totalDurationSeconds >= 1 && (
                                        <p className="text-xs text-gray-400 mt-2">
                                            ~{Math.floor(totalDurationSeconds / Number(intervalTime))} capture{Math.floor(totalDurationSeconds / Number(intervalTime)) !== 1 ? 's' : ''} over {formatDuration(totalDurationSeconds)}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Sequence builder */}
                            {mode === 'auto' && (
                            <div className="px-7 py-6 border-b border-gray-100">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <p className="text-sm font-semibold text-gray-700">Sequence</p>
                                        <p className="text-xs text-gray-400 mt-0.5">Mix actions and analysis captures: executed in order</p>
                                    </div>
                                    {url && (durationMin !== '' || durationSec !== '') && (
                                        <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${overBudget ? 'text-red-600 bg-red-50 border border-red-100' : 'text-blue-600 bg-blue-50 border border-blue-100'}`}>
                                            <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                                <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" strokeLinecap="round" />
                                            </svg>
                                            {estimatedSeconds}
                                        </span>
                                    )}
                                </div>

                                {sequence.some(i => i.type === 'analyse') && (
                                    <div className="flex items-center gap-2 mb-3 bg-purple-50 border border-purple-100 rounded-xl px-4 py-2.5 flex-wrap">
                                        <span className="text-xs font-medium text-purple-700">Interval Time</span>
                                        <input
                                            type="number" min="0" max="5"
                                            value={intervalTimeMin}
                                            onChange={e => setIntervalTimeMin(e.target.value)}
                                            disabled={loading}
                                            className="w-14 bg-white border border-purple-200 rounded-lg px-2 py-1 text-sm text-center font-semibold text-purple-700 focus:outline-none focus:border-purple-500 disabled:opacity-50"
                                        />
                                        <span className="text-xs text-gray-500">m</span>
                                        <input
                                            type="number" min="0" max="59"
                                            value={intervalTimeSec}
                                            onChange={e => setIntervalTimeSec(e.target.value)}
                                            disabled={loading}
                                            className="w-14 bg-white border border-purple-200 rounded-lg px-2 py-1 text-sm text-center font-semibold text-purple-700 focus:outline-none focus:border-purple-500 disabled:opacity-50"
                                        />
                                        <span className="text-xs text-gray-500">s : applied to every Analyse block below</span>
                                    </div>
                                )}

                                {sequence.length === 0 && (
                                    <div className="text-center py-10 border-2 border-dashed border-gray-100 rounded-xl mb-3">
                                        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                                            </svg>
                                        </div>
                                        <p className="text-sm text-gray-500 font-medium">No sequence yet</p>
                                        <p className="text-xs text-gray-400 mt-1">Optional : add steps to interact with the page and/or an Analyse block to capture runtime metrics. Leave empty to just run Lighthouse.</p>
                                    </div>
                                )}

                                <div className="space-y-2.5">
                                    {sequence.map((item, i) => {

                                        if (item.type === 'analyse') return (
                                            <div key={i} className="bg-purple-50 border border-purple-200 border-l-4 border-l-purple-500 rounded-xl p-4">
                                                <div className="flex items-center gap-3">
                                                    <span className="w-2 h-2 rounded-full shrink-0 bg-purple-500" />
                                                    <span className="text-xs text-gray-400 font-medium w-4 shrink-0">{i + 1}</span>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
                                                        </svg>
                                                        <span className="text-sm font-semibold text-purple-700">Analyse</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-1 flex-wrap">
                                                        <span className="text-xs text-gray-500">Intervals</span>
                                                        <input
                                                            type="number" min="1" max="50"
                                                            value={item.intervals}
                                                            onChange={e => updateItem(i, 'intervals', e.target.value)}
                                                            disabled={loading}
                                                            className="w-14 bg-white border border-purple-200 rounded-lg px-2 py-1 text-sm text-center font-semibold text-purple-700 focus:outline-none focus:border-purple-500 disabled:opacity-50"
                                                        />
                                                    </div>
                                                    <button type="button" onClick={() => removeItem(i)} disabled={loading} className="ml-auto text-gray-300 hover:text-red-400 transition-colors shrink-0 disabled:opacity-50">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" /></svg>
                                                    </button>
                                                </div>
                                            </div>
                                        )

                                        return (
                                            <div key={i} className={`bg-gray-50 border border-gray-200 border-l-4 ${STEP_BORDER[item.type]} rounded-xl p-2.5`}>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-gray-400 font-medium w-4 shrink-0">{i + 1}</span>
                                                    <StepTypeSelect value={item.type} onChange={type => changeStepType(i, type)} disabled={loading}
                                                        options={STEP_LABELS} dotColors={STEP_DOT} />
                                                    <span className="text-[11px] font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">
                                                        {STEP_TIME[item.type]}s
                                                    </span>
                                                    {(item.type === 'hover' || item.type === 'click') && (
                                                        <input disabled={loading} className={smInput} placeholder="CSS selector" value={item.selector} onChange={e => updateItem(i, 'selector', e.target.value)} />
                                                    )}
                                                    {item.type === 'scroll' && <span className="text-xs text-gray-400">Scrolls to bottom then back to top</span>}
                                                    {item.type === 'goBack' && <span className="text-xs text-gray-400">Navigates to the previous page</span>}
                                                    <button type="button" onClick={() => removeItem(i)} disabled={loading} className="ml-auto text-gray-300 hover:text-red-400 transition-colors shrink-0 disabled:opacity-50">
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" /></svg>
                                                    </button>
                                                </div>
                                                {item.type === 'search' && (
                                                    <div className="mt-2.5 ml-6 space-y-2">
                                                        <input disabled={loading} className={smInput} placeholder="CSS selector  (e.g. input[name='q'])" value={item.selector} onChange={e => updateItem(i, 'selector', e.target.value)} />
                                                        <input disabled={loading} className={smInput} placeholder="Search query  (e.g. shoes)" value={item.query} onChange={e => updateItem(i, 'query', e.target.value)} />
                                                    </div>
                                                )}
                                                {item.type === 'login' && (
                                                    <div className="mt-2.5 ml-6 space-y-3">
                                                        <div>
                                                            <p className="text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Selectors</p>
                                                            <div className="space-y-2">
                                                                <input disabled={loading} className={smInput} placeholder="Email field" value={item.emailSelector} onChange={e => updateItem(i, 'emailSelector', e.target.value)} />
                                                                <input disabled={loading} className={smInput} placeholder="Password field" value={item.passwordSelector} onChange={e => updateItem(i, 'passwordSelector', e.target.value)} />
                                                                <input disabled={loading} className={smInput} placeholder="Submit button" value={item.submitSelector} onChange={e => updateItem(i, 'submitSelector', e.target.value)} />
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Credentials</p>
                                                            <div className="space-y-2">
                                                                <input disabled={loading} className={smInput} placeholder="Email or username" type="text" value={item.email} onChange={e => updateItem(i, 'email', e.target.value)} />
                                                                <div className="relative">
                                                                    <input disabled={loading} className={smInput + ' pr-9'} placeholder="Password" type={showPasswords[i] ? 'text' : 'password'} value={item.password} onChange={e => updateItem(i, 'password', e.target.value)} />
                                                                    <button type="button" onClick={() => setShowPasswords(p => ({ ...p, [i]: !p[i] }))} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                                                        {showPasswords[i]
                                                                            ? <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" strokeLinecap="round"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" strokeLinecap="round"/><line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round"/></svg>
                                                                            : <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                                                        }
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>

                                <div className="flex gap-2 mt-3">
                                    <button type="button" onClick={addActionStep} disabled={loading}
                                        className="flex-1 py-2.5 border border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/50 transition-all disabled:opacity-50 font-medium">
                                        + Add Step
                                    </button>
                                    <button type="button" onClick={addAnalyseBlock} disabled={loading}
                                        className="flex-1 py-2.5 border border-dashed border-purple-200 rounded-xl text-sm text-purple-400 hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50/50 transition-all disabled:opacity-50 font-medium">
                                        + Add Analysis
                                    </button>
                                </div>
                            </div>
                            )}

                            {/* Submit / Progress */}
                            <div className="px-7 py-6 bg-gray-50/50">
                                {loading ? (
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2.5">
                                                <span className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin shrink-0" />
                                                <span className="text-sm font-medium text-gray-700">
                                                    Analysing <span className="text-blue-600 font-semibold">{url}</span>
                                                </span>
                                            </div>
                                            <span className="text-xs text-gray-400 tabular-nums">
                                                {remaining > 0 ? `~${remainingText} left` : 'Finishing up…'}
                                            </span>
                                        </div>
                                        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-blue-500 rounded-full transition-[width] duration-200 ease-linear" style={{ width: `${percent}%` }} />
                                        </div>
                                        <p className="text-xs text-gray-400 mt-2 text-center">{Math.round(percent)}% complete</p>
                                    </div>
                                ) : (
                                    <button type="submit" disabled={!canSubmit}
                                        className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2.5 text-sm shadow-sm shadow-blue-200 disabled:shadow-none">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                            <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                        Run Analysis
                                    </button>
                                )}
                            </div>

                        </form>
                    </div>

                    {/* ── Right sidebar ──────────────────────────────── */}
                    <div className="space-y-4">

                        {/* Recent analyses */}
                        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                                <p className="text-sm font-semibold text-gray-800">Recent Analyses</p>
                                {recent.length > 0 && (
                                    <button onClick={() => navigate('/dashboard/history')}
                                        className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors">
                                        View all →
                                    </button>
                                )}
                            </div>

                            {recent.length === 0 ? (
                                <div className="px-5 py-8 text-center">
                                    <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <circle cx="12" cy="12" r="10" />
                                            <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
                                        </svg>
                                    </div>
                                    <p className="text-sm text-gray-500 font-medium">No analyses yet</p>
                                    <p className="text-xs text-gray-400 mt-1">Your past scans will appear here</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-100">
                                    {recent.map((a) => {
                                        const lcp = a.lighthouseData?.lcp
                                        const tbt = a.lighthouseData?.tbt
                                        const cls = a.lighthouseData?.cls
                                        const d = new Date(a.createdAt)
                                        const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                                        const timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

                                        return (
                                            <div key={a._id} className="px-5 py-4">
                                                <div className="flex items-center gap-1.5">
                                                    <p className="text-sm font-semibold text-gray-800 truncate" title={a.url}>
                                                        {a.url.replace(/^https?:\/\//, '')}
                                                    </p>
                                                    {a.mode === 'manual' && (
                                                        <span className="shrink-0 text-[10px] font-semibold text-purple-600 bg-purple-50 border border-purple-100 px-1.5 py-0.5 rounded-full">Live Session</span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-400 mt-0.5">
                                                    {dateStr} · {timeStr}
                                                    {a.totalDuration != null && ` · ${formatDuration(a.totalDuration)}`}
                                                </p>

                                                <div className="flex items-center gap-3 mt-2.5">
                                                    {[
                                                        { key: 'lcp', label: 'LCP', val: lcp, fmt: v => `${Math.round(v)}ms` },
                                                        { key: 'tbt', label: 'TBT', val: tbt, fmt: v => `${Math.round(v)}ms` },
                                                        { key: 'cls', label: 'CLS', val: cls, fmt: v => v.toFixed(3) },
                                                    ].map(({ key, label, val, fmt }) => (
                                                        <div key={key}>
                                                            <p className="text-[10px] text-gray-400">{label}</p>
                                                            <p className={`text-xs font-semibold ${metricColor(key, val)}`}>
                                                                {val != null ? fmt(val) : '—'}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="flex items-center gap-2 mt-3">
                                                    <button
                                                        onClick={() => window.open(`/dashboard/analysis/${a._id}`, '_blank')}
                                                        className="flex-1 text-xs font-medium text-gray-600 border border-gray-200 hover:border-gray-300 hover:text-gray-900 py-1.5 rounded-lg transition-colors text-center"
                                                    >
                                                        View
                                                    </button>
                                                    <button
                                                        onClick={() => rerun(a)}
                                                        className="flex-1 text-xs font-medium text-blue-600 border border-blue-200 hover:bg-blue-50 py-1.5 rounded-lg transition-colors text-center"
                                                    >
                                                        Re-run
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>


                    </div>
                </div>

                {/* ── What gets measured ─────────────────────────────── */}
                <div className="mt-6 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="px-7 py-5 border-b border-gray-100">
                        <p className="text-sm font-semibold text-gray-800">What gets measured</p>
                        <p className="text-xs text-gray-400 mt-0.5">Every analysis runs both a Lighthouse audit and real-time runtime monitoring</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">

                        {/* Lighthouse */}
                        <div className="px-7 py-6">
                            <div className="flex items-center gap-2 mb-5">
                                <div className="w-7 h-7 bg-yellow-50 rounded-lg flex items-center justify-center">
                                    <svg width="14" height="14" fill="none" stroke="#ca8a04" strokeWidth="2.5" viewBox="0 0 24 24">
                                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-gray-800">Lighthouse Audit</p>
                                    <p className="text-xs text-gray-400">Core Web Vitals & performance scores</p>
                                </div>
                            </div>
                            <div className="space-y-3">
                                {LIGHTHOUSE_DISPLAY.map(({ label, desc }) => (
                                    <div key={label} className="flex items-center gap-3">
                                        <span className="w-8 text-xs font-bold text-gray-700 shrink-0">{label}</span>
                                        <span className="text-xs text-gray-500">{desc}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Runtime */}
                        <div className="px-7 py-6">
                            <div className="flex items-center gap-2 mb-5">
                                <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center">
                                    <svg width="14" height="14" fill="none" stroke="#2563eb" strokeWidth="2.5" viewBox="0 0 24 24">
                                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-gray-800">Runtime Monitoring</p>
                                    <p className="text-xs text-gray-400">Captured at each Analyse block interval</p>
                                </div>
                            </div>
                            <div className="space-y-3">
                                {RUNTIME_METRICS.map(({ label, desc }) => (
                                    <div key={label} className="flex items-center gap-3">
                                        <span className="w-28 text-xs font-bold text-gray-700 shrink-0">{label}</span>
                                        <span className="text-xs text-gray-500">{desc}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                    </div>
                </div>

            </div>
        </div>
    )
}

export default Home
