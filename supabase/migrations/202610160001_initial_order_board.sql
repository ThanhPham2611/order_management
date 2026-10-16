create extension if not exists pgcrypto;

create type public.order_status as enum (
  'new',
  'preparing',
  'delivering',
  'completed',
  'cancelled'
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no bigint generated always as identity unique,
  recipient_name text not null check (char_length(trim(recipient_name)) between 1 and 120),
  recipient_phone text check (recipient_phone is null or char_length(recipient_phone) <= 30),
  delivery_address text not null check (char_length(trim(delivery_address)) between 1 and 500),
  delivery_at timestamptz not null,
  status public.order_status not null default 'new',
  notes text check (notes is null or char_length(notes) <= 1000),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  quantity numeric(10, 2) not null check (quantity > 0 and quantity <= 99999),
  unit text check (unit is null or char_length(unit) <= 30),
  sort_order smallint not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);

create index orders_delivery_at_idx on public.orders (delivery_at);
create index orders_status_delivery_at_idx on public.orders (status, delivery_at);
create index order_items_order_id_sort_order_idx on public.order_items (order_id, sort_order);

create or replace function public.touch_order_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  new.version = old.version + 1;
  return new;
end;
$$;

create trigger orders_touch_version
before update on public.orders
for each row execute function public.touch_order_version();

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
    insert into public.order_items (order_id, name, quantity, unit, sort_order)
    values (
      v_order_id,
      trim(v_item->>'name'),
      (v_item->>'quantity')::numeric,
      nullif(trim(v_item->>'unit'), ''),
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
    insert into public.order_items (order_id, name, quantity, unit, sort_order)
    values (
      v_order_id,
      trim(v_item->>'name'),
      (v_item->>'quantity')::numeric,
      nullif(trim(v_item->>'unit'), ''),
      v_index
    );
    v_index := v_index + 1;
  end loop;

  return public.order_as_json(v_order_id);
end;
$$;

create or replace function public.set_order_status(
  p_id uuid,
  p_expected_version integer,
  p_status public.order_status
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
begin
  update public.orders
  set status = p_status
  where id = p_id and version = p_expected_version
  returning id into v_order_id;

  if v_order_id is null then
    if exists (select 1 from public.orders where id = p_id) then
      raise exception using errcode = 'P0001', message = 'ORDER_CONFLICT';
    end if;
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;

  return public.order_as_json(v_order_id);
end;
$$;

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "Public board can read orders"
on public.orders for select to anon, authenticated using (true);

create policy "Public board can read order items"
on public.order_items for select to anon, authenticated using (true);

revoke all on table public.orders from anon, authenticated;
revoke all on table public.order_items from anon, authenticated;
grant select on table public.orders, public.order_items to anon, authenticated;

revoke all on function public.order_as_json(uuid) from public, anon, authenticated;
revoke all on function public.validate_order_payload(jsonb) from public, anon, authenticated;
revoke all on function public.create_order(jsonb) from public;
revoke all on function public.update_order(uuid, integer, jsonb) from public;
revoke all on function public.set_order_status(uuid, integer, public.order_status) from public;
grant execute on function public.create_order(jsonb) to anon, authenticated;
grant execute on function public.update_order(uuid, integer, jsonb) to anon, authenticated;
grant execute on function public.set_order_status(uuid, integer, public.order_status) to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_items'
  ) then
    alter publication supabase_realtime add table public.order_items;
  end if;
end;
$$;

