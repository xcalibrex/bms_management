// Reddit API client. Uses the OAuth Bearer token flow.
//
// Reddit API notes:
// - Base for user-authenticated requests is https://oauth.reddit.com
// - All requests MUST include a descriptive User-Agent ("web:bms:v1.0 (by /u/...)")
// - Rate limit: 60 QPM per OAuth token. Watch `X-Ratelimit-*` response headers.
// - Access tokens expire after 1 hour — refresh via `refresh_token` grant.
const API_BASE = 'https://oauth.reddit.com'
const AUTH_BASE = 'https://www.reddit.com'
const DEFAULT_UA = 'web:bms-agent-runtime:v1.0 (by /u/bms-bot)'

export function createRedditClient({ accessToken, userAgent = DEFAULT_UA }) {
  async function request(path, { method = 'GET', form, params } = {}) {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : ''
    const res = await fetch(`${API_BASE}${path}${qs}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': userAgent,
        ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: form ? new URLSearchParams(form).toString() : undefined,
    })
    const text = await res.text()
    let json
    try { json = text ? JSON.parse(text) : {} } catch { json = { raw: text } }
    if (!res.ok) {
      throw new Error(json?.message || json?.error || `Reddit API error: ${res.status}`)
    }
    return json
  }

  return {
    // GET /api/v1/me — authenticated user
    async getMe() {
      return request('/api/v1/me')
    },

    // List subreddits the user moderates or is subscribed to
    async getSubscribedSubreddits({ limit = 50 } = {}) {
      return request('/subreddits/mine/subscriber', { params: { limit } })
    },

    // Submit a text (self) post
    async submitText({ subreddit, title, text, nsfw = false, spoiler = false, flairId }) {
      return request('/api/submit', {
        method: 'POST',
        form: {
          sr: subreddit,
          kind: 'self',
          title,
          text: text || '',
          nsfw: nsfw ? 'true' : 'false',
          spoiler: spoiler ? 'true' : 'false',
          api_type: 'json',
          ...(flairId ? { flair_id: flairId } : {}),
        },
      })
    },

    // Submit a link post
    async submitLink({ subreddit, title, url, nsfw = false, spoiler = false, flairId }) {
      return request('/api/submit', {
        method: 'POST',
        form: {
          sr: subreddit,
          kind: 'link',
          title,
          url,
          nsfw: nsfw ? 'true' : 'false',
          spoiler: spoiler ? 'true' : 'false',
          resubmit: 'true',
          api_type: 'json',
          ...(flairId ? { flair_id: flairId } : {}),
        },
      })
    },

    // Submit an image post. Note: Reddit's native image upload is a multi-step
    // flow (request lease → upload to S3 → submit). For simplicity we treat
    // image posts as link posts pointing at an already-hosted URL, which is
    // how most subreddits show inline images anyway.
    async submitImage({ subreddit, title, imageUrl, nsfw = false, flairId }) {
      return this.submitLink({ subreddit, title, url: imageUrl, nsfw, flairId })
    },

    // Comment on a post or another comment (parent fullname e.g. t3_xxxx or t1_xxxx)
    async comment({ parentFullname, text }) {
      return request('/api/comment', {
        method: 'POST',
        form: {
          parent: parentFullname,
          text,
          api_type: 'json',
        },
      })
    },

    // Latest N posts by the authenticated user
    async getMyPosts({ limit = 25 } = {}) {
      const me = await this.getMe()
      return request(`/user/${me.name}/submitted`, { params: { limit, sort: 'new' } })
    },

    // Fetch a single post by id (t3_xxxx → "xxxx")
    async getPost(id36) {
      return request(`/by_id/t3_${id36}`)
    },

    // Inbox (unread messages + comment replies)
    async getInbox({ limit = 25 } = {}) {
      return request('/message/unread', { params: { limit } })
    },

    async validate() {
      try {
        const me = await this.getMe()
        return { valid: true, username: me.name, karma: (me.link_karma || 0) + (me.comment_karma || 0) }
      } catch (e) {
        return { valid: false, error: e.message }
      }
    },
  }
}

// --- OAuth token helpers (used from edge functions) ---

// Exchange an auth code for an access_token + refresh_token
export async function exchangeCodeForToken({ clientId, clientSecret, code, redirectUri, userAgent = DEFAULT_UA }) {
  const basic = btoa(`${clientId}:${clientSecret}`)
  const res = await fetch(`${AUTH_BASE}/api/v1/access_token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }).toString(),
  })
  const json = await res.json()
  if (!res.ok || json.error) throw new Error(json.error || 'Reddit token exchange failed')
  return json // { access_token, refresh_token, expires_in, scope, token_type }
}

// Refresh an expiring token using refresh_token
export async function refreshAccessToken({ clientId, clientSecret, refreshToken, userAgent = DEFAULT_UA }) {
  const basic = btoa(`${clientId}:${clientSecret}`)
  const res = await fetch(`${AUTH_BASE}/api/v1/access_token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  })
  const json = await res.json()
  if (!res.ok || json.error) throw new Error(json.error || 'Reddit token refresh failed')
  return json // { access_token, expires_in, scope, token_type }
}

// Build the Reddit authorization URL for the OAuth start step
export function buildAuthorizeUrl({ clientId, redirectUri, state, scopes = ['identity', 'submit', 'read', 'edit', 'mysubreddits', 'privatemessages'] }) {
  const qs = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    state,
    redirect_uri: redirectUri,
    duration: 'permanent',
    scope: scopes.join(' '),
  }).toString()
  return `${AUTH_BASE}/api/v1/authorize?${qs}`
}
