-- Invite links, robustness fix: consume the invite SERVER-SIDE at account
-- creation, independent of browser / origin / redirect / Supabase URL config.
--
-- Why this exists
-- ───────────────
-- The original flow (20260531000000_invites.sql) consumes the token CLIENT-side:
-- /signup?invite=TOKEN stashes it in localStorage and the calendar mount calls
-- consume_invite() at "the first authenticated moment". That path silently fails
-- whenever the token doesn't survive the email-confirmation round trip — e.g. the
-- confirmation link opens in a different browser (Gmail in-app webview) than
-- signup, OR Supabase ignores emailRedirectTo (origin not in the redirect
-- allowlist) and lands the user on a different origin. In both cases localStorage
-- has no token, consume never runs, and no error is shown. (Observed: a fully
-- confirmed+signed-in user whose invite row stayed used_at = NULL.)
--
-- This trigger reads the token from signup metadata (signUp options.data ->
-- raw_user_meta_data) and performs the same BIDIRECTIONAL accepted pair that
-- consume_invite() does — but at INSERT on auth.users, so it never depends on any
-- client redirect. The client-side consume_invite() path is kept as a fallback
-- (idempotent: on conflict do update + used_at guard), so both layers cooperate.
--
-- Safety: the body is wrapped so ANY failure is swallowed and returns NEW. A
-- trigger exception here would roll back the whole signup transaction (the
-- auth.users insert), so invite handling must never be able to block account
-- creation. A bad/expired/mismatched token simply no-ops.
--
-- Trade-off: with email confirmation ON, this fires before the email is
-- confirmed. The invite link click already stands in for both sides' consent
-- (per 20260531000000), so creating the accepted pair at signup is consistent
-- with that model; the worst case (user never confirms) leaves an accepted share
-- to an account that can't log in — harmless, and the invite is marked used.

create or replace function public.consume_invite_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tok text := nullif(trim(new.raw_user_meta_data ->> 'invite_token'), '');
  inv public.invites%rowtype;
begin
  if tok is null then
    return new;
  end if;

  select * into inv from public.invites where token = tok;
  if not found then return new; end if;            -- unknown token
  if inv.used_at is not null then return new; end if;   -- already used
  if inv.revoked_at is not null then return new; end if; -- revoked
  if inv.expires_at < now() then return new; end if;    -- expired
  if inv.owner_id = new.id then return new; end if;     -- self (shouldn't happen at signup)

  -- Email-restricted invite must match the signing-up address.
  if inv.invitee_email is not null
     and lower(new.email) <> inv.invitee_email then
    return new;
  end if;

  -- Bidirectional accepted shares (same as consume_invite). Column is
  -- responded_at; requested_at uses its table default.
  insert into public.schedule_shares (owner_id, viewer_id, status, responded_at)
  values (inv.owner_id, new.id, 'accepted', now())
  on conflict (owner_id, viewer_id) do update
    set status = 'accepted', responded_at = now();

  insert into public.schedule_shares (owner_id, viewer_id, status, responded_at)
  values (new.id, inv.owner_id, 'accepted', now())
  on conflict (owner_id, viewer_id) do update
    set status = 'accepted', responded_at = now();

  update public.invites
     set used_at = now(), used_by = new.id
   where token = tok;

  return new;
exception
  when others then
    -- Never let invite handling abort signup. Client-side consume_invite() (the
    -- calendar-mount fallback) can still retry for a legitimately failed case.
    return new;
end;
$$;

-- Separate AFTER INSERT trigger (does not touch handle_new_user_profile). Both
-- shares FK to auth.users(id), which exists inside this trigger, so there is no
-- ordering dependency on the profile-creating trigger.
drop trigger if exists on_auth_user_consume_invite on auth.users;
create trigger on_auth_user_consume_invite
  after insert on auth.users
  for each row execute function public.consume_invite_on_signup();
