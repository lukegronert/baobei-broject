-- Likes and dislikes on date ideas. Run once in the Supabase SQL editor.
--
-- Each row also keeps a snapshot of the idea (name, type, tags, place) so the
-- morning scout can read what was liked even after the idea leaves ideas.json.

create table if not exists public.reactions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  idea_id text not null,
  reaction text not null check (reaction in ('like', 'dislike')),
  idea_name text,
  idea_type text,
  idea_tags text[] not null default '{}',
  idea_city text,
  idea_area text,
  updated_at timestamptz not null default now(),
  primary key (user_id, idea_id)
);

alter table public.reactions enable row level security;

-- Reading needs only the public anon key, so the scout can read likes without
-- a secret. Likes on date ideas aren't private; drop this policy if that changes.
create policy "Anyone can read reactions"
  on public.reactions for select
  using (true);

create policy "Signed-in users add their own reactions"
  on public.reactions for insert to authenticated
  with check (user_id = auth.uid());

create policy "Signed-in users change their own reactions"
  on public.reactions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Signed-in users remove their own reactions"
  on public.reactions for delete to authenticated
  using (user_id = auth.uid());

grant select on public.reactions to anon, authenticated;
grant insert, update, delete on public.reactions to authenticated;
