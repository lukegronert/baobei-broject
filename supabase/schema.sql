-- What each signed-in person thinks of each date idea. Run once in the
-- Supabase SQL editor.
--
-- interest: 'interested' / 'not_interested', for places not visited yet.
-- visited:  been there. rating ('up' / 'down') and review only apply once visited.
--
-- Each row also keeps a snapshot of the idea (name, type, tags, place) so the
-- morning scout and the My places tab can use it after the idea leaves ideas.json.

create table if not exists public.idea_marks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  idea_id text not null,
  interest text check (interest in ('interested', 'not_interested')),
  visited boolean not null default false,
  rating text check (rating in ('up', 'down')),
  review text,
  idea_name text,
  idea_type text,
  idea_tags text[] not null default '{}',
  idea_city text,
  idea_area text,
  updated_at timestamptz not null default now(),
  primary key (user_id, idea_id),
  check (visited or (rating is null and review is null))
);

alter table public.idea_marks enable row level security;

-- Reading needs only the public anon key, so the scout can read marks without
-- a secret. Marks on date ideas aren't private; drop this policy if that changes.
create policy "Anyone can read marks"
  on public.idea_marks for select
  using (true);

create policy "Signed-in users add their own marks"
  on public.idea_marks for insert to authenticated
  with check (user_id = auth.uid());

create policy "Signed-in users change their own marks"
  on public.idea_marks for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Signed-in users remove their own marks"
  on public.idea_marks for delete to authenticated
  using (user_id = auth.uid());

grant select on public.idea_marks to anon, authenticated;
grant insert, update, delete on public.idea_marks to authenticated;
