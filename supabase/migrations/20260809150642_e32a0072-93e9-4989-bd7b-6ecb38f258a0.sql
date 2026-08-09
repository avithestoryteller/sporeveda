create extension if not exists "pgcrypto";

create type org_role as enum ('owner', 'admin', 'member', 'viewer');
create type bag_stage as enum ('prep','colonizing','bulking','fruiting','harvested','discarded');
create type contamination_severity as enum ('minor', 'moderate', 'severe');
create type contamination_action as enum ('monitoring', 'isolated', 'discarded');

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
grant select, insert, update, delete on public.organizations to authenticated;
grant all on public.organizations to service_role;

create table public.memberships (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        org_role not null default 'member',
  created_at  timestamptz not null default now(),
  unique (org_id, user_id)
);
create index idx_memberships_user on public.memberships(user_id);
create index idx_memberships_org on public.memberships(org_id);
grant select, insert, update, delete on public.memberships to authenticated;
grant all on public.memberships to service_role;

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;

create table public.species (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid references public.organizations(id) on delete cascade,
  common_name          text not null,
  scientific_name      text,
  rec_colonization_temp_min numeric(4,1),
  rec_colonization_temp_max numeric(4,1),
  rec_fruiting_temp_min     numeric(4,1),
  rec_fruiting_temp_max     numeric(4,1),
  rec_humidity_min_pct      numeric(4,1),
  rec_humidity_max_pct      numeric(4,1),
  created_at           timestamptz not null default now()
);
create index idx_species_org on public.species(org_id);
create unique index idx_species_global_name_unique on public.species(common_name) where org_id is null;
create unique index idx_species_org_name_unique on public.species(org_id, common_name) where org_id is not null;
grant select, insert, update, delete on public.species to authenticated;
grant all on public.species to service_role;

create table public.farms (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  location_notes  text,
  is_active       boolean not null default true,
  target_colonization_temp_min numeric(4,1),
  target_colonization_temp_max numeric(4,1),
  target_fruiting_temp_min     numeric(4,1),
  target_fruiting_temp_max     numeric(4,1),
  target_humidity_min_pct      numeric(4,1),
  target_humidity_max_pct      numeric(4,1),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, name)
);
create index idx_farms_org on public.farms(org_id);
grant select, insert, update, delete on public.farms to authenticated;
grant all on public.farms to service_role;

create table public.batches (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations(id) on delete cascade,
  farm_id               uuid not null references public.farms(id) on delete cascade,
  species_id            uuid not null references public.species(id),
  batch_code            text not null,
  substrate_type        text,
  inoculation_date      date not null,
  dry_substrate_weight_kg numeric(6,2),
  notes                 text,
  created_at            timestamptz not null default now(),
  unique (org_id, batch_code)
);
create index idx_batches_org on public.batches(org_id);
create index idx_batches_farm on public.batches(farm_id);
create index idx_batches_species on public.batches(species_id);
grant select, insert, update, delete on public.batches to authenticated;
grant all on public.batches to service_role;

create table public.bags (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  batch_id        uuid not null references public.batches(id) on delete cascade,
  farm_id         uuid not null references public.farms(id),
  species_id      uuid not null references public.species(id),
  bag_number      int not null,
  bag_code        text not null,
  net_weight_kg   numeric(5,2),
  current_stage   bag_stage not null default 'prep',
  is_discarded    boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, bag_code),
  unique (batch_id, bag_number)
);
create index idx_bags_org on public.bags(org_id);
create index idx_bags_batch on public.bags(batch_id);
create index idx_bags_farm on public.bags(farm_id);
create index idx_bags_species on public.bags(species_id);
create index idx_bags_stage on public.bags(current_stage);
grant select, insert, update, delete on public.bags to authenticated;
grant all on public.bags to service_role;

create table public.bag_stage_history (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  bag_id      uuid not null references public.bags(id) on delete cascade,
  stage       bag_stage not null,
  changed_at  timestamptz not null default now(),
  changed_by  uuid references auth.users(id),
  notes       text
);
create index idx_bag_stage_history_bag on public.bag_stage_history(bag_id, changed_at);
create index idx_bag_stage_history_org on public.bag_stage_history(org_id);
grant select on public.bag_stage_history to authenticated;
grant all on public.bag_stage_history to service_role;

create or replace function public.log_bag_stage_change()
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
  after insert on public.bags
  for each row execute function public.log_bag_stage_change();

create trigger trg_bag_stage_update
  after update on public.bags
  for each row execute function public.log_bag_stage_change();

create table public.contamination_events (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  bag_id          uuid not null references public.bags(id) on delete cascade,
  detected_at     timestamptz not null default now(),
  severity        contamination_severity not null,
  contaminant_type text,
  action_taken    contamination_action not null default 'monitoring',
  notes           text,
  created_at      timestamptz not null default now()
);
create index idx_contamination_bag on public.contamination_events(bag_id);
create index idx_contamination_org on public.contamination_events(org_id);
grant select, insert, update, delete on public.contamination_events to authenticated;
grant all on public.contamination_events to service_role;

create table public.harvests (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  bag_id          uuid not null references public.bags(id) on delete cascade,
  flush_number    int not null,
  harvest_date    date not null,
  wet_weight_g    numeric(7,1) not null,
  notes           text,
  created_at      timestamptz not null default now(),
  unique (bag_id, flush_number)
);
create index idx_harvests_bag on public.harvests(bag_id);
create index idx_harvests_org on public.harvests(org_id);
grant select, insert, update, delete on public.harvests to authenticated;
grant all on public.harvests to service_role;

create table public.environment_readings (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  farm_id         uuid not null references public.farms(id) on delete cascade,
  reading_date    date not null,
  avg_temp_c      numeric(4,1),
  avg_humidity_pct numeric(4,1),
  min_temp_c      numeric(4,1),
  max_temp_c      numeric(4,1),
  min_humidity_pct numeric(4,1),
  max_humidity_pct numeric(4,1),
  source          text not null default 'manual',
  recorded_by     uuid references auth.users(id),
  notes           text,
  created_at      timestamptz not null default now(),
  unique (farm_id, reading_date)
);
create index idx_environment_readings_org on public.environment_readings(org_id);
create index idx_environment_readings_farm_date on public.environment_readings(farm_id, reading_date);
grant select, insert, update, delete on public.environment_readings to authenticated;
grant all on public.environment_readings to service_role;

create or replace function public.user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from memberships where user_id = auth.uid();
$$;

create or replace function public.user_role_in_org(target_org uuid)
returns org_role
language sql
stable
security definer
set search_path = public
as $$
  select role from memberships
  where org_id = target_org and user_id = auth.uid();
$$;

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.profiles enable row level security;
alter table public.species enable row level security;
alter table public.farms enable row level security;
alter table public.batches enable row level security;
alter table public.bags enable row level security;
alter table public.bag_stage_history enable row level security;
alter table public.contamination_events enable row level security;
alter table public.harvests enable row level security;
alter table public.environment_readings enable row level security;

create policy "org: members can view" on public.organizations for select to authenticated
  using (id in (select public.user_org_ids()));
create policy "org: owners/admins can update" on public.organizations for update to authenticated
  using (public.user_role_in_org(id) in ('owner','admin'));

create policy "memberships: members can view within their org" on public.memberships for select to authenticated
  using (org_id in (select public.user_org_ids()));
create policy "memberships: owners/admins can manage" on public.memberships for all to authenticated
  using (public.user_role_in_org(org_id) in ('owner','admin'))
  with check (public.user_role_in_org(org_id) in ('owner','admin'));

create policy "profiles: user can view own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles: user can update own profile" on public.profiles for update to authenticated using (id = auth.uid());
create policy "profiles: user can insert own profile" on public.profiles for insert to authenticated with check (id = auth.uid());

create policy "species: view global or own-org" on public.species for select to authenticated
  using (org_id is null or org_id in (select public.user_org_ids()));
create policy "species: members can add org-specific species" on public.species for insert to authenticated
  with check (org_id in (select public.user_org_ids()));
create policy "species: members can update own org species" on public.species for update to authenticated
  using (org_id in (select public.user_org_ids()));

create policy "farms: members can view" on public.farms for select to authenticated using (org_id in (select public.user_org_ids()));
create policy "farms: non-viewers can insert" on public.farms for insert to authenticated with check (public.user_role_in_org(org_id) in ('owner','admin','member'));
create policy "farms: non-viewers can update" on public.farms for update to authenticated using (public.user_role_in_org(org_id) in ('owner','admin','member'));
create policy "farms: owners/admins can delete" on public.farms for delete to authenticated using (public.user_role_in_org(org_id) in ('owner','admin'));

create policy "batches: members can view" on public.batches for select to authenticated using (org_id in (select public.user_org_ids()));
create policy "batches: non-viewers can insert" on public.batches for insert to authenticated with check (public.user_role_in_org(org_id) in ('owner','admin','member'));
create policy "batches: non-viewers can update" on public.batches for update to authenticated using (public.user_role_in_org(org_id) in ('owner','admin','member'));
create policy "batches: owners/admins can delete" on public.batches for delete to authenticated using (public.user_role_in_org(org_id) in ('owner','admin'));

create policy "bags: members can view" on public.bags for select to authenticated using (org_id in (select public.user_org_ids()));
create policy "bags: non-viewers can insert" on public.bags for insert to authenticated with check (public.user_role_in_org(org_id) in ('owner','admin','member'));
create policy "bags: non-viewers can update" on public.bags for update to authenticated using (public.user_role_in_org(org_id) in ('owner','admin','member'));
create policy "bags: owners/admins can delete" on public.bags for delete to authenticated using (public.user_role_in_org(org_id) in ('owner','admin'));

create policy "bag_stage_history: members can view" on public.bag_stage_history for select to authenticated using (org_id in (select public.user_org_ids()));

create policy "contamination_events: members can view" on public.contamination_events for select to authenticated using (org_id in (select public.user_org_ids()));
create policy "contamination_events: non-viewers can insert" on public.contamination_events for insert to authenticated with check (public.user_role_in_org(org_id) in ('owner','admin','member'));
create policy "contamination_events: non-viewers can update" on public.contamination_events for update to authenticated using (public.user_role_in_org(org_id) in ('owner','admin','member'));

create policy "harvests: members can view" on public.harvests for select to authenticated using (org_id in (select public.user_org_ids()));
create policy "harvests: non-viewers can insert" on public.harvests for insert to authenticated with check (public.user_role_in_org(org_id) in ('owner','admin','member'));
create policy "harvests: non-viewers can update" on public.harvests for update to authenticated using (public.user_role_in_org(org_id) in ('owner','admin','member'));

create policy "environment_readings: members can view" on public.environment_readings for select to authenticated using (org_id in (select public.user_org_ids()));
create policy "environment_readings: non-viewers can insert" on public.environment_readings for insert to authenticated with check (public.user_role_in_org(org_id) in ('owner','admin','member'));
create policy "environment_readings: non-viewers can update" on public.environment_readings for update to authenticated using (public.user_role_in_org(org_id) in ('owner','admin','member'));

create or replace view public.v_contamination_rate_by_batch
with (security_invoker = true) as
select
  b.id as batch_id,
  b.org_id,
  b.batch_code,
  b.species_id,
  count(bg.id) as total_bags,
  count(ce.bag_id) filter (where ce.bag_id is not null) as contaminated_bags,
  round(100.0 * count(ce.bag_id) filter (where ce.bag_id is not null) / nullif(count(bg.id), 0), 1) as contamination_rate_pct
from public.batches b
join public.bags bg on bg.batch_id = b.id
left join (select distinct bag_id from public.contamination_events) ce on ce.bag_id = bg.id
group by b.id, b.org_id, b.batch_code, b.species_id;

create or replace view public.v_yield_by_batch
with (security_invoker = true) as
select
  b.id as batch_id,
  b.org_id,
  b.batch_code,
  b.species_id,
  b.dry_substrate_weight_kg,
  coalesce(sum(h.wet_weight_g), 0) / 1000.0 as total_wet_yield_kg,
  round(100.0 * (coalesce(sum(h.wet_weight_g), 0) / 1000.0) / nullif(b.dry_substrate_weight_kg, 0), 1) as biological_efficiency_pct
from public.batches b
join public.bags bg on bg.batch_id = b.id
left join public.harvests h on h.bag_id = bg.id
group by b.id, b.org_id, b.batch_code, b.species_id, b.dry_substrate_weight_kg;

create or replace view public.v_farm_species_performance
with (security_invoker = true) as
select
  f.id as farm_id,
  f.org_id,
  f.name as farm_name,
  b.species_id,
  s.common_name as species_name,
  count(distinct b.id) as batch_count,
  round(avg(cr.contamination_rate_pct), 1) as avg_contamination_rate_pct,
  round(avg(y.biological_efficiency_pct), 1) as avg_biological_efficiency_pct
from public.farms f
join public.batches b on b.farm_id = f.id
join public.species s on s.id = b.species_id
left join public.v_contamination_rate_by_batch cr on cr.batch_id = b.id
left join public.v_yield_by_batch y on y.batch_id = b.id
group by f.id, f.org_id, f.name, b.species_id, s.common_name;

grant select on public.v_contamination_rate_by_batch to authenticated;
grant select on public.v_yield_by_batch to authenticated;
grant select on public.v_farm_species_performance to authenticated;

insert into public.species (common_name, scientific_name, rec_colonization_temp_min, rec_colonization_temp_max, rec_fruiting_temp_min, rec_fruiting_temp_max, rec_humidity_min_pct, rec_humidity_max_pct)
values
  ('Oyster - Grey', 'Pleurotus ostreatus', 22, 24, 16, 20, 85, 95),
  ('Oyster - Pearl', 'Pleurotus ostreatus', 22, 24, 16, 20, 85, 95),
  ('Lion''s Mane', 'Hericium erinaceus', 21, 24, 15, 21, 85, 95),
  ('Shiitake', 'Lentinula edodes', 22, 26, 12, 18, 80, 90)
on conflict (common_name) where org_id is null do nothing;