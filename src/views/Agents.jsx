import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { models, imageStyles, getGradient, Pill, AgentAvatar } from '../lib/agentHelpers'

function AgentModal({ onClose, onSave }) {
  const [tab, setTab] = useState('profile')
  const [form, setForm] = useState({
    name: '',
    model: models[0],
    personality: '',
    temperature: 0.7,
    system_prompt: '',
    fanvue_connected: false,
    falai_connected: false,
    lora_model: '',
    image_style: 'None',
  })

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const labelStyle = {
    fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase',
    letterSpacing: '0.5px', marginBottom: 6, display: 'block',
  }
  const inputStyle = {
    width: '100%', background: 'var(--surface-hover)', borderRadius: 10,
    padding: '10px 14px', fontSize: 13, color: 'var(--text-primary)',
  }
  const tabStyle = (active) => ({
    padding: '6px 14px', fontSize: 12, borderRadius: 20,
    background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
    fontWeight: active ? 500 : 400, cursor: 'pointer', transition: 'all 0.15s',
  })
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

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div style={{
        background: '#131313', borderRadius: 'var(--radius-lg)', padding: 28,
        width: 480, maxHeight: '82vh', overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 20,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 500 }}>New Model</div>

        <div style={{ display: 'flex', gap: 4 }}>
          {['profile', 'integrations', 'image gen'].map(t => (
            <button key={t} style={tabStyle(tab === t)} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === 'profile' && (
          <>
            <div>
              <label style={labelStyle}>Name</label>
              <input style={inputStyle} value={form.name} onChange={e => update('name', e.target.value)} placeholder="Model name" />
            </div>
            <div>
              <label style={labelStyle}>Model</label>
              <select style={{ ...inputStyle, cursor: 'pointer', appearance: 'none' }} value={form.model} onChange={e => update('model', e.target.value)}>
                {models.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Personality</label>
              <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }} value={form.personality} onChange={e => update('personality', e.target.value)} placeholder="Describe the model's personality..." />
            </div>
            <div>
              <label style={labelStyle}>System Prompt</label>
              <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }} value={form.system_prompt} onChange={e => update('system_prompt', e.target.value)} placeholder="System instructions for the model..." />
            </div>
            <div>
              <label style={labelStyle}>Temperature — {form.temperature}</label>
              <input type="range" min="0" max="1" step="0.1" value={form.temperature} onChange={e => update('temperature', parseFloat(e.target.value))} style={{ width: '100%', accentColor: 'rgba(255,255,255,0.4)', cursor: 'pointer' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                <span>Precise</span><span>Creative</span>
              </div>
            </div>
          </>
        )}

        {tab === 'integrations' && (
          <>
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Fanvue</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Connect model to Fanvue platform</div>
                </div>
                <div style={toggleStyle(form.fanvue_connected)} onClick={() => update('fanvue_connected', !form.fanvue_connected)}>
                  <div style={toggleDot(form.fanvue_connected)} />
                </div>
              </div>
            </div>
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>fal.ai</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Image generation and LoRA models</div>
                </div>
                <div style={toggleStyle(form.falai_connected)} onClick={() => update('falai_connected', !form.falai_connected)}>
                  <div style={toggleDot(form.falai_connected)} />
                </div>
              </div>
            </div>
          </>
        )}

        {tab === 'image gen' && (
          <>
            <div>
              <label style={labelStyle}>Image Style</label>
              <select style={{ ...inputStyle, cursor: 'pointer', appearance: 'none' }} value={form.image_style} onChange={e => update('image_style', e.target.value)}>
                {imageStyles.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>LoRA Model ID</label>
              <input style={inputStyle} value={form.lora_model} onChange={e => update('lora_model', e.target.value)} placeholder="e.g. realistic-v4, anime-style-v2" />
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose}
            style={{ padding: '8px 16px', fontSize: 13, borderRadius: 10, color: 'var(--text-secondary)', transition: 'color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
          >Cancel</button>
          <button onClick={() => onSave(form)}
            style={{ padding: '8px 22px', fontSize: 13, borderRadius: 10, background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)', fontWeight: 500, transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          >Create</button>
        </div>
      </div>
    </div>
  )
}

function getMonthStart() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
}

export default function Agents() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [agents, setAgents] = useState([])
  const [stats, setStats] = useState({})
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAgents() }, [])

  async function fetchAgents() {
    const { data } = await supabase.from('agents').select('*').order('created_at', { ascending: false })
    if (data) {
      setAgents(data)
      fetchStats(data)
    }
    setLoading(false)
  }

  async function fetchStats(agentList) {
    const monthStart = getMonthStart()
    const result = {}
    for (const agent of agentList) {
      const [revRes, fansRes] = await Promise.all([
        supabase.from('revenue').select('amount').eq('agent_id', agent.id).gte('created_at', monthStart),
        supabase.from('fans').select('id', { count: 'exact', head: true }).eq('agent_id', agent.id).gte('created_at', monthStart),
      ])
      const revenue = (revRes.data || []).reduce((sum, r) => sum + Number(r.amount || 0), 0)
      const newFans = fansRes.count || 0
      result[agent.id] = { revenue, newFans }
    }
    setStats(result)
  }

  const handleCreate = async (form) => {
    const payload = { ...form, user_id: user.id, updated_at: new Date().toISOString() }
    const { data: created } = await supabase.from('agents').insert(payload).select().single()
    if (created) {
      await supabase.from('agent_settings').insert({ agent_id: created.id })
      navigate(`/agents/${created.id}`)
    }
    setShowNew(false)
  }

  if (loading) {
    return <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: 48 }}>Loading models...</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>Models</h1>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Create and manage your AI characters</p>
        </div>
        <button onClick={() => setShowNew(true)}
          style={{ padding: '8px 20px', fontSize: 13, borderRadius: 10, background: 'rgba(255,255,255,0.08)', color: 'var(--text-primary)', fontWeight: 500, transition: 'background 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.13)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
        >New Model</button>
      </div>

      {agents.length === 0 ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '48px 0', textAlign: 'center' }}>
          No models yet. Create your first one.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {agents.map(agent => {
            const s = stats[agent.id] || { revenue: 0, newFans: 0 }
            return (
              <div key={agent.id} style={{
                background: 'var(--surface)', borderRadius: 'var(--radius)',
                overflow: 'hidden', cursor: 'pointer', transition: 'background 0.15s',
              }}
              onClick={() => navigate(`/agents/${agent.id}`)}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}
              >
                <div style={{ height: 56, background: getGradient(agent.name), position: 'relative' }}>
                  <div style={{ position: 'absolute', bottom: -16, left: 18 }}>
                    <AgentAvatar agent={agent} size={36} radius={12} fontSize={14} />
                  </div>
                </div>

                <div style={{ padding: '24px 18px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{agent.name}</div>
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: agent.status === 'active' ? 'rgba(74, 222, 128, 0.7)' : 'rgba(255, 255, 255, 0.15)',
                    }} />
                  </div>

                  {agent.personality && (
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{agent.personality}</p>
                  )}

                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {agent.fanvue_connected && <Pill label="Fanvue" active />}
                    {agent.falai_connected && <Pill label="fal.ai" active />}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 2 }}>
                    <div style={{
                      background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 12px',
                    }}>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 3 }}>This month</div>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>${s.revenue.toFixed(2)}</div>
                    </div>
                    <div style={{
                      background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 12px',
                    }}>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 3 }}>New fans</div>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{s.newFans}</div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showNew && <AgentModal onClose={() => setShowNew(false)} onSave={handleCreate} />}
    </div>
  )
}
