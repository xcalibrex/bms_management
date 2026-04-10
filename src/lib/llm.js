const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'

// Approximate per-1M-token costs in USD (input, output) — used for cost estimation
export const MODEL_COSTS = {
  'sao10k/l3.1-euryale-70b': { input: 0.70, output: 0.80 },
  'anthracite-org/magnum-v4-72b': { input: 1.875, output: 2.25 },
  'nous/hermes-3-llama-3.1-405b': { input: 1.79, output: 2.49 },
  'thedrummer/unslopnemo-12b': { input: 0.40, output: 0.40 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.60 },
  'openai/gpt-4o': { input: 2.50, output: 10.00 },
  'anthropic/claude-3.5-sonnet': { input: 3.00, output: 15.00 },
  'anthropic/claude-3.5-haiku': { input: 1.00, output: 5.00 },
}

export const RECOMMENDED_MODELS = [
  { id: 'sao10k/l3.1-euryale-70b', label: 'Euryale 70B (Recommended)', tier: 'standard' },
  { id: 'anthracite-org/magnum-v4-72b', label: 'Magnum V4 72B (Premium)', tier: 'premium' },
  { id: 'nous/hermes-3-llama-3.1-405b', label: 'Hermes 3 405B (Top quality)', tier: 'premium' },
  { id: 'thedrummer/unslopnemo-12b', label: 'UnslopNemo 12B (Fast/cheap)', tier: 'standard' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o-mini (SFW only)', tier: 'sfw' },
]

export function estimateCost(model, promptTokens, completionTokens) {
  const cost = MODEL_COSTS[model]
  if (!cost) return 0
  return (promptTokens / 1_000_000) * cost.input + (completionTokens / 1_000_000) * cost.output
}

export function createLLMClient(apiKey) {
  if (!apiKey) throw new Error('OpenRouter API key required')

  async function chat({ model, messages, tools, temperature = 0.85, maxTokens = 1024 }) {
    const body = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }
    if (tools && tools.length) {
      body.tools = tools
      body.tool_choice = 'auto'
    }

    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://bms.app',
        'X-Title': 'BMS Agent Runtime',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error?.message || `OpenRouter error ${res.status}`)
    }

    const json = await res.json()
    const choice = json.choices?.[0]
    return {
      content: choice?.message?.content || '',
      toolCalls: choice?.message?.tool_calls || [],
      finishReason: choice?.finish_reason,
      usage: json.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      raw: json,
    }
  }

  async function chatWithTools({ model, messages, tools, toolHandlers, temperature = 0.85, maxTokens = 1024, maxIterations = 5 }) {
    let conversation = [...messages]
    let totalUsage = { prompt_tokens: 0, completion_tokens: 0 }
    let finalContent = ''

    for (let i = 0; i < maxIterations; i++) {
      const result = await chat({ model, messages: conversation, tools, temperature, maxTokens })
      totalUsage.prompt_tokens += result.usage.prompt_tokens || 0
      totalUsage.completion_tokens += result.usage.completion_tokens || 0

      if (result.toolCalls.length === 0) {
        finalContent = result.content
        break
      }

      conversation.push({
        role: 'assistant',
        content: result.content || null,
        tool_calls: result.toolCalls,
      })

      for (const toolCall of result.toolCalls) {
        const handler = toolHandlers[toolCall.function.name]
        let toolResult
        try {
          const args = JSON.parse(toolCall.function.arguments || '{}')
          toolResult = handler ? await handler(args) : { error: 'Unknown tool' }
        } catch (e) {
          toolResult = { error: e.message }
        }
        conversation.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
        })
      }
    }

    return { content: finalContent, usage: totalUsage, conversation }
  }

  return { chat, chatWithTools }
}
