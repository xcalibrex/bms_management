// reddit-oauth-callback — receives Reddit's redirect, exchanges the
// code for access + refresh tokens, fetches the account username,
// and persists everything on the agent row.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const REDDIT_CLIENT_ID = Deno.env.get('REDDIT_CLIENT_ID') || ''
const REDDIT_CLIENT_SECRET = Deno.env.get('REDDIT_CLIENT_SECRET') || ''
const REDDIT_USER_AGENT = Deno.env.get('REDDIT_USER_AGENT') || 'web:bms-agent-runtime:v1.0'
const FALLBACK_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://bms-management.vercel.app'

const REDIRECT_URI = `${supabaseUrl}/functions/v1/reddit-oauth-callback`
const AUTH_BASE = 'https://www.reddit.com'
const API_BASE = 'https://oauth.reddit.com'

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const supabase = createClient(supabaseUrl, serviceKey)

  function bounce(returnBase: string, agentId: string | null, params: Record<string, string>) {
    const base = returnBase || FALLBACK_SITE_URL
    const target = new URL(`${base.replace(/\/$/, '')}/agents/${agentId || ''}`)
    for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v)
    return Response.redirect(target.toString(), 302)
  }

  if (error) return bounce(FALLBACK_SITE_URL, null, { reddit_error: error })
  if (!code || !state) return bounce(FALLBACK_SITE_URL, null, { reddit_error: 'missing_code_or_state' })

  const { data: stateRow } = await supabase
    .from('oauth_states')
    .select('*')
    .eq('state', state)
    .eq('provider', 'reddit')
    .single()

  if (!stateRow) return bounce(FALLBACK_SITE_URL, null, { reddit_error: 'invalid_state' })
  if (new Date(stateRow.expires_at).getTime() < Date.now()) {
    return bounce(stateRow.return_url || FALLBACK_SITE_URL, stateRow.agent_id, { reddit_error: 'state_expired' })
  }
  const returnBase = stateRow.return_url || FALLBACK_SITE_URL
  await supabase.from('oauth_states').delete().eq('state', state)

  try {
    const basic = btoa(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`)
    const tokenRes = await fetch(`${AUTH_BASE}/api/v1/access_token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': REDDIT_USER_AGENT,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }).toString(),
    })
    const tok = await tokenRes.json()
    if (!tokenRes.ok || tok.error) throw new Error(tok.error || 'token exchange failed')

    const expiresAt = new Date(Date.now() + (tok.expires_in || 3600) * 1000).toISOString()

    // Fetch username
    const meRes = await fetch(`${API_BASE}/api/v1/me`, {
      headers: {
        Authorization: `Bearer ${tok.access_token}`,
        'User-Agent': REDDIT_USER_AGENT,
      },
    })
    const me = await meRes.json()
    if (!meRes.ok) throw new Error('failed to fetch me')

    await supabase.from('agents').update({
      reddit_connected: true,
      reddit_username: me.name || null,
      reddit_access_token: tok.access_token,
      reddit_refresh_token: tok.refresh_token,
      reddit_token_expires_at: expiresAt,
      reddit_scopes: tok.scope || null,
    }).eq('id', stateRow.agent_id)

    await supabase.from('agent_events').insert({
      agent_id: stateRow.agent_id,
      event_type: 'reddit_connected',
      description: `Reddit connected as u/${me.name}`,
    })

    return bounce(returnBase, stateRow.agent_id, { reddit_connected: '1' })
  } catch (e) {
    return bounce(returnBase, stateRow.agent_id, {
      reddit_error: 'oauth_failed',
      reddit_error_detail: encodeURIComponent((e as Error).message || 'unknown'),
    })
  }
})
