-- FlechaCard — Supabase setup
-- Paste this whole file into the Supabase dashboard: SQL Editor → New query → Run.
-- Safe to run more than once.

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  edit_key uuid not null default gen_random_uuid(),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cards enable row level security;

-- The public may read cards (but never the edit_key column, see grants below).
drop policy if exists "public read" on public.cards;
create policy "public read" on public.cards for select using (true);

-- No direct writes from the browser: everything goes through the functions.
revoke all on public.cards from anon, authenticated;
grant select (slug, data, updated_at) on public.cards to anon, authenticated;

-- Create a card: generates a short slug and a secret edit key.
create or replace function public.create_card(card_data jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  new_slug text;
  new_key uuid;
  tries int := 0;
begin
  if pg_column_size(card_data) > 20000 then
    raise exception 'card_too_large';
  end if;
  loop
    new_slug := lower(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
    begin
      insert into public.cards (slug, data) values (new_slug, card_data)
        returning edit_key into new_key;
      exit;
    exception when unique_violation then
      tries := tries + 1;
      if tries > 5 then raise; end if;
    end;
  end loop;
  return json_build_object('slug', new_slug, 'edit_key', new_key);
end;
$$;

-- Update a card: only works with the matching secret edit key.
create or replace function public.update_card(card_slug text, key uuid, card_data jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_column_size(card_data) > 20000 then
    raise exception 'card_too_large';
  end if;
  update public.cards
     set data = card_data, updated_at = now()
   where slug = card_slug and edit_key = key;
  return found;
end;
$$;

revoke all on function public.create_card(jsonb) from public;
revoke all on function public.update_card(text, uuid, jsonb) from public;
grant execute on function public.create_card(jsonb) to anon, authenticated;
grant execute on function public.update_card(text, uuid, jsonb) to anon, authenticated;
