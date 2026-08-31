-- FlechaCard — encomendas e pagamentos (PaySuite)
-- Cole este ficheiro no SQL Editor do Supabase e carregue em Run.
-- Pode ser corrido as vezes que quiser: não apaga encomendas.
--
-- Regra de ouro deste ficheiro: o preço NUNCA vem do navegador. O site diz
-- só o que a pessoa quer comprar; o preço é lido aqui, na base de dados.
-- Sem isto, qualquer pessoa edita o JavaScript e compra um cartão de
-- 3.999 MT por 1 MT.

-- 1. Catálogo -----------------------------------------------------------
create table if not exists public.products (
  code       text primary key,
  name       text not null,
  price_mt   integer not null check (price_mt > 0),  -- meticais, sem cêntimos
  active     boolean not null default true
);

insert into public.products (code, name, price_mt) values
  ('classico', 'FlechaCard Clássico', 1999),
  ('bambu',    'FlechaCard Bambu',    2799),
  ('metal',    'FlechaCard Metal',    3999)
on conflict (code) do update
  set name = excluded.name, price_mt = excluded.price_mt;

alter table public.products enable row level security;
drop policy if exists "catalogo publico" on public.products;
create policy "catalogo publico" on public.products for select using (active);
revoke all on public.products from anon, authenticated;
grant select (code, name, price_mt) on public.products to anon, authenticated;

-- 2. Encomendas ---------------------------------------------------------
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  reference       text unique not null,   -- o número que a pessoa vê e diz ao telefone
  product_code    text not null references public.products(code),
  quantity        integer not null default 1 check (quantity between 1 and 500),
  amount_mt       integer not null check (amount_mt > 0),  -- calculado aqui, nunca recebido
  customer_name   text not null,
  customer_phone  text not null,
  customer_email  text,
  delivery_notes  text,
  card_slug       text,                   -- para que cartão digital o NFC vai apontar
  owner_id        uuid references auth.users(id) on delete set null,
  status          text not null default 'pending'
                  check (status in ('pending', 'paid', 'failed', 'cancelled', 'refunded')),
  gateway         text not null default 'paysuite',
  gateway_ref     text,                   -- id da transação do lado da PaySuite
  gateway_payload jsonb,                  -- resposta crua, para quando algo corre mal
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists orders_owner_idx  on public.orders (owner_id);
create index if not exists orders_status_idx on public.orders (status);
create unique index if not exists orders_gateway_ref_idx
  on public.orders (gateway_ref) where gateway_ref is not null;

alter table public.orders enable row level security;

-- Ninguém escreve nem lê esta tabela diretamente pelo navegador. Só as
-- funções abaixo e a Edge Function (que usa a service-role key).
revoke all on public.orders from anon, authenticated;

-- 3. Criar uma encomenda ------------------------------------------------
-- Devolve a referência e o valor a pagar. O estado fica 'pending' até a
-- PaySuite confirmar. Aberto a visitantes: comprar um cartão físico não
-- devia obrigar a criar conta primeiro.
create or replace function public.create_order(
  p_product   text,
  p_quantity  integer,
  p_name      text,
  p_phone     text,
  p_email     text default null,
  p_notes     text default null,
  p_card_slug text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price integer;
  v_qty   integer := greatest(1, least(coalesce(p_quantity, 1), 500));
  v_ref   text;
  v_id    uuid;
begin
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_phone), '') = '' then
    raise exception 'nome e telefone sao obrigatorios' using errcode = '22023';
  end if;

  select price_mt into v_price
    from public.products
   where code = p_product and active;

  if v_price is null then
    raise exception 'produto desconhecido' using errcode = '22023';
  end if;

  -- Referência curta e legível ao telefone: FC-3K7F2Q
  v_ref := 'FC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.orders (
    reference, product_code, quantity, amount_mt,
    customer_name, customer_phone, customer_email, delivery_notes,
    card_slug, owner_id
  ) values (
    v_ref, p_product, v_qty, v_price * v_qty,
    trim(p_name), trim(p_phone), nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''), nullif(trim(coalesce(p_card_slug, '')), ''),
    auth.uid()
  ) returning id into v_id;

  return json_build_object(
    'id', v_id, 'reference', v_ref, 'amount_mt', v_price * v_qty
  );
end;
$$;

-- 4. Ver o estado de uma encomenda --------------------------------------
-- A página de obrigado pergunta por aqui se o pagamento já entrou.
-- Só devolve o estado, nunca os dados do cliente.
create or replace function public.order_status(p_reference text)
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
           'reference', o.reference,
           'status',    o.status,
           'amount_mt', o.amount_mt
         )
    from public.orders o
   where o.reference = p_reference;
$$;

-- 5. As minhas encomendas -----------------------------------------------
create or replace function public.my_orders()
returns table (
  reference text, product_code text, quantity integer,
  amount_mt integer, status text, created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select o.reference, o.product_code, o.quantity,
         o.amount_mt, o.status, o.created_at
    from public.orders o
   where o.owner_id = auth.uid()
     and auth.uid() is not null
   order by o.created_at desc;
$$;

-- 6. Permissões ---------------------------------------------------------
revoke all on function public.create_order(text, integer, text, text, text, text, text) from public;
revoke all on function public.order_status(text) from public;
revoke all on function public.my_orders() from public;

grant execute on function public.create_order(text, integer, text, text, text, text, text)
  to anon, authenticated;
grant execute on function public.order_status(text) to anon, authenticated;
grant execute on function public.my_orders() to authenticated;

-- 7. Avisar a API para recarregar ---------------------------------------
notify pgrst, 'reload schema';

-- 8. Confirmação --------------------------------------------------------
select routine_name as funcao_criada
  from information_schema.routines
 where routine_schema = 'public'
   and routine_name in ('create_order', 'order_status', 'my_orders')
 order by routine_name;
