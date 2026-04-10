const API_BASE = 'https://api.fanvue.com'
const API_VERSION = '2025-06-26'

export function createFanvueClient(apiKey) {
  async function request(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'X-Fanvue-API-Key': apiKey,
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
    // Profile
    async getProfile() {
      return request('/v1/users/me')
    },

    // Subscribers / Fans
    async getSubscribers(params = {}) {
      const qs = new URLSearchParams(params).toString()
      return request(`/v1/subscribers${qs ? `?${qs}` : ''}`)
    },

    async getFollowers(params = {}) {
      const qs = new URLSearchParams(params).toString()
      return request(`/v1/followers${qs ? `?${qs}` : ''}`)
    },

    async getTopSpenders(params = {}) {
      const qs = new URLSearchParams(params).toString()
      return request(`/v1/subscribers/top-spenders${qs ? `?${qs}` : ''}`)
    },

    // Messages
    async getChats(params = {}) {
      const qs = new URLSearchParams(params).toString()
      return request(`/v1/chats${qs ? `?${qs}` : ''}`)
    },

    async getChatMessages(chatId, params = {}) {
      const qs = new URLSearchParams(params).toString()
      return request(`/v1/chats/${chatId}/messages${qs ? `?${qs}` : ''}`)
    },

    async sendMessage(chatId, body) {
      return request(`/v1/chats/${chatId}/messages`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
    },

    async sendMassMessage(body) {
      return request('/v1/chats/mass-message', {
        method: 'POST',
        body: JSON.stringify(body),
      })
    },

    // Earnings
    async getEarnings(params = {}) {
      const qs = new URLSearchParams(params).toString()
      return request(`/v1/insights/earnings${qs ? `?${qs}` : ''}`)
    },

    // Content
    async getPosts(params = {}) {
      const qs = new URLSearchParams(params).toString()
      return request(`/v1/posts${qs ? `?${qs}` : ''}`)
    },

    async createPost(body) {
      return request('/v1/posts', {
        method: 'POST',
        body: JSON.stringify(body),
      })
    },

    // Media upload
    async uploadMedia(body) {
      return request('/v1/media/upload', {
        method: 'POST',
        body: JSON.stringify(body),
      })
    },

    // Validate key works
    async validate() {
      try {
        await request('/v1/users/me')
        return { valid: true }
      } catch (e) {
        return { valid: false, error: e.message }
      }
    },
  }
}
