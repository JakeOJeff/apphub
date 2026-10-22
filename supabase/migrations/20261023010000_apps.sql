-- Apps move from Cloudflare D1 to here. `sources` is AES-GCM ciphertext made by the API server
-- (key: the Worker's ENCRYPTION_KEY), so this database never holds readable app secrets.

create table public.apps (
  id text primary key,
  name text not null,
  color text not null,
  platforms text not null default '',
  sources text not null,
  last_check jsonb,
  created_at timestamptz not null default now()
);

alter table public.apps enable row level security;

create function public.app_role(target_app text) returns text
language sql stable security definer set search_path = '' as $$
  select role from public.app_access where app_id = target_app and user_id = (select auth.uid())
$$;
revoke execute on function public.app_role(text) from public, anon;
grant execute on function public.app_role(text) to authenticated;

create policy "owners and granted members read apps" on public.apps
  for select to authenticated using ((select public.is_owner()) or public.app_role(id) is not null);
create policy "owners add apps" on public.apps
  for insert to authenticated with check ((select public.is_owner()));
create policy "owners and editors update apps" on public.apps
  for update to authenticated
  using ((select public.is_owner()) or public.app_role(id) = 'editor')
  with check ((select public.is_owner()) or public.app_role(id) = 'editor');
create policy "owners delete apps" on public.apps
  for delete to authenticated using ((select public.is_owner()));

-- Access and invites now point at real apps and go away with them.
alter table public.app_access add constraint app_access_app_fk foreign key (app_id) references public.apps on delete cascade;
alter table public.invites add constraint invites_app_fk foreign key (app_id) references public.apps on delete cascade;
drop function public.forget_app(text);
