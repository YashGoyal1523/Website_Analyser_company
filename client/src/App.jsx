import { useContext } from 'react'
import { Routes, Route } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import { AppContext } from './context/AppContext'
import Navbar from './components/Navbar'
import AuthModal from './components/AuthModal'
import ProtectedRoute from './components/ProtectedRoute'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import Home from './pages/Home'
import History from './pages/History'
import Result from './pages/Result'
import AnalysisView from './pages/AnalysisView'
import CompareView from './pages/CompareView'

const App = () => {
    const { showAuth, setShowAuth, authMode } = useContext(AppContext)

    return (
        <div>
            <Navbar />
            <Routes>
                <Route path="/" element={<Landing />} />
                <Route
                    path="/dashboard"
                    element={<ProtectedRoute><Dashboard /></ProtectedRoute>}
                >
                    <Route index element={<Home />} />
                    <Route path="history" element={<History />} />
                    <Route path="result" element={<Result />} />
                    <Route path="analysis/:id" element={<AnalysisView />} />
                    <Route path="compare/:idA/:idB" element={<CompareView />} />
                </Route>
            </Routes>
            {showAuth && (
                <AuthModal initialMode={authMode} onClose={() => setShowAuth(false)} />
            )}
            <ToastContainer position="bottom-right" theme="light" />
        </div>
    )
}

export default App
