begin;
do $tests$
declare
  base jsonb;
  r jsonb;
  r2 jsonb;
  bad jsonb;
  before_count bigint;
  after_count bigint;
  expected text;
begin
  base := jsonb_build_object('requestId',gen_random_uuid(),'items',
    '[{"id":"coffee","qty":1,"price":4500},{"id":"sandwich","qty":1,"price":5000},{"id":"notebook","qty":1,"price":6500},{"id":"pen","qty":1,"price":1500}]'::jsonb,
    'total',17500,'method','cash','paid',17500);
  r := public.complete_checkout(base);
  assert (r->>'total')::bigint=17500 and (r->>'paid')::bigint=17500 and (r->>'change')::bigint=0, 'Exact payment failed';
  assert jsonb_array_length(r->'items')=4, 'Receipt items missing';
  r2 := public.complete_checkout(base);
  assert r2=r, 'Retry did not return the same saved receipt';
  select count(*) into before_count from public.orders;
  begin
    perform public.complete_checkout(base || '{"paid":20000}'::jsonb);
    raise exception 'A conflicting retry was accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'request_conflict' then raise; end if;
  end;
  r := public.complete_checkout(base || jsonb_build_object('requestId',gen_random_uuid(),'paid',20000));
  assert (r->>'change')::bigint=2500, 'Cash change failed';
  for expected in select unnest(array['qr','card']) loop
    r := public.complete_checkout(base || jsonb_build_object('requestId',gen_random_uuid(),'method',expected,'paid',null));
    assert (r->>'paid')::bigint=17500 and (r->>'change')::bigint=0, 'Simulated payment failed';
  end loop;
  select count(*) into before_count from public.orders;
  for bad,expected in
    select * from (values
      ('{"paid":17499}'::jsonb,'insufficient_payment'),
      ('{"paid":-1}'::jsonb,'invalid_payment'),
      ('{"paid":null}'::jsonb,'invalid_payment'),
      ('{"paid":1.5}'::jsonb,'invalid_payment'),
      ('{"method":"bank"}'::jsonb,'invalid_order'),
      ('{"items":[]}'::jsonb,'invalid_order'),
      ('{"items":[{"id":"coffee","qty":0,"price":4500}]}'::jsonb,'invalid_order'),
      ('{"items":[{"id":"coffee","qty":1000,"price":4500}]}'::jsonb,'invalid_order'),
      ('{"items":[{"id":"coffee","qty":1.5,"price":4500}]}'::jsonb,'invalid_order'),
      ('{"items":[{"id":"coffee","qty":1,"price":4500},{"id":"coffee","qty":1,"price":4500}]}'::jsonb,'invalid_order'),
      ('{"items":[{"id":"missing","qty":1,"price":4500}]}'::jsonb,'invalid_product'),
      ('{"items":[{"id":"coffee","qty":1,"price":4400}]}'::jsonb,'catalog_changed'),
      ('{"total":17499}'::jsonb,'catalog_changed')
    ) as cases(body,code)
  loop
    begin
      perform public.complete_checkout(base || bad || jsonb_build_object('requestId',gen_random_uuid()));
      raise exception 'Invalid checkout was accepted: %',bad;
    exception when sqlstate 'P0001' then
      if sqlerrm <> expected then raise exception 'Expected %, got %',expected,sqlerrm; end if;
    end;
  end loop;
  select count(*) into after_count from public.orders;
  assert before_count=after_count, 'Failed checkout created an order';
  r := public.complete_checkout(base);
  update public.products set price=price+100,name='Changed Coffee' where id='coffee';
  r2 := public.complete_checkout(base);
  assert r2=r, 'Saved receipt changed when product metadata changed';
  begin
    perform public.complete_checkout(base || jsonb_build_object('requestId',gen_random_uuid()));
    raise exception 'Changed catalog was accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'catalog_changed' then raise; end if;
  end;
  update public.products set active=false where id='coffee';
  begin
    perform public.complete_checkout(base || jsonb_build_object('requestId',gen_random_uuid()));
    raise exception 'Inactive product was accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'catalog_changed' then raise; end if;
  end;
  assert not has_function_privilege('anon','public.complete_checkout(jsonb)','execute'), 'Public checkout RPC exposed';
  assert not has_function_privilege('authenticated','public.complete_checkout(jsonb)','execute'), 'Authenticated checkout RPC exposed';
  assert has_function_privilege('service_role','public.complete_checkout(jsonb)','execute'), 'Edge Function cannot call checkout';
  assert not has_table_privilege('anon','public.orders','select'), 'Orders exposed';
  assert not has_table_privilege('anon','public.order_items','select'), 'Order items exposed';
  assert not has_table_privilege('anon','public.payments','select'), 'Payments exposed';
  assert has_table_privilege('anon','public.products','select'), 'Catalog inaccessible';
end
$tests$;
rollback;
