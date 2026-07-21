import { useContext } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { AppContext } from '../context/AppContext'

const Navbar = () => {
    const navigate = useNavigate()
    const location = useLocation()
    const { user, logout, openAuth } = useContext(AppContext)
    const onDashboard = location.pathname.startsWith('/dashboard')
    const isViewPage = location.pathname.startsWith('/dashboard/analysis') || location.pathname.startsWith('/dashboard/compare')

    if (isViewPage) return (
        <nav
            className="sticky top-0 z-40 shadow-lg"
            style={{ background: 'linear-gradient(135deg, #4338ca 0%, #1d4ed8 100%)' }}
        >
            <div className="px-6 flex items-center h-16">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0 backdrop-blur-sm">
                        <svg width="15" height="15" fill="none" stroke="#fff" strokeWidth="2.5" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" strokeLinecap="round" />
                        </svg>
                    </div>
                    <span className="text-white font-semibold text-[17px] tracking-[-0.3px]">Website Analyser</span>
                </div>
            </div>
        </nav>
    )

    const handleLogout = () => {
        logout()
        navigate('/')
    }

    return (
        <nav
            className="sticky top-0 z-40 shadow-lg"
            style={{ background: 'linear-gradient(135deg, #4338ca 0%, #1d4ed8 100%)' }}
        >
            <div className="px-6 flex items-center justify-between h-16">

                {/* Logo */}
                <button
                    onClick={() => navigate('/')}
                    className="flex items-center gap-2.5 bg-transparent border-none cursor-pointer p-0 shrink-0 group"
                >
                    <div className="w-8 h-8 rounded-xl bg-white/20 group-hover:bg-white/30 flex items-center justify-center shrink-0 transition-colors duration-200">
                        <svg width="15" height="15" fill="none" stroke="#fff" strokeWidth="2.5" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" strokeLinecap="round" />
                        </svg>
                    </div>
                    <span className="text-white font-semibold text-[17px] tracking-[-0.3px] group-hover:text-white/80 transition-colors duration-200">
                        Website Analyser
                    </span>
                </button>

                {/* Center anchor links — landing page only */}
                {!onDashboard && (
                    <div className="hidden sm:flex items-center gap-1">
                        <a
                            href="/#features"
                            className="text-sm text-white/70 hover:text-white px-4 py-2 rounded-lg hover:bg-white/10 transition-all duration-200"
                        >
                            Features
                        </a>
                        <a
                            href="/#how-it-works"
                            className="text-sm text-white/70 hover:text-white px-4 py-2 rounded-lg hover:bg-white/10 transition-all duration-200"
                        >
                            How it Works
                        </a>
                    </div>
                )}

                {/* Dashboard tabs — logged in on dashboard */}
                {user && onDashboard && (
                    <div className="flex items-center h-full gap-1">
                        {[
                            { to: '/dashboard', end: true, label: 'New Analysis' },
                            { to: '/dashboard/history', end: false, label: 'Past Results' },
                        ].map(({ to, end, label }) => (
                            <NavLink
                                key={to}
                                to={to}
                                end={end}
                                className={({ isActive }) =>
                                    `h-full flex items-center px-4 text-sm font-medium border-b-2 transition-all duration-200 ${
                                        isActive
                                            ? 'border-white text-white'
                                            : 'border-transparent text-white/60 hover:text-white hover:bg-white/10'
                                    }`
                                }
                            >
                                {label}
                            </NavLink>
                        ))}
                    </div>
                )}

                {/* Right side */}
                {user ? (
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-white/25 flex items-center justify-center shrink-0">
                                <span className="text-white text-sm font-bold">{user.name[0].toUpperCase()}</span>
                            </div>
                            <span className="text-sm font-medium text-white/80">{user.name}</span>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="text-sm font-medium text-white/60 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/10 border border-white/20 hover:border-white/40 transition-all duration-200"
                        >
                            Logout
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => openAuth('login')}
                            className="text-sm font-medium text-white/80 hover:text-white px-4 py-2 rounded-lg hover:bg-white/10 border border-white/25 hover:border-white/40 transition-all duration-200"
                        >
                            Login
                        </button>
                        <button
                            onClick={() => openAuth('register')}
                            className="text-sm font-semibold text-indigo-700 bg-white hover:bg-indigo-50 px-4 py-2 rounded-lg shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                        >
                            Sign Up
                        </button>
                    </div>
                )}

            </div>
        </nav>
    )
}

export default Navbar
