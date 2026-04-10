const stats = [
  { label: 'Total Agents', value: '12' },
  { label: 'Active', value: '8' },
  { label: 'Images Generated', value: '3.4k' },
  { label: 'Fanvue Connected', value: '6' },
]

const recentAgents = [
  { name: 'Atlas', model: 'GPT-4o', status: 'active', lastActive: '2 min ago', integrations: ['Fanvue', 'fal.ai'] },
  { name: 'Nova', model: 'Claude 3.5', status: 'active', lastActive: '5 min ago', integrations: ['Fanvue', 'fal.ai'] },
  { name: 'Echo', model: 'Gemini Pro', status: 'idle', lastActive: '1 hr ago', integrations: ['fal.ai'] },
  { name: 'Sage', model: 'GPT-4o', status: 'active', lastActive: '12 min ago', integrations: ['Fanvue'] },
  { name: 'Drift', model: 'Mistral Large', status: 'idle', lastActive: '3 hr ago', integrations: [] },
]

const activity = [
  { text: 'Atlas generated 12 images via fal.ai', time: '2 min ago' },
  { text: 'Nova LoRA model updated to anime-style-v2', time: '1 hr ago' },
  { text: 'Echo connected to fal.ai', time: '3 hr ago' },
  { text: 'Sage Fanvue profile synced', time: '5 hr ago' },
  { text: 'Drift personality config updated', time: '1 day ago' },
]

export default function Dashboard() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>Dashboard</h1>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Overview of your AI agents</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {stats.map(s => (
          <div key={s.label} style={{
            background: 'var(--surface)',
            borderRadius: 'var(--radius)',
            padding: '18px 20px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.5px' }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14, color: 'var(--text-secondary)' }}>Recent Agents</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {recentAgents.map(a => (
              <div key={a.name} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px', borderRadius: 10, cursor: 'pointer', transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 10,
                    background: 'var(--surface-active)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
                  }}>{a.name[0]}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', gap: 6 }}>
                      <span>{a.model}</span>
                      {a.integrations.length > 0 && (
                        <span style={{ color: 'rgba(255,255,255,0.2)' }}>{a.integrations.join(' · ')}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: a.status === 'active' ? 'rgba(74, 222, 128, 0.7)' : 'rgba(255, 255, 255, 0.15)',
                  }} />
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{a.lastActive}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14, color: 'var(--text-secondary)' }}>Activity</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {activity.map((a, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px', borderRadius: 10,
              }}>
                <span style={{ fontSize: 13 }}>{a.text}</span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', marginLeft: 12 }}>{a.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
