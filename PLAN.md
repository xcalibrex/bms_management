# BMS — AI Agent Management Platform

## Overview
Autonomous AI agents on Fanvue that build relationships with fans, generate revenue through chat, PPV content, and image generation via fal.ai. Supabase is the agent's brain — storing fan profiles, memories, content strategy, and revenue data.

**Supabase Project:** Models (`wzllrjbumbxvvozcwlzj`) — BMS org

---

## Phase 1: Supabase Schema

### Tables

- [ ] **agents** — agent profiles (name, model, personality, system_prompt, temperature, lora_model, image_style, fanvue_connected, falai_connected, status)
- [ ] **fans** — per-agent fan records (agent_id, fanvue_fan_id, display_name, relationship_stage [new/engaged/paying/vip], preferences jsonb, spending_total, last_active, active_times, engagement_score)
- [ ] **fan_memories** — structured memory per fan (fan_id, agent_id, memory_type [fact/preference/callback/boundary], content, importance, created_at)
- [ ] **conversations** — chat history (fan_id, agent_id, role [fan/agent], message, sentiment, created_at)
- [ ] **content** — generated content log (agent_id, fan_id, type [ppv/free/mass], prompt_used, image_url, lora_model, nsfw, price, purchased, created_at)
- [ ] **revenue** — revenue events (agent_id, fan_id, type [tip/ppv/subscription], amount, created_at)
- [ ] **agent_settings** — per-agent config (agent_id, escalation_rules jsonb, content_strategy jsonb, reactivation_threshold_days, ppv_price_default, nsfw_enabled)

### RLS Policies
- [ ] Enable RLS on all tables
- [ ] Auth-based access (service role for agent operations, anon blocked)

---

## Phase 2: Agent Autonomy Logic

### Fan Relationship Pipeline
- [ ] **Stage engine** — auto-promote fans through stages based on engagement + spending
  - `new` → 3+ messages exchanged → `engaged`
  - `engaged` → first purchase/tip → `paying`
  - `paying` → $100+ total spend → `vip`
- [ ] **Memory extraction** — after each conversation, LLM extracts key facts/preferences into fan_memories
- [ ] **Callback system** — agent references stored memories in future conversations ("happy birthday!", "how was that trip?")

### Content Strategy
- [ ] **Escalation rules per agent** — define what content is available at each relationship stage
- [ ] **PPV generation flow** — agent decides to send image → fal.ai generates with LoRA → stored in content table → sent as PPV via Fanvue
- [ ] **Tease-to-PPV pattern** — free suggestive preview → "unlock for $X" → PPV behind paywall
- [ ] **Mass message scheduling** — periodic content drops to all subscribers

### Revenue Maximization
- [ ] **Tip bait responses** — agent detects tip-worthy moments and teases accordingly
- [ ] **Reactivation** — detect dormant fans (no activity in X days), send personalized re-engagement
- [ ] **Spending-aware responses** — VIP fans get more attention, faster image gen, exclusive content
- [ ] **Revenue dashboard** — per-agent and per-fan revenue tracking

---

## Phase 3: Integration Layer

### Fanvue Integration
- [ ] **Webhook receiver** — incoming fan messages from Fanvue
- [ ] **Message sender** — send agent responses back to Fanvue
- [ ] **PPV sender** — send locked content with price via Fanvue API
- [ ] **Profile sync** — keep agent Fanvue profile in sync with Supabase config
- [ ] **Revenue webhook** — capture tip/purchase events from Fanvue

### fal.ai Integration
- [ ] **Image generation endpoint** — generate images with agent's LoRA model
- [ ] **NSFW gating** — only generate NSFW when agent has nsfw_enabled and fan stage permits
- [ ] **Style consistency** — LoRA model ensures character consistency across all generated images
- [ ] **Image storage** — store generated images (Supabase Storage or external CDN)

---

## Phase 4: Frontend Updates

- [ ] **Agent detail view** — show connected fans, revenue, content history, memory log
- [ ] **Fan management view** — per-agent fan list with relationship stages, spending, last active
- [ ] **Revenue dashboard** — charts/stats for revenue by agent, by fan, by content type, over time
- [ ] **Content gallery** — generated images per agent with PPV stats (purchased/pending)
- [ ] **Live agent feed** — real-time view of agent conversations and actions

---

## Phase 5: Agent Loop (Runtime)

The core loop for each agent:

```
1. Fan message arrives (Fanvue webhook)
2. Fetch fan profile + recent memories from Supabase
3. Build LLM prompt: agent personality + system prompt + fan context + conversation history
4. LLM generates response
5. If response includes image intent → fal.ai generates → send as PPV or free
6. Send response to fan via Fanvue
7. Extract new memories from conversation → store in Supabase
8. Update fan profile (engagement score, relationship stage, last_active)
9. Log revenue event if applicable
```

---

## Immediate Next Steps
1. Create Supabase schema (Phase 1)
2. Install @supabase/supabase-js in the frontend
3. Update frontend views to reflect new data model
4. Build Fanvue + fal.ai integration scaffolding
