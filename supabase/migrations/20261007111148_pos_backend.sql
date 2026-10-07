-- Campus Corner activity backend. Money is always integer centavos.
create table public.products (
  id text primary key check (id ~ '^[a-z][a-z0-9_-]{0,63}$'),
  name text not null,
  description text not null,
  category text not null,
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  price bigint not null check (price > 0 and price <= 99999999900),
  active boolean not null default true,
  sort_order integer not null default 0
);
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  normalized_request jsonb not null,
  transaction_number text not null unique default
    ('TXN-' || to_char(now(),'YYYY') || '-' || upper(replace(gen_random_uuid()::text,'-',''))),
  total bigint not null check (total > 0 and total <= 99999999900),
  status text not null default 'paid' check (status = 'paid'),
  created_at timestamptz not null default now()
);
create table public.order_items (
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null references public.products(id),
  product_name text not null,
  unit_price bigint not null check (unit_price > 0 and unit_price <= 99999999900),
  quantity integer not null check (quantity between 1 and 999),
  subtotal bigint generated always as (unit_price * quantity) stored,
  primary key (order_id,product_id)
);
create index order_items_product_id_idx on public.order_items(product_id);
create table public.payments (
  order_id uuid primary key references public.orders(id) on delete cascade,
  method text not null check (method in ('cash','qr','card')),
  paid bigint not null check (paid >= 0 and paid <= 99999999900),
  change bigint not null check (change >= 0 and change <= 99999999900),
  simulated boolean not null default true check (simulated),
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
revoke all on public.products,public.orders,public.order_items,public.payments from anon,authenticated;
grant select on public.products to anon,authenticated;
grant all on public.products,public.orders,public.order_items,public.payments to service_role;
create policy "Active catalog is public" on public.products for select to anon,authenticated using (active);
-- Transaction tables intentionally have no public policies: guest checkout uses the Edge Function.
comment on table public.orders is 'Private completed demo orders, accessible only through server checkout.';
comment on table public.payments is 'Simulated activity payments; no card data or real funds.';

insert into public.products (id,name,price,color,description,category,sort_order) values
('coffee','Coffee',4500,'#eee5d7','Your daily pick-me-up','Drink',1),
('sandwich','Sandwich',5000,'#edf0dc','A little lunch-time fuel','Food',2),
('soda','Soft Drink',3500,'#f6e1d8','Chilled & refreshing','Drink',3),
('cookies','Cookies',2500,'#f3e7d3','A sweet study companion','Food',4),
('water','Bottled Water',2000,'#e0ecec','Stay hydrated, stay focused','Drink',5),
('chocolate','Chocolate',2500,'#ebe0db','For your well-earned break','Food',6),
('notebook','Campus Notebook',6500,'#e4e8f0','Big ideas start here','Merchandise',7),
('pen','Ballpoint Pen',1500,'#eee6ed','Ready for the next lecture','Merchandise',8);

create function public.complete_checkout(p_request jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_request_id uuid;
  v_total bigint := 0;
  v_expected bigint;
  v_paid bigint;
  v_method text;
  v_item jsonb;
  v_items jsonb;
  v_normalized jsonb;
  v_product public.products%rowtype;
  v_order public.orders%rowtype;
  v_existing boolean;
begin
  if jsonb_typeof(p_request) is distinct from 'object' then
    raise exception using message='invalid_order',errcode='P0001';
  end if;
  if jsonb_typeof(p_request->'requestId') is distinct from 'string'
    or coalesce(p_request->>'requestId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(p_request->'total') is distinct from 'number'
    or coalesce(p_request->>'total','') !~ '^[0-9]+$'
    or coalesce(p_request->>'method','') not in ('cash','qr','card')
    or jsonb_typeof(p_request->'items') is distinct from 'array' then
    raise exception using message='invalid_order',errcode='P0001';
  end if;
  if (p_request->>'total')::numeric < 1 or (p_request->>'total')::numeric > 99999999900
    or jsonb_array_length(p_request->'items') not between 1 and 100 then
    raise exception using message='invalid_order',errcode='P0001';
  end if;
  v_request_id := (p_request->>'requestId')::uuid;
  v_expected := (p_request->>'total')::bigint;
  v_method := p_request->>'method';
  for v_item in select value from jsonb_array_elements(p_request->'items') loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or jsonb_typeof(v_item->'id') is distinct from 'string'
      or coalesce(v_item->>'id','') !~ '^[a-z][a-z0-9_-]{0,63}$'
      or jsonb_typeof(v_item->'qty') is distinct from 'number'
      or coalesce(v_item->>'qty','') !~ '^[0-9]+$'
      or jsonb_typeof(v_item->'price') is distinct from 'number'
      or coalesce(v_item->>'price','') !~ '^[0-9]+$' then
      raise exception using message='invalid_order',errcode='P0001';
    end if;
    if (v_item->>'qty')::numeric not between 1 and 999
      or (v_item->>'price')::numeric not between 1 and 99999999900 then
      raise exception using message='invalid_order',errcode='P0001';
    end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_request->'items'))
    <> jsonb_array_length(p_request->'items') then
    raise exception using message='invalid_order',errcode='P0001';
  end if;
  select jsonb_agg(jsonb_build_object('id',value->>'id','qty',(value->>'qty')::integer,'price',(value->>'price')::bigint)
    order by value->>'id') into v_items from jsonb_array_elements(p_request->'items');
  if v_method='cash' then
    if jsonb_typeof(p_request->'paid') is distinct from 'number'
      or coalesce(p_request->>'paid','') !~ '^[0-9]+$' then
      raise exception using message='invalid_payment',errcode='P0001';
    end if;
    if (p_request->>'paid')::numeric not between 0 and 99999999900 then
      raise exception using message='invalid_payment',errcode='P0001';
    end if;
    v_paid := (p_request->>'paid')::bigint;
  else
    if p_request->>'paid' is not null then
      raise exception using message='invalid_payment',errcode='P0001';
    end if;
    v_paid := null;
  end if;
  v_normalized := jsonb_build_object('requestId',v_request_id,'items',v_items,
    'total',v_expected,'method',v_method,'paid',v_paid);

  -- Serialize matching request IDs before checking for a prior committed order.
  perform pg_advisory_xact_lock(hashtextextended(v_request_id::text,0));
  select * into v_order from public.orders where request_id=v_request_id;
  v_existing := found;
  if v_existing then
    if v_order.normalized_request <> v_normalized then
      raise exception using message='request_conflict',errcode='P0001';
    end if;
  else
    -- Read/lock catalog rows in stable order so prices cannot change during this save.
    for v_item in select value from jsonb_array_elements(v_items) loop
      select * into v_product from public.products where id=v_item->>'id' for share;
      if not found then
        raise exception using message='invalid_product',errcode='P0001';
      end if;
      if not v_product.active or v_product.price <> (v_item->>'price')::bigint then
        raise exception using message='catalog_changed',errcode='P0001';
      end if;
      v_total := v_total + v_product.price * (v_item->>'qty')::integer;
    end loop;
    if v_total <> v_expected or v_total > 99999999900 then
      raise exception using message='catalog_changed',errcode='P0001';
    end if;
    if v_method='cash' then
      if v_paid < v_total then
        raise exception using message='insufficient_payment',errcode='P0001',
          detail='Insufficient payment. Please enter at least ₱' || to_char(v_total::numeric/100,'FM999999999990.00') || '.';
      end if;
    else
      v_paid := v_total;
    end if;
    insert into public.orders(request_id,normalized_request,total)
      values(v_request_id,v_normalized,v_total) returning * into v_order;
    insert into public.order_items(order_id,product_id,product_name,unit_price,quantity)
      select v_order.id,p.id,p.name,p.price,(item.value->>'qty')::integer
      from jsonb_array_elements(v_items) item join public.products p on p.id=item.value->>'id';
    insert into public.payments(order_id,method,paid,change)
      values(v_order.id,v_method,v_paid,v_paid-v_total);
  end if;
  return (
    select jsonb_build_object(
      'number',v_order.transaction_number,'date',v_order.created_at,
      'items',(select jsonb_agg(jsonb_build_object('id',i.product_id,'name',i.product_name,
        'price',i.unit_price,'qty',i.quantity,'subtotal',i.subtotal) order by i.product_id)
        from public.order_items i where i.order_id=v_order.id),
      'total',v_order.total,'paid',p.paid,'change',p.change,
      'method',case p.method when 'cash' then 'Cash' when 'qr' then 'QR Payment' else 'Credit/Debit Card' end
    ) from public.payments p where p.order_id=v_order.id
  );
end
$function$;
revoke all on function public.complete_checkout(jsonb) from public,anon,authenticated;
grant execute on function public.complete_checkout(jsonb) to service_role;
comment on function public.complete_checkout(jsonb) is 'Server-only atomic, idempotent simulated checkout. SECURITY INVOKER; no public execution.';
