-- apphub auth: who can sign in and which apps each person can see.
-- Identity is Supabase Auth. Apps themselves live in Cloudflare D1; app_id here is the D1 app id.
--
-- Roles
--   owner  (profiles.role)   every app, can add/delete apps and manage the team
--   editor (app_access.role) one app: view data, edit its name and sources
--   viewer (app_access.role) one app: view data
--
-- Signup is invite-only: a new auth user must match a row in invites, or the signup fails.

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now()
);

create table public.app_access (
  app_id text not null,
  user_id uuid not null references public.profiles on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (app_id, user_id)
);

-- Access granted to an email before that person has an account. app_id is null for an owner invite.
create table public.invites (
  id bigint generated always as identity primary key,
  email text not null check (email = lower(email)),
  app_id text,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  invited_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  check ((role = 'owner') = (app_id is null))
);
create unique index invites_email_app on public.invites (email, coalesce(app_id, ''));

create function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'owner')
$$;

-- ---------- RLS ----------

alter table public.profiles enable row level security;
alter table public.app_access enable row level security;
alter table public.invites enable row level security;

create policy "read own profile or owner reads all" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or (select public.is_owner()));
create policy "owner updates profiles" on public.profiles
  for update to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));

create policy "read own access or owner reads all" on public.app_access
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_owner()));
create policy "owner manages access" on public.app_access
  for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));

create policy "owner manages invites" on public.invites
  for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));

-- ---------- signup ----------

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  addr text := lower(new.email);
begin
  if not exists (select 1 from public.invites where email = addr) then
    raise exception 'not_invited: % has not been invited to apphub', addr;
  end if;
  insert into public.profiles (id, email, role)
  values (new.id, addr, case when exists (select 1 from public.invites where email = addr and role = 'owner') then 'owner' else 'member' end);
  insert into public.app_access (app_id, user_id, role)
    select app_id, new.id, role from public.invites where email = addr and app_id is not null
    on conflict do nothing;
  delete from public.invites where email = addr;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- RPCs ----------

-- What the API server needs on each request: the caller's workspace role and per-app roles.
create function public.my_access() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'email', p.email,
    'role', p.role,
    'apps', coalesce((select jsonb_object_agg(a.app_id, a.role) from public.app_access a where a.user_id = p.id), '{}'::jsonb)
  )
  from public.profiles p where p.id = (select auth.uid())
$$;

-- Grant by email: updates an existing member, or leaves an invite for when they sign up.
-- role 'owner' (app_id null) makes them a workspace owner.
create function public.grant_access(target_email text, target_app text, target_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  addr text := lower(trim(target_email));
  uid uuid;
begin
  if not public.is_owner() then raise exception 'Only owners can manage access'; end if;
  if target_role not in ('owner', 'editor', 'viewer') then raise exception 'Unknown role %', target_role; end if;
  if (target_role = 'owner') <> (target_app is null) then raise exception 'Owner access is workspace-wide; editor and viewer need an app'; end if;
  select id into uid from public.profiles where email = addr;
  if uid is null then
    insert into public.invites (email, app_id, role, invited_by) values (addr, target_app, target_role, auth.uid())
      on conflict (email, coalesce(app_id, '')) do update set role = excluded.role;
  elsif target_role = 'owner' then
    update public.profiles set role = 'owner' where id = uid;
  else
    insert into public.app_access (app_id, user_id, role) values (target_app, uid, target_role)
      on conflict (app_id, user_id) do update set role = excluded.role;
  end if;
end $$;

-- Revoke by email. target_app null = remove owner role (an owner can't demote themselves).
create function public.revoke_access(target_email text, target_app text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  addr text := lower(trim(target_email));
begin
  if not public.is_owner() then raise exception 'Only owners can manage access'; end if;
  if target_app is null then
    if addr = (select email from public.profiles where id = auth.uid()) then raise exception 'You can''t remove your own owner role'; end if;
    update public.profiles set role = 'member' where email = addr;
    delete from public.invites where email = addr and app_id is null;
  else
    delete from public.app_access where app_id = target_app and user_id = (select id from public.profiles where email = addr);
    delete from public.invites where email = addr and app_id = target_app;
  end if;
end $$;

-- Called when an app is deleted.
create function public.forget_app(target_app text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'Only owners can delete apps'; end if;
  delete from public.app_access where app_id = target_app;
  delete from public.invites where app_id = target_app;
end $$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.my_access(), public.grant_access(text, text, text), public.revoke_access(text, text), public.forget_app(text), public.is_owner() from public, anon;
grant execute on function public.my_access(), public.grant_access(text, text, text), public.revoke_access(text, text), public.forget_app(text), public.is_owner() to authenticated;
