-- Social media agents: Instagram + Reddit integration
-- Adds per-agent OAuth credentials and a scheduled_posts table that the
-- dispatch-posts edge function drains into live posts.

-- ---------------------------------------------------------------------
-- 1. Agent-level social connection columns
-- ---------------------------------------------------------------------

alter table public.agents
  add column if not exists instagram_connected boolean not null default false,
  add column if not exists instagram_username text,
  add column if not exists instagram_user_id text,           -- IG Business account id
  add column if not exists instagram_page_id text,           -- linked FB page id
  add column if not exists instagram_access_token text,      -- long-lived (60 day) token
  add column if not exists instagram_token_expires_at timestamptz,
  add column if not exists reddit_connected boolean not null default false,
  add column if not exists reddit_username text,
  add column if not exists reddit_access_token text,
  add column if not exists reddit_refresh_token text,
  add column if not exists reddit_token_expires_at timestamptz,
  add column if not exists reddit_scopes text;

-- ---------------------------------------------------------------------
-- 2. scheduled_posts — posts queued for the dispatcher
-- ---------------------------------------------------------------------

create table if not exists public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  platform text not null check (platform in ('instagram', 'reddit')),

  -- Source content (for image posts)
  content_id uuid references public.content(id) on delete set null,
  image_url text,

  -- Instagram fields
  caption text,

  -- Reddit fields
  subreddit text,
  title text,
  body text,
  url text,
  post_kind text check (post_kind in ('image', 'text', 'link')),

  -- Common
  nsfw boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'posted', 'failed', 'cancelled')),
  send_at timestamptz not null default now(),
  posted_at timestamptz,
  platform_post_id text,         -- IG media id or Reddit t3_xxx
  platform_post_url text,        -- permalink once posted
  error text,
  attempts integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scheduled_posts_dispatch_idx
  on public.scheduled_posts (status, send_at)
  where status = 'pending';

create index if not exists scheduled_posts_agent_idx
  on public.scheduled_posts (agent_id, created_at desc);

-- ---------------------------------------------------------------------
-- 3. post_analytics — flat insights pulled from IG + Reddit
-- ---------------------------------------------------------------------

create table if not exists public.post_analytics (
  id uuid primary key default gen_random_uuid(),
  scheduled_post_id uuid not null references public.scheduled_posts(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  platform text not null,
  impressions integer,
  reach integer,
  likes integer,
  comments integer,
  shares integer,
  saves integer,
  upvotes integer,
  fetched_at timestamptz not null default now()
);

create index if not exists post_analytics_post_idx
  on public.post_analytics (scheduled_post_id, fetched_at desc);

-- ---------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------

alter table public.scheduled_posts enable row level security;
alter table public.post_analytics enable row level security;

-- Owner can view/manage their agents' scheduled posts
drop policy if exists scheduled_posts_owner_select on public.scheduled_posts;
create policy scheduled_posts_owner_select
  on public.scheduled_posts for select
  using (
    exists (select 1 from public.agents a where a.id = scheduled_posts.agent_id and a.user_id = auth.uid())
  );

drop policy if exists scheduled_posts_owner_write on public.scheduled_posts;
create policy scheduled_posts_owner_write
  on public.scheduled_posts for all
  using (
    exists (select 1 from public.agents a where a.id = scheduled_posts.agent_id and a.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.agents a where a.id = scheduled_posts.agent_id and a.user_id = auth.uid())
  );

drop policy if exists post_analytics_owner_select on public.post_analytics;
create policy post_analytics_owner_select
  on public.post_analytics for select
  using (
    exists (select 1 from public.agents a where a.id = post_analytics.agent_id and a.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- 5. updated_at trigger
-- ---------------------------------------------------------------------

create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists scheduled_posts_updated_at on public.scheduled_posts;
create trigger scheduled_posts_updated_at
  before update on public.scheduled_posts
  for each row execute function public.set_updated_at();
