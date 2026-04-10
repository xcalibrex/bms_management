// Instagram Graph API client. Pass an OAuth user access token for an
// Instagram Business/Creator account linked to a Facebook Page.
//
// Requires the `instagram_content_publish`, `instagram_basic`, and
// `pages_show_list` scopes on the Meta app. Publishing a photo is a
// two-step container flow:
//   1) POST /{ig-user-id}/media  with image_url + caption → returns creation_id
//   2) POST /{ig-user-id}/media_publish with creation_id → returns media id
//
// Reels/videos require polling the container status until FINISHED.
const GRAPH_BASE = 'https://graph.facebook.com/v21.0'

export function createInstagramClient({ accessToken, igUserId }) {
  async function request(path, { method = 'GET', params = {}, body } = {}) {
    const qs = new URLSearchParams({ ...params, access_token: accessToken }).toString()
    const url = `${GRAPH_BASE}${path}?${qs}`
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || json.error) {
      const msg = json.error?.message || `Instagram API error: ${res.status}`
      throw new Error(msg)
    }
    return json
  }

  return {
    // Returns the IG business account id + username for the connected page
    async getProfile() {
      return request(`/${igUserId}`, {
        params: { fields: 'id,username,name,profile_picture_url,followers_count,media_count' },
      })
    },

    // Step 1: create an image media container
    async createImageContainer({ imageUrl, caption }) {
      return request(`/${igUserId}/media`, {
        method: 'POST',
        params: {
          image_url: imageUrl,
          ...(caption ? { caption } : {}),
        },
      })
    },

    // Step 1 (video/reel variant)
    async createVideoContainer({ videoUrl, caption, mediaType = 'REELS' }) {
      return request(`/${igUserId}/media`, {
        method: 'POST',
        params: {
          media_type: mediaType,
          video_url: videoUrl,
          ...(caption ? { caption } : {}),
        },
      })
    },

    // Poll container status — videos/reels must reach FINISHED before publish
    async getContainerStatus(containerId) {
      return request(`/${containerId}`, {
        params: { fields: 'status_code,status' },
      })
    },

    // Step 2: publish the prepared container
    async publishContainer(containerId) {
      return request(`/${igUserId}/media_publish`, {
        method: 'POST',
        params: { creation_id: containerId },
      })
    },

    // Convenience: create + publish in one call (image only, since
    // videos need polling). Returns { id: <published media id> }.
    async postImage({ imageUrl, caption }) {
      const container = await this.createImageContainer({ imageUrl, caption })
      return this.publishContainer(container.id)
    },

    // Recent posts (for analytics / feed display)
    async getMedia({ limit = 25 } = {}) {
      return request(`/${igUserId}/media`, {
        params: {
          fields: 'id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count',
          limit,
        },
      })
    },

    // Insights for a single post
    async getMediaInsights(mediaId) {
      return request(`/${mediaId}/insights`, {
        params: { metric: 'impressions,reach,engagement,saved' },
      }).catch(() => ({ data: [] })) // insights not available for all post types
    },

    async validate() {
      try {
        const p = await this.getProfile()
        return { valid: true, username: p.username, id: p.id }
      } catch (e) {
        return { valid: false, error: e.message }
      }
    },
  }
}

// Exchange a short-lived user token for a long-lived (60 day) token.
// Call this right after the OAuth code exchange.
export async function exchangeForLongLivedToken({ clientId, clientSecret, shortLivedToken }) {
  const qs = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: clientId,
    client_secret: clientSecret,
    fb_exchange_token: shortLivedToken,
  }).toString()
  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${qs}`)
  const json = await res.json()
  if (!res.ok || json.error) throw new Error(json.error?.message || 'Token exchange failed')
  return json // { access_token, token_type, expires_in }
}

// Look up the IG business account id for a given user access token.
// A user may have multiple Pages; we pick the first one with a linked IG account.
export async function findInstagramBusinessAccount(accessToken) {
  const pagesRes = await fetch(
    `${GRAPH_BASE}/me/accounts?fields=id,name,instagram_business_account&access_token=${encodeURIComponent(accessToken)}`,
  )
  const pages = await pagesRes.json()
  if (!pagesRes.ok || pages.error) {
    throw new Error(pages.error?.message || 'Failed to list pages')
  }
  const page = (pages.data || []).find(p => p.instagram_business_account?.id)
  if (!page) throw new Error('No Instagram Business account linked to any of your Pages')
  return {
    pageId: page.id,
    pageName: page.name,
    igUserId: page.instagram_business_account.id,
  }
}
