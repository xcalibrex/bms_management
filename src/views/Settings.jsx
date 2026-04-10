import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function Settings() {
  const { user, profile, updateProfile, signOut } = useAuth()
  const [profileName, setProfileName] = useState(profile?.name || '')
  const [profileSaved, setProfileSaved] = useState(false)

  // fal.ai (account level)
  const [falaiKey, setFalaiKey] = useState(profile?.falai_api_key || '')
  const [falaiSaved, setFalaiSaved] = useState(false)

  // OpenRouter (account level)
  const [openrouterKey, setOpenrouterKey] = useState(profile?.openrouter_api_key || '')
  const [openrouterSaved, setOpenrouterSaved] = useState(false)

  useEffect(() => {
    if (profile) {
      setProfileName(profile.name || '')
      setFalaiKey(profile.falai_api_key || '')
      setOpenrouterKey(profile.openrouter_api_key || '')
    }
  }, [profile])

  const handleProfileSave = async () => {
    await updateProfile({ name: profileName })
    setProfileSaved(true)
    setTimeout(() => setProfileSaved(false), 2000)
  }

  const handleFalaiSave = async () => {
    await updateProfile({ falai_api_key: falaiKey.trim() || null })
    setFalaiSaved(true)
    setTimeout(() => setFalaiSaved(false), 2000)
  }

  const handleOpenrouterSave = async () => {
    await updateProfile({ openrouter_api_key: openrouterKey.trim() || null })
    setOpenrouterSaved(true)
    setTimeout(() => setOpenrouterSaved(false), 2000)
  }

  const labelStyle = {
    fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase',
    letterSpacing: '0.5px', marginBottom: 6, display: 'block',
  }
  const inputStyle = {
    width: '100%', background: 'var(--surface-hover)', borderRadius: 10,
    padding: '10px 14px', fontSize: 13, color: 'var(--text-primary)',
  }
  const sectionStyle = {
    background: 'var(--surface)', borderRadius: 'var(--radius)', padding: 22,
    display: 'flex', flexDirection: 'column', gap: 16,
  }

  const initial = (profile?.name || user?.email || '?')[0].toUpperCase()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>Settings</h1>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Configure your profile, defaults, and integrations</p>
      </div>

      {/* Profile */}
      <div style={sectionStyle}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Profile</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, background: 'var(--surface-active)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0,
          }}>{initial}</div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{user?.email}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...inputStyle, flex: 1 }} value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="Your name" />
              <button onClick={handleProfileSave}
                style={{
                  padding: '8px 18px', fontSize: 12, borderRadius: 10,
                  background: profileSaved ? 'rgba(74, 222, 128, 0.15)' : 'rgba(255,255,255,0.08)',
                  color: profileSaved ? 'rgba(74, 222, 128, 0.9)' : 'var(--text-secondary)',
                  fontWeight: 500, transition: 'all 0.15s', whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { if (!profileSaved) e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
                onMouseLeave={e => { if (!profileSaved) e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
              >{profileSaved ? 'Saved' : 'Save'}</button>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={signOut}
            style={{ padding: '6px 14px', fontSize: 11, borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: 'var(--text-tertiary)', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,80,80,0.12)'; e.currentTarget.style.color = 'rgba(255,120,120,0.9)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--text-tertiary)' }}
          >Sign Out</button>
        </div>
      </div>

      {/* OpenRouter (account level) */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>OpenRouter</div>
          {profile?.openrouter_api_key && (
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(74, 222, 128, 0.1)', color: 'rgba(74, 222, 128, 0.8)' }}>Configured</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
          Powers all your agents' LLM responses. Get a key at openrouter.ai/keys. Recommended models: <code style={{ background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 4 }}>sao10k/l3.1-euryale-70b</code> for standard, <code style={{ background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 4 }}>anthracite-org/magnum-v4-72b</code> for VIP.
        </div>
        <div>
          <label style={labelStyle}>API Key</label>
          <input style={inputStyle} value={openrouterKey} onChange={e => setOpenrouterKey(e.target.value)} type="password" placeholder="sk-or-..." />
        </div>
        <button onClick={handleOpenrouterSave}
          style={{
            padding: '8px 18px', fontSize: 12, borderRadius: 10,
            background: openrouterSaved ? 'rgba(74, 222, 128, 0.15)' : 'rgba(255,255,255,0.08)',
            color: openrouterSaved ? 'rgba(74, 222, 128, 0.9)' : 'var(--text-primary)',
            fontWeight: 500, transition: 'all 0.15s', alignSelf: 'flex-start',
          }}
          onMouseEnter={e => { if (!openrouterSaved) e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
          onMouseLeave={e => { if (!openrouterSaved) e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
        >{openrouterSaved ? 'Saved' : 'Save Key'}</button>
      </div>

      {/* fal.ai integration (account level) */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>fal.ai</div>
          {profile?.falai_api_key && (
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(74, 222, 128, 0.1)', color: 'rgba(74, 222, 128, 0.8)' }}>Configured</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
          Powers image generation across all agents. LoRA models are configured per-agent in their profile.
        </div>
        <div>
          <label style={labelStyle}>API Key</label>
          <input style={inputStyle} value={falaiKey} onChange={e => setFalaiKey(e.target.value)} type="password" placeholder="Your fal.ai API key" />
        </div>
        <button onClick={handleFalaiSave}
          style={{
            padding: '8px 18px', fontSize: 12, borderRadius: 10,
            background: falaiSaved ? 'rgba(74, 222, 128, 0.15)' : 'rgba(255,255,255,0.08)',
            color: falaiSaved ? 'rgba(74, 222, 128, 0.9)' : 'var(--text-primary)',
            fontWeight: 500, transition: 'all 0.15s', alignSelf: 'flex-start',
          }}
          onMouseEnter={e => { if (!falaiSaved) e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
          onMouseLeave={e => { if (!falaiSaved) e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
        >{falaiSaved ? 'Saved' : 'Save Key'}</button>
      </div>

    </div>
  )
}
