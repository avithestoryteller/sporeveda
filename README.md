# Sporeveda FMS

-- =====================================================================

-- Mushroom Farm Management — Supabase Schema (Sporeveda / multi-tenant)

-- =====================================================================

-- Hierarchy: organizations -> farms -> batches -> bags -> (stage history,

--            contamination events, harvests)

-- Design notes:

--   - "species" is a shared reference table (org_id nullable) so the

--     platform ships with common species pre-seeded, and any org can

--     add their own without polluting the global list.

--   - Environmental targets live on species (recommended) and farms

--     (what that room is actually configured to hold). Batches/bags

--     inherit from farm+species rather than duplicating targets — a

--     farm/room can run several species/batches at once, which

--     matches how Sporeveda's Room 1 actually works today.

--   - Every tenant-scoped table carries org_id directly (not just

--     via joins) so RLS policies stay simple and indexes stay useful.

-- =====================================================================

create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- ---------------------------------------------------------------------

-- ENUM TYPES

-- ---------------------------------------------------------------------

create type org_role as enum ('owner', 'admin', 'member', 'viewer');

create type bag_stage as enum (

  'prep',

  'colonizing',

  'bulking',

  'fruiting',

  'harvested',

  'discarded'

);

create type contamination_severity as enum ('minor', 'moderate', 'severe');

create type contamination_action as enum ('monitoring', 'isolated', 'discarded');

-- ---------------------------------------------------------------------

-- ORGANIZATIONS (tenant root)

-- ---------------------------------------------------------------------

create table organizations (

  id          uuid primary key default gen_random_uuid(),

  name        text not null,

  slug        text not null unique,

  created_at  timestamptz not null default now(),

  updated_at  timestamptz not null default now()

);

-- Links a Supabase auth user to an org, with a role.

-- This table is the backbone of every RLS check in the schema.

create table memberships (

  id          uuid primary key default gen_random_uuid(),

  org_id      uuid not null references organizations(id) on delete cascade,

  user_id     uuid not null references auth.users(id) on delete cascade,

  role        org_role not null default 'member',

  created_at  timestamptz not null default now(),

  unique (org_id, user_id)

);

create index idx_memberships_user on memberships(user_id);

create index idx_memberships_org on memberships(org_id);

-- Optional: display info for members, separate from auth.users so you

-- can show names/avatars without touching the protected auth schema.

create table profiles (

  id           uuid primary key references auth.users(id) on delete cascade,

  display_name text,

  created_at   timestamptz not null default now()

);

-- ---------------------------------------------------------------------

-- SPECIES (shared reference data, org-extensible)

-- ---------------------------------------------------------------------

create table species (

  id                   uuid primary key default gen_random_uuid(),

  org_id               uuid references organizations(id) on delete cascade, -- null = global/platform-provided

  common_name          text not null,           -- e.g. "Oyster - Grey"

  scientific_name       text,                    -- e.g. "Pleurotus ostreatus"

  -- recommended targets, used as defaults when a farm doesn't override

  rec_colonization_temp_min numeric(4,1),

  rec_colonization_temp_max numeric(4,1),

  rec_fruiting_temp_min      numeric(4,1),

  rec_fruiting_temp_max      numeric(4,1),

  rec_humidity_min_pct       numeric(4,1),

  rec_humidity_max_pct       numeric(4,1),

  created_at           timestamptz not null default now()

);

create index idx_species_org on species(org_id);

-- NULL org_id defeats a plain composite UNIQUE constraint (NULL <> NULL

-- in Postgres uniqueness checks), so global and org-specific species

-- each get their own partial unique index instead.

create unique index idx_species_global_name_unique

  on species(common_name) where org_id is null;

create unique index idx_species_org_name_unique

  on species(org_id, common_name) where org_id is not null;

-- ---------------------------------------------------------------------

-- FARMS (a physical room/site within an org)

-- ---------------------------------------------------------------------

create table farms (

  id              uuid primary key default gen_random_uuid(),

  org_id          uuid not null references organizations(id) on delete cascade,

  name            text not null,             -- e.g. "Room 1", "Grow Room A"

  location_notes  text,

  is_active       boolean not null default true,

  -- actual achievable targets for this room (overrides species defaults

  -- when set; nullable because a brand-new farm may not have this dialed in yet)

  target_colonization_temp_min numeric(4,1),

  target_colonization_temp_max numeric(4,1),

  target_fruiting_temp_min      numeric(4,1),

  target_fruiting_temp_max      numeric(4,1),

  target_humidity_min_pct       numeric(4,1),

  target_humidity_max_pct       numeric(4,1),

  created_at      timestamptz not null default now(),

  updated_at      timestamptz not null default now(),

  unique (org_id, name)

);

create index idx_farms_org on farms(org_id);

-- ---------------------------------------------------------------------

-- BATCHES (one inoculation run of one species in one farm on one date)

-- ---------------------------------------------------------------------

create table batches (

  id                    uuid primary key default gen_random_uuid(),

  org_id                uuid not null references organizations(id) on delete cascade,

  farm_id               uuid not null references farms(id) on delete cascade,

  species_id            uuid not null references species(id),

  batch_code            text not null,   -- e.g. "BO1-140726" — human-facing, matches your paper system

  substrate_type        text,            -- e.g. "sawdust + bran", "straw"

  inoculation_date      date not null,

  dry_substrate_weight_kg numeric(6,2),

  notes                 text,

  created_at            timestamptz not null default now(),

  unique (org_id, batch_code)

);

create index idx_batches_org on batches(org_id);

create index idx_batches_farm on batches(farm_id);

create index idx_batches_species on batches(species_id);

-- ---------------------------------------------------------------------

-- BAGS (individually tracked unit — your BOX-ddmmyy-bagno system)

-- ---------------------------------------------------------------------

create table bags (

  id              uuid primary key default gen_random_uuid(),

  org_id          uuid not null references organizations(id) on delete cascade,

  batch_id        uuid not null references batches(id) on delete cascade,

  -- denormalized for fast filtering/RLS without joining through batches every time

  farm_id         uuid not null references farms(id),

  species_id      uuid not null references species(id),

  bag_number      int not null,             -- sequence within the batch, e.g. 01, 02...

  bag_code        text not null,            -- full human-facing ID, e.g. "BO1-140726-01"

  net_weight_kg   numeric(5,2),

  current_stage   bag_stage not null default 'prep',

  is_discarded    boolean not null default false,

  created_at      timestamptz not null default now(),

  updated_at      timestamptz not null default now(),

  unique (org_id, bag_code),

  unique (batch_id, bag_number)

);

create index idx_bags_org on bags(org_id);

create index idx_bags_batch on bags(batch_id);

create index idx_bags_farm on bags(farm_id);

create index idx_bags_species on bags(species_id);

create index idx_bags_stage on bags(current_stage);

-- ---------------------------------------------------------------------

-- BAG STAGE HISTORY (timestamped, append-only — the actual audit trail)

-- ---------------------------------------------------------------------

create table bag_stage_history (

  id          uuid primary key default gen_random_uuid(),

  org_id      uuid not null references organizations(id) on delete cascade,

  bag_id      uuid not null references bags(id) on delete cascade,

  stage       bag_stage not null,

  changed_at  timestamptz not null default now(),

  changed_by  uuid references auth.users(id),

  notes       text

);

create index idx_bag_stage_history_bag on bag_stage_history(bag_id, changed_at);

create index idx_bag_stage_history_org on bag_stage_history(org_id);

-- Auto-log every stage change so the app never has to remember to do it

-- in two places. Also seeds the first history row when a bag is created.

create or replace function log_bag_stage_change()

returns trigger

language plpgsql

security definer

set search_path = public

as $$

begin

  if (tg_op = 'INSERT') then

    insert into bag_stage_history (org_id, bag_id, stage, changed_by)

    values (new.org_id, new.id, new.current_stage, auth.uid());

  elsif (tg_op = 'UPDATE' and new.current_stage is distinct from old.current_stage) then

    insert into bag_stage_history (org_id, bag_id, stage, changed_by)

    values (new.org_id, new.id, new.current_stage, auth.uid());

  end if;

  return new;

end;

$$;

create trigger trg_bag_stage_insert

  after insert on bags

  for each row execute function log_bag_stage_change();

create trigger trg_bag_stage_update

  after update on bags

  for each row execute function log_bag_stage_change();

-- ---------------------------------------------------------------------

-- CONTAMINATION EVENTS (flag + notes, supports rate calc by batch/species)

-- ---------------------------------------------------------------------

create table contamination_events (

  id              uuid primary key default gen_random_uuid(),

  org_id          uuid not null references organizations(id) on delete cascade,

  bag_id          uuid not null references bags(id) on delete cascade,

  detected_at     timestamptz not null default now(),

  severity        contamination_severity not null,

  contaminant_type text,          -- e.g. "green mold (Trichoderma)", "bacterial wet spot"

  action_taken    contamination_action not null default 'monitoring',

  notes           text,

  created_at      timestamptz not null default now()

);

create index idx_contamination_bag on contamination_events(bag_id);

create index idx_contamination_org on contamination_events(org_id);

-- ---------------------------------------------------------------------

-- HARVESTS (per bag, per flush — feeds yield / biological efficiency)

-- ---------------------------------------------------------------------

create table harvests (

  id              uuid primary key default gen_random_uuid(),

  org_id          uuid not null references organizations(id) on delete cascade,

  bag_id          uuid not null references bags(id) on delete cascade,

  flush_number    int not null,             -- 1, 2, 3...

  harvest_date    date not null,

  wet_weight_g    numeric(7,1) not null,

  notes           text,

  created_at      timestamptz not null default now(),

  unique (bag_id, flush_number)

);

create index idx_harvests_bag on harvests(bag_id);

create index idx_harvests_org on harvests(org_id);

-- ---------------------------------------------------------------------

-- ENVIRONMENTAL READINGS (daily average temp/humidity per farm)

-- ---------------------------------------------------------------------

-- One row per farm per day. Manually logged today (visited once daily,

-- averaged by eye/Inkbird min-max reading); the shape is deliberately

-- generic (source + optional min/max) so it doesn't need to change if

-- an API-connected hygrometer shows up later and starts writing

-- hourly readings that get aggregated into the same daily row.

create table environment_readings (

  id              uuid primary key default gen_random_uuid(),

  org_id          uuid not null references organizations(id) on delete cascade,

  farm_id         uuid not null references farms(id) on delete cascade,

  reading_date    date not null,

  avg_temp_c      numeric(4,1),

  avg_humidity_pct numeric(4,1),

  min_temp_c      numeric(4,1),   -- optional, if your hygrometer shows a daily min/max

  max_temp_c      numeric(4,1),

  min_humidity_pct numeric(4,1),

  max_humidity_pct numeric(4,1),

  source          text not null default 'manual', -- 'manual' today; 'sensor_api' later

  recorded_by     uuid references auth.users(id),

  notes           text,

  created_at      timestamptz not null default now(),

  unique (farm_id, reading_date)

);

create index idx_environment_readings_org on environment_readings(org_id);

create index idx_environment_readings_farm_date on environment_readings(farm_id, reading_date);

-- =====================================================================

-- HELPER FUNCTIONS FOR RLS

-- =====================================================================

-- Returns the set of org_ids the current user belongs to.

-- SECURITY DEFINER + STABLE so it can be used cheaply inside policies

-- without each policy re-querying memberships with the caller's own

-- (possibly restricted) permissions.

create or replace function user_org_ids()

returns setof uuid

language sql

stable

security definer

set search_path = public

as $$

  select org_id from memberships where user_id = auth.uid();

$$;

-- Returns the current user's role in a given org, or null if not a member.

create or replace function user_role_in_org(target_org uuid)

returns org_role

language sql

stable

security definer

set search_path = public

as $$

  select role from memberships

  where org_id = target_org and user_id = auth.uid();

$$;

-- =====================================================================

-- ROW LEVEL SECURITY

-- =====================================================================

alter table organizations enable row level security;

alter table memberships enable row level security;

alter table profiles enable row level security;

alter table species enable row level security;

alter table farms enable row level security;

alter table batches enable row level security;

alter table bags enable row level security;

alter table bag_stage_history enable row level security;

alter table contamination_events enable row level security;

alter table harvests enable row level security;

alter table environment_readings enable row level security;

-- ---- organizations ----

-- Members can see their own orgs. Only owners/admins can update.

-- Creation happens via a separate signup flow (service role or a

-- security-definer RPC) rather than a direct insert policy, so a new

-- org's first membership row can be created atomically alongside it.

create policy "org: members can view"

  on organizations for select

  using (id in (select user_org_ids()));

create policy "org: owners/admins can update"

  on organizations for update

  using (user_role_in_org(id) in ('owner','admin'));

-- ---- memberships ----

create policy "memberships: members can view within their org"

  on memberships for select

  using (org_id in (select user_org_ids()));

create policy "memberships: owners/admins can manage"

  on memberships for all

  using (user_role_in_org(org_id) in ('owner','admin'))

  with check (user_role_in_org(org_id) in ('owner','admin'));

-- ---- profiles ----

create policy "profiles: user can view/update own profile"

  on profiles for select using (id = auth.uid());

create policy "profiles: user can update own profile"

  on profiles for update using (id = auth.uid());

create policy "profiles: user can insert own profile"

  on profiles for insert with check (id = auth.uid());

-- ---- species ----

-- Visible if it's global (org_id is null) or belongs to one of the

-- user's orgs. Only members of the owning org can write custom species;

-- global rows are managed by the platform (service role), not end users.

create policy "species: view global or own-org"

  on species for select

  using (org_id is null or org_id in (select user_org_ids()));

create policy "species: members can add org-specific species"

  on species for insert

  with check (org_id in (select user_org_ids()));

create policy "species: members can update own org species"

  on species for update

  using (org_id in (select user_org_ids()));

-- ---- farms / batches / bags / bag_stage_history / contamination_events / harvests ----

-- Same shape repeated per table: select/insert/update/delete gated on

-- org_id membership. Write access could be tightened to admin/member

-- (excluding 'viewer') later — shown here for farms as an example.

create policy "farms: members can view"

  on farms for select using (org_id in (select user_org_ids()));

create policy "farms: non-viewers can insert"

  on farms for insert with check (user_role_in_org(org_id) in ('owner','admin','member'));

create policy "farms: non-viewers can update"

  on farms for update using (user_role_in_org(org_id) in ('owner','admin','member'));

create policy "farms: owners/admins can delete"

  on farms for delete using (user_role_in_org(org_id) in ('owner','admin'));

create policy "batches: members can view" on batches for select using (org_id in (select user_org_ids()));

create policy "batches: non-viewers can insert" on batches for insert with check (user_role_in_org(org_id) in ('owner','admin','member'));

create policy "batches: non-viewers can update" on batches for update using (user_role_in_org(org_id) in ('owner','admin','member'));

create policy "batches: owners/admins can delete" on batches for delete using (user_role_in_org(org_id) in ('owner','admin'));

create policy "bags: members can view" on bags for select using (org_id in (select user_org_ids()));

create policy "bags: non-viewers can insert" on bags for insert with check (user_role_in_org(org_id) in ('owner','admin','member'));

create policy "bags: non-viewers can update" on bags for update using (user_role_in_org(org_id) in ('owner','admin','member'));

create policy "bags: owners/admins can delete" on bags for delete using (user_role_in_org(org_id) in ('owner','admin'));

create policy "bag_stage_history: members can view" on bag_stage_history for select using (org_id in (select user_org_ids()));

-- inserts happen via the trigger (security definer), so no direct insert policy needed for normal app use.

create policy "contamination_events: members can view" on contamination_events for select using (org_id in (select user_org_ids()));

create policy "contamination_events: non-viewers can insert" on contamination_events for insert with check (user_role_in_org(org_id) in ('owner','admin','member'));

create policy "contamination_events: non-viewers can update" on contamination_events for update using (user_role_in_org(org_id) in ('owner','admin','member'));

create policy "harvests: members can view" on harvests for select using (org_id in (select user_org_ids()));

create policy "harvests: non-viewers can insert" on harvests for insert with check (user_role_in_org(org_id) in ('owner','admin','member'));

create policy "harvests: non-viewers can update" on harvests for update using (user_role_in_org(org_id) in ('owner','admin','member'));

create policy "environment_readings: members can view" on environment_readings for select using (org_id in (select user_org_ids()));

create policy "environment_readings: non-viewers can insert" on environment_readings for insert with check (user_role_in_org(org_id) in ('owner','admin','member'));

create policy "environment_readings: non-viewers can update" on environment_readings for update using (user_role_in_org(org_id) in ('owner','admin','member'));

-- =====================================================================

-- EXAMPLE ANALYTICS VIEWS

-- =====================================================================

-- Contamination rate by batch. RLS on underlying tables still applies

-- when this view is queried (views inherit the querying user's access).

create or replace view v_contamination_rate_by_batch as

select

  b.id as batch_id,

  b.org_id,

  b.batch_code,

  b.species_id,

  count(bg.id) as total_bags,

  count(ce.bag_id) filter (where ce.bag_id is not null) as contaminated_bags,

  round(

    100.0 * count(ce.bag_id) filter (where ce.bag_id is not null) / nullif(count(bg.id), 0),

    1

  ) as contamination_rate_pct

from batches b

join bags bg on bg.batch_id = b.id

left join (select distinct bag_id from contamination_events) ce on ce.bag_id = bg.id

group by b.id, b.org_id, b.batch_code, b.species_id;

-- Yield / biological efficiency by batch.

-- Biological efficiency = total wet harvest weight / dry substrate weight * 100.

create or replace view v_yield_by_batch as

select

  b.id as batch_id,

  b.org_id,

  b.batch_code,

  b.species_id,

  b.dry_substrate_weight_kg,

  coalesce(sum(h.wet_weight_g), 0) / 1000.0 as total_wet_yield_kg,

  round(

    100.0 * (coalesce(sum(h.wet_weight_g), 0) / 1000.0) / nullif(b.dry_substrate_weight_kg, 0),

    1

  ) as biological_efficiency_pct

from batches b

join bags bg on bg.batch_id = b.id

left join harvests h on h.bag_id = bg.id

group by b.id, b.org_id, b.batch_code, b.species_id, b.dry_substrate_weight_kg;

-- Cross-farm comparison — deliberately grouped by species_id so the

-- app layer can never accidentally compare, e.g., Oyster vs Shiitake.

create or replace view v_farm_species_performance as

select

  f.id as farm_id,

  f.org_id,

  f.name as farm_name,

  b.species_id,

  s.common_name as species_name,

  count(distinct b.id) as batch_count,

  round(avg(cr.contamination_rate_pct), 1) as avg_contamination_rate_pct,

  round(avg(y.biological_efficiency_pct), 1) as avg_biological_efficiency_pct

from farms f

join batches b on b.farm_id = f.id

join species s on s.id = b.species_id

left join v_contamination_rate_by_batch cr on cr.batch_id = b.id

left join v_yield_by_batch y on y.batch_id = b.id

group by f.id, f.org_id, f.name, b.species_id, s.common_name;

-- =====================================================================

-- SEED DATA (global species reference — org_id null)

-- =====================================================================

insert into species (common_name, scientific_name, rec_colonization_temp_min, rec_colonization_temp_max, rec_fruiting_temp_min, rec_fruiting_temp_max, rec_humidity_min_pct, rec_humidity_max_pct)

values

  ('Oyster - Grey', 'Pleurotus ostreatus', 22, 24, 16, 20, 85, 95),

  ('Oyster - Pearl', 'Pleurotus ostreatus', 22, 24, 16, 20, 85, 95),

  ('Lion''s Mane', 'Hericium erinaceus', 21, 24, 15, 21, 85, 95),

  ('Shiitake', 'Lentinula edodes', 22, 26, 12, 18, 80, 90)

on conflict (common_name) where org_id is null do nothing;

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://sporeveda.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7cf048a4-c7fe-4080-bdd6-7a40254ccd7e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
