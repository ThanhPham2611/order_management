import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";

import type {
  CatalogItem,
  CatalogItemInput,
  CatalogItemUpdate,
  Order,
  OrderInput,
  OrderStatus,
  OrderUnit,
} from "../domain/order";

interface OrderItemRow {
  id: string;
  name: string;
  quantity: number | string;
  unit: string | null;
  unit_price?: number | string;
  catalog_item_id?: string | null;
  sort_order: number;
}

export interface CatalogRow {
  id: string;
  name: string;
  price: number | string;
  unit: OrderUnit;
  active: boolean;
}

export interface OrderRow {
  id: string;
  order_no: number;
  recipient_name: string;
  recipient_phone: string | null;
  delivery_address: string;
  delivery_at: string;
  status: OrderStatus;
  notes: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  order_items?: OrderItemRow[];
  items?: OrderItemRow[];
}

interface OrderRpcPayload {
  recipient_name: string;
  recipient_phone: string | null;
  delivery_address: string;
  delivery_at: string;
  notes: string | null;
  items: Array<{
    name: string;
    quantity: number;
    unit: string | null;
    unit_price: number;
    catalog_item_id: string | null;
  }>;
}

export class OrderConflictError extends Error {
  constructor() {
    super("Đơn vừa được cập nhật ở thiết bị khác.");
    this.name = "OrderConflictError";
  }
}

export class OrderRepositoryError extends Error {
  constructor(message = "Không thể cập nhật đơn. Hãy thử lại.") {
    super(message);
    this.name = "OrderRepositoryError";
  }
}

export function mapOrderRow(row: OrderRow): Order {
  const itemRows = row.order_items ?? row.items ?? [];
  return {
    id: row.id,
    orderNo: Number(row.order_no),
    recipientName: row.recipient_name,
    recipientPhone: row.recipient_phone,
    deliveryAddress: row.delivery_address,
    deliveryAt: row.delivery_at,
    status: row.status,
    notes: row.notes,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: itemRows
      .map((item) => ({
        id: item.id,
        name: item.name,
        quantity: Number(item.quantity),
        unit: item.unit,
        unitPrice: Number(item.unit_price ?? 0),
        catalogItemId: item.catalog_item_id ?? null,
        sortOrder: item.sort_order,
      }))
      .sort((left, right) => left.sortOrder - right.sortOrder),
  };
}

export function serializeOrderInput(input: OrderInput): OrderRpcPayload {
  const hasExplicitOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(input.deliveryAt);
  const deliveryInstant = new Date(
    hasExplicitOffset ? input.deliveryAt : `${input.deliveryAt}:00+07:00`,
  );

  return {
    recipient_name: input.recipientName.trim(),
    recipient_phone: input.recipientPhone?.trim() || null,
    delivery_address: input.deliveryAddress.trim(),
    delivery_at: deliveryInstant.toISOString(),
    notes: input.notes?.trim() || null,
    items: input.items.map((item) => ({
      name: item.name.trim(),
      quantity: Number(item.quantity),
      unit: item.unit?.trim() || null,
      unit_price: Number(item.unitPrice ?? 0),
      catalog_item_id: item.catalogItemId || null,
    })),
  };
}

export function toOrderRepositoryError(error: { message?: string } | null): Error {
  if (error?.message?.includes("ORDER_CONFLICT")) return new OrderConflictError();
  if (error?.message?.includes("CATALOG_NAME_EXISTS")) {
    return new OrderRepositoryError("Vật phẩm này đã có trong danh mục.");
  }
  if (error?.message?.includes("ORDER_NOT_FOUND") || error?.message?.includes("CATALOG_NOT_FOUND")) {
    return new OrderRepositoryError("Không tìm thấy đơn này. Dữ liệu đã được tải lại.");
  }
  return new OrderRepositoryError();
}

let browserClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new OrderRepositoryError("Supabase chưa được cấu hình cho môi trường này.");
  }
  browserClient = createClient(url, key);
  return browserClient;
}

function unwrapRpcOrder(data: unknown): Order {
  return mapOrderRow(data as OrderRow);
}

export async function fetchOrders(): Promise<Order[]> {
  const client = getSupabaseBrowserClient();
  const { data, error } = await client
    .from("orders")
    .select(
      "id, order_no, recipient_name, recipient_phone, delivery_address, delivery_at, status, notes, version, created_at, updated_at, order_items(id, name, quantity, unit, unit_price, catalog_item_id, sort_order)",
    )
    .order("delivery_at", { ascending: true });
  if (error) throw toOrderRepositoryError(error);
  return (data as OrderRow[]).map(mapOrderRow);
}

export async function createOrder(input: OrderInput): Promise<Order> {
  const { data, error } = await getSupabaseBrowserClient().rpc("create_order", {
    p_payload: serializeOrderInput(input),
  });
  if (error) throw toOrderRepositoryError(error);
  return unwrapRpcOrder(data);
}

export async function updateOrder(
  order: Pick<Order, "id" | "version">,
  input: OrderInput,
): Promise<Order> {
  const { data, error } = await getSupabaseBrowserClient().rpc("update_order", {
    p_id: order.id,
    p_expected_version: order.version,
    p_payload: serializeOrderInput(input),
  });
  if (error) throw toOrderRepositoryError(error);
  return unwrapRpcOrder(data);
}

export async function setOrderStatus(
  order: Pick<Order, "id" | "version">,
  status: OrderStatus,
): Promise<Order> {
  const { data, error } = await getSupabaseBrowserClient().rpc("set_order_status", {
    p_id: order.id,
    p_expected_version: order.version,
    p_status: status,
  });
  if (error) throw toOrderRepositoryError(error);
  return unwrapRpcOrder(data);
}

export function mapCatalogRow(row: CatalogRow): CatalogItem {
  return { id: row.id, name: row.name, price: Number(row.price), unit: row.unit, active: row.active };
}

export async function fetchCatalog(): Promise<CatalogItem[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("catalog_items")
    .select("id, name, price, unit, active")
    .order("name", { ascending: true });
  if (error) throw toOrderRepositoryError(error);
  return (data as CatalogRow[]).map(mapCatalogRow);
}

export async function createCatalogItem(input: CatalogItemInput): Promise<CatalogItem> {
  const { data, error } = await getSupabaseBrowserClient().rpc("create_catalog_item", {
    p_payload: input,
  });
  if (error) throw toOrderRepositoryError(error);
  return mapCatalogRow(data as CatalogRow);
}

export async function updateCatalogItem(id: string, input: CatalogItemUpdate): Promise<CatalogItem> {
  const { data, error } = await getSupabaseBrowserClient().rpc("update_catalog_item", {
    p_id: id,
    p_payload: input,
  });
  if (error) throw toOrderRepositoryError(error);
  return mapCatalogRow(data as CatalogRow);
}

export function subscribeToOrders(onChange: () => void): () => void {
  const client = getSupabaseBrowserClient();
  const channel: RealtimeChannel = client
    .channel("order-board")
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "catalog_items" }, onChange)
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
