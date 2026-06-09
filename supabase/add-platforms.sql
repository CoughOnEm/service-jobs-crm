-- Allow Facebook + YouTube as job platforms (the jobs table limits which
-- platform values are valid). Run once: Supabase -> SQL Editor -> New query -> Run.
alter table public.jobs drop constraint if exists jobs_platform_check;
alter table public.jobs add constraint jobs_platform_check
  check (platform in ('instagram','x','tiktok','whatsapp','telegram','facebook','youtube'));
