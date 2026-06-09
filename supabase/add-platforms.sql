-- Allow Facebook + YouTube as job platforms.
-- (The jobs table restricts which platform values are valid; this widens it.)
-- Run once: Supabase -> SQL Editor -> New query -> paste -> Run.

-- Drop whatever check constraint currently restricts jobs.platform (any name).
do $$
declare c text;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public' and rel.relname = 'jobs' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%platform%'
  loop
    execute format('alter table public.jobs drop constraint %I', c);
  end loop;
end $$;

-- Re-add it with Facebook + YouTube included.
alter table public.jobs add constraint jobs_platform_check
  check (platform in ('instagram','x','tiktok','whatsapp','telegram','facebook','youtube'));
