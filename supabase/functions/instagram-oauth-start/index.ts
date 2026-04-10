// instagram-oauth-start — generates a Facebook Login authorization URL
// (Instagram Graph API requires going through Facebook Login on a Page
// with a linked IG Business/Creator account) and stores a short-lived
// state row that the callback function will validate.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const META_APP_ID = Deno.env.get('META_APP_ID') || ''
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://bms.app'

const REDIRECT_URI = `${supabaseUrl}/functions/v1/instagram-oauth-callback`
// Minimum scopes to publish to an IG business account
const SCOPES = [
  'public_profile',
  'pages_show_list',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_insights',
].join(',')

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return new Response('Missing auth', { status: 401 })

  const supabase = createClient(supabaseUrl, serviceKey)

  // Verify the caller is a real user
  const { data: userRes, error: userErr } = await supabase.auth.getUser(token)
  if (userErr || !userRes?.user) return new Response('Unauthorized', { status: 401 })
  const userId = userRes.user.id

  const { agent_id } = await req.json().catch(() => ({}))
  if (!agent_id) return new Response('Missing agent_id', { status: 400 })

  // Ensure the caller actually owns this agent
  const { data: agent } = await supabase
    .from('agents')
    .select('id, user_id')
    .eq('id', agent_id)
    .single()
  if (!agent || agent.user_id !== userId) {
    return new Response('Forbidden', { status: 403 })
  }

  if (!META_APP_ID) {
    return new Response('META_APP_ID not configured on server', { status: 500 })
  }

  // Generate state token — random + bound to agent + expires in 10 min
  const state = crypto.randomUUID()
  await supabase.from('oauth_states').insert({
    state,
    agent_id,
    user_id: userId,
    provider: 'instagram',
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  })

  const params = new URLSearchParams({
    client_id: META_APP_ID,
    redirect_uri: REDIRECT_URI,
    state,
    scope: SCOPES,
    response_type: 'code',
  }).toString()

  const authorizeUrl = `https://www.facebook.com/v21.0/dialog/oauth?${params}`

  return new Response(JSON.stringify({ url: authorizeUrl }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
