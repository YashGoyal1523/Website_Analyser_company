import { Outlet } from 'react-router-dom'

const Dashboard = () => {
    return (
        <div className="min-h-[calc(100vh-65px)] bg-gray-50">
            <Outlet />
        </div>
    )
}

export default Dashboard
