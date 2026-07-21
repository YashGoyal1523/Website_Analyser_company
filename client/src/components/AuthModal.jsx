import { useContext, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppContext } from '../context/AppContext'

const IconUser = () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="7" r="4" />
    </svg>
)

const IconMail = () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" strokeLinecap="round" />
    </svg>
)

const IconLock = () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" strokeLinecap="round" />
    </svg>
)

const IconEye = ({ off }) => off ? (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" strokeLinecap="round" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" strokeLinecap="round" />
        <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round" />
    </svg>
) : (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
)

const INPUT = 'w-full border border-gray-200 rounded-xl pl-10 py-3 text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all bg-gray-50 focus:bg-white'

const AuthModal = ({ onClose, initialMode = 'login' }) => {
    const [mode, setMode] = useState(initialMode)
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const { login, register } = useContext(AppContext)
    const navigate = useNavigate()

    const switchMode = (m) => {
        setMode(m)
        setName('')
        setEmail('')
        setPassword('')
        setShowPassword(false)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setSubmitting(true)
        const success = mode === 'login'
            ? await login(email, password)
            : await register(name, email, password)
        setSubmitting(false)
        if (success) {
            onClose()
            navigate('/dashboard')
        }
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
            <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden relative">

                {/* Top accent bar */}
                <div className="h-1 w-full bg-linear-to-r from-blue-500 via-blue-600 to-blue-500" />

                {/* Close */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    aria-label="Close"
                >
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                    </svg>
                </button>

                {/* Header */}
                <div className="px-8 pt-7 pb-6">
                    {/* Brand */}
                    <div className="flex items-center gap-2 mb-6">
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
                            <svg width="14" height="14" fill="none" stroke="#fff" strokeWidth="2.5" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" strokeLinecap="round" />
                            </svg>
                        </div>
                        <span className="text-gray-900 font-semibold text-[15px]">Website Analyser</span>
                    </div>

                    <p className="text-xl font-bold text-gray-900 mb-1">
                        {mode === 'login' ? 'Welcome back' : 'Create an account'}
                    </p>
                    <p className="text-sm text-gray-500">
                        {mode === 'login'
                            ? 'Sign in to access your dashboard'
                            : 'Get started for free — no credit card needed'}
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="px-8 pb-8 flex flex-col gap-4">

                    {mode === 'register' && (
                        <Field label="Full Name">
                            <FieldIcon><IconUser /></FieldIcon>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="Your full name"
                                required
                                disabled={submitting}
                                className={INPUT}
                            />
                        </Field>
                    )}

                    <Field label="Email">
                        <FieldIcon><IconMail /></FieldIcon>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                            disabled={submitting}
                            className={INPUT}
                        />
                    </Field>

                    <Field label="Password">
                        <FieldIcon><IconLock /></FieldIcon>
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            disabled={submitting}
                            className={INPUT + ' pr-11'}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(p => !p)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                            tabIndex={-1}
                        >
                            <IconEye off={showPassword} />
                        </button>
                    </Field>

                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full mt-1 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm shadow-blue-200"
                    >
                        {submitting ? (
                            <>
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                {mode === 'login' ? 'Signing in…' : 'Creating account…'}
                            </>
                        ) : (
                            mode === 'login' ? 'Sign In' : 'Create Account'
                        )}
                    </button>

                    <p className="text-center text-sm text-gray-400">
                        {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                        <button
                            type="button"
                            onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
                            className="text-blue-600 hover:text-blue-700 font-medium transition-colors"
                        >
                            {mode === 'login' ? 'Sign up' : 'Sign in'}
                        </button>
                    </p>

                </form>
            </div>
        </div>
    )
}

const Field = ({ label, children }) => (
    <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
        <div className="relative">{children}</div>
    </div>
)

const FieldIcon = ({ children }) => (
    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
        {children}
    </span>
)

export default AuthModal
