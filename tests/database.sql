
begin;
do $test$
declare
  basket jsonb := '[{"id":"sandwich","qty":3},{"id":"cookies","qty":1}]';
  result jsonb; first_receipt jsonb; id uuid := gen_random_uuid(); bad text; method text;
  baseline bigint := (select count(*) from public.orders);
begin
  foreach bad in array array['','hello','-1','175.001','1e3','NaN','Infinity','999999999999999'] loop
    result := public.kiosk_checkout(gen_random_uuid(),basket,'Cash',bad,17500);
    assert result->>'code'='INVALID_PAYMENT', 'Cash validation failed: '||bad;
  end loop;
  result := public.kiosk_checkout(gen_random_uuid(),basket,'Cash','174.99',17500);
  assert result->>'code'='INSUFFICIENT_PAYMENT', 'Underpayment accepted';
  assert result->>'message'='Insufficient payment. Please enter at least ₱175.00.', 'Wrong insufficient message';
  assert (select count(*) from public.orders)=baseline, 'Invalid payments created orders';
  result := public.kiosk_checkout(id,basket,'Cash','175.00',17500);
  assert result->>'ok'='true', 'Exact cash rejected';
  first_receipt := result->'receipt';
  assert (first_receipt->>'paid')::bigint=17500 and (first_receipt->>'change')::bigint=0, 'Exact cash change is not zero';
  result := public.kiosk_checkout(id,basket,'Cash','175.00',17500);
  assert result->'receipt'=first_receipt, 'Replay changed receipt';
  assert (select count(*) from public.orders)=baseline+1, 'Replay duplicated order';
  result := public.kiosk_checkout(id,basket,'Cash','200.00',17500);
  assert result->>'code'='REQUEST_CONFLICT', 'Changed replay accepted';
  result := public.kiosk_checkout(gen_random_uuid(),basket,'Cash','200.00',17500);
  assert (result->'receipt'->>'change')::bigint=2500, 'Overpayment change incorrect';
  foreach method in array array['QR Payment','Credit/Debit Card'] loop
    result := public.kiosk_checkout(gen_random_uuid(),basket,method,'0',17500);
    assert result->>'ok'='true', 'Simulated payment rejected';
    assert (result->'receipt'->>'paid')::bigint=17500 and (result->'receipt'->>'change')::bigint=0, 'Simulated totals wrong';
  end loop;
  result := public.kiosk_checkout(gen_random_uuid(),basket,'QR Payment',null,1);
  assert result->>'code'='TOTAL_CHANGED', 'Tampered total accepted';
  result := public.kiosk_checkout(gen_random_uuid(),'[]','Cash','175',17500);
  assert result->>'code'='INVALID_CART', 'Empty cart accepted';
  result := public.kiosk_checkout(gen_random_uuid(),'[{"id":"missing","qty":1}]','Cash','175',17500);
  assert result->>'code'='INVALID_CART', 'Unknown product accepted';
  result := public.kiosk_checkout(gen_random_uuid(),'[{"id":"coffee","qty":1000}]','Cash','175',17500);
  assert result->>'code'='INVALID_CART', 'Excessive quantity accepted';
  result := public.kiosk_checkout(gen_random_uuid(),'[{"id":"coffee","qty":-1}]','Cash','175',17500);
  assert result->>'code'='INVALID_CART', 'Negative quantity accepted';
  result := public.kiosk_checkout(gen_random_uuid(),'[{"id":"coffee","qty":1.5}]','Cash','175',17500);
  assert result->>'code'='INVALID_CART', 'Fractional quantity accepted';
  result := public.kiosk_checkout(gen_random_uuid(),'[{"id":"coffee"},{"id":"coffee","qty":1}]','Cash','175',17500);
  assert result->>'code'='INVALID_CART', 'Missing quantity accepted';
  result := public.kiosk_checkout(gen_random_uuid(),'[{"id":"coffee","qty":1},{"id":"coffee","qty":1}]','Cash','175',17500);
  assert result->>'code'='INVALID_CART', 'Duplicate products accepted';
  update public.products set name='Changed',price=6000,active=false where products.id='sandwich';
  result := public.kiosk_checkout(id,basket,'Cash','175.00',17500);
  assert result->'receipt'=first_receipt, 'Product edits changed saved receipt or replay';
  assert not has_table_privilege('anon','public.orders','select'), 'Public order read granted';
  assert not has_table_privilege('anon','public.order_items','insert'), 'Public item insert granted';
  assert not has_function_privilege('anon','public.kiosk_checkout(uuid,jsonb,text,text,bigint)','execute'), 'Public checkout RPC granted';
  assert not has_function_privilege('authenticated','public.kiosk_receipt(uuid)','execute'), 'Public receipt RPC granted';
  assert (select bool_and(relrowsecurity) from pg_class where oid in ('public.products'::regclass,'public.orders'::regclass,'public.order_items'::regclass)), 'RLS missing';
end $test$;
rollback;
select 'All database validation, receipt, replay, and security assertions passed; test writes rolled back.' as result;
