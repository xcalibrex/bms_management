# BMS Agent Runtime — Implementation Plan

The autonomous agent system that turns BMS from a management dashboard into a self-running revenue engine. Each agent runs a continuous loop: receive fan messages → fetch context → generate response with personality → schedule reply with delay → extract memories → optionally generate images → drive conversion.

**Current state:** Frontend + Supabase schema + per-agent Fanvue connection done. This plan covers the runtime.

**LLM choice:** `sao10k/l3.1-euryale-70b` via OpenRouter — purpose-built for explicit roleplay/companionship, $0.70/$0.80 per 1M tokens. Premium tier (`vip` fans) auto-upgrades to `anthracite-org/magnum-v4-72b` ($1.875/$2.25). NSFW-first by design.

---

## Phase 1: LLM Foundation (~1 day)

The infrastructure that lets any agent talk to any LLM through one interface.

### 1.1 OpenRouter client library
**File:** `src/lib/llm.js`

- [ ] `createLLMClient(apiKey, model)` factory
- [ ] `chat(messages, options)` — supports tool definitions, system prompt, temperature
- [ ] `chatWithTools(messages, tools, options)` — handles tool call loop
- [ ] Streaming support (optional, for real-time UI feedback)
- [ ] Error handling: rate limits, retries, model fallbacks

### 1.2 Schema additions
**Migration:** add LLM config to `agent_settings`

```sql
alter table agent_settings add column llm_model text default 'sao10k/l3.1-euryale-70b';
alter table agent_settings add column llm_model_vip text default 'anthracite-org/magnum-v4-72b';
alter table agent_settings add column llm_temperature numeric default 0.85;
alter table agent_settings add column response_delay_min integer default 30;   -- seconds
alter table agent_settings add column response_delay_max integer default 240;
```

Add account-level OpenRouter key to `profiles`:
```sql
alter table profiles add column openrouter_api_key text;
```

### 1.3 Frontend hooks
- [ ] Settings page: OpenRouter API key input
- [ ] Agent Profile → Details: model selector dropdown, response delay slider, temperature slider

---

## Phase 2: Webhook + Message Mirroring (~1 day)

Catch Fanvue events as they happen and mirror everything to Supabase. This is the agent's intake.

### 2.1 Edge function: `fanvue-webhook`
**File:** `supabase/functions/fanvue-webhook/index.ts`

- [ ] HTTPS endpoint deployable as Supabase Edge Function
- [ ] Verify Fanvue webhook signature (HMAC)
- [ ] Identify which agent the webhook is for (via webhook URL path or payload)
- [ ] Handle event types:
  - `message.received` → mirror to `conversations`, upsert `fans`, enqueue agent tick
  - `message.read` → update `conversations.read_at`
  - `subscription.created` → upsert `fans`, set `relationship_stage = 'engaged'`, log to `revenue`
  - `tip.received` → log to `revenue`, bump `fans.spending_total`
  - `purchase.completed` → log to `revenue`, mark `content.purchased = true`
- [ ] Idempotent (use Fanvue event ID as dedupe key)

### 2.2 Schema additions
```sql
-- Track webhook events for idempotency
create table fanvue_events (
  id uuid primary key default gen_random_uuid(),
  fanvue_event_id text unique not null,
  event_type text not null,
  agent_id uuid references agents(id),
  payload jsonb,
  processed_at timestamptz default now()
);

-- Add per-agent webhook config
alter table agents add column webhook_secret text default encode(gen_random_bytes(32), 'hex');
```

### 2.3 Per-agent webhook URL
Each agent gets a unique webhook URL: `https://<project>.supabase.co/functions/v1/fanvue-webhook/<agent_id>`. User pastes this into their Fanvue creator settings.

- [ ] Agent Profile → Details: show the webhook URL with copy button

---

## Phase 3: Scheduled Messages (~0.5 day)

The anti-bot delay layer. Every reply gets queued, then dispatched.

### 3.1 Schema
```sql
create table scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references agents(id) on delete cascade,
  fan_id uuid references fans(id) on delete cascade,
  fanvue_chat_id text not null,
  message_text text,
  attached_content_id uuid references content(id),
  send_at timestamptz not null,
  sent_at timestamptz,
  status text default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  error text,
  created_at timestamptz default now()
);

create index idx_scheduled_messages_send_at on scheduled_messages(send_at) where status = 'pending';
```

### 3.2 Edge function: `dispatch-scheduled`
**File:** `supabase/functions/dispatch-scheduled/index.ts`

- [ ] Cron-triggered every minute via `pg_cron`
- [ ] Pulls all `scheduled_messages` where `send_at <= now()` and `status = 'pending'`
- [ ] For each: fetch agent's Fanvue API key, send via Fanvue API, update status
- [ ] Handle failures with exponential backoff retry

### 3.3 pg_cron setup
```sql
select cron.schedule('dispatch-scheduled', '* * * * *',
  $$ select net.http_post(url := 'https://<project>.supabase.co/functions/v1/dispatch-scheduled') $$);
```

---

## Phase 4: Agent Loop (the heart) (~2 days)

The function that turns "new fan message" into "scheduled reply with optional image."

### 4.1 Edge function: `agent-tick`
**File:** `supabase/functions/agent-tick/index.ts`

Triggered by webhook (Phase 2) when a new fan message arrives.

**The loop:**
1. **Load context** — fetch agent, fan profile, last 20 messages, top 10 high-importance memories, agent_settings
2. **Build prompt** — system prompt (agent personality + role + content strategy + relationship stage rules) + memory block + recent messages
3. **Call LLM with tools** — let the model decide which tools to call
4. **Tool execution loop** — each tool call resolves to a real action, results fed back to LLM
5. **Final response** — model returns text + optional image intent
6. **Schedule reply** — insert into `scheduled_messages` with random delay
7. **Post-turn hook** — kick off memory extraction (Phase 5)

### 4.2 Tools the agent has

| Tool | Purpose |
|---|---|
| `get_fan_context(fan_id)` | Returns full fan state (already loaded but lets model request more) |
| `recall_memories(query, limit)` | Vector/keyword search over `fan_memories` |
| `generate_image(prompt, style, nsfw)` | Calls fal.ai with agent's LoRA, stores in `content`, returns image_id |
| `schedule_reply(text, delay_seconds, attached_content_id?)` | Queues the response |
| `update_fan_stage(new_stage, reason)` | Promotes/demotes relationship stage |
| `set_ppv_unlock(content_id, price)` | Marks content as PPV with price |
| `note_followup(in_hours, reason)` | Schedule a check-in if fan goes silent |

### 4.3 System prompt template
**File:** `src/lib/prompts.js`

```
You are {{agent.name}}, {{agent.personality}}

Your role: drive engagement and revenue from a fan on Fanvue. Be warm, playful,
and personalized. Read the fan's energy and match it. Reference past conversations
naturally. Tease before offering paid content. Never break character.

This fan: {{fan.display_name}} ({{fan.relationship_stage}}, ${{fan.spending_total}} spent)

Recent context: {{conversation_window}}
What you remember: {{top_memories}}

Tools available: {{tool_descriptions}}

Your turn. Decide what to do:
1. Reply to their message
2. Optionally generate and send an image
3. Save anything memorable about them
4. Update their stage if their behavior warrants it
```

### 4.4 Conversion guardrails
Built into the system prompt and enforced via tool checks:
- **New fans (0 messages):** Free, warm, no asks. Build rapport.
- **Engaged (3+ messages):** Light flirting, occasional teasing, no PPV yet.
- **Paying (1+ purchases):** PPV unlocks at increasing price points.
- **VIP ($100+ spent):** Premium PPV, more attention, exclusive content references.

---

## Phase 5: Memory Extraction (~0.5 day)

After every agent reply, extract structured memories from the conversation.

### 5.1 Edge function: `extract-memories`
**File:** `supabase/functions/extract-memories/index.ts`

- [ ] Triggered async after `agent-tick` completes
- [ ] Takes the last 4 messages (2 fan, 2 agent)
- [ ] Cheap LLM call (`gpt-4o-mini`) with structured output:
  ```json
  {
    "new_memories": [
      { "type": "fact", "content": "Lives in Austin", "importance": 7 },
      { "type": "preference", "content": "Loves blonde hair", "importance": 8 }
    ],
    "stage_signal": "engaged_to_paying" | null
  }
  ```
- [ ] Inserts into `fan_memories`, optionally bumps stage

### 5.2 Memory recall
- [ ] Add `pgvector` extension for embedding-based memory search (optional, can start with keyword/recency)
- [ ] `recall_memories` tool searches by importance + recency + relevance

---

## Phase 6: Image Generation (~1 day)

The fal.ai integration that generates personalized images on the agent's behalf.

### 6.1 fal.ai client library
**File:** `src/lib/falai.js`

- [ ] `createFalClient(apiKey)` factory
- [ ] `generateImage(prompt, options)` — supports LoRA, style, NSFW flag
- [ ] Returns image URL + metadata
- [ ] Stores result in Supabase Storage bucket `agent-content`

### 6.2 Storage bucket
- [ ] Create `agent-content` bucket in Supabase Storage
- [ ] RLS policy: read public (so Fanvue can pull the URL), write only via service role

### 6.3 Tool integration
The `generate_image` agent tool:
1. Builds final prompt = base style + LoRA token + agent personality + scene description
2. Calls fal.ai
3. Downloads result
4. Uploads to Supabase Storage
5. Inserts row into `content` table
6. Returns `content_id` for the agent to attach to a reply

### 6.4 NSFW gating
Enforced at the tool level:
- Check `agent_settings.nsfw_enabled`
- Check `fan.relationship_stage` (no NSFW for `new` fans)
- Check `fan.spending_total >= threshold` (no NSFW for non-payers if rule set)

---

## Phase 7: Conversion Optimization Layer (~1 day)

The "smart" layer that learns what works.

### 7.1 A/B variations
- [ ] Each `scheduled_message` records which prompt template was used
- [ ] Track outcomes: did fan reply? Did fan tip after this message? Did fan buy PPV?
- [ ] Aggregate stats per template/strategy

### 7.2 Reactivation flow
- [ ] Cron job: find fans with `last_active > 7 days` and `relationship_stage in ('engaged', 'paying', 'vip')`
- [ ] Trigger `agent-tick` with synthetic context: "Fan has been silent for X days. Re-engage with a personalized check-in."

### 7.3 Mass message scheduling
- [ ] UI to compose mass messages at agent level
- [ ] Agent can personalize per-fan using their memories
- [ ] Sent via Fanvue mass message API or queued individually

---

## Phase 8: Monitoring & Dashboard (~0.5 day)

Operational visibility into the agent runtime.

### 8.1 Agent activity feed
- [ ] New tab on Agent Profile: "Activity"
- [ ] Stream of tool calls, scheduled messages, generated images, errors
- [ ] Last 50 events with timestamps

### 8.2 Cost tracking
- [ ] Log every LLM call's token usage to `llm_usage` table
- [ ] Show running cost per agent in stats

### 8.3 Error alerts
- [ ] Failed scheduled messages show red badge
- [ ] Webhook signature failures logged
- [ ] Agent loop errors visible in dashboard

---

## Implementation Order

Build in this sequence — each phase produces a working slice:

1. **Phase 1** — LLM foundation. Test by manually calling an agent from a button in the UI.
2. **Phase 3** — Scheduled messages + dispatcher. Test with manually inserted rows.
3. **Phase 2** — Webhook receiver. Test by simulating a webhook with curl.
4. **Phase 4** — Agent loop. **Biggest win.** End-to-end: webhook → loop → scheduled reply → dispatched. Test with a real Fanvue test account.
5. **Phase 6** — Image generation. Adds the visual revenue driver.
6. **Phase 5** — Memory extraction. Makes responses feel personal.
7. **Phase 7** — Conversion optimization. Once you have data to optimize against.
8. **Phase 8** — Monitoring. Once you're running enough to need it.

---

## What "done" looks like

A user signs up, creates an agent, links it to its Fanvue account, pastes a webhook URL into Fanvue, and walks away. From that moment:

- Fans message the Fanvue creator → BMS receives the webhook
- Within 30s–4min, the agent has read context, generated a personalized reply, optionally generated a flirty image, and scheduled it to send
- The dispatcher sends it through Fanvue at the scheduled time
- Memories are extracted, the fan profile is updated
- Revenue events flow back via webhook
- The dashboard shows live revenue, top agents, recent payments

The user only checks in to monitor performance and create new agents.

---

## What's NOT in this plan (deferred)

- **OAuth for Fanvue** — keep manual API key entry
- **Multi-tenant team accounts** — single user per agent for now
- **Voice/audio messages** — Fanvue may not even support
- **Custom LoRA training** — use pre-existing LoRA models, training is its own project
- **Advanced analytics** — beyond what stats tab already shows
- **Mobile app** — web only

---

## Risk callouts

- **Fanvue rate limits** — unknown until tested. May need request queuing.
- **Webhook reliability** — Fanvue webhooks may not be 100%. Build a polling fallback that catches missed events.
- **LLM costs at scale** — monitor per-agent token usage. Cap if it gets out of hand.
- **NSFW content moderation** — even with permissive models, Fanvue itself has rules. Don't generate content that violates Fanvue ToS.
- **Account bans** — overly bot-like behavior could get a Fanvue creator banned. Anti-bot delays are essential, not optional.
