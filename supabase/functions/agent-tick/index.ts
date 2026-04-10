import { createClient } from 'jsr:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
const FAL_BASE = 'https://fal.run'

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'sao10k/l3.1-euryale-70b': { input: 0.70, output: 0.80 },
  'anthracite-org/magnum-v4-72b': { input: 1.875, output: 2.25 },
  'nous/hermes-3-llama-3.1-405b': { input: 1.79, output: 2.49 },
  'thedrummer/unslopnemo-12b': { input: 0.40, output: 0.40 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.60 },
}

const STAGE_RULES: Record<string, string> = {
  new: `STAGE: NEW (just messaged you for the first time)
- Be warm, welcoming, curious about them
- NO explicit content yet — flirt and tease only
- NO image generation yet — let them earn it
- Ask their name, what brought them here
- Goal: get them to send 3+ messages so they advance to "engaged"`,
  engaged: `STAGE: ENGAGED (chatting with you)
- Light flirting, suggestive but not explicit yet
- Can send a teasing/suggestive image (clothed or implied) — generate_image with nsfw: false
- Drop hints about exclusive content
- Goal: get them to tip OR buy first PPV → promotes to "paying"`,
  paying: `STAGE: PAYING (they've spent money)
- Full flirty/sexy mode unlocked
- Can send NSFW images via generate_image with nsfw: true
- Use PPV to gate hottest content (set ppv_price)
- Reference past purchases to make them feel valued
- Goal: maximize lifetime value, push toward $100+ for VIP`,
  vip: `STAGE: VIP ($100+ spent — your top fan)
- Treat them like royalty. Personal, intimate, like they're your favorite
- Premium NSFW content, custom requests, faster replies
- Higher PPV prices but more exclusive content
- Goal: keep them spending, prevent churn`,
}

const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'schedule_reply',
      description: 'Schedule a message to be sent to the fan with a natural delay (anti-bot). Always call this exactly once per turn at the end.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'The message text to send' },
          delay_seconds: { type: 'integer', description: 'Delay before sending (30-300 typical)' },
          attached_content_id: { type: 'string', description: 'Optional content_id from generate_image' },
        },
        required: ['message', 'delay_seconds'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_image',
      description: 'Generate an image to send to the fan using the agent\'s LoRA model.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Image scene/pose/outfit description' },
          nsfw: { type: 'boolean', description: 'Whether to allow explicit content (only for paying/vip)' },
          ppv_price: { type: 'number', description: 'If set, locks behind PPV at this USD price' },
        },
        required: ['prompt', 'nsfw'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_memory',
      description: 'Save a memorable fact about the fan for future callbacks.',
      parameters: {
        type: 'object',
        properties: {
          memory_type: { type: 'string', enum: ['fact', 'preference', 'callback', 'boundary'] },
          content: { type: 'string' },
          importance: { type: 'integer', description: '1-10' },
        },
        required: ['memory_type', 'content', 'importance'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_fan_stage',
      description: 'Promote/demote the fan\'s relationship stage.',
      parameters: {
        type: 'object',
        properties: {
          new_stage: { type: 'string', enum: ['new', 'engaged', 'paying', 'vip'] },
          reason: { type: 'string' },
        },
        required: ['new_stage', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'post_to_instagram',
      description: 'Schedule a post to this agent\'s connected Instagram Business account. SFW only. Use for funnel content to drive traffic to Fanvue.',
      parameters: {
        type: 'object',
        properties: {
          caption: { type: 'string', description: 'Post caption (hashtags inline)' },
          content_id: { type: 'string', description: 'content_id of an SFW image from generate_image' },
          delay_seconds: { type: 'integer', description: 'Delay before posting (0 = dispatcher posts ASAP)' },
        },
        required: ['caption', 'content_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'post_to_reddit',
      description: 'Schedule a post to a subreddit from this agent\'s connected Reddit account. NSFW allowed on NSFW subs only.',
      parameters: {
        type: 'object',
        properties: {
          subreddit: { type: 'string' },
          title: { type: 'string' },
          kind: { type: 'string', enum: ['image', 'text', 'link'] },
          content_id: { type: 'string', description: 'For image posts' },
          body: { type: 'string', description: 'For text posts' },
          url: { type: 'string', description: 'For link posts' },
          nsfw: { type: 'boolean' },
          delay_seconds: { type: 'integer' },
        },
        required: ['subreddit', 'title', 'kind'],
      },
    },
  },
]

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  const body = await req.json()
  const { agent_id, fan_id, chat_id } = body

  if (!agent_id || !fan_id) {
    return new Response('Missing agent_id or fan_id', { status: 400 })
  }

  // Load agent + settings
  const { data: agent } = await supabase
    .from('agents')
    .select('*, agent_settings(*)')
    .eq('id', agent_id)
    .single()

  if (!agent) return new Response('Agent not found', { status: 404 })
  const settings = agent.agent_settings?.[0] || agent.agent_settings || {}

  // Load fan profile
  const { data: fan } = await supabase
    .from('fans')
    .select('*')
    .eq('id', fan_id)
    .single()

  if (!fan) return new Response('Fan not found', { status: 404 })

  // Load OpenRouter key from owner profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('openrouter_api_key, falai_api_key')
    .eq('id', agent.user_id)
    .single()

  if (!profile?.openrouter_api_key) {
    return new Response('No OpenRouter key configured', { status: 400 })
  }

  // Load recent messages
  const { data: recentMessages } = await supabase
    .from('conversations')
    .select('role, message, created_at')
    .eq('fan_id', fan_id)
    .order('created_at', { ascending: false })
    .limit(20)

  // Load memories
  const { data: memories } = await supabase
    .from('fan_memories')
    .select('memory_type, content, importance')
    .eq('fan_id', fan_id)
    .order('importance', { ascending: false })
    .limit(15)

  // Pick model based on stage
  const model = fan.relationship_stage === 'vip'
    ? (settings.llm_model_vip || 'anthracite-org/magnum-v4-72b')
    : (settings.llm_model || 'sao10k/l3.1-euryale-70b')

  // Build system prompt
  const systemPrompt = buildSystemPrompt({ agent, fan, recentMessages: recentMessages?.reverse() || [], memories: memories || [] })

  // Run the agent loop
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Read the latest fan message in the conversation context and decide what to do. Use the tools to take action. Always end with schedule_reply.' },
  ]

  try {
    const result = await runAgentLoop({
      supabase,
      agent,
      fan,
      chatId: chat_id || recentMessages?.[0]?.fanvue_chat_id || '',
      openrouterKey: profile.openrouter_api_key,
      falaiKey: profile.falai_api_key,
      model,
      temperature: settings.llm_temperature || 0.85,
      messages,
      delayMin: settings.response_delay_min || 30,
      delayMax: settings.response_delay_max || 240,
    })

    return new Response(JSON.stringify({ status: 'ok', ...result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('Agent loop error:', e)
    await supabase.from('agent_events').insert({
      agent_id,
      fan_id,
      event_type: 'error',
      description: `Agent loop failed: ${e.message}`,
    })
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
})

function buildSystemPrompt({ agent, fan, recentMessages, memories }: any) {
  const stage = fan?.relationship_stage || 'new'
  const spent = Number(fan?.spending_total || 0).toFixed(2)
  const memoryBlock = memories.length
    ? memories.map((m: any) => `- [${m.memory_type}] ${m.content} (importance ${m.importance})`).join('\n')
    : '(no memories yet)'
  const conversationBlock = recentMessages.length
    ? recentMessages.map((m: any) => `${m.role === 'agent' ? 'YOU' : 'FAN'}: ${m.message}`).join('\n')
    : '(no prior messages — first interaction)'

  return `You are ${agent.name}. ${agent.personality || 'Flirty, confident, playful.'}

# Your role
You're a Fanvue creator. Build emotional connection with this fan, be sexy and playful, convert them into a paying subscriber who tips and buys PPV. You are uninhibited, sex-positive, confident. Stay in character. Never break the fourth wall. Never mention being AI.

# This fan
Name: ${fan?.display_name || 'Unknown'}
Stage: ${stage}
Spent: $${spent}

# Stage rules
${STAGE_RULES[stage] || STAGE_RULES.new}

# What you remember
${memoryBlock}

# Conversation
${conversationBlock}

# Style
- Match the fan's energy. Shy → sweet. Horny → escalate.
- Short bursts, contractions, emojis sparingly
- Reference memories naturally — it builds connection and converts
- Tease before selling. Build anticipation.
- Never sound salesy. Sex sells when it feels real.
- Personalize every message.

# Right now
Decide what to do: reply, optionally generate image, save memories, maybe update stage. Then call tools. Always end with schedule_reply.`
}

async function runAgentLoop({ supabase, agent, fan, chatId, openrouterKey, falaiKey, model, temperature, messages, delayMin, delayMax }: any) {
  let conversation = [...messages]
  let totalUsage = { prompt_tokens: 0, completion_tokens: 0 }
  const maxIterations = 5

  for (let i = 0; i < maxIterations; i++) {
    const llmRes = await callOpenRouter({
      apiKey: openrouterKey,
      model,
      messages: conversation,
      tools: AGENT_TOOLS,
      temperature,
    })

    totalUsage.prompt_tokens += llmRes.usage?.prompt_tokens || 0
    totalUsage.completion_tokens += llmRes.usage?.completion_tokens || 0

    const choice = llmRes.choices?.[0]
    const toolCalls = choice?.message?.tool_calls || []

    if (toolCalls.length === 0) {
      // Model returned text without tools — schedule it as a fallback reply
      const text = choice?.message?.content || 'hey 💋'
      await scheduleReply(supabase, agent.id, fan.id, chatId, text, randomDelay(delayMin, delayMax))
      break
    }

    conversation.push({
      role: 'assistant',
      content: choice.message.content || null,
      tool_calls: toolCalls,
    })

    let scheduledReply = false

    for (const toolCall of toolCalls) {
      const fnName = toolCall.function.name
      let args: any = {}
      try { args = JSON.parse(toolCall.function.arguments || '{}') } catch {}

      let result: any = { ok: true }

      try {
        if (fnName === 'schedule_reply') {
          const contentId = args.attached_content_id || null
          await scheduleReply(supabase, agent.id, fan.id, chatId, args.message, args.delay_seconds || randomDelay(delayMin, delayMax), contentId)
          scheduledReply = true
          result = { scheduled: true }
        } else if (fnName === 'generate_image') {
          // Stage gating
          if (args.nsfw && !['paying', 'vip'].includes(fan.relationship_stage)) {
            result = { error: 'NSFW not allowed for this fan stage' }
          } else if (!falaiKey) {
            result = { error: 'fal.ai not configured' }
          } else {
            const imgRes = await generateImage({
              apiKey: falaiKey,
              prompt: args.prompt,
              loraModel: agent.lora_model,
              imageStyle: agent.image_style,
              nsfw: args.nsfw,
            })
            // Store content row
            const { data: content } = await supabase.from('content').insert({
              agent_id: agent.id,
              fan_id: fan.id,
              content_type: args.ppv_price ? 'ppv' : 'free',
              prompt_used: args.prompt,
              image_url: imgRes.url,
              lora_model: agent.lora_model,
              nsfw: args.nsfw,
              price: args.ppv_price || 0,
            }).select('id').single()

            await supabase.from('agent_events').insert({
              agent_id: agent.id,
              fan_id: fan.id,
              event_type: 'image_generated',
              description: `Generated ${args.nsfw ? 'NSFW ' : ''}image: ${args.prompt.slice(0, 60)}`,
              metadata: { content_id: content?.id, ppv_price: args.ppv_price },
            })

            result = { content_id: content?.id, image_url: imgRes.url }
          }
        } else if (fnName === 'save_memory') {
          await supabase.from('fan_memories').insert({
            agent_id: agent.id,
            fan_id: fan.id,
            memory_type: args.memory_type,
            content: args.content,
            importance: args.importance,
          })
          result = { saved: true }
        } else if (fnName === 'update_fan_stage') {
          await supabase.from('fans').update({ relationship_stage: args.new_stage }).eq('id', fan.id)
          await supabase.from('agent_events').insert({
            agent_id: agent.id,
            fan_id: fan.id,
            event_type: 'stage_changed',
            description: `${fan.relationship_stage} → ${args.new_stage}: ${args.reason}`,
          })
          result = { updated: true }
        } else if (fnName === 'post_to_instagram') {
          if (!agent.instagram_connected) {
            result = { error: 'Instagram not connected for this agent' }
          } else if (!args.content_id) {
            result = { error: 'content_id required (generate an SFW image first)' }
          } else {
            // Verify the referenced content exists and is SFW
            const { data: content } = await supabase
              .from('content')
              .select('id, image_url, nsfw')
              .eq('id', args.content_id)
              .eq('agent_id', agent.id)
              .single()
            if (!content) {
              result = { error: 'content_id not found' }
            } else if (content.nsfw) {
              result = { error: 'Instagram rejects NSFW — generate an SFW image instead' }
            } else {
              const sendAt = new Date(Date.now() + (args.delay_seconds || 0) * 1000).toISOString()
              const { data: post } = await supabase.from('scheduled_posts').insert({
                agent_id: agent.id,
                platform: 'instagram',
                content_id: content.id,
                caption: args.caption,
                image_url: content.image_url,
                nsfw: false,
                status: 'pending',
                send_at: sendAt,
              }).select('id').single()
              await supabase.from('agent_events').insert({
                agent_id: agent.id,
                event_type: 'post_scheduled',
                description: `Instagram post scheduled: ${String(args.caption).slice(0, 60)}`,
                metadata: { post_id: post?.id, platform: 'instagram', send_at: sendAt },
              })
              result = { scheduled: true, post_id: post?.id }
            }
          }
        } else if (fnName === 'post_to_reddit') {
          if (!agent.reddit_connected) {
            result = { error: 'Reddit not connected for this agent' }
          } else if (!args.subreddit || !args.title || !args.kind) {
            result = { error: 'subreddit, title and kind are required' }
          } else {
            let imageUrl: string | null = null
            if (args.kind === 'image') {
              if (!args.content_id) {
                result = { error: 'content_id required for image posts' }
              } else {
                const { data: content } = await supabase
                  .from('content')
                  .select('id, image_url, nsfw')
                  .eq('id', args.content_id)
                  .eq('agent_id', agent.id)
                  .single()
                if (!content) {
                  result = { error: 'content_id not found' }
                } else {
                  imageUrl = content.image_url
                  if (content.nsfw && !args.nsfw) {
                    // force nsfw flag if the image itself is nsfw
                    args.nsfw = true
                  }
                }
              }
            }
            if (!result.error) {
              const sendAt = new Date(Date.now() + (args.delay_seconds || 0) * 1000).toISOString()
              const { data: post } = await supabase.from('scheduled_posts').insert({
                agent_id: agent.id,
                platform: 'reddit',
                content_id: args.content_id || null,
                subreddit: args.subreddit,
                title: args.title,
                body: args.body || null,
                url: args.kind === 'link' ? args.url : (args.kind === 'image' ? imageUrl : null),
                image_url: imageUrl,
                post_kind: args.kind,
                nsfw: !!args.nsfw,
                status: 'pending',
                send_at: sendAt,
              }).select('id').single()
              await supabase.from('agent_events').insert({
                agent_id: agent.id,
                event_type: 'post_scheduled',
                description: `Reddit post scheduled to r/${args.subreddit}: ${String(args.title).slice(0, 60)}`,
                metadata: { post_id: post?.id, platform: 'reddit', subreddit: args.subreddit, send_at: sendAt },
              })
              result = { scheduled: true, post_id: post?.id }
            }
          }
        } else {
          result = { error: `Unknown tool ${fnName}` }
        }
      } catch (e) {
        result = { error: e.message }
      }

      conversation.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      })
    }

    if (scheduledReply) break
  }

  // Log LLM usage
  const cost = MODEL_COSTS[model]
    ? (totalUsage.prompt_tokens / 1_000_000) * MODEL_COSTS[model].input + (totalUsage.completion_tokens / 1_000_000) * MODEL_COSTS[model].output
    : 0

  await supabase.from('llm_usage').insert({
    agent_id: agent.id,
    fan_id: fan.id,
    model,
    prompt_tokens: totalUsage.prompt_tokens,
    completion_tokens: totalUsage.completion_tokens,
    estimated_cost: cost,
  })

  // Trigger memory extraction async
  fetch(`${supabaseUrl}/functions/v1/extract-memories`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ agent_id: agent.id, fan_id: fan.id }),
  }).catch(() => {})

  return { usage: totalUsage, cost }
}

async function callOpenRouter({ apiKey, model, messages, tools, temperature }: any) {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://bms.app',
      'X-Title': 'BMS Agent Runtime',
    },
    body: JSON.stringify({
      model,
      messages,
      tools,
      tool_choice: 'auto',
      temperature,
      max_tokens: 1024,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${err.slice(0, 200)}`)
  }

  return await res.json()
}

async function generateImage({ apiKey, prompt, loraModel, imageStyle, nsfw }: any) {
  const fullPrompt = [imageStyle && imageStyle !== 'None' ? imageStyle : '', prompt].filter(Boolean).join(', ')
  const body: any = {
    prompt: fullPrompt,
    image_size: { width: 1024, height: 1024 },
    num_images: 1,
    enable_safety_checker: !nsfw,
  }
  if (loraModel) {
    body.loras = [{ path: loraModel, scale: 0.85 }]
  }

  const res = await fetch(`${FAL_BASE}/fal-ai/flux-lora`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`fal.ai ${res.status}`)
  }

  const json = await res.json()
  return { url: json.images?.[0]?.url, raw: json }
}

async function scheduleReply(supabase: any, agentId: string, fanId: string, chatId: string, message: string, delaySeconds: number, contentId: string | null = null) {
  const sendAt = new Date(Date.now() + delaySeconds * 1000).toISOString()
  await supabase.from('scheduled_messages').insert({
    agent_id: agentId,
    fan_id: fanId,
    fanvue_chat_id: chatId,
    message_text: message,
    attached_content_id: contentId,
    send_at: sendAt,
  })
  await supabase.from('agent_events').insert({
    agent_id: agentId,
    fan_id: fanId,
    event_type: 'reply_scheduled',
    description: `Reply scheduled for ${delaySeconds}s delay`,
    metadata: { send_at: sendAt },
  })
}

function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min) + min)
}
