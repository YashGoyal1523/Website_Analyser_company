import { useContext } from 'react'
import { Navigate } from 'react-router-dom'
import { AppContext } from '../context/AppContext'

const ProtectedRoute = ({ children }) => {
    const { token } = useContext(AppContext)
    return token ? children : <Navigate to="/" replace />
}

export default ProtectedRoute
