-- FlechaCard — Supabase setup
-- Cole este ficheiro inteiro no SQL Editor do Supabase e carregue em Run.
-- Pode ser corrido as vezes que quiser: não apaga nada.

-- 1. Tabela dos cartões ------------------------------------------------
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  edit_key uuid not null default gen_random_uuid(),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cards enable row level security;

-- Qualquer pessoa pode ler cartões; a coluna edit_key fica escondida
-- porque não é incluída no grant de select mais abaixo.
drop policy if exists "public read" on public.cards;
create policy "public read" on public.cards for select using (true);

-- Nada é escrito diretamente pelo navegador: só através das funções.
revoke all on public.cards from anon, authenticated;
grant select (slug, data, updated_at) on public.cards to anon, authenticated;

-- 2. Criar um cartão ---------------------------------------------------
-- Devolve o código curto do cartão e a chave secreta de edição.
-- gen_random_uuid() faz parte do PostgreSQL, por isso não é preciso
-- instalar nenhuma extensão.
create or replace function public.create_card(card_data jsonb)
returns json
language sql
security definer
set search_path = public
as $$
  insert into public.cards (slug, data)
  values (substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), card_data)
  returning json_build_object('slug', slug, 'edit_key', edit_key);
$$;

-- 3. Atualizar um cartão -----------------------------------------------
-- Só funciona com a chave de edição correta; devolve true se atualizou.
create or replace function public.update_card(card_slug text, key uuid, card_data jsonb)
returns boolean
language sql
security definer
set search_path = public
as $$
  with updated as (
    update public.cards
       set data = card_data, updated_at = now()
     where slug = card_slug and edit_key = key
    returning 1
  )
  select exists (select 1 from updated);
$$;

-- 4. Permissões --------------------------------------------------------
revoke all on function public.create_card(jsonb) from public;
revoke all on function public.update_card(text, uuid, jsonb) from public;
grant execute on function public.create_card(jsonb) to anon, authenticated;
grant execute on function public.update_card(text, uuid, jsonb) to anon, authenticated;

-- 5. Avisar a API para recarregar (senão as funções dão erro 404) -------
notify pgrst, 'reload schema';

-- 6. Confirmação: deve mostrar duas linhas, create_card e update_card ---
select routine_name as funcao_criada
  from information_schema.routines
 where routine_schema = 'public'
   and routine_name in ('create_card', 'update_card')
 order by routine_name;
