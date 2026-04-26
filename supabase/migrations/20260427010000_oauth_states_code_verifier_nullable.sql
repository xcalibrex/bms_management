-- code_verifier is only used by PKCE flows (Fanvue). Instagram and Reddit
-- OAuth don't use PKCE, so requiring it NOT NULL silently broke every
-- non-Fanvue insert (the start functions didn't check the error).
alter table public.oauth_states
  alter column code_verifier drop not null;
