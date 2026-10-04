-- RevTimeline database setup for Supabase.
-- Run once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Safe to run again: it only creates what is missing.
--
-- Each signed-in person has one workspace: the same JSON document the app keeps in the
-- browser (projects, tasks, events and connections). Row-level security limits every
-- request to the owner's own row; nobody else, including other signed-in users, can read it.

create table if not exists public.workspaces (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.workspaces enable row level security;

-- New tables are not exposed automatically in this project, so grant exactly what the app needs.
revoke all on public.workspaces from anon, authenticated;
grant select, insert, update, delete on public.workspaces to authenticated;

drop policy if exists "Owners read their workspace" on public.workspaces;
create policy "Owners read their workspace" on public.workspaces
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Owners create their workspace" on public.workspaces;
create policy "Owners create their workspace" on public.workspaces
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Owners update their workspace" on public.workspaces;
create policy "Owners update their workspace" on public.workspaces
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Owners delete their workspace" on public.workspaces;
create policy "Owners delete their workspace" on public.workspaces
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Saves only if nobody else saved since this device last loaded the workspace.
-- Returns the new version, or -1 when another device saved first, so the app can
-- show both versions instead of silently overwriting one of them.
-- expected_version 0 means "create my workspace" (fails with -1 if it already exists).
create or replace function public.save_workspace(expected_version bigint, new_data jsonb)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  next_version bigint;
begin
  if auth.uid() is null then
    raise exception 'Sign in to save your workspace.';
  end if;
  if expected_version = 0 then
    insert into public.workspaces (user_id, data)
    values (auth.uid(), new_data)
    on conflict (user_id) do nothing
    returning version into next_version;
  else
    update public.workspaces
    set data = new_data, version = version + 1, updated_at = now()
    where user_id = auth.uid() and version = expected_version
    returning version into next_version;
  end if;
  return coalesce(next_version, -1);
end;
$$;

revoke all on function public.save_workspace(bigint, jsonb) from public, anon;
grant execute on function public.save_workspace(bigint, jsonb) to authenticated;

-- Tell other open devices when a workspace changes. Realtime applies the same
-- row-level security, so each person only hears about their own workspace.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workspaces'
  ) then
    alter publication supabase_realtime add table public.workspaces;
  end if;
end;
$$;
