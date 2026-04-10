import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function Settings() {
  const { user, profile, updateProfile, signOut } = useAuth()
  const [profileName, setProfileName] = useState(profile?.name || '')
  const [profileSaved, setProfileSaved] = useState(false)

  // fal.ai (account level)
  const [falaiKey, setFalaiKey] = useState(profile?.falai_api_key || '')
  const [falaiSaved, setFalaiSaved] = useState(false)

  const [settings, setSettings] = useState({
    apiKey: '',
    defaultModel: 'GPT-4o',
    maxTokens: 4096,
    defaultTemp: 0.7,
    streamResponses: true,
    logConversations: true,
    autoSave: true,
  })

  useEffect(() => {
    if (profile) {
      setProfileName(profile.name || '')
      setFalaiKey(profile.falai_api_key || '')
    }
  }, [profile])

  const update = (key, value) => setSettings(prev => ({ ...prev, [key]: value }))

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

  const models = ['GPT-4o', 'Claude 3.5 Sonnet', 'Gemini Pro', 'Mistral Large', 'Llama 3.1 70B']

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
  const toggleStyle = (active) => ({
    width: 36, height: 20, borderRadius: 10,
    background: active ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)',
    position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
  })
  const toggleDot = (active) => ({
    width: 14, height: 14, borderRadius: '50%',
    background: active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)',
    position: 'absolute', top: 3, left: active ? 19 : 3, transition: 'all 0.2s',
  })
  const Toggle = ({ active, onToggle }) => (
    <div style={toggleStyle(active)} onClick={onToggle}>
      <div style={toggleDot(active)} />
    </div>
  )

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

      {/* fal.ai integration (account level) */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>fal.ai</div>
          {profile?.falai_api_key && (
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(74, 222, 128, 0.1)', color: 'rgba(74, 222, 128, 0.8)' }}>Configured</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
          Shared across all your agents for image generation and LoRA models. Fanvue API keys are set per agent in each agent's profile.
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

      {/* Model config + Preferences */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={sectionStyle}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Model Configuration</div>
          <div>
            <label style={labelStyle}>LLM API Key</label>
            <input style={inputStyle} value={settings.apiKey} onChange={e => update('apiKey', e.target.value)} type="password" placeholder="sk-..." />
          </div>
          <div>
            <label style={labelStyle}>Default Model</label>
            <select style={{ ...inputStyle, cursor: 'pointer', appearance: 'none' }} value={settings.defaultModel} onChange={e => update('defaultModel', e.target.value)}>
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Max Tokens</label>
            <input style={inputStyle} type="number" value={settings.maxTokens} onChange={e => update('maxTokens', parseInt(e.target.value))} />
          </div>
          <div>
            <label style={labelStyle}>Default Temperature — {settings.defaultTemp}</label>
            <input type="range" min="0" max="1" step="0.1" value={settings.defaultTemp} onChange={e => update('defaultTemp', parseFloat(e.target.value))} style={{ width: '100%', accentColor: 'rgba(255,255,255,0.4)', cursor: 'pointer' }} />
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Preferences</div>
          {[
            { key: 'streamResponses', label: 'Stream Responses', desc: 'Show responses as they generate' },
            { key: 'logConversations', label: 'Log Conversations', desc: 'Save conversation history' },
            { key: 'autoSave', label: 'Auto-save Changes', desc: 'Automatically save agent configurations' },
          ].map(item => (
            <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{item.desc}</div>
              </div>
              <Toggle active={settings[item.key]} onToggle={() => update(item.key, !settings[item.key])} />
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          style={{ padding: '8px 22px', fontSize: 13, borderRadius: 10, background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)', fontWeight: 500, transition: 'background 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
        >Save Settings</button>
      </div>
    </div>
  )
}
