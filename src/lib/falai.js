const FAL_BASE = 'https://fal.run'

// Default model — change per agent if needed
const DEFAULT_MODEL = 'fal-ai/flux-lora'

export function createFalClient(apiKey) {
  if (!apiKey) throw new Error('fal.ai API key required')

  async function generateImage({
    prompt,
    loraUrl,
    loraScale = 0.85,
    style = '',
    nsfw = false,
    width = 1024,
    height = 1024,
    numImages = 1,
    model = DEFAULT_MODEL,
  }) {
    const fullPrompt = [style, prompt].filter(Boolean).join(', ')

    const body = {
      prompt: fullPrompt,
      image_size: { width, height },
      num_images: numImages,
      enable_safety_checker: !nsfw,
    }

    if (loraUrl) {
      body.loras = [{ path: loraUrl, scale: loraScale }]
    }

    const res = await fetch(`${FAL_BASE}/${model}`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || err.message || `fal.ai error ${res.status}`)
    }

    const json = await res.json()
    const images = json.images || []
    return {
      url: images[0]?.url,
      images: images.map(img => img.url),
      seed: json.seed,
      raw: json,
    }
  }

  async function downloadImage(url) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed to download image: ${res.status}`)
    return await res.blob()
  }

  return { generateImage, downloadImage }
}
