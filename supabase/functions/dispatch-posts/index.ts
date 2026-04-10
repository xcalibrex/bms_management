// dispatch-posts — drains scheduled_posts whose send_at has passed and
// pushes them to the right platform (Instagram Graph API / Reddit).
//
// Intended to be invoked on a 1-minute schedule via pg_cron:
//
//   select cron.schedule('dispatch-posts', '* * * * *', $$
//     select net.http_post(
//       url := 'https://<project>.supabase.co/functions/v1/dispatch-posts',
//       headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))
//     );
//   $$);
//
// Per-run it will:
//   1. Pick up to BATCH_SIZE pending posts where send_at <= now()
//   2. Refresh Reddit tokens if expiring, pick fresh IG long-lived tokens
//   3. Post to the platform
//   4. Mark success/failure on the row (with retry + backoff via `attempts`)

import { createClient } from 'jsr:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Meta / Reddit app credentials (set as Supabase function secrets)
const META_APP_ID = Deno.env.get('META_APP_ID') || ''
const META_APP_SECRET = Deno.env.get('META_APP_SECRET') || ''
const REDDIT_CLIENT_ID = Deno.env.get('REDDIT_CLIENT_ID') || ''
const REDDIT_CLIENT_SECRET = Deno.env.get('REDDIT_CLIENT_SECRET') || ''
const REDDIT_USER_AGENT = Deno.env.get('REDDIT_USER_AGENT') || 'web:bms-agent-runtime:v1.0'

const GRAPH_BASE = 'https://graph.facebook.com/v21.0'
const REDDIT_API_BASE = 'https://oauth.reddit.com'
const REDDIT_AUTH_BASE = 'https://www.reddit.com'

const BATCH_SIZE = 10
const MAX_ATTEMPTS = 5

Deno.serve(async (_req) => {
  const supabase = createClient(supabaseUrl, serviceKey)

  // Claim a batch of due posts
  const { data: posts, error } = await supabase
    .from('scheduled_posts')
    .select('*')
    .eq('status', 'pending')
    .lte('send_at', new Date().toISOString())
    .order('send_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) {
    return json({ error: error.message }, 500)
  }
  if (!posts || posts.length === 0) {
    return json({ dispatched: 0 })
  }

  const results: any[] = []

  for (const post of posts) {
    const { data: agent } = await supabase
      .from('agents')
      .select('*')
      .eq('id', post.agent_id)
      .single()

    if (!agent) {
      await markFailed(supabase, post, 'agent not found', false)
      results.push({ id: post.id, status: 'failed', error: 'agent not found' })
      continue
    }

    try {
      if (post.platform === 'instagram') {
        const res = await postToInstagram(supabase, agent, post)
        await markPosted(supabase, post, res.id, res.permalink)
        results.push({ id: post.id, status: 'posted', platform_post_id: res.id })
      } else if (post.platform === 'reddit') {
        const res = await postToReddit(supabase, agent, post)
        await markPosted(supabase, post, res.id, res.permalink)
        results.push({ id: post.id, status: 'posted', platform_post_id: res.id })
      } else {
        throw new Error(`unknown platform: ${post.platform}`)
      }
    } catch (e) {
      const retriable = post.attempts + 1 < MAX_ATTEMPTS
      await markFailed(supabase, post, e.message || String(e), retriable)
      results.push({ id: post.id, status: retriable ? 'retrying' : 'failed', error: e.message })
    }
  }

  return json({ dispatched: posts.length, results })
})

// ---- Instagram ----------------------------------------------------------

async function postToInstagram(_supabase: any, agent: any, post: any): Promise<{ id: string; permalink?: string }> {
  if (!agent.instagram_connected || !agent.instagram_access_token || !agent.instagram_user_id) {
    throw new Error('Instagram not connected')
  }
  if (!post.image_url) {
    throw new Error('image_url required for IG post')
  }

  // Step 1: create media container
  const containerParams = new URLSearchParams({
    image_url: post.image_url,
    access_token: agent.instagram_access_token,
  })
  if (post.caption) containerParams.set('caption', post.caption)

  const containerRes = await fetch(`${GRAPH_BASE}/${agent.instagram_user_id}/media?${containerParams}`, { method: 'POST' })
  const container = await containerRes.json()
  if (!containerRes.ok || container.error) {
    throw new Error(`IG container: ${container.error?.message || containerRes.status}`)
  }

  // Step 2: publish
  const publishParams = new URLSearchParams({
    creation_id: container.id,
    access_token: agent.instagram_access_token,
  })
  const publishRes = await fetch(`${GRAPH_BASE}/${agent.instagram_user_id}/media_publish?${publishParams}`, { method: 'POST' })
  const published = await publishRes.json()
  if (!publishRes.ok || published.error) {
    throw new Error(`IG publish: ${published.error?.message || publishRes.status}`)
  }

  // Optionally fetch the permalink
  let permalink: string | undefined
  try {
    const permRes = await fetch(`${GRAPH_BASE}/${published.id}?fields=permalink&access_token=${encodeURIComponent(agent.instagram_access_token)}`)
    const perm = await permRes.json()
    permalink = perm.permalink
  } catch {}

  return { id: published.id, permalink }
}

// ---- Reddit -------------------------------------------------------------

async function postToReddit(supabase: any, agent: any, post: any): Promise<{ id: string; permalink?: string }> {
  if (!agent.reddit_connected || !agent.reddit_refresh_token) {
    throw new Error('Reddit not connected')
  }

  const accessToken = await ensureRedditToken(supabase, agent)

  const form: Record<string, string> = {
    sr: post.subreddit,
    title: post.title,
    api_type: 'json',
    nsfw: post.nsfw ? 'true' : 'false',
  }
  if (post.post_kind === 'text') {
    form.kind = 'self'
    form.text = post.body || ''
  } else if (post.post_kind === 'image' || post.post_kind === 'link') {
    form.kind = 'link'
    form.url = post.url || post.image_url || ''
    form.resubmit = 'true'
  } else {
    throw new Error(`unknown post_kind ${post.post_kind}`)
  }

  const res = await fetch(`${REDDIT_API_BASE}/api/submit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': REDDIT_USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(form).toString(),
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Reddit ${res.status}: ${JSON.stringify(json).slice(0, 200)}`)
  }

  const submitErrors = json?.json?.errors
  if (Array.isArray(submitErrors) && submitErrors.length > 0) {
    throw new Error(`Reddit: ${submitErrors.map((e: any) => e.join(' ')).join('; ')}`)
  }

  const data = json?.json?.data || {}
  return {
    id: data.name || data.id || 'unknown',
    permalink: data.url,
  }
}

async function ensureRedditToken(supabase: any, agent: any): Promise<string> {
  const expiresAt = agent.reddit_token_expires_at ? new Date(agent.reddit_token_expires_at).getTime() : 0
  // Refresh if <2 min remaining
  if (agent.reddit_access_token && expiresAt - Date.now() > 2 * 60 * 1000) {
    return agent.reddit_access_token
  }

  if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET) {
    throw new Error('Reddit app credentials not configured on the server')
  }

  const basic = btoa(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`)
  const res = await fetch(`${REDDIT_AUTH_BASE}/api/v1/access_token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': REDDIT_USER_AGENT,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: agent.reddit_refresh_token,
    }).toString(),
  })

  const json = await res.json()
  if (!res.ok || json.error) {
    throw new Error(`Reddit token refresh: ${json.error || res.status}`)
  }

  const newExpires = new Date(Date.now() + (json.expires_in || 3600) * 1000).toISOString()
  await supabase.from('agents').update({
    reddit_access_token: json.access_token,
    reddit_token_expires_at: newExpires,
  }).eq('id', agent.id)

  return json.access_token
}

// ---- Status helpers -----------------------------------------------------

async function markPosted(supabase: any, post: any, platformPostId: string, permalink?: string) {
  await supabase.from('scheduled_posts').update({
    status: 'posted',
    posted_at: new Date().toISOString(),
    platform_post_id: platformPostId,
    platform_post_url: permalink || null,
    error: null,
  }).eq('id', post.id)

  await supabase.from('agent_events').insert({
    agent_id: post.agent_id,
    event_type: 'post_published',
    description: `Posted to ${post.platform}${post.subreddit ? ` r/${post.subreddit}` : ''}`,
    metadata: { post_id: post.id, platform_post_id: platformPostId, permalink },
  })
}

async function markFailed(supabase: any, post: any, message: string, retriable: boolean) {
  const attempts = (post.attempts || 0) + 1
  // Backoff: 2, 4, 8, 16, 32 minutes
  const backoffMinutes = Math.pow(2, attempts)
  const nextSendAt = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString()

  await supabase.from('scheduled_posts').update({
    status: retriable ? 'pending' : 'failed',
    attempts,
    error: message.slice(0, 500),
    send_at: retriable ? nextSendAt : post.send_at,
  }).eq('id', post.id)

  if (!retriable) {
    await supabase.from('agent_events').insert({
      agent_id: post.agent_id,
      event_type: 'error',
      description: `Post to ${post.platform} failed permanently: ${message.slice(0, 120)}`,
      metadata: { post_id: post.id, attempts },
    })
  }
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
