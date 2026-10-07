create table public.customer_feedback (
  order_id uuid primary key references public.orders(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 500),
  created_at timestamptz not null default now()
);
alter table public.customer_feedback enable row level security;
revoke all on public.customer_feedback from public, anon, authenticated;
grant all on public.customer_feedback to service_role;

-- Only the backend can call this. A random receipt reference identifies the
-- completed transaction; one feedback row per order makes retries idempotent.
create function public.kiosk_feedback(p_transaction_number text, p_rating integer, p_comment text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_order_id uuid;
  v_existing public.customer_feedback%rowtype;
  v_comment text;
begin
  if p_transaction_number is null or
     p_transaction_number !~* '^TXN-[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' or
     p_rating is null or p_rating not between 1 and 5 or
     p_comment is null or char_length(p_comment) > 500 then
    return jsonb_build_object('ok',false,'code','INVALID_FEEDBACK','message','Choose a rating from 1 to 5 and a comment of at most 500 characters.');
  end if;
  v_comment := btrim(p_comment);
  -- The order row lock serializes concurrent submissions for the same receipt.
  select id into v_order_id from public.orders
    where transaction_number = upper(p_transaction_number) for update;
  if not found then
    return jsonb_build_object('ok',false,'code','ORDER_NOT_FOUND','message','This completed transaction could not be found.');
  end if;
  select * into v_existing from public.customer_feedback where order_id = v_order_id;
  if found then
    if v_existing.rating <> p_rating or v_existing.comment <> v_comment then
      return jsonb_build_object('ok',false,'code','FEEDBACK_CONFLICT','message','Feedback was already saved for this transaction. You can skip to start a new transaction.');
    end if;
  else
    insert into public.customer_feedback(order_id,rating,comment)
      values(v_order_id,p_rating,v_comment) returning * into v_existing;
  end if;
  return jsonb_build_object('ok',true,'feedback',jsonb_build_object(
    'transactionNumber',upper(p_transaction_number),'rating',v_existing.rating,
    'comment',v_existing.comment,'date',v_existing.created_at));
end;
$$;
revoke execute on function public.kiosk_feedback(text,integer,text) from public,anon,authenticated;
grant execute on function public.kiosk_feedback(text,integer,text) to service_role;
