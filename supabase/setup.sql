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

-- 1a. Dono do cartão -----------------------------------------------------
-- Criar um cartão exige conta, por isso os cartões novos têm sempre dono.
-- Fica anulável por causa dos cartões antigos, criados antes das contas
-- existirem: esses continuam a editar-se pelo link secreto de edição.
alter table public.cards
  add column if not exists owner_id uuid references auth.users(id) on delete set null;
create index if not exists cards_owner_idx on public.cards (owner_id);

-- 1b. Regras para o nome do link ---------------------------------------
-- Só letras minúsculas, números e hífens; nomes do próprio site ficam
-- reservados para não colidirem com as páginas.
alter table public.cards drop constraint if exists cards_slug_valid;
alter table public.cards add constraint cards_slug_valid check (
  slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
  -- Um cartão com um destes nomes ficava inalcançável: o alojamento serve
  -- o ficheiro do site e o cartão nunca chega a ser procurado.
  and slug not in (
    'index', 'create', 'card', 'diagnostico', 'entrar', 'painel',
    'encomendar', 'obrigado', 'css', 'js', 'supabase',
    'assets', 'api', 'admin', 'www', 'flechacard', 'readme', 'robots',
    'sitemap', 'favicon', '404'
  )
);

-- 2. Criar um cartão ---------------------------------------------------
-- Devolve o código curto do cartão e a chave secreta de edição.
-- gen_random_uuid() faz parte do PostgreSQL, por isso não é preciso
-- instalar nenhuma extensão.
-- desired_slug: o nome escolhido pela pessoa. Se vier vazio, é gerado um
-- código aleatório. Se já estiver ocupado, a base de dados recusa e o
-- site mostra a mensagem certa.
-- Só quem tem sessão iniciada pode criar: sem conta, não é inserida
-- nenhuma linha e a função devolve nulo.
drop function if exists public.create_card(jsonb);

create or replace function public.create_card(card_data jsonb, desired_slug text default null)
returns json
language sql
security definer
set search_path = public
as $$
  insert into public.cards (slug, data, owner_id)
  select
    coalesce(
      nullif(lower(trim(coalesce(desired_slug, ''))), ''),
      substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)
    ),
    card_data,
    auth.uid()
  where auth.uid() is not null
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

-- 3b. Cartões de quem tem conta ----------------------------------------
-- Listar os meus cartões.
create or replace function public.my_cards()
returns table (slug text, data jsonb, updated_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select c.slug, c.data, c.updated_at
    from public.cards c
   where c.owner_id = auth.uid()
     and auth.uid() is not null
   order by c.updated_at desc;
$$;

-- Atualizar um cartão meu, sem precisar da chave de edição.
create or replace function public.update_my_card(card_slug text, card_data jsonb)
returns boolean
language sql
security definer
set search_path = public
as $$
  with updated as (
    update public.cards
       set data = card_data, updated_at = now()
     where slug = card_slug
       and owner_id = auth.uid()
       and auth.uid() is not null
    returning 1
  )
  select exists (select 1 from updated);
$$;

-- Apagar um cartão meu.
create or replace function public.delete_my_card(card_slug text)
returns boolean
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from public.cards
     where slug = card_slug
       and owner_id = auth.uid()
       and auth.uid() is not null
    returning 1
  )
  select exists (select 1 from deleted);
$$;

-- Ler um cartão meu para o editar.
create or replace function public.get_my_card(card_slug text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select c.data from public.cards c
   where c.slug = card_slug
     and c.owner_id = auth.uid()
     and auth.uid() is not null;
$$;

-- 4. Permissões --------------------------------------------------------
revoke all on function public.create_card(jsonb, text) from public;
revoke all on function public.update_card(text, uuid, jsonb) from public;
grant execute on function public.create_card(jsonb, text) to authenticated;
revoke all on function public.my_cards() from public;
revoke all on function public.update_my_card(text, jsonb) from public;
revoke all on function public.delete_my_card(text) from public;
revoke all on function public.get_my_card(text) from public;
grant execute on function public.my_cards() to authenticated;
grant execute on function public.update_my_card(text, jsonb) to authenticated;
grant execute on function public.delete_my_card(text) to authenticated;
grant execute on function public.get_my_card(text) to authenticated;
-- update_card continua aberto a visitantes: é o que mantém a funcionar os
-- links de edição dos cartões criados antes de existirem contas.
grant execute on function public.update_card(text, uuid, jsonb) to anon, authenticated;

-- 5. Avisar a API para recarregar (senão as funções dão erro 404) -------
notify pgrst, 'reload schema';

-- 6. Confirmação: deve mostrar duas linhas, create_card e update_card ---
select routine_name as funcao_criada
  from information_schema.routines
 where routine_schema = 'public'
   and routine_name in ('create_card', 'update_card', 'my_cards',
                        'update_my_card', 'delete_my_card', 'get_my_card')
 order by routine_name;
