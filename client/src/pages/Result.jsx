import { useContext, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppContext } from '../context/AppContext'
import ResultPanel from '../components/ResultPanel'

const Result = () => {
    const { analysisData, setAnalysisData } = useContext(AppContext)
    const navigate = useNavigate()

    useEffect(() => {
        if (!analysisData) navigate('/dashboard', { replace: true })
    }, [analysisData, navigate])

    if (!analysisData) return null

    const handleBack = () => {
        setAnalysisData(null)
        navigate('/dashboard')
    }

    return (
        <div>
            <ResultPanel data={analysisData} />
            <div className="no-print max-w-4xl mx-auto px-6 pb-20">
                <button
                    onClick={handleBack}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-4 rounded-xl transition-colors flex items-center justify-center gap-2.5 text-base"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    New Scan
                </button>
            </div>
        </div>
    )
}

export default Result
