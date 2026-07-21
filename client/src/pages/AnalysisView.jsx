import { useContext, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { AppContext } from '../context/AppContext'
import ResultPanel from '../components/ResultPanel'

const AnalysisView = () => {
    const { id } = useParams()
    const { backendUrl, token } = useContext(AppContext)
    const navigate = useNavigate()
    const [data, setData] = useState(null)
    const [error, setError] = useState(false)

    useEffect(() => {
        const load = async () => {
            try {
                const { data: res } = await axios.get(
                    `${backendUrl}/api/analyses/${id}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                )
                if (res.success) {
                    setData(res.data)
                    document.title = `Results · ${res.data.url.replace(/^https?:\/\//, '')}`
                } else setError(true)
            } catch {
                setError(true)
            }
        }
        load()
    }, [id])

    if (error) return (
        <div className="flex flex-col items-center justify-center py-32 gap-3">
            <p className="text-gray-900 font-semibold text-lg">Analysis not found</p>
            <button onClick={() => navigate('/dashboard/history')} className="text-sm text-blue-600 hover:underline">
                Back to History
            </button>
        </div>
    )

    if (!data) return (
        <div className="flex items-center justify-center py-32">
            <span className="w-6 h-6 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
        </div>
    )

    return <ResultPanel data={data} />
}

export default AnalysisView
