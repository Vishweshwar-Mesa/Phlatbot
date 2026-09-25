-- FlatMatch schema. Run once in the Supabase SQL editor (or `supabase db push`).
-- All access goes through the server with the service role key; RLS is enabled
-- with no policies so the anon/public key can read or write nothing.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- participants
create table participants (
  id                uuid primary key default gen_random_uuid(),
  name              text not null unique,
  telegram_user_id  bigint unique,
  form_token        uuid not null unique default gen_random_uuid(),
  form_submitted_at timestamptz
);

insert into participants (name) values ('Riya'), ('Meera'), ('Kavita');

-- ---------------------------------------------------------------- preferences
-- Hard constraints are plain columns (binary / thresholds, never weighted).
-- max_rent is the person's own share; the engine compares monthly_rent / 3.
create table preferences (
  participant_id             uuid primary key references participants(id) on delete cascade,
  max_rent                   integer not null check (max_rent > 0),
  no_go_areas                text[]  not null default '{}',
  min_bathrooms              numeric not null check (min_bathrooms >= 0),
  requires_lift              boolean not null,
  requires_parking           boolean not null,
  requires_pet_friendly      boolean not null,
  requires_bachelor_friendly boolean not null,
  -- [{label, weight (1-5), is_custom}]
  soft_preferences           jsonb   not null default '[]'::jsonb,
  updated_at                 timestamptz not null default now()
);

-- ---------------------------------------------------------------- batch_runs
create type batch_trigger as enum ('cron', 'manual', 'onboarding_complete');

create table batch_runs (
  id             uuid primary key default gen_random_uuid(),
  run_date       date not null,                -- Asia/Kolkata calendar date
  triggered_by   batch_trigger not null,
  listing_count  integer not null default 0,
  -- Set only for runs that publish a vote page (cron / manual).
  published_at   timestamptz,
  -- Ordered listing ids: top-3 shortlist (voting) and remaining qualifiers (no voting).
  shortlist      uuid[] not null default '{}',
  also_qualified uuid[] not null default '{}',
  -- Human-readable reason for an empty page ("waiting on ...", "no new listings").
  empty_reason   text,
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);

-- ---------------------------------------------------------------- listings
create type listing_status as enum (
  'draft', 'awaiting_preferences', 'pending', 'assessed_unpublished', 'published'
);
create type extraction_status as enum ('ok', 'needs_clarification');
-- Where a draft is in the Telegram confirm conversation.
create type draft_stage as enum ('awaiting_answers', 'awaiting_confirm', 'awaiting_edit');

create table listings (
  id                        uuid primary key default gen_random_uuid(),
  raw_text                  text not null,
  submitted_by_telegram_id  bigint not null,
  submitted_at              timestamptz not null default now(),
  confirmed_at              timestamptz,
  -- Computed on the confirmed text; null while draft. Unique => duplicates rejected.
  dedupe_hash               text unique,
  -- Gemini extraction (schema in lib/types.ts) + latitude/longitude (nullable).
  structured                jsonb not null default '{}'::jsonb,
  -- Submitter answers to "this doesn't mention X" questions: {field: value|null}.
  -- null = submitter said they don't know -> stays "not confirmed".
  clarifications            jsonb not null default '{}'::jsonb,
  -- Hard-constraint fields currently being asked about.
  missing_fields            text[] not null default '{}',
  extraction_status         extraction_status not null,
  status                    listing_status not null default 'draft',
  draft_stage               draft_stage,
  published_batch_run_id    uuid references batch_runs(id)
);
create index listings_status_idx on listings(status);
create index listings_submitter_draft_idx on listings(submitted_by_telegram_id) where status = 'draft';

-- ---------------------------------------------------------------- assessments
-- One current assessment per listing (re-scoring overwrites it).
create table assessments (
  id               uuid primary key default gen_random_uuid(),
  listing_id       uuid not null unique references listings(id) on delete cascade,
  per_person       jsonb not null,
  overall_rank     text  not null,      -- 'all 3' | '2 of 3' | '1 of 3' | 'disqualified'
  qualify_count    integer not null,
  soft_score       numeric,             -- null when no qualifying person listed preferences
  unconfirmed_count integer not null,
  narrative        text,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------- votes
create type vote_reaction as enum ('interested', 'maybe', 'no');

create table votes (
  id             uuid primary key default gen_random_uuid(),
  listing_id     uuid not null references listings(id) on delete cascade,
  batch_run_id   uuid not null references batch_runs(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  reaction       vote_reaction not null,
  comment        text check (comment is null or char_length(comment) <= 500),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (listing_id, batch_run_id, participant_id)
);

-- ---------------------------------------------------------------- geocode cache
create table locality_geocode_cache (
  normalized_locality text primary key,
  latitude            double precision,   -- null = Nominatim found nothing (no pin)
  longitude           double precision,
  resolved_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------- support tables
-- Idempotent webhook processing: one row per Telegram update_id.
create table telegram_updates (
  update_id   bigint primary key,
  received_at timestamptz not null default now()
);

-- Simple named rate limits (e.g. /reassess once per hour, total).
create table rate_limits (
  key     text primary key,
  last_at timestamptz not null
);

-- A person's answer to "is locality X inside your no-go area Y?" for fuzzy matches.
create table no_go_confirmations (
  participant_id      uuid not null references participants(id) on delete cascade,
  normalized_locality text not null,
  no_go_area          text not null,
  is_no_go            boolean,            -- null = asked, not yet answered
  asked_at            timestamptz not null default now(),
  answered_at         timestamptz,
  primary key (participant_id, normalized_locality, no_go_area)
);

-- ---------------------------------------------------------------- functions
-- Returns true exactly once per update_id.
create function claim_telegram_update(p_update_id bigint) returns boolean
language plpgsql as $$
begin
  insert into telegram_updates (update_id) values (p_update_id);
  return true;
exception when unique_violation then
  return false;
end $$;

-- Atomically takes the slot if the last use was more than p_seconds ago.
-- Returns null on success, or the timestamp when the slot next frees up.
create function try_rate_limit(p_key text, p_seconds integer) returns timestamptz
language plpgsql as $$
declare
  v_last timestamptz;
begin
  insert into rate_limits (key, last_at) values (p_key, now())
  on conflict (key) do update set last_at = now()
    where rate_limits.last_at <= now() - make_interval(secs => p_seconds)
  returning null into v_last;
  if found then
    return null;
  end if;
  select last_at into v_last from rate_limits where key = p_key;
  return v_last + make_interval(secs => p_seconds);
end $$;

-- ---------------------------------------------------------------- RLS
alter table participants            enable row level security;
alter table preferences             enable row level security;
alter table batch_runs              enable row level security;
alter table listings                enable row level security;
alter table assessments             enable row level security;
alter table votes                   enable row level security;
alter table locality_geocode_cache  enable row level security;
alter table telegram_updates        enable row level security;
alter table rate_limits             enable row level security;
alter table no_go_confirmations     enable row level security;
