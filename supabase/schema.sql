-- Maddock & Co VAT Registration Checker schema

create extension if not exists "uuid-ossp";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'client' check (role in ('admin', 'accountant', 'client')),
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  sector text,
  vat_number text,
  is_vat_registered boolean not null default false,
  assigned_accountant uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.client_users (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references public.clients(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(client_id, user_id)
);

create table if not exists public.turnover_entries (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references public.clients(id) on delete cascade,
  period_start date not null,
  standard_rated numeric(14,2) not null default 0,
  reduced_rated numeric(14,2) not null default 0,
  zero_rated numeric(14,2) not null default 0,
  exempt numeric(14,2) not null default 0,
  out_of_scope numeric(14,2) not null default 0,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  unique(client_id, period_start)
);

create table if not exists public.vat_reviews (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references public.clients(id) on delete cascade,
  rolling_taxable_turnover numeric(14,2) not null,
  expected_next_30_days numeric(14,2) not null default 0,
  risk_status text not null,
  advice_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references public.clients(id) on delete cascade,
  alert_type text not null,
  message text not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.client_users enable row level security;
alter table public.turnover_entries enable row level security;
alter table public.vat_reviews enable row level security;
alter table public.alerts enable row level security;

-- Starter policies. Tighten before commercial deployment.

create policy "Users can read own profile"
on public.profiles for select
using (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles for update
using (auth.uid() = id);

create policy "Authenticated users can read clients"
on public.clients for select
to authenticated
using (true);

create policy "Authenticated users can insert clients"
on public.clients for insert
to authenticated
with check (true);

create policy "Authenticated users can read turnover"
on public.turnover_entries for select
to authenticated
using (true);

create policy "Authenticated users can write turnover"
on public.turnover_entries for insert
to authenticated
with check (true);

create policy "Authenticated users can update turnover"
on public.turnover_entries for update
to authenticated
using (true);

create policy "Authenticated users can read reviews"
on public.vat_reviews for select
to authenticated
using (true);

create policy "Authenticated users can write reviews"
on public.vat_reviews for insert
to authenticated
with check (true);

create policy "Authenticated users can read alerts"
on public.alerts for select
to authenticated
using (true);
