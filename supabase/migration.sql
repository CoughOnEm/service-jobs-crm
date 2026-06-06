-- ============================================================
-- SERVICE JOBS CRM — Supabase Migration (Password-Room Model)
-- No auth required. Password hash = room key.
-- Run this once in: Supabase Dashboard → SQL Editor → New query → paste → Run
-- ============================================================

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  room text not null,
  client text not null,
  platform text not null check (platform in ('instagram', 'x', 'tiktok', 'whatsapp', 'telegram')),
  service text not null,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'failed')),
  price text,
  cost text,
  vendor text,
  notes text,
  images text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.vendors (
  room text not null,
  id uuid primary key default gen_random_uuid(),
  name text not null,
  services text[] default '{}',
  platforms text[] default '{}',
  contact text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auto-update timestamps
create or replace function public.handle_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger on_job_updated before update on public.jobs for each row execute function public.handle_updated_at();
create trigger on_vendor_updated before update on public.vendors for each row execute function public.handle_updated_at();

-- RLS: allow anon access (security comes from the room hash being secret)
alter table public.jobs enable row level security;
alter table public.vendors enable row level security;

create policy "anon_read_jobs" on public.jobs for select using (true);
create policy "anon_insert_jobs" on public.jobs for insert with check (true);
create policy "anon_update_jobs" on public.jobs for update using (true);
create policy "anon_delete_jobs" on public.jobs for delete using (true);

create policy "anon_read_vendors" on public.vendors for select using (true);
create policy "anon_insert_vendors" on public.vendors for insert with check (true);
create policy "anon_update_vendors" on public.vendors for update using (true);
create policy "anon_delete_vendors" on public.vendors for delete using (true);

-- Screenshot storage
insert into storage.buckets (id, name, public)
values ('screenshots', 'screenshots', true)
on conflict (id) do nothing;

create policy "anon_upload_screenshots" on storage.objects for insert with check (bucket_id = 'screenshots');
create policy "anon_read_screenshots" on storage.objects for select using (bucket_id = 'screenshots');
create policy "anon_delete_screenshots" on storage.objects for delete using (bucket_id = 'screenshots');

-- Realtime
alter publication supabase_realtime add table public.jobs;
alter publication supabase_realtime add table public.vendors;

-- Indexes
create index idx_jobs_room on public.jobs (room);
create index idx_jobs_status on public.jobs (status);
create index idx_jobs_platform on public.jobs (platform);
create index idx_jobs_service on public.jobs (service);
create index idx_jobs_created_at on public.jobs (created_at desc);
create index idx_vendors_room on public.vendors (room);
