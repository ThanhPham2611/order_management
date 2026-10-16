import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve("supabase/migrations/202610160001_initial_order_board.sql");

describe("order board migration security contract", () => {
  it("defines the tables, optimistic versioning, and three mutation RPCs", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(/create table public\.orders/i);
    expect(sql).toMatch(/create table public\.order_items/i);
    expect(sql).toMatch(/version integer not null default 1/i);
    expect(sql).toMatch(/create or replace function public\.create_order/i);
    expect(sql).toMatch(/create or replace function public\.update_order/i);
    expect(sql).toMatch(/create or replace function public\.set_order_status/i);
    expect(sql).toContain("ORDER_CONFLICT");
  });

  it("allows anonymous reads but routes anonymous writes through RPCs", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/revoke all on table public\.orders from anon/i);
    expect(sql).toMatch(/grant select on table public\.orders, public\.order_items to anon/i);
    expect(sql).toMatch(/grant execute on function public\.create_order\(jsonb\) to anon/i);
    expect(sql).toMatch(/alter publication supabase_realtime add table public\.orders/i);
  });
});

describe("catalog migration contract", () => {
  const sql = readFileSync(resolve("supabase/migrations/202610160002_catalog_items.sql"), "utf8");

  it("snapshots price on order lines and keeps catalog writes behind RPCs", () => {
    expect(sql).toMatch(/create table public\.catalog_items/i);
    expect(sql).toMatch(/add column unit_price numeric/i);
    expect(sql).toMatch(/revoke all on table public\.catalog_items from anon/i);
    expect(sql).toMatch(/grant select on table public\.catalog_items to anon/i);
    expect(sql).toMatch(/grant execute on function public\.create_catalog_item\(jsonb\) to anon/i);
    expect(sql).toMatch(/alter publication supabase_realtime add table public\.catalog_items/i);
    expect(sql).toContain("CATALOG_NAME_EXISTS");
  });
});

describe("three-column status migration contract", () => {
  const sql = readFileSync(resolve("supabase/migrations/202610160003_three_column_statuses.sql"), "utf8");

  it("rebuilds the enum, maps old values and re-grants the status RPC", () => {
    expect(sql).toMatch(/create type public\.order_status as enum \('new', 'delivered', 'paid', 'cancelled'\)/i);
    expect(sql).toMatch(/when 'preparing' then 'new'/i);
    expect(sql).toMatch(/when 'delivering' then 'delivered'/i);
    expect(sql).toMatch(/when 'completed' then 'paid'/i);
    expect(sql).toMatch(/grant execute on function public\.set_order_status\(uuid, integer, public\.order_status\) to anon/i);
  });
});
