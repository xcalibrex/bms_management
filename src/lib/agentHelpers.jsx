export const models = ['GPT-4o', 'Claude 3.5 Sonnet', 'Gemini Pro', 'Mistral Large', 'Llama 3.1 70B']
export const imageStyles = ['None', 'Photorealistic', 'Anime', 'Digital Art', 'Oil Painting', 'Watercolor', '3D Render']

export const avatarGradients = [
  'linear-gradient(135deg, #1a1a2e, #16213e)',
  'linear-gradient(135deg, #1a1a1a, #2d1b38)',
  'linear-gradient(135deg, #0f1923, #1a2a1a)',
  'linear-gradient(135deg, #1e1a14, #2a1a1a)',
  'linear-gradient(135deg, #141420, #1a2030)',
  'linear-gradient(135deg, #1a1418, #281a20)',
]

export function getGradient(name) {
  if (!name) return avatarGradients[0]
  const idx = name.charCodeAt(0) % avatarGradients.length
  return avatarGradients[idx]
}

export function AgentAvatar({ agent, size = 36, radius = 12, fontSize = 14, shadow = true }) {
  const style = {
    width: size,
    height: size,
    borderRadius: radius,
    background: agent?.fanvue_avatar_url
      ? `url(${agent.fanvue_avatar_url}) center/cover`
      : 'var(--surface-active)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    flexShrink: 0,
    overflow: 'hidden',
    boxShadow: shadow ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
  }
  return (
    <div style={style}>
      {!agent?.fanvue_avatar_url && (agent?.name?.[0] || '?').toUpperCase()}
    </div>
  )
}

export function Pill({ label, active }) {
  return (
    <span style={{
      padding: '3px 10px',
      fontSize: 10,
      borderRadius: 20,
      background: active ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
      color: active ? 'var(--text-secondary)' : 'var(--text-tertiary)',
      letterSpacing: '0.3px',
      transition: 'all 0.15s',
    }}>{label}</span>
  )
}

export function StagePill({ stage }) {
  const colors = {
    new: { bg: 'rgba(255,255,255,0.06)', color: 'var(--text-tertiary)' },
    engaged: { bg: 'rgba(59,130,246,0.12)', color: 'rgba(96,165,250,0.9)' },
    paying: { bg: 'rgba(74,222,128,0.1)', color: 'rgba(74,222,128,0.8)' },
    vip: { bg: 'rgba(250,204,21,0.1)', color: 'rgba(250,204,21,0.8)' },
  }
  const c = colors[stage] || colors.new
  return (
    <span style={{
      padding: '2px 8px',
      fontSize: 10,
      borderRadius: 20,
      background: c.bg,
      color: c.color,
      letterSpacing: '0.3px',
      textTransform: 'capitalize',
    }}>{stage}</span>
  )
}

export function timeAgo(date) {
  if (!date) return ''
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
