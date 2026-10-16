-- Free-sample ("hàng tặng / ăn thử") orders: is_gift = true means the order total is 0 ₫ for money reports,
-- while the order itself and its quantities are still counted. Line prices are kept as a reference value.

begin;

alter table public.orders add column if not exists is_gift boolean not null default false;

create or replace function public.order_as_json(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', o.id,
    'order_no', o.order_no,
    'recipient_name', o.recipient_name,
    'recipient_phone', o.recipient_phone,
    'delivery_address', o.delivery_address,
    'delivery_at', o.delivery_at,
    'status', o.status,
    'notes', o.notes,
    'is_gift', o.is_gift,
    'version', o.version,
    'created_at', o.created_at,
    'updated_at', o.updated_at,
    'items', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'name', i.name,
          'quantity', i.quantity,
          'unit', i.unit,
          'unit_price', i.unit_price,
          'catalog_item_id', i.catalog_item_id,
          'sort_order', i.sort_order
        ) order by i.sort_order
      ) filter (where i.id is not null),
      '[]'::jsonb
    )
  )
  from public.orders o
  left join public.order_items i on i.order_id = o.id
  where o.id = p_order_id
  group by o.id;
$$;

create or replace function public.create_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_index integer := 0;
begin
  perform public.validate_order_payload(p_payload);

  insert into public.orders (
    recipient_name,
    recipient_phone,
    delivery_address,
    delivery_at,
    notes,
    is_gift
  ) values (
    trim(p_payload->>'recipient_name'),
    nullif(trim(p_payload->>'recipient_phone'), ''),
    trim(p_payload->>'delivery_address'),
    (p_payload->>'delivery_at')::timestamptz,
    nullif(trim(p_payload->>'notes'), ''),
    coalesce((p_payload->>'is_gift')::boolean, false)
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_payload->'items')
  loop
    insert into public.order_items (
      order_id, name, quantity, unit, unit_price, catalog_item_id, sort_order
    ) values (
      v_order_id,
      trim(v_item->>'name'),
      (v_item->>'quantity')::numeric,
      nullif(trim(v_item->>'unit'), ''),
      coalesce((v_item->>'unit_price')::numeric, 0),
      nullif(v_item->>'catalog_item_id', '')::uuid,
      v_index
    );
    v_index := v_index + 1;
  end loop;

  return public.order_as_json(v_order_id);
end;
$$;

create or replace function public.update_order(
  p_id uuid,
  p_expected_version integer,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_index integer := 0;
begin
  perform public.validate_order_payload(p_payload);

  update public.orders
  set recipient_name = trim(p_payload->>'recipient_name'),
      recipient_phone = nullif(trim(p_payload->>'recipient_phone'), ''),
      delivery_address = trim(p_payload->>'delivery_address'),
      delivery_at = (p_payload->>'delivery_at')::timestamptz,
      notes = nullif(trim(p_payload->>'notes'), ''),
      is_gift = coalesce((p_payload->>'is_gift')::boolean, false)
  where id = p_id and version = p_expected_version
  returning id into v_order_id;

  if v_order_id is null then
    if exists (select 1 from public.orders where id = p_id) then
      raise exception using errcode = 'P0001', message = 'ORDER_CONFLICT';
    end if;
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;

  delete from public.order_items where order_id = v_order_id;
  for v_item in select value from jsonb_array_elements(p_payload->'items')
  loop
    insert into public.order_items (
      order_id, name, quantity, unit, unit_price, catalog_item_id, sort_order
    ) values (
      v_order_id,
      trim(v_item->>'name'),
      (v_item->>'quantity')::numeric,
      nullif(trim(v_item->>'unit'), ''),
      coalesce((v_item->>'unit_price')::numeric, 0),
      nullif(v_item->>'catalog_item_id', '')::uuid,
      v_index
    );
    v_index := v_index + 1;
  end loop;

  return public.order_as_json(v_order_id);
end;
$$;

commit;
