import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { createFanvueClient } from '../lib/fanvue'
import { models, imageStyles, getGradient, Pill, StagePill, timeAgo, AgentAvatar } from '../lib/agentHelpers'

const tabList = ['Stats', 'Activity', 'Fans', 'Messages', 'Content', 'Details']

const dateRanges = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: 'All', days: null },
]

function getRangeStart(days) {
  if (!days) return null
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return d
}

export default function AgentProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [agent, setAgent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Stats')
  const [dateRange, setDateRange] = useState(30) // days
  const [tabData, setTabData] = useState([])
  const [tabLoading, setTabLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function fetch() {
      const { data, error } = await supabase.from('agents').select('*').eq('id', id).single()
      if (error || !data) { navigate('/agents'); return }
      setAgent(data)
      setLoading(false)
    }
    fetch()
  }, [id])

  useEffect(() => {
    if (!agent) return
    fetchTabData()
  }, [tab, agent?.id, dateRange])

  async function fetchTabData() {
    setTabLoading(true)
    let data = []

    const useFanvue = agent.fanvue_connected && agent.fanvue_api_key
    const client = useFanvue ? createFanvueClient(agent.fanvue_api_key) : null
    const rangeStart = getRangeStart(dateRange)
    const rangeStartISO = rangeStart?.toISOString()

    try {
      if (tab === 'Stats') {
        data = await fetchStatsData(agent, client, useFanvue, rangeStart, dateRange)
      } else if (tab === 'Activity') {
        let q = supabase.from('agent_events').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false }).limit(100)
        if (rangeStartISO) q = q.gte('created_at', rangeStartISO)
        const res = await q
        data = res.data || []
      } else if (tab === 'Fans') {
        if (useFanvue) {
          const res = await client.getSubscribers({ limit: 50 })
          const list = res?.data || res?.subscribers || []
          data = list.map(sub => ({
            id: sub.uuid || sub.id,
            display_name: sub.name || sub.username || sub.displayName || 'Anonymous',
            relationship_stage: sub.totalSpent > 100 ? 'vip' : sub.totalSpent > 0 ? 'paying' : 'engaged',
            spending_total: sub.totalSpent || 0,
            last_active: sub.lastActiveAt || sub.updatedAt,
            source: 'fanvue',
          }))
          if (rangeStart) {
            data = data.filter(f => !f.last_active || new Date(f.last_active) >= rangeStart)
          }
        } else {
          let q = supabase.from('fans').select('*').eq('agent_id', agent.id).order('last_active', { ascending: false, nullsFirst: false })
          if (rangeStartISO) q = q.gte('last_active', rangeStartISO)
          const res = await q
          data = res.data || []
        }
      } else if (tab === 'Messages') {
        if (useFanvue) {
          const chatsRes = await client.getChats({ limit: 20 })
          const chats = chatsRes?.data || chatsRes?.chats || []
          const allMessages = []
          for (const chat of chats.slice(0, 10)) {
            try {
              const msgRes = await client.getChatMessages(chat.uuid || chat.id, { limit: 10 })
              const msgs = msgRes?.data || msgRes?.messages || []
              msgs.forEach(m => {
                allMessages.push({
                  id: m.uuid || m.id,
                  role: m.senderType === 'creator' || m.fromCreator ? 'agent' : 'fan',
                  message: m.content || m.text || m.message,
                  created_at: m.createdAt || m.created_at,
                  fan_name: chat.fan?.name || chat.username || 'Fan',
                })
              })
            } catch {}
          }
          data = allMessages.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 100)
          if (rangeStart) data = data.filter(m => new Date(m.created_at) >= rangeStart)
        } else {
          let q = supabase.from('conversations').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false }).limit(100)
          if (rangeStartISO) q = q.gte('created_at', rangeStartISO)
          const res = await q
          data = res.data || []
        }
      } else if (tab === 'Content') {
        if (useFanvue) {
          const res = await client.getPosts({ limit: 50 })
          const list = res?.data || res?.posts || []
          data = list.map(post => ({
            id: post.uuid || post.id,
            content_type: post.isPaid ? 'ppv' : 'free',
            price: post.price || 0,
            nsfw: post.isNsfw || false,
            purchased: false,
            image_url: post.media?.[0]?.url || post.thumbnail,
            created_at: post.createdAt || post.created_at,
          }))
          if (rangeStart) data = data.filter(c => new Date(c.created_at) >= rangeStart)
        } else {
          let q = supabase.from('content').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false })
          if (rangeStartISO) q = q.gte('created_at', rangeStartISO)
          const res = await q
          data = res.data || []
        }
      }
    } catch (e) {
      console.error('Failed to fetch tab data:', e)
    }

    setTabData(data)
    setTabLoading(false)
  }

  if (loading) {
    return <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: 48 }}>Loading...</div>
  }
  if (!agent) return null

  const tabStyle = (active) => ({
    padding: '7px 16px', fontSize: 12, borderRadius: 20,
    background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
    fontWeight: active ? 500 : 400, cursor: 'pointer', transition: 'all 0.15s',
  })

  const dateFilterBtn = (active) => ({
    padding: '5px 12px', fontSize: 11, borderRadius: 20,
    background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
    fontWeight: active ? 500 : 400, cursor: 'pointer', transition: 'all 0.15s',
    letterSpacing: '0.3px',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Back */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div
          style={{ fontSize: 13, color: 'var(--text-tertiary)', cursor: 'pointer', transition: 'color 0.15s' }}
          onClick={() => navigate('/agents')}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
        >Agents</div>

        {/* Date filter */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--surface)', borderRadius: 20, padding: 3 }}>
          {dateRanges.map(r => (
            <button key={r.label} style={dateFilterBtn(dateRange === r.days)} onClick={() => setDateRange(r.days)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Header */}
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{
          height: 80,
          background: agent.fanvue_banner_url
            ? `url(${agent.fanvue_banner_url}) center/cover`
            : getGradient(agent.name),
          position: 'relative',
        }}>
          <div style={{ position: 'absolute', bottom: -24, left: 24 }}>
            <AgentAvatar agent={agent} size={56} radius={16} fontSize={20} />
          </div>
        </div>
        <div style={{ padding: '32px 24px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 500 }}>{agent.name}</div>
            {agent.fanvue_username && (
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>@{agent.fanvue_username}</div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', gap: 5 }}>
              {agent.fanvue_connected && <Pill label="Fanvue" active />}
              {agent.falai_connected && <Pill label="fal.ai" active />}
            </div>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: agent.status === 'active' ? 'rgba(74, 222, 128, 0.7)' : 'rgba(255, 255, 255, 0.15)',
            }} />
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4 }}>
        {tabList.map(t => (
          <button key={t} style={tabStyle(tab === t)} onClick={() => {
            if (t === tab) return
            setTab(t)
            setTabData(null)
            setTabLoading(true)
          }}>{t}</button>
        ))}
      </div>

      {/* Tab content */}
      {tabLoading && tab !== 'Details' ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: 24 }}>Loading...</div>
      ) : (
        <>
          {tab === 'Stats' && <StatsTab data={tabData} dateRange={dateRange} />}
          {tab === 'Activity' && <ActivityTab data={tabData} />}
          {tab === 'Fans' && <FansTab data={tabData} />}
          {tab === 'Messages' && <MessagesTab data={tabData} agentName={agent.name} />}
          {tab === 'Content' && <ContentTab data={tabData} />}
          {tab === 'Details' && (
            <DetailsTab
              agent={agent}
              onSave={async (updates) => {
                setSaving(true)
                await supabase.from('agents').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', agent.id)
                setAgent(prev => ({ ...prev, ...updates }))
                setSaving(false)
                setSaved(true)
                setTimeout(() => setSaved(false), 2000)
              }}
              onDelete={async () => {
                await supabase.from('agents').delete().eq('id', agent.id)
                navigate('/agents')
              }}
              saving={saving}
              saved={saved}
            />
          )}
        </>
      )}
    </div>
  )
}

function FansTab({ data }) {
  if (!Array.isArray(data) || data.length === 0) {
    return <Empty text="No fans yet" />
  }
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: 6 }}>
      {data.map(fan => (
        <div key={fan.id} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 14px', borderRadius: 10, transition: 'background 0.15s', cursor: 'default',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 10, background: 'var(--surface-active)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
            }}>{(fan.display_name || '?')[0].toUpperCase()}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{fan.display_name || 'Anonymous'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', gap: 8, marginTop: 2 }}>
                <StagePill stage={fan.relationship_stage} />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>${Number(fan.spending_total || 0).toFixed(2)}</div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>spent</div>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', minWidth: 60, textAlign: 'right' }}>{timeAgo(fan.last_active)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function MessagesTab({ data, agentName }) {
  if (!Array.isArray(data) || data.length === 0) {
    return <Empty text="No messages yet" />
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {data.map(msg => (
        <div key={msg.id} style={{
          display: 'flex', flexDirection: 'column', gap: 4,
          padding: '12px 16px', borderRadius: 'var(--radius)',
          background: msg.role === 'agent' ? 'var(--surface)' : 'var(--surface-hover)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: msg.role === 'agent' ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
              {msg.role === 'agent' ? agentName : 'Fan'}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{timeAgo(msg.created_at)}</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>{msg.message}</div>
        </div>
      ))}
    </div>
  )
}

function ContentTab({ data }) {
  if (!Array.isArray(data) || data.length === 0) {
    return <Empty text="No content generated yet" />
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
      {data.map(item => (
        <div key={item.id} style={{
          background: 'var(--surface)', borderRadius: 'var(--radius)',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            height: 140, background: item.image_url
              ? `url(${item.image_url}) center/cover`
              : 'linear-gradient(135deg, #1a1a2e, #16213e)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {!item.image_url && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>No preview</span>}
          </div>
          <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 5 }}>
              <Pill label={item.content_type} active />
              {item.nsfw && <Pill label="NSFW" active={false} />}
              {item.purchased && <Pill label="Purchased" active />}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)' }}>
              {item.price > 0 && <span>${Number(item.price).toFixed(2)}</span>}
              <span>{timeAgo(item.created_at)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

const RUNTIME_MODELS = [
  { id: 'sao10k/l3.1-euryale-70b', label: 'Euryale 70B (Recommended)', cost: '$0.70 / $0.80' },
  { id: 'anthracite-org/magnum-v4-72b', label: 'Magnum V4 72B (Premium)', cost: '$1.88 / $2.25' },
  { id: 'nous/hermes-3-llama-3.1-405b', label: 'Hermes 3 405B (Top quality)', cost: '$1.79 / $2.49' },
  { id: 'thedrummer/unslopnemo-12b', label: 'UnslopNemo 12B (Cheapest)', cost: '$0.40 / $0.40' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o-mini (SFW only)', cost: '$0.15 / $0.60' },
]

function DetailsTab({ agent, onSave, onDelete, saving, saved }) {
  const [form, setForm] = useState({
    name: agent.name || '',
    model: agent.model || models[0],
    personality: agent.personality || '',
    system_prompt: agent.system_prompt || '',
    temperature: agent.temperature ?? 0.7,
    fanvue_connected: agent.fanvue_connected ?? false,
    falai_connected: agent.falai_connected ?? false,
    lora_model: agent.lora_model || '',
    image_style: agent.image_style || 'None',
  })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [webhookCopied, setWebhookCopied] = useState(false)

  // Runtime settings (from agent_settings table)
  const [runtimeSettings, setRuntimeSettings] = useState({
    llm_model: 'sao10k/l3.1-euryale-70b',
    llm_model_vip: 'anthracite-org/magnum-v4-72b',
    llm_temperature: 0.85,
    response_delay_min: 30,
    response_delay_max: 240,
    nsfw_enabled: false,
    ppv_price_default: 9.99,
  })
  const [runtimeSaved, setRuntimeSaved] = useState(false)

  useEffect(() => {
    async function loadSettings() {
      const { data } = await supabase.from('agent_settings').select('*').eq('agent_id', agent.id).single()
      if (data) {
        setRuntimeSettings({
          llm_model: data.llm_model || 'sao10k/l3.1-euryale-70b',
          llm_model_vip: data.llm_model_vip || 'anthracite-org/magnum-v4-72b',
          llm_temperature: data.llm_temperature ?? 0.85,
          response_delay_min: data.response_delay_min ?? 30,
          response_delay_max: data.response_delay_max ?? 240,
          nsfw_enabled: data.nsfw_enabled ?? false,
          ppv_price_default: data.ppv_price_default ?? 9.99,
        })
      }
    }
    loadSettings()
  }, [agent.id])

  const updateRuntime = (key, value) => setRuntimeSettings(prev => ({ ...prev, [key]: value }))

  const saveRuntimeSettings = async () => {
    await supabase.from('agent_settings').upsert({
      agent_id: agent.id,
      ...runtimeSettings,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'agent_id' })
    setRuntimeSaved(true)
    setTimeout(() => setRuntimeSaved(false), 2000)
  }

  const webhookUrl = `https://wzllrjbumbxvvozcwlzj.supabase.co/functions/v1/fanvue-webhook/${agent.id}`

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl)
    setWebhookCopied(true)
    setTimeout(() => setWebhookCopied(false), 2000)
  }

  // Signing secret
  const [signingSecret, setSigningSecret] = useState(agent.fanvue_signing_secret || '')
  const [signingSecretSaved, setSigningSecretSaved] = useState(false)

  const saveSigningSecret = async () => {
    await supabase.from('agents').update({
      fanvue_signing_secret: signingSecret.trim() || null,
    }).eq('id', agent.id)
    setSigningSecretSaved(true)
    setTimeout(() => setSigningSecretSaved(false), 2000)
  }

  // Fanvue connection state (OAuth-based)
  const [fanvueUsername, setFanvueUsername] = useState(agent.fanvue_username || '')
  const [fanvueStatus, setFanvueStatus] = useState(agent.fanvue_connected ? 'connected' : 'idle')
  const [fanvueError, setFanvueError] = useState('')

  // Handle OAuth return URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('fanvue_connected') === '1') {
      setFanvueStatus('connected')
      window.history.replaceState({}, '', window.location.pathname)
      // Sync profile to pull username
      syncFanvueProfile()
    } else if (params.get('fanvue_error')) {
      const code = params.get('fanvue_error')
      const detail = params.get('fanvue_error_detail')
      setFanvueError(detail ? `${code}: ${decodeURIComponent(detail)}` : decodeURIComponent(code))
      setFanvueStatus('error')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const syncFanvueProfile = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL || 'https://wzllrjbumbxvvozcwlzj.supabase.co'}/functions/v1/fanvue-sync-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agent.id }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.username) setFanvueUsername(data.username)
      }
    } catch {}
  }

  const handleFanvueConnect = async () => {
    setFanvueStatus('connecting')
    setFanvueError('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL || 'https://wzllrjbumbxvvozcwlzj.supabase.co'}/functions/v1/fanvue-oauth-start`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ agent_id: agent.id }),
      })

      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Failed to start OAuth: ${err}`)
      }

      const { url } = await res.json()
      window.location.href = url // Redirect to Fanvue authorization page
    } catch (e) {
      setFanvueError(e.message)
      setFanvueStatus('error')
    }
  }

  const handleFanvueDisconnect = async () => {
    await supabase.from('agents').update({
      fanvue_api_key: null,
      fanvue_refresh_token: null,
      fanvue_token_expires_at: null,
      fanvue_connected: false,
      fanvue_username: null,
      fanvue_scopes: null,
    }).eq('id', agent.id)
    setFanvueUsername('')
    setFanvueStatus('idle')
    update('fanvue_connected', false)
  }

  // Instagram connection state
  const [igUsername, setIgUsername] = useState(agent.instagram_username || '')
  const [igStatus, setIgStatus] = useState(agent.instagram_connected ? 'connected' : 'idle')
  const [igError, setIgError] = useState('')

  // Reddit connection state
  const [redditUsername, setRedditUsername] = useState(agent.reddit_username || '')
  const [redditStatus, setRedditStatus] = useState(agent.reddit_connected ? 'connected' : 'idle')
  const [redditError, setRedditError] = useState('')

  // Handle OAuth return params for IG / Reddit
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    let touched = false
    if (params.get('instagram_connected') === '1') {
      setIgStatus('connected')
      touched = true
      supabase.from('agents').select('instagram_username').eq('id', agent.id).single().then(({ data }) => {
        if (data?.instagram_username) setIgUsername(data.instagram_username)
      })
    } else if (params.get('instagram_error')) {
      const code = params.get('instagram_error')
      const detail = params.get('instagram_error_detail')
      setIgError(detail ? `${code}: ${decodeURIComponent(detail)}` : decodeURIComponent(code))
      setIgStatus('error')
      touched = true
    }
    if (params.get('reddit_connected') === '1') {
      setRedditStatus('connected')
      touched = true
      supabase.from('agents').select('reddit_username').eq('id', agent.id).single().then(({ data }) => {
        if (data?.reddit_username) setRedditUsername(data.reddit_username)
      })
    } else if (params.get('reddit_error')) {
      const code = params.get('reddit_error')
      const detail = params.get('reddit_error_detail')
      setRedditError(detail ? `${code}: ${decodeURIComponent(detail)}` : decodeURIComponent(code))
      setRedditStatus('error')
      touched = true
    }
    if (touched) window.history.replaceState({}, '', window.location.pathname)
  }, [agent.id])

  const startOAuth = async (provider) => {
    const setStatus = provider === 'instagram' ? setIgStatus : setRedditStatus
    const setError = provider === 'instagram' ? setIgError : setRedditError
    setStatus('connecting')
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const base = import.meta.env.VITE_SUPABASE_URL || 'https://wzllrjbumbxvvozcwlzj.supabase.co'
      const res = await fetch(`${base}/functions/v1/${provider}-oauth-start`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agent_id: agent.id,
          // Pass the current origin so the OAuth callback knows whether to
          // bounce back to prod or localhost. Validated against an allowlist
          // on the server side. The callback appends /agents/:id itself.
          return_url: window.location.origin,
        }),
      })
      if (!res.ok) throw new Error(`Failed to start OAuth: ${await res.text()}`)
      const { url } = await res.json()
      window.location.href = url
    } catch (e) {
      setError(e.message)
      setStatus('error')
    }
  }

  const disconnectInstagram = async () => {
    await supabase.from('agents').update({
      instagram_connected: false,
      instagram_username: null,
      instagram_user_id: null,
      instagram_page_id: null,
      instagram_access_token: null,
      instagram_token_expires_at: null,
    }).eq('id', agent.id)
    setIgUsername('')
    setIgStatus('idle')
  }

  const disconnectReddit = async () => {
    await supabase.from('agents').update({
      reddit_connected: false,
      reddit_username: null,
      reddit_access_token: null,
      reddit_refresh_token: null,
      reddit_token_expires_at: null,
      reddit_scopes: null,
    }).eq('id', agent.id)
    setRedditUsername('')
    setRedditStatus('idle')
  }

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={sectionStyle}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Profile</div>
        <div>
          <label style={labelStyle}>Name</label>
          <input style={inputStyle} value={form.name} onChange={e => update('name', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Personality</label>
          <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }} value={form.personality} onChange={e => update('personality', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>System Prompt</label>
          <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }} value={form.system_prompt} onChange={e => update('system_prompt', e.target.value)} />
        </div>
      </div>

      {/* Fanvue Connection */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Fanvue Account</div>
          {fanvueStatus === 'connected' && (
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(74, 222, 128, 0.1)', color: 'rgba(74, 222, 128, 0.8)' }}>Connected</span>
          )}
        </div>

        {fanvueStatus === 'connected' ? (
          <>
            {fanvueUsername && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Linked to Fanvue as <span style={{ fontWeight: 500 }}>{fanvueUsername}</span>
              </div>
            )}
            <div style={{
              fontSize: 11, color: 'var(--text-tertiary)', padding: '10px 14px',
              background: 'rgba(255,255,255,0.03)', borderRadius: 10, lineHeight: 1.5,
            }}>
              This agent is linked to its Fanvue creator account. Fans, messages, and earnings sync from Fanvue. The agent can send messages and PPV content directly to subscribers.
            </div>
            <button onClick={handleFanvueDisconnect}
              style={{ padding: '6px 14px', fontSize: 11, borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: 'var(--text-tertiary)', transition: 'all 0.15s', alignSelf: 'flex-start' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,80,80,0.12)'; e.currentTarget.style.color = 'rgba(255,120,120,0.9)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--text-tertiary)' }}
            >Disconnect</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
              Each agent links to its own Fanvue creator account via secure OAuth. You'll be redirected to Fanvue to authorize BMS, then sent back here.
            </div>
            {fanvueError && (
              <div style={{ fontSize: 12, color: 'rgba(255, 120, 120, 0.9)', padding: '8px 12px', background: 'rgba(255, 80, 80, 0.08)', borderRadius: 10 }}>
                {fanvueError}
              </div>
            )}
            <button onClick={handleFanvueConnect}
              disabled={fanvueStatus === 'connecting'}
              style={{
                padding: '10px 22px', fontSize: 13, borderRadius: 10,
                background: 'rgba(255,255,255,0.08)', color: 'var(--text-primary)',
                fontWeight: 500, transition: 'background 0.15s', alignSelf: 'flex-start',
                opacity: fanvueStatus === 'connecting' ? 0.5 : 1,
                cursor: fanvueStatus === 'connecting' ? 'wait' : 'pointer',
              }}
              onMouseEnter={e => { if (fanvueStatus !== 'connecting') e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            >{fanvueStatus === 'connecting' ? 'Redirecting...' : 'Connect with Fanvue'}</button>
          </>
        )}
      </div>

      {/* Instagram Connection */}
      <SocialConnectSection
        label="Instagram Account"
        platformName="Instagram"
        status={igStatus}
        username={igUsername}
        error={igError}
        description="Connect this agent to an Instagram Business or Creator account (linked to a Facebook Page). Posts stay SFW — used for funnel content that drives traffic to Fanvue."
        connectedBlurb="This agent can publish scheduled posts to Instagram via the Graph API. SFW content only."
        onConnect={() => startOAuth('instagram')}
        onDisconnect={disconnectInstagram}
        sectionStyle={sectionStyle}
        toggleStyle={toggleStyle}
      />

      {/* Reddit Connection */}
      <SocialConnectSection
        label="Reddit Account"
        platformName="Reddit"
        status={redditStatus}
        username={redditUsername}
        usernamePrefix="u/"
        error={redditError}
        description="Connect this agent to a Reddit account. Agents can post to allow-listed subreddits. NSFW permitted on NSFW-tagged subreddits only."
        connectedBlurb="This agent can submit scheduled posts to subreddits, respecting each sub's rules and NSFW tagging."
        onConnect={() => startOAuth('reddit')}
        onDisconnect={disconnectReddit}
        sectionStyle={sectionStyle}
        toggleStyle={toggleStyle}
      />

      {/* Image Generation */}
      <div style={sectionStyle}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Image Generation</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>fal.ai Enabled</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Allow this agent to generate images</div>
          </div>
          <div style={toggleStyle(form.falai_connected)} onClick={() => update('falai_connected', !form.falai_connected)}>
            <div style={toggleDot(form.falai_connected)} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Image Style</label>
          <select style={{ ...inputStyle, cursor: 'pointer', appearance: 'none' }} value={form.image_style} onChange={e => update('image_style', e.target.value)}>
            {imageStyles.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>LoRA Model ID</label>
          <input style={inputStyle} value={form.lora_model} onChange={e => update('lora_model', e.target.value)} placeholder="e.g. realistic-v4" />
        </div>
      </div>

      {/* Webhook URL + Signing Secret */}
      <div style={sectionStyle}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Webhook</div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
          In your agent's Fanvue Developer Area → Webhooks, register the URL below. Then copy the signing secret Fanvue shows you and paste it here so we can verify incoming events.
        </div>

        <div>
          <label style={labelStyle}>Webhook URL</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              readOnly
              value={webhookUrl}
              style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11 }}
              onClick={e => e.target.select()}
            />
            <button onClick={copyWebhook}
              style={{
                padding: '8px 18px', fontSize: 12, borderRadius: 10,
                background: webhookCopied ? 'rgba(74, 222, 128, 0.15)' : 'rgba(255,255,255,0.08)',
                color: webhookCopied ? 'rgba(74, 222, 128, 0.9)' : 'var(--text-primary)',
                fontWeight: 500, transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
            >{webhookCopied ? 'Copied' : 'Copy'}</button>
          </div>
        </div>

        <div>
          <label style={labelStyle}>Signing Secret</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="password"
              value={signingSecret}
              onChange={e => setSigningSecret(e.target.value)}
              placeholder="Paste Fanvue's webhook signing secret"
              style={inputStyle}
            />
            <button onClick={saveSigningSecret}
              style={{
                padding: '8px 18px', fontSize: 12, borderRadius: 10,
                background: signingSecretSaved ? 'rgba(74, 222, 128, 0.15)' : 'rgba(255,255,255,0.08)',
                color: signingSecretSaved ? 'rgba(74, 222, 128, 0.9)' : 'var(--text-primary)',
                fontWeight: 500, transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
            >{signingSecretSaved ? 'Saved' : 'Save'}</button>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 6 }}>
            Required for security — without this, incoming webhooks can't be verified.
          </div>
        </div>
      </div>

      {/* Runtime / LLM Configuration */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Runtime Configuration</div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
          Configure the LLM and behavior of this agent's autonomous loop. Models powered by OpenRouter (set your key in Settings).
        </div>

        <div>
          <label style={labelStyle}>Standard Model (new / engaged / paying fans)</label>
          <select
            style={{ ...inputStyle, cursor: 'pointer', appearance: 'none' }}
            value={runtimeSettings.llm_model}
            onChange={e => updateRuntime('llm_model', e.target.value)}
          >
            {RUNTIME_MODELS.map(m => <option key={m.id} value={m.id}>{m.label} — {m.cost} per 1M</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>VIP Model (fans with $100+ spent)</label>
          <select
            style={{ ...inputStyle, cursor: 'pointer', appearance: 'none' }}
            value={runtimeSettings.llm_model_vip}
            onChange={e => updateRuntime('llm_model_vip', e.target.value)}
          >
            {RUNTIME_MODELS.map(m => <option key={m.id} value={m.id}>{m.label} — {m.cost} per 1M</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Temperature — {runtimeSettings.llm_temperature}</label>
          <input
            type="range" min="0" max="1.5" step="0.05"
            value={runtimeSettings.llm_temperature}
            onChange={e => updateRuntime('llm_temperature', parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
            <span>Consistent</span><span>Wild</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Min Reply Delay — {runtimeSettings.response_delay_min}s</label>
            <input
              type="range" min="0" max="600" step="5"
              value={runtimeSettings.response_delay_min}
              onChange={e => updateRuntime('response_delay_min', parseInt(e.target.value))}
              style={{ width: '100%', accentColor: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}
            />
          </div>
          <div>
            <label style={labelStyle}>Max Reply Delay — {runtimeSettings.response_delay_max}s</label>
            <input
              type="range" min="30" max="1800" step="30"
              value={runtimeSettings.response_delay_max}
              onChange={e => updateRuntime('response_delay_max', parseInt(e.target.value))}
              style={{ width: '100%', accentColor: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>NSFW Enabled</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Allow this agent to generate explicit content (paying/VIP fans only)</div>
          </div>
          <div style={toggleStyle(runtimeSettings.nsfw_enabled)} onClick={() => updateRuntime('nsfw_enabled', !runtimeSettings.nsfw_enabled)}>
            <div style={toggleDot(runtimeSettings.nsfw_enabled)} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Default PPV Price — ${runtimeSettings.ppv_price_default}</label>
          <input
            style={inputStyle}
            type="number"
            step="0.01"
            value={runtimeSettings.ppv_price_default}
            onChange={e => updateRuntime('ppv_price_default', parseFloat(e.target.value) || 0)}
          />
        </div>

        <button onClick={saveRuntimeSettings}
          style={{
            padding: '8px 18px', fontSize: 12, borderRadius: 10,
            background: runtimeSaved ? 'rgba(74, 222, 128, 0.15)' : 'rgba(255,255,255,0.08)',
            color: runtimeSaved ? 'rgba(74, 222, 128, 0.9)' : 'var(--text-primary)',
            fontWeight: 500, transition: 'all 0.15s', alignSelf: 'flex-start',
          }}
          onMouseEnter={e => { if (!runtimeSaved) e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
          onMouseLeave={e => { if (!runtimeSaved) e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
        >{runtimeSaved ? 'Saved' : 'Save Runtime Settings'}</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              style={{ padding: '6px 14px', fontSize: 11, borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: 'var(--text-tertiary)', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,80,80,0.15)'; e.currentTarget.style.color = 'rgba(255,120,120,0.9)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--text-tertiary)' }}
            >Delete Agent</button>
          ) : (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'rgba(255,120,120,0.9)' }}>Confirm?</span>
              <button onClick={onDelete}
                style={{ padding: '5px 12px', fontSize: 11, borderRadius: 8, background: 'rgba(255,80,80,0.2)', color: 'rgba(255,120,120,0.9)' }}
              >Yes, delete</button>
              <button onClick={() => setConfirmDelete(false)}
                style={{ padding: '5px 12px', fontSize: 11, borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: 'var(--text-tertiary)' }}
              >Cancel</button>
            </div>
          )}
        </div>
        <button
          onClick={() => onSave(form)}
          disabled={saving}
          style={{
            padding: '8px 22px', fontSize: 13, borderRadius: 10,
            background: saved ? 'rgba(74, 222, 128, 0.15)' : 'rgba(255,255,255,0.1)',
            color: saved ? 'rgba(74, 222, 128, 0.9)' : 'var(--text-primary)',
            fontWeight: 500, transition: 'all 0.15s',
          }}
          onMouseEnter={e => { if (!saved) e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}
          onMouseLeave={e => { if (!saved) e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
        >{saved ? 'Saved' : saving ? 'Saving...' : 'Save Changes'}</button>
      </div>
    </div>
  )
}

function SocialConnectSection({
  label,
  platformName,
  status,
  username,
  usernamePrefix = '@',
  error,
  description,
  connectedBlurb,
  onConnect,
  onDisconnect,
  sectionStyle,
}) {
  return (
    <div style={sectionStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>{label}</div>
        {status === 'connected' && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(74, 222, 128, 0.1)', color: 'rgba(74, 222, 128, 0.8)' }}>Connected</span>
        )}
      </div>

      {status === 'connected' ? (
        <>
          {username && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Linked to {platformName} as <span style={{ fontWeight: 500 }}>{usernamePrefix}{username}</span>
            </div>
          )}
          <div style={{
            fontSize: 11, color: 'var(--text-tertiary)', padding: '10px 14px',
            background: 'rgba(255,255,255,0.03)', borderRadius: 10, lineHeight: 1.5,
          }}>{connectedBlurb}</div>
          <button onClick={onDisconnect}
            style={{ padding: '6px 14px', fontSize: 11, borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: 'var(--text-tertiary)', transition: 'all 0.15s', alignSelf: 'flex-start' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,80,80,0.12)'; e.currentTarget.style.color = 'rgba(255,120,120,0.9)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--text-tertiary)' }}
          >Disconnect</button>
        </>
      ) : (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>{description}</div>
          {error && (
            <div style={{ fontSize: 12, color: 'rgba(255, 120, 120, 0.9)', padding: '8px 12px', background: 'rgba(255, 80, 80, 0.08)', borderRadius: 10 }}>
              {error}
            </div>
          )}
          <button onClick={onConnect}
            disabled={status === 'connecting'}
            style={{
              padding: '10px 22px', fontSize: 13, borderRadius: 10,
              background: 'rgba(255,255,255,0.08)', color: 'var(--text-primary)',
              fontWeight: 500, transition: 'background 0.15s', alignSelf: 'flex-start',
              opacity: status === 'connecting' ? 0.5 : 1,
              cursor: status === 'connecting' ? 'wait' : 'pointer',
            }}
            onMouseEnter={e => { if (status !== 'connecting') e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
          >{status === 'connecting' ? 'Redirecting...' : `Connect with ${platformName}`}</button>
        </>
      )}
    </div>
  )
}

function Empty({ text }) {
  return (
    <div style={{
      padding: '48px 0', textAlign: 'center',
      color: 'var(--text-tertiary)', fontSize: 13,
    }}>{text}</div>
  )
}

const EVENT_COLORS = {
  message_received: 'rgba(96, 165, 250, 0.8)',
  message_sent: 'rgba(74, 222, 128, 0.8)',
  reply_scheduled: 'rgba(255, 255, 255, 0.5)',
  image_generated: 'rgba(192, 132, 252, 0.8)',
  memories_extracted: 'rgba(250, 204, 21, 0.7)',
  stage_changed: 'rgba(74, 222, 128, 0.9)',
  post_scheduled: 'rgba(255, 255, 255, 0.5)',
  post_published: 'rgba(74, 222, 128, 0.8)',
  instagram_connected: 'rgba(232, 121, 249, 0.9)',
  reddit_connected: 'rgba(251, 146, 60, 0.9)',
  error: 'rgba(255, 120, 120, 0.9)',
}

function ActivityTab({ data }) {
  if (!Array.isArray(data) || data.length === 0) {
    return <Empty text="No activity yet" />
  }

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: 6 }}>
      {data.map(ev => {
        const color = EVENT_COLORS[ev.event_type] || 'rgba(255,255,255,0.4)'
        const label = ev.event_type.replace(/_/g, ' ')
        return (
          <div key={ev.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            padding: '12px 14px', borderRadius: 10, transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: color, flexShrink: 0, marginTop: 6,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{label}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.4 }}>{ev.description}</div>
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{timeAgo(ev.created_at)}</span>
          </div>
        )
      })}
    </div>
  )
}

// --- Stats data fetch ---

async function fetchStatsData(agent, client, useFanvue, rangeStart, days) {
  const rangeStartISO = rangeStart?.toISOString()
  const bucketDays = days || 90 // for "All" default to 90 day chart
  const start = rangeStart || (() => { const d = new Date(); d.setDate(d.getDate() - bucketDays); d.setHours(0, 0, 0, 0); return d })()

  // Build daily buckets
  const buckets = {}
  const now = new Date()
  const dayMs = 86400000
  const dayCount = Math.max(1, Math.ceil((now - start) / dayMs))
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(start.getTime() + i * dayMs)
    const key = d.toISOString().slice(0, 10)
    buckets[key] = { date: key, revenue: 0, fans: 0, messages: 0 }
  }

  let totalRevenue = 0
  let totalFans = 0
  let totalMessages = 0

  if (useFanvue) {
    // Earnings
    try {
      const earningsRes = await client.getEarnings({ startDate: start.toISOString().slice(0, 10), endDate: now.toISOString().slice(0, 10) })
      const earnings = earningsRes?.data || earningsRes?.earnings || []
      earnings.forEach(e => {
        const amount = Number(e.amount || e.total || 0)
        totalRevenue += amount
        const key = (e.date || e.createdAt || '').slice(0, 10)
        if (buckets[key]) buckets[key].revenue += amount
      })
    } catch {}

    // Subscribers
    try {
      const subRes = await client.getSubscribers({ limit: 100 })
      const subs = subRes?.data || subRes?.subscribers || []
      subs.forEach(s => {
        const joinedAt = s.subscribedAt || s.createdAt
        if (!joinedAt) return
        const joinDate = new Date(joinedAt)
        if (joinDate >= start) {
          totalFans += 1
          const key = joinDate.toISOString().slice(0, 10)
          if (buckets[key]) buckets[key].fans += 1
        }
      })
    } catch {}

    // Messages — approximate by counting recent chat activity
    try {
      const chatsRes = await client.getChats({ limit: 30 })
      const chats = chatsRes?.data || chatsRes?.chats || []
      for (const chat of chats.slice(0, 15)) {
        try {
          const mRes = await client.getChatMessages(chat.uuid || chat.id, { limit: 20 })
          const msgs = mRes?.data || mRes?.messages || []
          msgs.forEach(m => {
            const t = new Date(m.createdAt || m.created_at)
            if (t >= start) {
              totalMessages += 1
              const key = t.toISOString().slice(0, 10)
              if (buckets[key]) buckets[key].messages += 1
            }
          })
        } catch {}
      }
    } catch {}
  } else {
    // Supabase fallback
    const [revRes, fansRes, msgRes] = await Promise.all([
      (() => {
        let q = supabase.from('revenue').select('amount, created_at').eq('agent_id', agent.id)
        if (rangeStartISO) q = q.gte('created_at', rangeStartISO)
        return q
      })(),
      (() => {
        let q = supabase.from('fans').select('created_at').eq('agent_id', agent.id)
        if (rangeStartISO) q = q.gte('created_at', rangeStartISO)
        return q
      })(),
      (() => {
        let q = supabase.from('conversations').select('created_at').eq('agent_id', agent.id)
        if (rangeStartISO) q = q.gte('created_at', rangeStartISO)
        return q
      })(),
    ])

    ;(revRes.data || []).forEach(r => {
      const amount = Number(r.amount || 0)
      totalRevenue += amount
      const key = r.created_at?.slice(0, 10)
      if (buckets[key]) buckets[key].revenue += amount
    })
    ;(fansRes.data || []).forEach(f => {
      totalFans += 1
      const key = f.created_at?.slice(0, 10)
      if (buckets[key]) buckets[key].fans += 1
    })
    ;(msgRes.data || []).forEach(m => {
      totalMessages += 1
      const key = m.created_at?.slice(0, 10)
      if (buckets[key]) buckets[key].messages += 1
    })
  }

  return {
    totalRevenue,
    totalFans,
    totalMessages,
    series: Object.values(buckets),
  }
}

function StatsTab({ data, dateRange }) {
  if (!data || Array.isArray(data) || !data.series) return <Empty text="No stats available" />

  const { totalRevenue, totalFans, totalMessages, series } = data

  const cards = [
    { label: 'Revenue', value: `$${totalRevenue.toFixed(2)}`, sub: dateRange ? `Last ${dateRange} days` : 'All time' },
    { label: 'New Fans', value: totalFans.toString(), sub: dateRange ? `Last ${dateRange} days` : 'All time' },
    { label: 'Messages', value: totalMessages.toString(), sub: dateRange ? `Last ${dateRange} days` : 'All time' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {cards.map(c => (
          <div key={c.label} style={{
            background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '20px 22px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>{c.label}</div>
            <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.5px' }}>{c.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <RevenueChart series={series} />
    </div>
  )
}

function RevenueChart({ series }) {
  const width = 1152 // fits inside 1200 with padding
  const height = 240
  const padding = { top: 20, right: 20, bottom: 32, left: 48 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom

  if (!series.length) return null

  const maxRevenue = Math.max(...series.map(s => s.revenue), 1)
  const stepX = series.length > 1 ? chartW / (series.length - 1) : chartW

  const points = series.map((s, i) => ({
    x: padding.left + i * stepX,
    y: padding.top + chartH - (s.revenue / maxRevenue) * chartH,
    date: s.date,
    value: s.revenue,
  }))

  const pathD = points.length > 1
    ? points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
    : `M ${points[0].x} ${points[0].y}`

  const areaD = points.length > 1
    ? `${pathD} L ${points[points.length - 1].x} ${padding.top + chartH} L ${points[0].x} ${padding.top + chartH} Z`
    : ''

  const yTicks = 4
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => (maxRevenue / yTicks) * i)

  const xLabelCount = Math.min(6, series.length)
  const xLabelStep = Math.max(1, Math.floor(series.length / xLabelCount))

  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 'var(--radius)', padding: 22,
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Revenue Over Time</div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{series.length} days</div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        <defs>
          <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>

        {/* Y gridlines */}
        {yTickValues.map((val, i) => {
          const y = padding.top + chartH - (val / maxRevenue) * chartH
          return (
            <g key={i}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.3)">
                ${val.toFixed(0)}
              </text>
            </g>
          )
        })}

        {/* Area */}
        {areaD && <path d={areaD} fill="url(#revenueGradient)" />}
        {/* Line */}
        <path d={pathD} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />

        {/* Points */}
        {points.length <= 90 && points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2" fill="rgba(255,255,255,0.8)" />
        ))}

        {/* X labels */}
        {points.filter((_, i) => i % xLabelStep === 0 || i === points.length - 1).map((p, i) => {
          const d = new Date(p.date)
          const label = `${d.getMonth() + 1}/${d.getDate()}`
          return (
            <text key={i} x={p.x} y={height - padding.bottom + 20} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.3)">
              {label}
            </text>
          )
        })}
      </svg>
    </div>
  )
}
