-- Add `provider` column to oauth_states.
--
-- The IG and Reddit OAuth start/callback functions filter on this column
-- (e.g. `.eq('provider', 'instagram')`), but it was never created. The
-- result was that state inserts silently dropped rows / lookups always
-- returned null, so every callback fell into `invalid_state` and bounced
-- to the FALLBACK_SITE_URL.
alter table public.oauth_states
  add column if not exists provider text;

-- Backfill any existing rows that were inserted without a provider.
update public.oauth_states set provider = 'fanvue' where provider is null;

-- Going forward the column is required.
alter table public.oauth_states
  alter column provider set not null;

create index if not exists oauth_states_provider_state_idx
  on public.oauth_states (provider, state);
