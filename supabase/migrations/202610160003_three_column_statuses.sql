-- Board now has three columns: new (Mới nhận) -> delivered (Đã giao) -> paid (Nhận tiền); cancelled is kept.
-- Existing data: preparing -> new, delivering -> delivered, completed -> paid.
-- Postgres cannot drop enum values, so the type is rebuilt. Order versions are not bumped (ALTER does not fire triggers).
-- Safe to re-run: it recovers from a half-applied earlier attempt and does nothing harmful once finished.

begin;

-- "if exists" also skips (with a notice) when the type itself is already gone.
drop function if exists public.set_order_status(uuid, integer, public.order_status);
drop function if exists public.set_order_status(uuid, integer, public.order_status_old);

do $$
begin
  -- Old-style enum still under the real name -> park it so the new one can take the name.
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'order_status'
      and not exists (
        select 1 from pg_enum e where e.enumtypid = t.oid and e.enumlabel = 'paid'
      )
  ) then
    alter type public.order_status rename to order_status_old;
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'order_status'
  ) then
    create type public.order_status as enum ('new', 'delivered', 'paid', 'cancelled');
  end if;
end;
$$;

alter table public.orders alter column status drop default;
alter table public.orders
  alter column status type public.order_status
  using (
    case status::text
      when 'preparing' then 'new'
      when 'delivering' then 'delivered'
      when 'completed' then 'paid'
      else status::text
    end
  )::public.order_status;
alter table public.orders alter column status set default 'new';

drop type if exists public.order_status_old;

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

revoke all on function public.set_order_status(uuid, integer, public.order_status) from public;
grant execute on function public.set_order_status(uuid, integer, public.order_status) to anon, authenticated;

commit;
