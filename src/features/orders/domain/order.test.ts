import { describe, expect, it } from "vitest";

import {
  filterOrders,
  getDeliveryUrgency,
  orderInputSchema,
  shouldShowInDefaultWindow,
  orderTotal,
  summarizeOrders,
  summarizeUnits,
  type Order,
} from "./order";

const baseOrder: Order = {
  id: "4ad535d4-d9c2-4a4a-a8bc-c66d405d09c2",
  orderNo: 1024,
  recipientName: "Nguyễn Minh An",
  recipientPhone: "0901234567",
  deliveryAddress: "12 Nguyễn Huệ, Quận 1",
  deliveryAt: "2026-10-16T04:30:00.000Z",
  status: "new",
  notes: "Gọi trước khi giao",
  version: 1,
  createdAt: "2026-10-16T02:00:00.000Z",
  updatedAt: "2026-10-16T02:00:00.000Z",
  items: [{ id: "item-1", name: "Cơm gà", quantity: 2, unit: "phần", unitPrice: 30_000, catalogItemId: null, sortOrder: 0 }],
};

describe("orderInputSchema", () => {
  it("accepts a complete order with multiple valid items", () => {
    const result = orderInputSchema.safeParse({
      recipientName: "Nguyễn Minh An",
      recipientPhone: "0901234567",
      deliveryAddress: "12 Nguyễn Huệ, Quận 1",
      deliveryAt: "2026-10-16T11:30",
      notes: "Gọi trước khi giao",
      items: [
        { name: "Cơm gà", quantity: 2, unit: "phần" },
        { name: "Trà tắc", quantity: 1, unit: "ly" },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects an order without an item and quantities that are not positive", () => {
    const noItems = orderInputSchema.safeParse({
      recipientName: "An",
      deliveryAddress: "Quận 1",
      deliveryAt: "2026-10-16T11:30",
      items: [],
    });
    const invalidQuantity = orderInputSchema.safeParse({
      recipientName: "An",
      deliveryAddress: "Quận 1",
      deliveryAt: "2026-10-16T11:30",
      items: [{ name: "Cơm", quantity: 0 }],
    });

    expect(noItems.success).toBe(false);
    expect(invalidQuantity.success).toBe(false);
  });
});

describe("getDeliveryUrgency", () => {
  const now = new Date("2026-10-16T04:00:00.000Z");

  it("marks unfinished past deliveries as overdue", () => {
    expect(
      getDeliveryUrgency({ ...baseOrder, deliveryAt: "2026-10-16T03:59:00.000Z" }, now),
    ).toBe("overdue");
  });

  it("marks deliveries within the next hour as due soon", () => {
    expect(getDeliveryUrgency(baseOrder, now)).toBe("due-soon");
  });

  it("does not mark delivered or paid orders as overdue", () => {
    expect(
      getDeliveryUrgency(
        { ...baseOrder, status: "paid", deliveryAt: "2026-10-16T03:00:00.000Z" },
        now,
      ),
    ).toBe("settled");
  });
});

describe("order visibility and filtering", () => {
  const now = new Date("2026-10-16T04:00:00.000Z");

  it("shows today's orders and unfinished overdue orders by default", () => {
    expect(shouldShowInDefaultWindow(baseOrder, now)).toBe(true);
    expect(
      shouldShowInDefaultWindow(
        { ...baseOrder, deliveryAt: "2026-10-15T02:00:00.000Z", status: "delivered" },
        now,
      ),
    ).toBe(true);
    expect(
      shouldShowInDefaultWindow(
        {
          ...baseOrder,
          deliveryAt: "2026-10-15T02:00:00.000Z",
          updatedAt: "2026-10-15T03:00:00.000Z",
          status: "paid",
        },
        now,
      ),
    ).toBe(false);
    // paid today (even for another day's delivery) must not vanish from the board
    expect(
      shouldShowInDefaultWindow(
        { ...baseOrder, deliveryAt: "2026-10-15T02:00:00.000Z", status: "paid" },
        now,
      ),
    ).toBe(true);
  });

  it("searches Vietnamese text without requiring matching accents", () => {
    expect(filterOrders([baseOrder], "nguyen hue")).toEqual([baseOrder]);
    expect(filterOrders([baseOrder], "tra sua")).toEqual([]);
    expect(filterOrders([baseOrder], "com ga")).toEqual([baseOrder]);
  });
});

describe("summarizeUnits", () => {
  it("totals per unit across orders, keeps fixed units at 0 and surfaces legacy/missing units", () => {
    const item = (quantity: number, unit: string | null) => ({
      id: "i", name: "x", quantity, unit, unitPrice: 0, catalogItemId: null, sortOrder: 0,
    });
    const orders = [
      { ...baseOrder, items: [item(2, "cái"), item(1.5, "hộp")] },
      { ...baseOrder, items: [item(3, "cái"), item(4, "phần"), item(1, null)] },
    ];
    expect(summarizeUnits(orders)).toEqual([
      { unit: "cái", total: 5 },
      { unit: "hộp", total: 1.5 },
      { unit: "chiếc", total: 0 },
      { unit: "phần", total: 4 },
      { unit: "Khác", total: 1 },
    ]);
  });
});

describe("order totals", () => {
  const line = (quantity: number, unitPrice: number) => ({
    id: "i", name: "x", quantity, unit: "hộp", unitPrice, catalogItemId: null, sortOrder: 0,
  });
  const order = (status: Order["status"], ...items: ReturnType<typeof line>[]): Order => ({
    ...baseOrder, status, items,
  });

  it("multiplies quantity by the saved unit price", () => {
    expect(orderTotal(order("new", line(2, 45_000), line(1.5, 10_000)))).toBe(105_000);
  });

  it("counts per column, splits unpaid/paid money and ignores cancelled orders", () => {
    expect(
      summarizeOrders([
        order("new", line(1, 10_000)),
        order("delivered", line(2, 20_000)),
        order("paid", line(3, 5_000)),
        order("cancelled", line(9, 99_000)),
      ]),
    ).toEqual({ toDeliver: 1, delivered: 1, paid: 1, unpaidAmount: 50_000, paidAmount: 15_000 });
  });
});
