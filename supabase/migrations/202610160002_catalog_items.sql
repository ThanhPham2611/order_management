-- Catalog of items (name, unit price, unit) + per-line price snapshot on order_items.

create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  price numeric(12, 0) not null default 0 check (price >= 0 and price <= 1000000000),
  unit text not null default 'cái' check (unit in ('cái', 'hộp', 'chiếc')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index catalog_items_name_key on public.catalog_items (lower(trim(name)));

-- unit_price is a snapshot taken when the order is saved; later catalog price changes never touch old orders.
-- Existing lines (free-text names) get price 0.
alter table public.order_items
  add column catalog_item_id uuid references public.catalog_items(id) on delete set null,
  add column unit_price numeric(12, 0) not null default 0
    check (unit_price >= 0 and unit_price <= 1000000000);

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

create or replace function public.validate_order_payload(p_payload jsonb)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
begin
  if nullif(trim(p_payload->>'recipient_name'), '') is null then
    raise exception using errcode = '22023', message = 'RECIPIENT_NAME_REQUIRED';
  end if;
  if nullif(trim(p_payload->>'delivery_address'), '') is null then
    raise exception using errcode = '22023', message = 'DELIVERY_ADDRESS_REQUIRED';
  end if;
  if nullif(p_payload->>'delivery_at', '') is null then
    raise exception using errcode = '22023', message = 'DELIVERY_AT_REQUIRED';
  end if;
  if jsonb_typeof(p_payload->'items') is distinct from 'array'
    or jsonb_array_length(p_payload->'items') = 0 then
    raise exception using errcode = '22023', message = 'ORDER_ITEMS_REQUIRED';
  end if;
  if jsonb_array_length(p_payload->'items') > 50 then
    raise exception using errcode = '22023', message = 'TOO_MANY_ORDER_ITEMS';
  end if;

  for v_item in select value from jsonb_array_elements(p_payload->'items')
  loop
    if nullif(trim(v_item->>'name'), '') is null then
      raise exception using errcode = '22023', message = 'ITEM_NAME_REQUIRED';
    end if;
    if coalesce((v_item->>'quantity')::numeric, 0) <= 0 then
      raise exception using errcode = '22023', message = 'ITEM_QUANTITY_INVALID';
    end if;
    if coalesce((v_item->>'unit_price')::numeric, 0) < 0 then
      raise exception using errcode = '22023', message = 'ITEM_PRICE_INVALID';
    end if;
  end loop;
end;
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
    notes
  ) values (
    trim(p_payload->>'recipient_name'),
    nullif(trim(p_payload->>'recipient_phone'), ''),
    trim(p_payload->>'delivery_address'),
    (p_payload->>'delivery_at')::timestamptz,
    nullif(trim(p_payload->>'notes'), '')
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
      notes = nullif(trim(p_payload->>'notes'), '')
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

create or replace function public.validate_catalog_payload(p_payload jsonb)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if nullif(trim(p_payload->>'name'), '') is null then
    raise exception using errcode = '22023', message = 'CATALOG_NAME_REQUIRED';
  end if;
  if coalesce((p_payload->>'price')::numeric, -1) < 0 then
    raise exception using errcode = '22023', message = 'CATALOG_PRICE_INVALID';
  end if;
  if p_payload->>'unit' is null or p_payload->>'unit' not in ('cái', 'hộp', 'chiếc') then
    raise exception using errcode = '22023', message = 'CATALOG_UNIT_INVALID';
  end if;
end;
$$;

create or replace function public.create_catalog_item(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  perform public.validate_catalog_payload(p_payload);

  if exists (
    select 1 from public.catalog_items
    where lower(trim(name)) = lower(trim(p_payload->>'name'))
  ) then
    raise exception using errcode = 'P0001', message = 'CATALOG_NAME_EXISTS';
  end if;

  insert into public.catalog_items (name, price, unit)
  values (trim(p_payload->>'name'), (p_payload->>'price')::numeric, p_payload->>'unit')
  returning id into v_id;

  return (select to_jsonb(c) from public.catalog_items c where c.id = v_id);
end;
$$;

create or replace function public.update_catalog_item(p_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  perform public.validate_catalog_payload(p_payload);

  if exists (
    select 1 from public.catalog_items
    where lower(trim(name)) = lower(trim(p_payload->>'name')) and id <> p_id
  ) then
    raise exception using errcode = 'P0001', message = 'CATALOG_NAME_EXISTS';
  end if;

  update public.catalog_items
  set name = trim(p_payload->>'name'),
      price = (p_payload->>'price')::numeric,
      unit = p_payload->>'unit',
      active = coalesce((p_payload->>'active')::boolean, active),
      updated_at = now()
  where id = p_id
  returning id into v_id;

  if v_id is null then
    raise exception using errcode = 'P0002', message = 'CATALOG_NOT_FOUND';
  end if;

  return (select to_jsonb(c) from public.catalog_items c where c.id = v_id);
end;
$$;

alter table public.catalog_items enable row level security;

create policy "Public board can read catalog items"
on public.catalog_items for select to anon, authenticated using (true);

revoke all on table public.catalog_items from anon, authenticated;
grant select on table public.catalog_items to anon, authenticated;

revoke all on function public.validate_catalog_payload(jsonb) from public, anon, authenticated;
revoke all on function public.create_catalog_item(jsonb) from public;
revoke all on function public.update_catalog_item(uuid, jsonb) from public;
grant execute on function public.create_catalog_item(jsonb) to anon, authenticated;
grant execute on function public.update_catalog_item(uuid, jsonb) to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'catalog_items'
  ) then
    alter publication supabase_realtime add table public.catalog_items;
  end if;
end;
$$;
