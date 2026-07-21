import { useContext, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { AppContext } from '../context/AppContext'
import ComparePanel from '../components/ComparePanel'

const CompareView = () => {
    const { idA, idB } = useParams()
    const { backendUrl, token } = useContext(AppContext)
    const navigate = useNavigate()
    const [data, setData] = useState(null)
    const [error, setError] = useState(false)

    useEffect(() => {
        const load = async () => {
            try {
                const [resA, resB] = await Promise.all([
                    axios.get(`${backendUrl}/api/analyses/${idA}`, { headers: { Authorization: `Bearer ${token}` } }),
                    axios.get(`${backendUrl}/api/analyses/${idB}`, { headers: { Authorization: `Bearer ${token}` } }),
                ])
                if (resA.data.success && resB.data.success) {
                    setData([resA.data.data, resB.data.data])
                    const urlA = resA.data.data.url.replace(/^https?:\/\//, '')
                    const urlB = resB.data.data.url.replace(/^https?:\/\//, '')
                    document.title = `Compare · ${urlA} vs ${urlB}`
                } else setError(true)
            } catch {
                setError(true)
            }
        }
        load()
    }, [idA, idB])

    if (error) return (
        <div className="flex flex-col items-center justify-center py-32 gap-3">
            <p className="text-gray-900 font-semibold text-lg">Could not load comparison</p>
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

    return <ComparePanel dataA={data[0]} dataB={data[1]} />
}

export default CompareView
