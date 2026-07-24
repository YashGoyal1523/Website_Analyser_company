import { useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppContext } from '../context/AppContext'

const stats = [
    { value: '6', label: 'Core Web Vitals measured' },
    { value: '6', label: 'Runtime metrics tracked' },
    { value: '∞', label: 'Configurable intervals' },
]

const features = [
    {
        icon: (
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
        title: 'Lighthouse Audit',
        desc: 'Every Core Web Vital (LCP, FCP, TTFB, TBT, CLS, Speed Index) measured and colour-coded against real-world thresholds.',
    },
    {
        icon: (
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
        title: 'Runtime Monitoring',
        desc: 'JS heap, DOM nodes, event listeners and CPU timings captured at every Analyse block in your sequence.',
    },
    {
        icon: (
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" strokeLinecap="round" />
            </svg>
        ),
        title: 'Side-by-side Compare',
        desc: 'Pick any two past scans and compare them instantly: dual-line charts, metric deltas, and winner badges at a glance.',
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
        title: 'Build your sequence',
        desc: 'Chain interaction steps (click, scroll, search, login) and drop in Analyse blocks wherever you want metrics captured.',
    },
    {
        n: '03',
        title: 'View & compare results',
        desc: 'Get Lighthouse audits, runtime charts, and compare any two scans side-by-side.',
    },
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
                className="relative overflow-hidden px-6 pt-24 pb-24 text-center"
                style={{ background: 'radial-gradient(ellipse 80% 40% at 50% -10%, rgba(59,130,246,0.08), transparent)' }}
            >
                <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-600 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                    Website Performance Analytics
                </div>

                <h1 className="text-5xl sm:text-6xl font-bold text-gray-950 tracking-tight leading-[1.1] mb-5 max-w-2xl mx-auto">
                    Know exactly how your website performs
                </h1>

                <p className="text-lg text-gray-500 mb-10 max-w-xl mx-auto leading-relaxed">
                    Run Lighthouse audits and real-time runtime monitoring on any URL. Get actionable data in minutes.
                </p>

                <button
                    onClick={handleCTA}
                    className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors text-[15px] shadow-sm shadow-blue-200"
                >
                    {token ? 'Go to Dashboard →' : 'Start Analysing →'}
                </button>

                {/* Browser-frame product mockup */}
                <div className="max-w-3xl mx-auto mt-14 rounded-2xl overflow-hidden border border-gray-200 shadow-2xl shadow-blue-100/60 text-left">
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
            </section>

            {/* ── Stats bar ─────────────────────────────────────────── */}
            <section className="border-y border-gray-100 bg-gray-50/70 py-12">
                <div className="max-w-3xl mx-auto grid grid-cols-3 gap-8 text-center">
                    {stats.map(({ value, label }) => (
                        <div key={label}>
                            <p className="text-4xl font-bold text-gray-900 tracking-tight">{value}</p>
                            <p className="text-sm text-gray-500 mt-1.5">{label}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── Features ──────────────────────────────────────────── */}
            <section id="features" className="py-24 px-6">
                <div className="max-w-4xl mx-auto">
                    <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 text-center mb-3">
                        Features
                    </p>
                    <h2 className="text-3xl font-bold text-gray-900 tracking-tight text-center mb-14">
                        Everything you need to analyse performance
                    </h2>
                    <div className="grid grid-cols-3 gap-6">
                        {features.map(({ icon, title, desc }) => (
                            <div key={title} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-gray-300 transition-all">
                                <div className="w-9 h-9 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center mb-4">
                                    {icon}
                                </div>
                                <h3 className="font-semibold text-gray-900 mb-1.5 text-[15px]">{title}</h3>
                                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── How it Works ──────────────────────────────────────── */}
            <section id="how-it-works" className="bg-gray-50/70 border-y border-gray-100 py-24 px-6">
                <div className="max-w-4xl mx-auto">
                    <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 text-center mb-3">
                        How it works
                    </p>
                    <h2 className="text-3xl font-bold text-gray-900 text-center tracking-tight mb-16">
                        Three steps to better performance
                    </h2>
                    <div className="grid grid-cols-3 gap-10">
                        {steps.map(({ n, title, desc }) => (
                            <div key={n}>
                                <p className="text-5xl font-black text-gray-200 leading-none mb-4 select-none">{n}</p>
                                <h3 className="text-base font-semibold text-gray-900 mb-2">{title}</h3>
                                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── CTA banner ────────────────────────────────────────── */}
            <section className="bg-blue-600 py-20 px-6 text-center">
                <h2 className="text-3xl font-bold text-white tracking-tight mb-3">
                    Ready to audit your website?
                </h2>
                <p className="text-blue-200 mb-8 text-base">
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
