import './App.css'
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Auth from './views/Auth'
import Dashboard from './views/Dashboard'
import Agents from './views/Agents'
import AgentProfile from './views/AgentProfile'
import Settings from './views/Settings'

const navItems = [
  { label: 'Dashboard', path: '/' },
  { label: 'Agents', path: '/agents' },
  { label: 'Settings', path: '/settings' },
]

function AppShell() {
  const { user, profile, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  if (loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-tertiary)', fontSize: 13,
      }}>Loading...</div>
    )
  }

  if (!user) return <Auth />

  const initial = (profile?.name || user?.email || '?')[0].toUpperCase()
  const displayName = profile?.name || user?.email?.split('@')[0] || ''

  return (
    <div className="app">
      <nav className="sidebar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {navItems.map(({ label, path }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              className={({ isActive }) => {
                const active = isActive || (path === '/agents' && location.pathname.startsWith('/agents/'))
                return `nav-item ${active ? 'active' : ''}`
              }}
            >
              {label}
            </NavLink>
          ))}
        </div>
        <div
          className="nav-avatar"
          onClick={() => navigate('/settings')}
          title={displayName}
        >
          <div className="avatar-circle">{initial}</div>
          <span className="avatar-name">{displayName}</span>
        </div>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/agents/:id" element={<AgentProfile />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}

export default App
