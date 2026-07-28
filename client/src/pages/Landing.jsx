import { useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppContext } from '../context/AppContext'

const stats = [
    {
        value: '6', label: 'Core Web Vitals measured',
        icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" /></svg>,
    },
    {
        value: '7', label: 'Runtime metrics tracked',
        icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" /></svg>,
    },
    {
        value: '2', label: 'Analysis modes',
        icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18" strokeLinecap="round" strokeLinejoin="round" /></svg>,
    },
    {
        value: '7', label: 'Sequence step types',
        icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" strokeLinejoin="round" /></svg>,
    },
]

const features = [
    {
        icon: (
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
        title: 'Lighthouse Audit',
        desc: 'Every Core Web Vital measured and colour-coded against real-world thresholds.',
        badges: ['LCP', 'FCP', 'TBT', 'CLS'],
        accent: 'bg-blue-50 text-blue-600',
    },
    {
        icon: (
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
        title: 'Runtime Monitoring',
        desc: 'JS heap, DOM nodes, event listeners, process memory and CPU timings over time.',
        accent: 'bg-violet-50 text-violet-600',
        stroke: '#7c3aed',
    },
    {
        icon: (
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M12 3v12m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
        title: 'History & Export',
        desc: 'Every scan saved automatically. Search, re-run, or download a full PDF report.',
        accent: 'bg-amber-50 text-amber-600',
    },
    {
        icon: (
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" strokeLinecap="round" />
            </svg>
        ),
        title: 'Side-by-side Compare',
        desc: 'Pick any two past scans: dual-line charts, metric deltas, and winner badges.',
        accent: 'bg-emerald-50 text-emerald-600',
    },
]

const steps = [
    {
        n: '01',
        title: 'Enter a URL',
        desc: 'Any public URL, or a password-protected page using the built-in Login step automation.',
    },
    {
        n: '02',
        title: 'Script it, or drive it live',
        desc: 'Automated Sequence: chain interaction steps (click, hover, search, login, scroll, go back, switch tab) with Analyse blocks dropped wherever you want metrics captured. Or skip scripting entirely with a Live Session: interact with the site yourself while metrics are captured automatically in the background.',
    },
    {
        n: '03',
        title: 'View & compare results',
        desc: 'Get Lighthouse audits, runtime charts, and compare any two scans side-by-side.',
    },
]

const lighthouseMetrics = [
    { label: 'LCP',  desc: 'Largest Contentful Paint' },
    { label: 'FCP',  desc: 'First Contentful Paint' },
    { label: 'TTFB', desc: 'Time to First Byte' },
    { label: 'TBT',  desc: 'Total Blocking Time' },
    { label: 'SI',   desc: 'Speed Index' },
    { label: 'CLS',  desc: 'Cumulative Layout Shift' },
]

const runtimeMetricsList = [
    { label: 'JS Heap Used',    desc: 'JavaScript memory in use' },
    { label: 'DOM Nodes',       desc: 'Total nodes in the document' },
    { label: 'Event Listeners', desc: 'Active JS event listeners' },
    { label: 'Script Duration', desc: 'Time spent executing scripts' },
    { label: 'Task Duration',   desc: 'Total main-thread task time' },
    { label: 'Layout Duration', desc: 'Time spent on layout & paint' },
    { label: 'Process Memory',  desc: 'OS-level renderer memory (RSS)' },
]

const mockMetrics = [
    { name: 'LCP', value: '1.2 s', badge: 'Good', color: 'text-green-600 bg-green-50' },
    { name: 'FCP', value: '0.8 s', badge: 'Good', color: 'text-green-600 bg-green-50' },
    { name: 'TBT', value: '45 ms', badge: 'Good', color: 'text-green-600 bg-green-50' },
    { name: 'CLS', value: '0.04',  badge: 'Good', color: 'text-green-600 bg-green-50' },
    { name: 'TTFB', value: '210 ms', badge: 'Fair', color: 'text-yellow-600 bg-yellow-50' },
    { name: 'SI', value: '1.5 s',  badge: 'Good', color: 'text-green-600 bg-green-50' },
]

const Landing = () => {
    const { token, openAuth } = useContext(AppContext)
    const navigate = useNavigate()

    const handleCTA = () => token ? navigate('/dashboard') : openAuth('login')

    return (
        <div className="min-h-screen bg-white">

            {/* ── Hero ──────────────────────────────────────────────── */}
            <section
                className="relative overflow-hidden px-6 pt-16 pb-16"
                style={{ background: 'radial-gradient(ellipse 80% 40% at 50% -10%, rgba(59,130,246,0.08), transparent)' }}
            >
                <div className="max-w-340 mx-auto grid grid-cols-[1.05fr_0.95fr] gap-14 items-center">
                    <div>
                        <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-600 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
                            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                            Website Performance Analytics
                        </div>

                        <h1 className="text-4xl font-bold text-gray-950 tracking-tight leading-[1.1] mb-5">
                            Know exactly how your website performs
                        </h1>

                        <p className="text-lg text-gray-500 mb-8 leading-relaxed max-w-lg">
                            Run Lighthouse audits and real-time runtime monitoring on any URL. Script a sequence or drive it live, then export a full report. Get actionable data in minutes.
                        </p>

                        <button
                            onClick={handleCTA}
                            className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors text-[15px] shadow-sm shadow-blue-200"
                        >
                            {token ? 'Go to Dashboard →' : 'Start Analysing →'}
                        </button>
                    </div>

                    {/* Browser-frame product mockup */}
                    <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-2xl shadow-blue-100/60">
                        {/* Chrome bar */}
                        <div className="bg-gray-100 px-4 py-3 border-b border-gray-200 flex items-center gap-3">
                            <div className="flex items-center gap-1.5 shrink-0">
                                <div className="w-3 h-3 rounded-full bg-red-400" />
                                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                                <div className="w-3 h-3 rounded-full bg-green-400" />
                            </div>
                            <div className="flex-1 bg-white rounded-md h-6 flex items-center px-3 gap-2">
                                <svg width="10" height="10" fill="none" stroke="#9ca3af" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                                </svg>
                                <span className="text-xs text-gray-400">example.com · Analysis Results</span>
                            </div>
                        </div>

                        {/* App preview */}
                        <div className="bg-gray-50 p-5">
                            {/* Score ring + metric grid */}
                            <div className="flex items-start gap-5 mb-4">
                                {/* Ring */}
                                <div className="shrink-0 flex flex-col items-center gap-1.5">
                                    <div className="relative w-18 h-18">
                                        <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                                            <circle cx="40" cy="40" r="32" fill="none" stroke="#e5e7eb" strokeWidth="7" />
                                            <circle
                                                cx="40" cy="40" r="32"
                                                fill="none" stroke="#22c55e" strokeWidth="7"
                                                strokeDasharray="184 201"
                                                strokeLinecap="round"
                                            />
                                        </svg>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                                            <span className="text-lg font-bold text-gray-900 leading-none">92</span>
                                            <span className="text-[8px] text-gray-400 uppercase tracking-wide mt-0.5">Score</span>
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Good</span>
                                </div>

                                {/* Metric cards */}
                                <div className="flex-1 grid grid-cols-3 gap-2.5">
                                    {mockMetrics.map(({ name, value, badge, color }) => (
                                        <div key={name} className="bg-white rounded-xl p-2.5 border border-gray-100 shadow-sm">
                                            <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">{name}</p>
                                            <p className="text-sm font-bold text-gray-900 mt-0.5">{value}</p>
                                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${color}`}>{badge}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Sparkline chart */}
                            <div className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-sm">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-semibold text-gray-700">JS Heap Memory</p>
                                    <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">60 s window</span>
                                </div>
                                <svg viewBox="0 0 560 60" className="w-full h-14" preserveAspectRatio="none">
                                    <defs>
                                        <linearGradient id="heapGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
                                            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                                        </linearGradient>
                                    </defs>
                                    <path
                                        d="M0,46 C40,42 70,32 110,36 C150,40 180,50 230,42 C280,34 310,18 360,22 C410,26 440,38 490,32 C520,28 545,24 560,26"
                                        fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round"
                                    />
                                    <path
                                        d="M0,46 C40,42 70,32 110,36 C150,40 180,50 230,42 C280,34 310,18 360,22 C410,26 440,38 490,32 C520,28 545,24 560,26 L560,60 L0,60 Z"
                                        fill="url(#heapGrad)"
                                    />
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Stats band, icon cards instead of plain divided text ─── */}
            <section className="border-y border-gray-100 bg-gray-50/70 py-12 px-6">
                <div className="max-w-340 mx-auto grid grid-cols-4 gap-5">
                    {stats.map(({ value, label, icon }) => (
                        <div key={label} className="bg-white border border-gray-200 rounded-2xl p-5 flex items-center gap-4">
                            <div className="w-11 h-11 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                                {icon}
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-gray-900 tracking-tight leading-none">{value}</p>
                                <p className="text-xs text-gray-500 mt-1">{label}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── Features, bento-style: the audit is the anchor tile ──── */}
            <section id="features" className="py-20 px-6">
                <div className="max-w-340 mx-auto">
                    <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-3">
                        Features
                    </p>
                    <h2 className="text-3xl font-bold text-gray-900 tracking-tight mb-3">
                        Everything you need to analyse performance
                    </h2>
                    <p className="text-sm text-gray-500 mb-12 max-w-xl">
                        One tool covering the load-time audit, the runtime behaviour, and everything you do with the results afterward.
                    </p>
                    {/* Uniform 4-up grid, every card the same size and same white style.
                        Only the icon accent colour and the small decorative footer differ
                        per feature, so nothing is singled out as "the important one". */}
                    <div className="grid grid-cols-4 gap-5">
                        {features.map(({ icon, title, desc, badges, accent }, i) => (
                            <div key={title} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-gray-300 transition-all flex flex-col">
                                <div className={`w-10 h-10 ${accent} rounded-lg flex items-center justify-center mb-5 shrink-0`}>
                                    {icon}
                                </div>
                                <h3 className="font-semibold text-gray-900 mb-1.5 text-[15px]">{title}</h3>
                                <p className="text-sm text-gray-500 leading-relaxed mb-4">{desc}</p>

                                {i === 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-auto">
                                        {badges.map(b => (
                                            <span key={b} className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded-full">{b}</span>
                                        ))}
                                    </div>
                                )}

                                {i === 1 && (
                                    /* Mini sparkline, echoing the hero mockup's chart */
                                    <svg viewBox="0 0 200 36" className="w-full h-9 mt-auto" preserveAspectRatio="none">
                                        <path
                                            d="M0,26 C15,24 25,14 40,18 C55,22 65,30 80,24 C95,18 105,8 120,12 C135,16 145,22 160,18 C175,14 185,10 200,14"
                                            fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" opacity="0.7"
                                        />
                                    </svg>
                                )}

                                {i === 2 && (
                                    /* Mini "past scans" rows, echoing the History page */
                                    <div className="mt-auto space-y-1.5">
                                        {['example.com', 'the-internet…app.com'].map(url => (
                                            <div key={url} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5">
                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                                                <span className="text-[11px] text-gray-500 truncate">{url}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {i === 3 && (
                                    /* Mini A-vs-B comparison visual, echoing the Compare page */
                                    <div className="mt-auto flex items-center justify-between gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
                                        <div className="text-center">
                                            <p className="text-[9px] font-semibold text-indigo-600">A</p>
                                            <p className="text-sm font-bold text-gray-900">85</p>
                                        </div>
                                        <span className="text-gray-300 text-[10px]">vs</span>
                                        <div className="text-center">
                                            <p className="text-[9px] font-semibold text-amber-600">B</p>
                                            <p className="text-sm font-bold text-gray-900">92</p>
                                        </div>
                                        <span className="text-[9px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">+7</span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── What gets measured, metrics live inside cards, not bare text ─ */}
            <section className="bg-gray-50/70 border-y border-gray-100 py-20 px-6">
                <div className="max-w-340 mx-auto">
                    <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-3">
                        Under the hood
                    </p>
                    <h2 className="text-3xl font-bold text-gray-900 tracking-tight mb-12">
                        What gets measured, every single run
                    </h2>
                    <div className="grid grid-cols-[1fr_1.2fr] gap-8">
                        <div className="bg-white border border-gray-200 rounded-2xl p-7 shadow-sm">
                            <div className="flex items-center gap-2 mb-6">
                                <div className="w-7 h-7 bg-yellow-50 rounded-lg flex items-center justify-center">
                                    <svg width="14" height="14" fill="none" stroke="#ca8a04" strokeWidth="2.5" viewBox="0 0 24 24">
                                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </div>
                                <h3 className="font-semibold text-gray-900">Lighthouse Audit</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                {lighthouseMetrics.map(({ label, desc }) => (
                                    <div key={label} className="flex items-baseline gap-2.5">
                                        <span className="text-xs font-bold text-gray-700 shrink-0">{label}</span>
                                        <span className="text-xs text-gray-500">{desc}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-2xl p-7 shadow-sm">
                            <div className="flex items-center gap-2 mb-6">
                                <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center">
                                    <svg width="14" height="14" fill="none" stroke="#2563eb" strokeWidth="2.5" viewBox="0 0 24 24">
                                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </div>
                                <h3 className="font-semibold text-gray-900">Runtime Monitoring</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                {runtimeMetricsList.map(({ label, desc }) => (
                                    <div key={label} className="flex items-baseline gap-2.5">
                                        <span className="text-xs font-bold text-gray-700 shrink-0 w-28">{label}</span>
                                        <span className="text-xs text-gray-500">{desc}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── How it Works, connected timeline instead of 3 flat blocks ─ */}
            <section id="how-it-works" className="py-20 px-6">
                <div className="max-w-340 mx-auto">
                    <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-3">
                        How it works
                    </p>
                    <h2 className="text-3xl font-bold text-gray-900 tracking-tight mb-14">
                        Three steps to better performance
                    </h2>
                    <div className="relative grid grid-cols-3 gap-10">
                        <div className="absolute top-6 left-[16.5%] right-[16.5%] h-px bg-gray-200 hidden md:block" />
                        {steps.map(({ n, title, desc }, i) => (
                            <div key={n} className="relative">
                                <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold relative z-10 mb-5">
                                    {i + 1}
                                </div>
                                <p className="text-xs font-semibold text-gray-400 tracking-widest mb-1.5">STEP {n}</p>
                                <h3 className="text-base font-semibold text-gray-900 mb-2">{title}</h3>
                                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── CTA banner ────────────────────────────────────────── */}
            <section className="bg-blue-600 py-14 px-6 text-center">
                <h2 className="text-3xl font-bold text-white tracking-tight mb-3">
                    Ready to audit your website?
                </h2>
                <p className="text-blue-200 mb-6 text-base">
                    Free to use.
                </p>
                <button
                    onClick={handleCTA}
                    className="bg-white text-blue-600 hover:bg-blue-50 font-semibold px-8 py-3.5 rounded-xl transition-colors text-[15px]"
                >
                    {token ? 'Go to Dashboard →' : 'Get Started →'}
                </button>
            </section>

            {/* ── Footer ────────────────────────────────────────────── */}
            <footer className="border-t border-gray-100 py-8 px-6 text-center">
                <div className="flex items-center justify-center gap-2">
                    <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center">
                        <svg width="11" height="11" fill="none" stroke="#fff" strokeWidth="2.5" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" strokeLinecap="round" />
                        </svg>
                    </div>
                    <span className="text-sm font-semibold text-gray-700">Website Analyser</span>
                </div>
            </footer>

        </div>
    )
}

export default Landing
