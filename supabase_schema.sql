-- Smakflow / Lody u Lucjana — Schemat Supabase z Row Level Security (RLS)
-- Uruchom w Supabase SQL Editor

create extension if not exists "pgcrypto";

create table if not exists public.organizations (
  id text primary key,
  name text not null,
  slug text unique not null,
  access_code text not null,
  logo_url text,
  locations jsonb not null default '["Witryna Karpia","Magazyn Główny","Witryna Naramowicka"]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id text references public.organizations(id) on delete set null,
  email text not null,
  full_name text not null,
  role text not null default 'staff', -- 'admin' | 'manager' | 'staff'
  status text not null default 'pending', -- 'pending' | 'active' | 'blocked'
  pin_hash text,
  hourly_rate numeric(10,2) not null default 28.10,
  assigned_locations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.flavors (
  id text primary key,
  org_id text not null references public.organizations(id) on delete cascade,
  nazwa text not null,
  kategoria text not null default 'Mleczne',
  alergeny text not null default 'Brak',
  cena_porcji numeric(10,2) not null default 9.00,
  porcji_na_kuwete integer not null default 35 check (porcji_na_kuwete > 0),
  stany_lokali jsonb not null default '{}'::jsonb,
  ostatnia_sprzedaz_dni integer not null default 0,
  sprzedaz_30d integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.schedules (
  id text primary key,
  org_id text not null references public.organizations(id) on delete cascade,
  week_start date not null,
  location_name text not null,
  shifts jsonb not null default '[]'::jsonb,
  closed_days jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.finance_entries (
  id text primary key,
  org_id text not null references public.organizations(id) on delete cascade,
  entry_date date not null,
  entry_type text not null, -- 'pos_revenue' | 'ksef_invoice' | 'payroll'
  location_name text,
  amount numeric(12,2) not null,
  description text,
  raw_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.social_posts (
  id text primary key,
  org_id text not null references public.organizations(id) on delete cascade,
  channel text not null default 'instagram',
  title text,
  body text not null,
  image_url text,
  status text not null default 'draft', -- 'draft' | 'approved' | 'published'
  created_at timestamptz not null default now()
);

-- Pomocnicza funkcja zwracająca org_id zalogowanego użytkownika
create or replace function public.current_user_org_id()
returns text language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid();
$$;

-- Włączenie RLS na wszystkich tabelach
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.flavors enable row level security;
alter table public.schedules enable row level security;
alter table public.finance_entries enable row level security;
alter table public.social_posts enable row level security;

-- Polityki RLS: izoloacja między organizacjami
drop policy if exists "org_select" on public.organizations;
create policy "org_select" on public.organizations
  for select using (id = public.current_user_org_id());

drop policy if exists "org_insert" on public.organizations;
create policy "org_insert" on public.organizations
  for insert with check (auth.uid() is not null);

drop policy if exists "profiles_select_same_org" on public.profiles;
create policy "profiles_select_same_org" on public.profiles
  for select using (id = auth.uid() or org_id = public.current_user_org_id());

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert with check (id = auth.uid());

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin" on public.profiles
  for update using (
    id = auth.uid() or (
      org_id = public.current_user_org_id() and exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role in ('admin', 'manager') and p.status = 'active'
      )
    )
  );

drop policy if exists "flavors_all_same_org" on public.flavors;
create policy "flavors_all_same_org" on public.flavors
  for all using (org_id = public.current_user_org_id())
  with check (org_id = public.current_user_org_id());

drop policy if exists "schedules_all_same_org" on public.schedules;
create policy "schedules_all_same_org" on public.schedules
  for all using (org_id = public.current_user_org_id())
  with check (org_id = public.current_user_org_id());

drop policy if exists "finance_all_same_org" on public.finance_entries;
create policy "finance_all_same_org" on public.finance_entries
  for all using (org_id = public.current_user_org_id())
  with check (org_id = public.current_user_org_id());

drop policy if exists "social_all_same_org" on public.social_posts;
create policy "social_all_same_org" on public.social_posts
  for all using (org_id = public.current_user_org_id())
  with check (org_id = public.current_user_org_id());

-- Domyślna organizacja Lody u Lucjana
insert into public.organizations (id, name, slug, access_code, locations)
values (
  'lody-u-lucjana',
  'Lody u Lucjana',
  'lody-u-lucjana',
  'LUCJAN2026',
  '["Witryna Karpia","Magazyn Główny","Witryna Naramowicka"]'::jsonb
)
on conflict (id) do nothing;
