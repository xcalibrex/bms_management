// instagram-oauth-callback — Facebook redirects here after the user
// authorizes. We exchange the code for a short-lived token, upgrade it
// to a long-lived (60 day) token, look up the IG Business account id,
// and persist everything on the agent row. Then we bounce the browser
// back to the agent's detail page.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const META_APP_ID = Deno.env.get('META_APP_ID') || ''
const META_APP_SECRET = Deno.env.get('META_APP_SECRET') || ''
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://bms.app'

const REDIRECT_URI = `${supabaseUrl}/functions/v1/instagram-oauth-callback`
const GRAPH_BASE = 'https://graph.facebook.com/v21.0'

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const supabase = createClient(supabaseUrl, serviceKey)

  function bounce(agentId: string | null, params: Record<string, string>) {
    const target = new URL(`${PUBLIC_SITE_URL}/agents/${agentId || ''}`)
    for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v)
    return Response.redirect(target.toString(), 302)
  }

  if (error) {
    return bounce(null, { instagram_error: error })
  }
  if (!code || !state) {
    return bounce(null, { instagram_error: 'missing_code_or_state' })
  }

  // Validate state
  const { data: stateRow } = await supabase
    .from('oauth_states')
    .select('*')
    .eq('state', state)
    .eq('provider', 'instagram')
    .single()

  if (!stateRow) return bounce(null, { instagram_error: 'invalid_state' })
  if (new Date(stateRow.expires_at).getTime() < Date.now()) {
    return bounce(stateRow.agent_id, { instagram_error: 'state_expired' })
  }

  // Burn the state row immediately
  await supabase.from('oauth_states').delete().eq('state', state)

  try {
    // 1. Exchange code → short-lived token
    const tokenRes = await fetch(
      `${GRAPH_BASE}/oauth/access_token?` + new URLSearchParams({
        client_id: META_APP_ID,
        client_secret: META_APP_SECRET,
        redirect_uri: REDIRECT_URI,
        code,
      }).toString(),
    )
    const tokenJson = await tokenRes.json()
    if (!tokenRes.ok || tokenJson.error) {
      throw new Error(tokenJson.error?.message || 'token exchange failed')
    }
    const shortLived = tokenJson.access_token as string

    // 2. Upgrade to long-lived (60 day)
    const longRes = await fetch(
      `${GRAPH_BASE}/oauth/access_token?` + new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: META_APP_ID,
        client_secret: META_APP_SECRET,
        fb_exchange_token: shortLived,
      }).toString(),
    )
    const longJson = await longRes.json()
    if (!longRes.ok || longJson.error) {
      throw new Error(longJson.error?.message || 'long-lived exchange failed')
    }
    const longLivedToken = longJson.access_token as string
    const expiresIn = (longJson.expires_in as number) || 60 * 24 * 60 * 60

    // 3. Find the IG Business account via the user's pages
    const pagesRes = await fetch(
      `${GRAPH_BASE}/me/accounts?fields=id,name,instagram_business_account&access_token=${encodeURIComponent(longLivedToken)}`,
    )
    const pagesJson = await pagesRes.json()
    if (!pagesRes.ok || pagesJson.error) {
      throw new Error(pagesJson.error?.message || 'failed to list pages')
    }
    const page = (pagesJson.data || []).find((p: any) => p.instagram_business_account?.id)
    if (!page) throw new Error('No Instagram Business account linked to any Facebook Page')

    const igUserId = page.instagram_business_account.id

    // 4. Fetch the IG profile for username
    const profRes = await fetch(
      `${GRAPH_BASE}/${igUserId}?fields=id,username&access_token=${encodeURIComponent(longLivedToken)}`,
    )
    const prof = await profRes.json()

    // 5. Persist
    await supabase.from('agents').update({
      instagram_connected: true,
      instagram_username: prof.username || null,
      instagram_user_id: igUserId,
      instagram_page_id: page.id,
      instagram_access_token: longLivedToken,
      instagram_token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    }).eq('id', stateRow.agent_id)

    await supabase.from('agent_events').insert({
      agent_id: stateRow.agent_id,
      event_type: 'instagram_connected',
      description: `Instagram connected as @${prof.username || 'unknown'}`,
    })

    return bounce(stateRow.agent_id, { instagram_connected: '1' })
  } catch (e) {
    return bounce(stateRow.agent_id, {
      instagram_error: 'oauth_failed',
      instagram_error_detail: encodeURIComponent((e as Error).message || 'unknown'),
    })
  }
})
