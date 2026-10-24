-- ReferLink database: tables, security and functions.
-- Run this whole file in the Supabase SQL Editor. It is safe to run again.

-- =====================================================================
-- 1. Tables
-- =====================================================================

create table if not exists public.boards (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique,
  dashboard_token_hash text not null unique,
  name                 text not null,
  company              text not null,
  linkedin_url         text not null,
  refers_for           text,
  note                 text,
  created_at           timestamptz not null default now()
);

create table if not exists public.requests (
  id                 uuid primary key default gen_random_uuid(),
  board_id           uuid not null references public.boards(id) on delete cascade,
  status_token_hash  text unique,
  -- Personal fields. All set to null when the candidate deletes the request.
  candidate_name     text,
  candidate_email    text,
  candidate_linkedin text,
  job_ref            text,
  job_ref_norm       text,
  resume_url         text,
  why_fit            text,
  -- Outcome
  status             text not null default 'pending'
                     check (status in ('pending', 'referred', 'declined')),
  decline_reason     text
                     check (decline_reason in ('role_mismatch', 'experience', 'resume_link', 'job_closed', 'other')),
  decline_note       text check (char_length(decline_note) <= 300),  -- optional words from the employee
  created_at         timestamptz not null default now(),
  decided_at         timestamptz,  -- first decision only, used for speed metrics
  updated_at         timestamptz,
  deleted_at         timestamptz,
  constraint reason_only_when_declined check ((status = 'declined') = (decline_reason is not null)),
  constraint note_only_when_declined check (decline_note is null or status = 'declined')
);

create index if not exists requests_board_created_idx
  on public.requests (board_id, created_at desc);

-- One open request per email, per job, per board. Declined requests don't count,
-- so a candidate can fix a broken link and ask again.
create unique index if not exists requests_one_open_per_job
  on public.requests (board_id, candidate_email, job_ref_norm)
  where status in ('pending', 'referred') and deleted_at is null;

-- =====================================================================
-- 2. Lock the tables. The browser can never read or write them directly.
-- =====================================================================

alter table public.boards   enable row level security;
alter table public.requests enable row level security;
revoke all on public.boards, public.requests from public, anon, authenticated;

-- =====================================================================
-- 3. Private helpers (in a schema the API does not expose)
-- =====================================================================

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- 64 random hex characters (two random UUIDs, dashes removed).
create or replace function private.new_token() returns text
language sql volatile set search_path = '' as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

-- We store a SHA-256 fingerprint of each token, never the token itself.
create or replace function private.hash_token(p_token text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

-- "Priya Sharma" -> "priya-sharma"
create or replace function private.slugify(p_text text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(nullif(trim(both '-' from left(
    trim(both '-' from regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g')), 20)), ''), 'x');
$$;

create or replace function private.is_http_url(p_url text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(char_length(p_url) <= 500 and p_url ~* '^https?://[a-z0-9-]+(\.[a-z0-9-]+)+(:[0-9]+)?([/?#]\S*)?$', false);
$$;

create or replace function private.is_linkedin_url(p_url text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(char_length(p_url) <= 500 and p_url ~* '^https?://([a-z0-9-]+\.)?linkedin\.com/(in|pub)/[^\s/?#]+', false);
$$;

-- A job link, or a job ID like "JR-104523" (3 to 100 characters with at least one digit).
create or replace function private.is_job_ref(p_ref text) returns boolean
language sql immutable set search_path = '' as $$
  select case
    when p_ref ~* '^https?://' then private.is_http_url(p_ref)
    else coalesce(char_length(p_ref) between 3 and 100 and p_ref ~ '[0-9]', false)
  end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;

-- =====================================================================
-- 4. Public API: the only 7 doors in. Each checks its own token.
--    Errors are short codes (e.g. 'invalid:email'); the website turns them
--    into friendly messages.
-- =====================================================================

-- Door 1: anyone can create a board. Returns the dashboard token once.
create or replace function public.create_board(
  p_name text,
  p_company text,
  p_linkedin_url text,
  p_refers_for text default null,
  p_note text default null,
  p_website text default null  -- honeypot: hidden from people, filled by bots
) returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_name       text := btrim(coalesce(p_name, ''));
  v_company    text := btrim(coalesce(p_company, ''));
  v_linkedin   text := btrim(coalesce(p_linkedin_url, ''));
  v_refers_for text := nullif(btrim(coalesce(p_refers_for, '')), '');
  v_note       text := nullif(btrim(coalesce(p_note, '')), '');
  v_token      text := private.new_token();
  v_slug       text;
  v_id         uuid;
begin
  if coalesce(p_website, '') <> '' then raise exception 'spam'; end if;
  if char_length(v_name) not between 2 and 80 then raise exception 'invalid:name'; end if;
  if char_length(v_company) not between 2 and 80 then raise exception 'invalid:company'; end if;
  if not private.is_linkedin_url(v_linkedin) then raise exception 'invalid:linkedin_url'; end if;
  if char_length(coalesce(v_refers_for, '')) > 200 then raise exception 'invalid:refers_for'; end if;
  if char_length(coalesce(v_note, '')) > 200 then raise exception 'invalid:note'; end if;

  if (select count(*) from public.boards where created_at > now() - interval '1 hour') >= 50 then
    raise exception 'rate_limited';
  end if;

  loop
    v_slug := private.slugify(v_name) || '-' || private.slugify(v_company) || '-' || left(private.new_token(), 4);
    exit when not exists (select 1 from public.boards where slug = v_slug);
  end loop;

  insert into public.boards (slug, dashboard_token_hash, name, company, linkedin_url, refers_for, note)
  values (v_slug, private.hash_token(v_token), v_name, v_company, v_linkedin, v_refers_for, v_note)
  returning id into v_id;

  return json_build_object('board_id', v_id, 'slug', v_slug, 'dashboard_token', v_token);
end;
$$;

-- Door 2: the public slug can read the board's public info.
create or replace function public.get_public_board(p_slug text) returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  v json;
begin
  select json_build_object(
           'board_id', b.id, 'name', b.name, 'company', b.company,
           'linkedin_url', b.linkedin_url, 'refers_for', b.refers_for, 'note', b.note)
    into v
    from public.boards b
   where b.slug = lower(btrim(coalesce(p_slug, '')));
  if v is null then raise exception 'not_found'; end if;
  return v;
end;
$$;

-- Door 3: the public slug can create one request. Returns the status token once.
create or replace function public.submit_request(
  p_slug text,
  p_name text,
  p_email text,
  p_linkedin_url text,
  p_job_ref text,
  p_resume_url text,
  p_why_fit text,
  p_consent boolean,
  p_website text default null  -- honeypot
) returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_board_id uuid;
  v_name     text := btrim(coalesce(p_name, ''));
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_linkedin text := btrim(coalesce(p_linkedin_url, ''));
  v_job_ref  text := btrim(coalesce(p_job_ref, ''));
  v_job_norm text;
  v_resume   text := btrim(coalesce(p_resume_url, ''));
  v_why      text := btrim(coalesce(p_why_fit, ''));
  v_token    text := private.new_token();
begin
  if coalesce(p_website, '') <> '' then raise exception 'spam'; end if;

  select id into v_board_id from public.boards where slug = lower(btrim(coalesce(p_slug, '')));
  if v_board_id is null then raise exception 'not_found'; end if;

  if char_length(v_name) not between 2 and 80 then raise exception 'invalid:name'; end if;
  if char_length(v_email) > 254 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'invalid:email'; end if;
  if not private.is_linkedin_url(v_linkedin) then raise exception 'invalid:linkedin_url'; end if;
  if not private.is_job_ref(v_job_ref) then raise exception 'invalid:job_ref'; end if;
  if not private.is_http_url(v_resume) then raise exception 'invalid:resume_url'; end if;
  if char_length(v_why) not between 20 and 300 then raise exception 'invalid:why_fit'; end if;
  if p_consent is not true then raise exception 'invalid:consent'; end if;

  v_job_norm := rtrim(lower(v_job_ref), '/');

  if (select count(*) from public.requests
       where board_id = v_board_id and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'rate_limited';
  end if;

  begin
    insert into public.requests
      (board_id, status_token_hash, candidate_name, candidate_email, candidate_linkedin,
       job_ref, job_ref_norm, resume_url, why_fit)
    values
      (v_board_id, private.hash_token(v_token), v_name, v_email, v_linkedin,
       v_job_ref, v_job_norm, v_resume, v_why);
  exception when unique_violation then
    raise exception 'duplicate';
  end;

  return json_build_object('status_token', v_token);
end;
$$;

-- Door 4: the dashboard secret can read that board's requests (newest first).
create or replace function public.get_dashboard(p_token text) returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  b public.boards;
begin
  select * into b from public.boards where dashboard_token_hash = private.hash_token(p_token);
  if b.id is null then raise exception 'not_found'; end if;

  return json_build_object(
    'board', json_build_object(
      'board_id', b.id, 'slug', b.slug, 'name', b.name, 'company', b.company,
      'refers_for', b.refers_for, 'note', b.note, 'created_at', b.created_at),
    'requests', coalesce((
      select json_agg(json_build_object(
               'id', r.id, 'candidate_name', r.candidate_name, 'candidate_email', r.candidate_email,
               'candidate_linkedin', r.candidate_linkedin, 'job_ref', r.job_ref,
               'resume_url', r.resume_url, 'why_fit', r.why_fit, 'status', r.status,
               'decline_reason', r.decline_reason, 'decline_note', r.decline_note,
               'created_at', r.created_at, 'decided_at', r.decided_at)
             order by r.created_at desc)
        from public.requests r
       where r.board_id = b.id and r.deleted_at is null), '[]'::json));
end;
$$;

-- Door 5: the dashboard secret can decide on one of that board's requests.
-- A decision can be changed later; decided_at keeps the first decision time.
-- A decline can carry an optional note (up to 300 characters) that the candidate sees.
drop function if exists public.decide_request(text, uuid, text, text);
create or replace function public.decide_request(
  p_token text,
  p_request_id uuid,
  p_decision text,
  p_reason text default null,
  p_note text default null
) returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_board_id uuid;
  v_req      public.requests;
  v_first    boolean;
  v_note     text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select id into v_board_id from public.boards where dashboard_token_hash = private.hash_token(p_token);
  if v_board_id is null then raise exception 'not_found'; end if;

  select * into v_req from public.requests
   where id = p_request_id and board_id = v_board_id and deleted_at is null
   for update;
  if v_req.id is null then raise exception 'not_found'; end if;

  if p_decision not in ('referred', 'declined') or p_decision is null then raise exception 'invalid:decision'; end if;
  if p_decision = 'declined' and (p_reason is null or p_reason not in
      ('role_mismatch', 'experience', 'resume_link', 'job_closed', 'other')) then
    raise exception 'invalid:reason';
  end if;
  if char_length(v_note) > 300 then raise exception 'invalid:note'; end if;

  v_first := v_req.decided_at is null;

  begin
    update public.requests
       set status         = p_decision,
           decline_reason = case when p_decision = 'declined' then p_reason end,
           decline_note   = case when p_decision = 'declined' then v_note end,
           decided_at     = coalesce(decided_at, now()),
           updated_at     = now()
     where id = v_req.id
    returning * into v_req;
  exception when unique_violation then
    raise exception 'duplicate';
  end;

  return json_build_object(
    'id', v_req.id, 'status', v_req.status, 'decline_reason', v_req.decline_reason,
    'decline_note', v_req.decline_note, 'decided_at', v_req.decided_at, 'is_first_decision', v_first,
    'hours_to_decision', round((extract(epoch from (v_req.decided_at - v_req.created_at)) / 3600)::numeric, 1));
end;
$$;

-- Door 6: the status token can read one request's status.
create or replace function public.get_request_status(p_token text) returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  v json;
begin
  select json_build_object(
           'status', r.status, 'decline_reason', r.decline_reason, 'decline_note', r.decline_note,
           'created_at', r.created_at, 'decided_at', r.decided_at,
           'job_ref', r.job_ref, 'candidate_name', r.candidate_name,
           'employee_name', b.name, 'company', b.company, 'board_slug', b.slug)
    into v
    from public.requests r
    join public.boards b on b.id = r.board_id
   where r.status_token_hash = private.hash_token(p_token) and r.deleted_at is null;
  if v is null then raise exception 'not_found'; end if;
  return v;
end;
$$;

-- Door 7: the status token can wipe that request's personal data.
-- An anonymous row stays (board, status, timestamps) so metrics remain honest.
create or replace function public.delete_request(p_token text) returns json
language plpgsql security definer set search_path = '' as $$
begin
  update public.requests
     set candidate_name = null, candidate_email = null, candidate_linkedin = null,
         job_ref = null, job_ref_norm = null, resume_url = null, why_fit = null, decline_note = null,
         status_token_hash = null, deleted_at = now(), updated_at = now()
   where status_token_hash = private.hash_token(p_token) and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
  return json_build_object('deleted', true);
end;
$$;

-- Only these 7 functions can be called from the browser.
revoke all on function
  public.create_board(text, text, text, text, text, text),
  public.get_public_board(text),
  public.submit_request(text, text, text, text, text, text, text, boolean, text),
  public.get_dashboard(text),
  public.decide_request(text, uuid, text, text, text),
  public.get_request_status(text),
  public.delete_request(text)
from public;

grant execute on function
  public.create_board(text, text, text, text, text, text),
  public.get_public_board(text),
  public.submit_request(text, text, text, text, text, text, text, boolean, text),
  public.get_dashboard(text),
  public.decide_request(text, uuid, text, text, text),
  public.get_request_status(text),
  public.delete_request(text)
to anon, authenticated;
