import { useState, useEffect } from 'react'
import Navbar from '../components/Navbar'
import Sidebar from '../components/Sidebar'
import { Outlet } from 'react-router-dom'
import { CreateOrganization, SignIn, useAuth, useUser } from '@clerk/clerk-react'
import { useDispatch, useSelector } from 'react-redux'
import { fetchWorkspaces, refreshWorkspace } from '../features/workspaceSlice'
import { useWorkspaceChanged, useWorkspaceRoom } from '../realtime/useWorkspaceRoom'
import { loadTheme } from '../features/themeSlice'
import { Loader2Icon } from 'lucide-react'

const SYNC_POLL_MS = 3000
const SYNC_SLOW_AFTER_MS = 30000

function WorkspaceSetup({ getToken }) {
    const dispatch = useDispatch()
    const [slow, setSlow] = useState(false)

    useEffect(() => {
        const poll = setInterval(() => dispatch(fetchWorkspaces({ getToken })), SYNC_POLL_MS)
        const slowTimer = setTimeout(() => setSlow(true), SYNC_SLOW_AFTER_MS)
        return () => {
            clearInterval(poll)
            clearTimeout(slowTimer)
        }
    }, [dispatch, getToken])

    return (
        <div className="flex flex-col items-center justify-center gap-3 h-screen bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400">
            <Loader2Icon className="size-7 text-blue-500 animate-spin" />
            <p>Setting up your workspace…</p>
            {slow && <p className="text-sm max-w-sm text-center">This is taking longer than usual. It will appear here as soon as it's ready; there's no need to create another one.</p>}
        </div>
    )
}

const Layout = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)
    const { user, isLoaded } = useUser()
    const { workspaces, loading, currentWorkspace } = useSelector((state) => state.workspace)
    const { getToken } = useAuth()
    const dispatch = useDispatch()

    // Live workspace: dashboard, project list, sidebar and team refetch when anyone changes the workspace
    const refresh = () => dispatch(refreshWorkspace({ getToken }))
    useWorkspaceRoom(currentWorkspace?.id, refresh)
    useWorkspaceChanged(refresh)

    // Initial load of theme
    useEffect(() => {
        dispatch(loadTheme())
    }, [])

    // Initial load of workspaces
    useEffect(() => {
        if (isLoaded && user && workspaces.length === 0) {
            dispatch(fetchWorkspaces({ getToken }))
        }
    }, [user, isLoaded])

    if (!user) {
        return (
            <div className="flex justify-center items-center h-screen bg-white dark:bg-zinc-950">
                <SignIn />
            </div>
        )
    }

    // Clerk already has the workspace, but the webhook sync hasn't reached our database yet: wait, don't offer to create another.
    // Checked before `loading` so the polling below doesn't unmount this screen.
    if (workspaces.length === 0 && user.organizationMemberships?.length > 0) return <WorkspaceSetup getToken={getToken} />

    if (loading) return (
        <div className='flex items-center justify-center h-screen bg-white dark:bg-zinc-950'>
            <Loader2Icon className="size-7 text-blue-500 animate-spin" />
        </div>
    )

    if (workspaces.length === 0) {
        return (
            <div className="min-h-screen flex justify-center items-center">
                <CreateOrganization skipInvitationScreen />
            </div>
        )
    }

    return (
        <div className="flex bg-white dark:bg-zinc-950 text-gray-900 dark:text-slate-100">
            <Sidebar isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />
            <div className="flex-1 flex flex-col h-screen">
                <Navbar isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />
                <div className="flex-1 h-full p-6 xl:p-10 xl:px-16 overflow-y-scroll">
                    <Outlet />
                </div>
            </div>
        </div>
    )
}

export default Layout
