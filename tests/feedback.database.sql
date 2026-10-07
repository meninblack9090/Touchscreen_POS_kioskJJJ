begin;
do $$
declare
  v_order jsonb;
  v_ref text;
  v_first jsonb;
  v_retry jsonb;
  v_role text;
begin
  v_order := public.kiosk_checkout(gen_random_uuid(),'[{"id":"coffee","qty":1}]'::jsonb,'Cash','45.00',4500);
  assert (v_order->>'ok')::boolean, 'Test order failed';
  v_ref := v_order->'receipt'->>'number';
  assert public.kiosk_feedback(v_ref,0,'')->>'code' = 'INVALID_FEEDBACK';
  assert public.kiosk_feedback(v_ref,6,'')->>'code' = 'INVALID_FEEDBACK';
  assert public.kiosk_feedback(v_ref,null,'')->>'code' = 'INVALID_FEEDBACK';
  assert public.kiosk_feedback(v_ref,5,repeat('x',501))->>'code' = 'INVALID_FEEDBACK';
  assert public.kiosk_feedback('TXN-'||gen_random_uuid()::text,5,'')->>'code' = 'ORDER_NOT_FOUND';
  v_first := public.kiosk_feedback(v_ref,5,' Helpful kiosk! ');
  assert (v_first->>'ok')::boolean;
  assert v_first->'feedback'->>'comment' = 'Helpful kiosk!';
  v_retry := public.kiosk_feedback(v_ref,5,'Helpful kiosk!');
  assert v_first = v_retry, 'Retry changed saved feedback';
  assert public.kiosk_feedback(v_ref,4,'Helpful kiosk!')->>'code' = 'FEEDBACK_CONFLICT';
  assert (select count(*) from public.customer_feedback f join public.orders o on o.id=f.order_id where o.transaction_number=v_ref) = 1;
  v_order := public.kiosk_checkout(gen_random_uuid(),'[{"id":"coffee","qty":1}]'::jsonb,'Cash','45.00',4500);
  v_ref := v_order->'receipt'->>'number';
  assert (public.kiosk_feedback(v_ref,1,'')->>'ok')::boolean, 'Optional empty comment rejected';
  v_order := public.kiosk_checkout(gen_random_uuid(),'[{"id":"coffee","qty":1}]'::jsonb,'Cash','45.00',4500);
  v_ref := v_order->'receipt'->>'number';
  assert (public.kiosk_feedback(v_ref,3,repeat('x',500))->>'ok')::boolean, '500 character comment rejected';
  foreach v_role in array array['anon','authenticated'] loop
    assert not has_table_privilege(v_role,'public.customer_feedback','SELECT,INSERT,UPDATE,DELETE');
    assert not has_function_privilege(v_role,'public.kiosk_feedback(text,integer,text)','EXECUTE');
  end loop;
  assert (select relrowsecurity from pg_class where oid='public.customer_feedback'::regclass);
end $$;
rollback;
