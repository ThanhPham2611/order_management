begin;
select plan(10);

select has_table('public', 'orders', 'orders table exists');
select has_table('public', 'order_items', 'order_items table exists');
select has_table('public', 'catalog_items', 'catalog_items table exists');
select has_function('public', 'create_order', array['jsonb'], 'create_order RPC exists');
select has_function(
  'public',
  'update_order',
  array['uuid', 'integer', 'jsonb'],
  'update_order RPC exists'
);
select has_function(
  'public',
  'set_order_status',
  array['uuid', 'integer', 'order_status'],
  'set_order_status RPC exists'
);

set local role anon;
select lives_ok(
  $$ select count(*) from public.orders $$,
  'anonymous users can read orders'
);
select throws_ok(
  $$ insert into public.orders (recipient_name, delivery_address, delivery_at)
     values ('Test', 'Test address', now()) $$,
  '42501',
  null,
  'anonymous users cannot insert orders directly'
);
select lives_ok(
  $$ select public.create_order(
    '{"recipient_name":"Test","delivery_address":"Test address","delivery_at":"2026-10-16T12:00:00+07:00","items":[{"name":"Cơm","quantity":1}]}'::jsonb
  ) $$,
  'anonymous users can create through the validated RPC'
);

select lives_ok(
  $$ select public.create_catalog_item('{"name":"Test item","price":1000,"unit":"hộp"}'::jsonb) $$,
  'anonymous users can create catalog items through the validated RPC'
);

select * from finish();
rollback;
