// reddit-oauth-start — mints a state token and returns Reddit's
// authorization URL. Uses `duration=permanent` so we get a refresh_token.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const REDDIT_CLIENT_ID = Deno.env.get('REDDIT_CLIENT_ID') || ''

// Same return-origin allowlist as Instagram OAuth start
const DEFAULT_ORIGINS = [
  'https://bms-management.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]
const ALLOWED_RETURN_ORIGINS = (Deno.env.get('ALLOWED_RETURN_ORIGINS') || '')
  .split(',').map(s => s.trim()).filter(Boolean)
const allowedOrigins = ALLOWED_RETURN_ORIGINS.length ? ALLOWED_RETURN_ORIGINS : DEFAULT_ORIGINS

const REDIRECT_URI = `${supabaseUrl}/functions/v1/reddit-oauth-callback`
const SCOPES = ['identity', 'submit', 'read', 'edit', 'mysubreddits', 'privatemessages', 'history'].join(' ')

function safeReturnUrl(raw: string | undefined): string {
  if (!raw) return allowedOrigins[0]
  try {
    const u = new URL(raw)
    const origin = `${u.protocol}//${u.host}`
    if (allowedOrigins.includes(origin)) return raw
  } catch {}
  return allowedOrigins[0]
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return new Response('Missing auth', { status: 401 })

  const supabase = createClient(supabaseUrl, serviceKey)
  const { data: userRes, error: userErr } = await supabase.auth.getUser(token)
  if (userErr || !userRes?.user) return new Response('Unauthorized', { status: 401 })
  const userId = userRes.user.id

  const body = await req.json().catch(() => ({}))
  const { agent_id, return_url } = body
  if (!agent_id) return new Response('Missing agent_id', { status: 400 })

  const { data: agent } = await supabase
    .from('agents')
    .select('id, user_id')
    .eq('id', agent_id)
    .single()
  if (!agent || agent.user_id !== userId) return new Response('Forbidden', { status: 403 })

  if (!REDDIT_CLIENT_ID) {
    return new Response('REDDIT_CLIENT_ID not configured', { status: 500 })
  }

  const state = crypto.randomUUID()
  await supabase.from('oauth_states').insert({
    state,
    agent_id,
    user_id: userId,
    provider: 'reddit',
    return_url: safeReturnUrl(return_url),
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  })

  const params = new URLSearchParams({
    client_id: REDDIT_CLIENT_ID,
    response_type: 'code',
    state,
    redirect_uri: REDIRECT_URI,
    duration: 'permanent',
    scope: SCOPES,
  }).toString()

  const url = `https://www.reddit.com/api/v1/authorize?${params}`
  return new Response(JSON.stringify({ url }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
