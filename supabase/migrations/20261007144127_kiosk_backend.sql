
create table public.products (
  id text primary key, name text not null, description text not null,
  category text not null, color text not null,
  price bigint not null check (price between 1 and 100000000),
  active boolean not null default true, sort_order integer not null
);
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique, request_payload jsonb not null,
  transaction_number text not null unique,
  created_at timestamptz not null default now(),
  method text not null check (method in ('Cash','QR Payment','Credit/Debit Card')),
  total bigint not null check (total > 0),
  paid bigint not null check (paid >= total and paid <= 99999999900),
  change bigint not null check (change = paid - total),
  check (method = 'Cash' or (paid = total and change = 0))
);
create table public.order_items (
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null references public.products(id),
  name text not null, price bigint not null check (price > 0),
  qty integer not null check (qty between 1 and 999),
  subtotal bigint not null check (subtotal = price * qty),
  primary key (order_id, product_id)
);
create index order_items_product_id_idx on public.order_items(product_id);
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
revoke all on public.products, public.orders, public.order_items from anon, authenticated;
grant select on public.products to anon, authenticated;
grant all on public.products, public.orders, public.order_items to service_role;
create policy "Public active catalog" on public.products for select to anon, authenticated using (active);
-- Completed orders have no public policies: receipts are returned only by checkout.
insert into public.products (id,name,price,color,description,category,sort_order) values
('coffee','Coffee',4500,'#eee5d7','Your daily pick-me-up','Drink',1),
('sandwich','Sandwich',5000,'#edf0dc','A little lunch-time fuel','Food',2),
('soda','Soft Drink',3500,'#f6e1d8','Chilled & refreshing','Drink',3),
('cookies','Cookies',2500,'#f3e7d3','A sweet study companion','Food',4),
('water','Bottled Water',2000,'#e0ecec','Stay hydrated, stay focused','Drink',5),
('chocolate','Chocolate',2500,'#ebe0db','For your well-earned break','Food',6),
('notebook','Campus Notebook',6500,'#e4e8f0','Big ideas start here','Merchandise',7),
('pen','Ballpoint Pen',1500,'#eee6ed','Ready for the next lecture','Merchandise',8);

create function public.kiosk_receipt(p_order_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'number', o.transaction_number, 'date', o.created_at,
    'total', o.total, 'paid', o.paid, 'change', o.change, 'method', o.method,
    'items', (select jsonb_agg(jsonb_build_object('id', i.product_id, 'name', i.name,
               'price', i.price, 'qty', i.qty, 'subtotal', i.subtotal) order by i.product_id)
              from public.order_items i where i.order_id = o.id)
  ) from public.orders o where o.id = p_order_id
$$;
revoke all on function public.kiosk_receipt(uuid) from public, anon, authenticated;
grant execute on function public.kiosk_receipt(uuid) to service_role;

create function public.kiosk_checkout(
  p_request_id uuid, p_items jsonb, p_method text, p_cash text, p_expected_total bigint
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_payload jsonb; v_items jsonb; v_snapshots jsonb := '[]'::jsonb;
  v_item jsonb; v_product public.products%rowtype;
  v_existing public.orders%rowtype;
  v_order_id uuid; v_total bigint := 0; v_paid bigint; v_qty integer;
  v_cash text := btrim(coalesce(p_cash, ''));
begin
  if p_request_id is null or p_method is null or
     p_method not in ('Cash','QR Payment','Credit/Debit Card') or
     p_expected_total is null or p_expected_total <= 0 or p_expected_total > 99999999900 then
    return jsonb_build_object('ok',false,'code','INVALID_REQUEST','message','Invalid checkout request.');
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('ok',false,'code','INVALID_CART','message','Please select valid products.');
  end if;
  if jsonb_array_length(p_items) not between 1 and 100 then
    return jsonb_build_object('ok',false,'code','INVALID_CART','message','Please select at least one product.');
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' or jsonb_typeof(v_item->'id') is distinct from 'string' or
       length(v_item->>'id') not between 1 and 80 or
       jsonb_typeof(v_item->'qty') is distinct from 'number' or
       (v_item->>'qty') !~ '^[0-9]{1,3}$' then
      return jsonb_build_object('ok',false,'code','INVALID_CART','message','Invalid product or quantity. Use 1 to 999 per item.');
    end if;
    v_qty := (v_item->>'qty')::integer;
    if v_qty not between 1 and 999 then
      return jsonb_build_object('ok',false,'code','INVALID_CART','message','Invalid quantity. Use 1 to 999 per item.');
    end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_items)) <> jsonb_array_length(p_items) then
    return jsonb_build_object('ok',false,'code','INVALID_CART','message','Each product must appear only once.');
  end if;
  select jsonb_agg(jsonb_build_object('id', value->>'id','qty',(value->>'qty')::integer)
                   order by value->>'id') into v_items from jsonb_array_elements(p_items);
  v_payload := jsonb_build_object('items',v_items,'method',p_method,'cash',
                   case when p_method='Cash' then v_cash else null end,'expectedTotal',p_expected_total);
  -- Serialize equal request IDs, including simultaneous retries, before checking replay.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select * into v_existing from public.orders where request_id = p_request_id;
  if found then
    if v_existing.request_payload <> v_payload then
      return jsonb_build_object('ok',false,'code','REQUEST_CONFLICT','message','This checkout reference belongs to a different request.');
    end if;
    return jsonb_build_object('ok',true,'receipt',public.kiosk_receipt(v_existing.id));
  end if;
  for v_item in select value from jsonb_array_elements(v_items) loop
    select * into v_product from public.products where id=v_item->>'id' and active for share;
    if not found then
      return jsonb_build_object('ok',false,'code','INVALID_CART','message','A selected product is unavailable. Please review your order.');
    end if;
    v_qty := (v_item->>'qty')::integer;
    v_total := v_total + v_product.price * v_qty;
    v_snapshots := v_snapshots || jsonb_build_array(jsonb_build_object(
        'id',v_product.id,'name',v_product.name,'price',v_product.price,
        'qty',v_qty,'subtotal',v_product.price*v_qty));
  end loop;
  if v_total <> p_expected_total then
    return jsonb_build_object('ok',false,'code','TOTAL_CHANGED','message','Product prices have changed. Please review your order before paying.');
  end if;
  if p_method='Cash' then
    if v_cash='' then
      return jsonb_build_object('ok',false,'code','INVALID_PAYMENT','message','Enter the amount paid.');
    end if;
    if length(v_cash)>14 or v_cash !~ '^[0-9]+([.][0-9]{1,2})?$' then
      return jsonb_build_object('ok',false,'code','INVALID_PAYMENT','message','Invalid payment. Enter a non-negative amount with up to 2 decimal places.');
    end if;
    if v_cash::numeric*100 > 99999999900 then
      return jsonb_build_object('ok',false,'code','INVALID_PAYMENT','message','Invalid payment. Amount is too large.');
    end if;
    v_paid := (v_cash::numeric*100)::bigint;
    if v_paid < v_total then
      return jsonb_build_object('ok',false,'code','INSUFFICIENT_PAYMENT','message',
        'Insufficient payment. Please enter at least ₱' || to_char(v_total::numeric/100,'FM999,999,999,990.00') || '.');
    end if;
  else
    v_paid := v_total;
  end if;
  v_order_id := gen_random_uuid();
  insert into public.orders(id,request_id,request_payload,transaction_number,method,total,paid,change)
  values(v_order_id,p_request_id,v_payload,'TXN-'||upper(v_order_id::text),p_method,v_total,v_paid,v_paid-v_total);
  insert into public.order_items(order_id,product_id,name,price,qty,subtotal)
    select v_order_id,value->>'id',value->>'name',(value->>'price')::bigint,
           (value->>'qty')::integer,(value->>'subtotal')::bigint
    from jsonb_array_elements(v_snapshots);
  return jsonb_build_object('ok',true,'receipt',public.kiosk_receipt(v_order_id));
end
$$;
revoke all on function public.kiosk_checkout(uuid,jsonb,text,text,bigint) from public, anon, authenticated;
grant execute on function public.kiosk_checkout(uuid,jsonb,text,text,bigint) to service_role;
