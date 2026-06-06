-- ============================================================
-- SERVICE JOBS CRM — Privacy hardening (run AFTER migration.sql)
-- Locks the database so data is reachable ONLY by someone who knows
-- the password. The app sends the room (password hash) as an "x-room"
-- request header; these policies only return rows whose room matches it.
-- Run once: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- ============================================================

-- Helper: the room from the request header the app sends.
create or replace function public.req_room() returns text
  language sql stable
as $$
  select nullif(current_setting('request.headers', true)::json ->> 'x-room', '')
$$;

-- ---------- jobs: replace permissive policies with room-scoped ones ----------
drop policy if exists "anon_read_jobs"   on public.jobs;
drop policy if exists "anon_insert_jobs" on public.jobs;
drop policy if exists "anon_update_jobs" on public.jobs;
drop policy if exists "anon_delete_jobs" on public.jobs;

create policy "room_read_jobs"   on public.jobs for select using (room = public.req_room());
create policy "room_insert_jobs" on public.jobs for insert with check (room = public.req_room());
create policy "room_update_jobs" on public.jobs for update using (room = public.req_room()) with check (room = public.req_room());
create policy "room_delete_jobs" on public.jobs for delete using (room = public.req_room());

-- ---------- vendors: same ----------
drop policy if exists "anon_read_vendors"   on public.vendors;
drop policy if exists "anon_insert_vendors" on public.vendors;
drop policy if exists "anon_update_vendors" on public.vendors;
drop policy if exists "anon_delete_vendors" on public.vendors;

create policy "room_read_vendors"   on public.vendors for select using (room = public.req_room());
create policy "room_insert_vendors" on public.vendors for insert with check (room = public.req_room());
create policy "room_update_vendors" on public.vendors for update using (room = public.req_room()) with check (room = public.req_room());
create policy "room_delete_vendors" on public.vendors for delete using (room = public.req_room());

-- ---------- screenshots: make the bucket private + room-scoped ----------
update storage.buckets set public = false where id = 'screenshots';

drop policy if exists "anon_upload_screenshots" on storage.objects;
drop policy if exists "anon_read_screenshots"   on storage.objects;
drop policy if exists "anon_delete_screenshots" on storage.objects;

-- Files are stored under "<room>/...", so the first path segment must match the room.
create policy "room_upload_screenshots" on storage.objects for insert
  with check (bucket_id = 'screenshots' and (storage.foldername(name))[1] = public.req_room());
create policy "room_read_screenshots" on storage.objects for select
  using (bucket_id = 'screenshots' and (storage.foldername(name))[1] = public.req_room());
create policy "room_delete_screenshots" on storage.objects for delete
  using (bucket_id = 'screenshots' and (storage.foldername(name))[1] = public.req_room());
