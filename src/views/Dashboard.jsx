import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { timeAgo, AgentAvatar } from '../lib/agentHelpers'

function getMonthStart() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalAgents: 0,
    activeAgents: 0,
    totalFans: 0,
    revenueThisMonth: 0,
  })
  const [recentPayments, setRecentPayments] = useState([])
  const [topAgents, setTopAgents] = useState([])

  useEffect(() => {
    fetchDashboard()
  }, [])

  async function fetchDashboard() {
    const monthStart = getMonthStart()

    // Fetch all agents (we need them for the top agents list and stats)
    const { data: agents } = await supabase.from('agents').select('*')
    const agentList = agents || []
    const agentMap = Object.fromEntries(agentList.map(a => [a.id, a]))

    // Fans count across user's agents
    const { count: fanCount } = await supabase
      .from('fans')
      .select('id', { count: 'exact', head: true })

    // Revenue this month — sum across all agents
    const { data: monthRevenue } = await supabase
      .from('revenue')
      .select('amount, agent_id')
      .gte('created_at', monthStart)

    const revenueTotal = (monthRevenue || []).reduce((sum, r) => sum + Number(r.amount || 0), 0)

    // Aggregate revenue per agent for "top agents this month"
    const agentRevenue = {}
    ;(monthRevenue || []).forEach(r => {
      agentRevenue[r.agent_id] = (agentRevenue[r.agent_id] || 0) + Number(r.amount || 0)
    })
    const topAgentList = Object.entries(agentRevenue)
      .map(([agentId, revenue]) => ({ agent: agentMap[agentId], revenue }))
      .filter(item => item.agent)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)

    // Recent payments — last 8 revenue events with fan display_name
    const { data: payments } = await supabase
      .from('revenue')
      .select('id, amount, revenue_type, created_at, agent_id, fan_id, fans(display_name)')
      .order('created_at', { ascending: false })
      .limit(8)

    setStats({
      totalAgents: agentList.length,
      activeAgents: agentList.filter(a => a.status === 'active').length,
      totalFans: fanCount || 0,
      revenueThisMonth: revenueTotal,
    })
    setTopAgents(topAgentList)
    setRecentPayments((payments || []).map(p => ({
      ...p,
      agent: agentMap[p.agent_id],
      fan_name: p.fans?.display_name || 'Anonymous',
    })))
    setLoading(false)
  }

  if (loading) {
    return <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: 48 }}>Loading...</div>
  }

  const statCards = [
    { label: 'Total Models', value: stats.totalAgents.toString(), sub: `${stats.activeAgents} active` },
    { label: 'Total Fans', value: stats.totalFans.toLocaleString(), sub: 'across all models' },
    { label: 'Revenue (Month)', value: `$${stats.revenueThisMonth.toFixed(2)}`, sub: new Date().toLocaleString('default', { month: 'long' }) },
    { label: 'Active Models', value: stats.activeAgents.toString(), sub: `of ${stats.totalAgents} total` },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>Dashboard</h1>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Overview of your AI models</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {statCards.map(s => (
          <div key={s.label} style={{
            background: 'var(--surface)',
            borderRadius: 'var(--radius)',
            padding: '18px 20px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.5px' }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* Top Models */}
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14, color: 'var(--text-secondary)' }}>Top Models This Month</div>
          {topAgents.length === 0 ? (
            <div style={{ color: 'var(--text-tertiary)', fontSize: 12, padding: '24px 0', textAlign: 'center' }}>
              No revenue yet this month
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {topAgents.map(({ agent, revenue }, i) => (
                <div key={agent.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', borderRadius: 10, cursor: 'pointer', transition: 'background 0.15s',
                }}
                onClick={() => navigate(`/agents/${agent.id}`)}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 20, fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'center',
                    }}>{i + 1}</div>
                    <AgentAvatar agent={agent} size={30} radius={10} fontSize={12} shadow={false} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{agent.name}</div>
                      {agent.fanvue_username && (
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>@{agent.fanvue_username}</div>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>${revenue.toFixed(2)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Payments */}
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14, color: 'var(--text-secondary)' }}>Recent Payments</div>
          {recentPayments.length === 0 ? (
            <div style={{ color: 'var(--text-tertiary)', fontSize: 12, padding: '24px 0', textAlign: 'center' }}>
              No payments yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {recentPayments.map(p => (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', borderRadius: 10, cursor: 'pointer', transition: 'background 0.15s',
                }}
                onClick={() => p.agent && navigate(`/agents/${p.agent.id}`)}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 20,
                      background: 'rgba(255,255,255,0.06)', color: 'var(--text-tertiary)',
                      textTransform: 'capitalize', flexShrink: 0,
                    }}>{p.revenue_type}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.fan_name} <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>→ {p.agent?.name || 'Unknown'}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{timeAgo(p.created_at)}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(74, 222, 128, 0.9)' }}>+${Number(p.amount).toFixed(2)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
