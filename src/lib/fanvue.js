// Fanvue API client. Pass an OAuth access_token (NOT an API key).
// Paths do not include /v1/ prefix. Auth is Bearer token.
const API_BASE = 'https://api.fanvue.com'
const API_VERSION = '2025-06-26'

export function createFanvueClient(accessToken) {
  async function request(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Fanvue-API-Version': API_VERSION,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message || `Fanvue API error: ${res.status}`)
    }
    return res.json()
  }

  return {
    async getProfile() {
      return request('/users/me')
    },

    async getSubscribers(params = {}) {
      const qs = new URLSearchParams(params).toString()
      return request(`/subscribers${qs ? `?${qs}` : ''}`)
    },

    async getFollowers(params = {}) {
      const qs = new URLSearchParams(params).toString()
      return request(`/followers${qs ? `?${qs}` : ''}`)
    },

    async getTopSpenders(params = {}) {
      const qs = new URLSearchParams(params).toString()
      return request(`/subscribers/top-spenders${qs ? `?${qs}` : ''}`)
    },

    async getChats(params = {}) {
      const qs = new URLSearchParams(params).toString()
      return request(`/chats${qs ? `?${qs}` : ''}`)
    },

    async getChatMessages(chatId, params = {}) {
      const qs = new URLSearchParams(params).toString()
      return request(`/chats/${chatId}/messages${qs ? `?${qs}` : ''}`)
    },

    async sendMessage(chatId, body) {
      return request(`/chats/${chatId}/messages`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
    },

    async sendMassMessage(body) {
      return request('/chats/mass-message', {
        method: 'POST',
        body: JSON.stringify(body),
      })
    },

    async getEarnings(params = {}) {
      const qs = new URLSearchParams(params).toString()
      return request(`/insights/earnings${qs ? `?${qs}` : ''}`)
    },

    async getPosts(params = {}) {
      const qs = new URLSearchParams(params).toString()
      return request(`/posts${qs ? `?${qs}` : ''}`)
    },

    async createPost(body) {
      return request('/posts', {
        method: 'POST',
        body: JSON.stringify(body),
      })
    },

    async uploadMedia(body) {
      return request('/media/upload', {
        method: 'POST',
        body: JSON.stringify(body),
      })
    },

    async validate() {
      try {
        await request('/users/me')
        return { valid: true }
      } catch (e) {
        return { valid: false, error: e.message }
      }
    },
  }
}
