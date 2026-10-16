import { z } from "zod";

export const ORDER_STATUSES = [
  "new",
  "delivered",
  "paid",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type DeliveryUrgency = "overdue" | "due-soon" | "scheduled" | "settled";

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  /** Price per unit at the time the order was saved (VND). */
  unitPrice: number;
  catalogItemId: string | null;
  sortOrder: number;
}

export interface CatalogItem {
  id: string;
  name: string;
  price: number;
  unit: OrderUnit;
  active: boolean;
}

export interface Order {
  id: string;
  orderNo: number;
  recipientName: string;
  recipientPhone: string | null;
  deliveryAddress: string;
  deliveryAt: string;
  status: OrderStatus;
  notes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

export const ORDER_UNITS = ["cái", "hộp", "chiếc"] as const;
export type OrderUnit = (typeof ORDER_UNITS)[number];
export const DEFAULT_UNIT: OrderUnit = ORDER_UNITS[0];

const MAX_PRICE = 1_000_000_000;

export const catalogItemInputSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên vật phẩm").max(120, "Tên vật phẩm tối đa 120 ký tự"),
  price: z.number("Nhập giá").int("Giá phải là số nguyên").min(0, "Giá không được âm").max(MAX_PRICE),
  unit: z.enum(ORDER_UNITS),
});
export type CatalogItemInput = z.infer<typeof catalogItemInputSchema>;
export type CatalogItemUpdate = CatalogItemInput & { active: boolean };

export function orderTotal(order: Pick<Order, "items">): number {
  return order.items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitPrice), 0);
}

/** Dashboard counters. Cancelled orders are ignored; "unpaid" = new + delivered. */
export function summarizeOrders(orders: Order[]) {
  const summary = { toDeliver: 0, delivered: 0, paid: 0, unpaidAmount: 0, paidAmount: 0 };
  for (const order of orders) {
    if (order.status === "cancelled") continue;
    summary[order.status === "new" ? "toDeliver" : order.status] += 1;
    summary[order.status === "paid" ? "paidAmount" : "unpaidAmount"] += orderTotal(order);
  }
  return summary;
}

/** Total quantity per unit; the fixed units always appear (even at 0), legacy/other units only when present. */
export function summarizeUnits(orders: Order[]): Array<{ unit: string; total: number }> {
  const totals = new Map<string, number>(ORDER_UNITS.map((unit) => [unit, 0]));
  for (const { items } of orders) {
    for (const item of items) {
      const unit = item.unit?.trim() || "Khác";
      totals.set(unit, (totals.get(unit) ?? 0) + item.quantity);
    }
  }
  return [...totals].filter(([unit, total]) => total > 0 || (ORDER_UNITS as readonly string[]).includes(unit))
    .map(([unit, total]) => ({ unit, total }));
}

export const orderItemInputSchema = z.object({
  name: z.string().trim().min(1, "Chọn món").max(120, "Tên món tối đa 120 ký tự"),
  quantity: z.coerce.number().positive("Số lượng phải lớn hơn 0").max(99_999),
  unit: z.string().trim().max(30, "Đơn vị tối đa 30 ký tự").optional().or(z.literal("")),
  unitPrice: z.number().min(0).max(MAX_PRICE).default(0),
  catalogItemId: z.string().optional().or(z.literal("")),
});

export const orderInputSchema = z.object({
  recipientName: z
    .string()
    .trim()
    .min(1, "Nhập tên người nhận")
    .max(120, "Tên người nhận tối đa 120 ký tự"),
  recipientPhone: z
    .string()
    .trim()
    .max(30, "Số điện thoại tối đa 30 ký tự")
    .optional()
    .or(z.literal("")),
  deliveryAddress: z
    .string()
    .trim()
    .min(1, "Nhập địa chỉ giao")
    .max(500, "Địa chỉ tối đa 500 ký tự"),
  deliveryAt: z.string().min(1, "Chọn ngày giờ giao"),
  notes: z.string().trim().max(1_000, "Ghi chú tối đa 1.000 ký tự").optional().or(z.literal("")),
  items: z.array(orderItemInputSchema).min(1, "Thêm ít nhất một món").max(50),
});

export type OrderInput = z.infer<typeof orderInputSchema>;

// paid/cancelled orders need no further action; delivered-but-unpaid orders stay visible until paid
const SETTLED_STATUSES = new Set<OrderStatus>(["paid", "cancelled"]);
const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";

export function getDeliveryUrgency(order: Order, now = new Date()): DeliveryUrgency {
  if (order.status !== "new") return "settled"; // only undelivered orders are urgent

  const minutesUntilDelivery = (new Date(order.deliveryAt).getTime() - now.getTime()) / 60_000;
  if (minutesUntilDelivery < 0) return "overdue";
  if (minutesUntilDelivery <= 60) return "due-soon";
  return "scheduled";
}

function localDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VIETNAM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function shouldShowInDefaultWindow(order: Order, now = new Date()): boolean {
  const delivery = new Date(order.deliveryAt);
  const isToday = localDateKey(delivery) === localDateKey(now);
  const isUnfinishedOverdue = delivery < now && !SETTLED_STATUSES.has(order.status);
  // An order settled today stays on the board even if its delivery slot was another day.
  const isSettledToday =
    SETTLED_STATUSES.has(order.status) && localDateKey(new Date(order.updatedAt)) === localDateKey(now);
  return isToday || isUnfinishedOverdue || isSettledToday;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi")
    .trim();
}

export function filterOrders(orders: Order[], query: string): Order[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return orders;

  return orders.filter((order) => {
    const searchable = [
      `#${order.orderNo}`,
      String(order.orderNo),
      order.recipientName,
      order.recipientPhone ?? "",
      order.deliveryAddress,
      order.notes ?? "",
      ...order.items.map((item) => item.name),
    ]
      .map(normalizeSearchText)
      .join(" ");
    return searchable.includes(normalizedQuery);
  });
}

export function sortOrdersByDelivery(orders: Order[]): Order[] {
  return [...orders].sort(
    (left, right) => new Date(left.deliveryAt).getTime() - new Date(right.deliveryAt).getTime(),
  );
}
