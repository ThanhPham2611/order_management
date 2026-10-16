import { describe, expect, it } from "vitest";

import {
  filterOrders,
  itemKey,
  onlyItem,
  orderHasItem,
  suggestAddresses,
  getDeliveryUrgency,
  orderInputSchema,
  shouldShowInDefaultWindow,
  orderTotal,
  summarizeOrders,
  summarizeQuantities,
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
  isGift: false,
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

describe("summarizeQuantities", () => {
  const item = (quantity: number, unit: string | null) => ({
    id: "i", name: "x", quantity, unit, unitPrice: 0, catalogItemId: null, sortOrder: 0,
  });
  const order = (status: Order["status"], isGift: boolean, ...items: ReturnType<typeof item>[]): Order => ({
    ...baseOrder, status, isGift, items,
  });

  it("splits each unit by column and bought/gift, with a grand total", () => {
    const rows = summarizeQuantities([
      order("new", false, item(2, "hộp"), item(1, "cái")),
      order("new", true, item(3, "hộp")),
      order("delivered", false, item(4, "hộp")),
      order("paid", true, item(1.5, "hộp")),
      order("cancelled", false, item(99, "hộp")),
    ]);
    const hop = rows.find((row) => row.unit === "hộp")!;

    expect(hop.byStatus.new).toEqual({ bought: 2, gift: 3 });
    expect(hop.byStatus.delivered).toEqual({ bought: 4, gift: 0 });
    expect(hop.byStatus.paid).toEqual({ bought: 0, gift: 1.5 });
    expect(hop.total).toEqual({ bought: 6, gift: 4.5 });
    expect(rows.find((row) => row.unit === "cái")!.total).toEqual({ bought: 1, gift: 0 });
  });

  it("keeps the fixed units at 0 and surfaces legacy or missing units only when present", () => {
    expect(summarizeQuantities([]).map((row) => row.unit)).toEqual(["cái", "hộp", "chiếc"]);
    const units = summarizeQuantities([order("new", false, item(4, "phần"), item(1, null))]).map((row) => row.unit);
    expect(units).toEqual(["cái", "hộp", "chiếc", "phần", "Khác"]);
  });
});

describe("item filter helpers", () => {
  const mixed: Order = {
    ...baseOrder,
    items: [
      { id: "a", name: "Cơm gà", quantity: 2, unit: "hộp", unitPrice: 0, catalogItemId: null, sortOrder: 0 },
      { id: "b", name: "Trà tắc", quantity: 1, unit: "cái", unitPrice: 0, catalogItemId: null, sortOrder: 1 },
    ],
  };

  it("matches an item by trimmed, case-insensitive name and can reduce an order to that item", () => {
    expect(orderHasItem(mixed, itemKey("  trà TẮC "))).toBe(true);
    expect(orderHasItem(mixed, itemKey("Bún bò"))).toBe(false);
    expect(onlyItem(mixed, itemKey("Cơm gà")).items.map((item) => item.name)).toEqual(["Cơm gà"]);
  });
});

describe("suggestAddresses", () => {
  const order = (id: string, address: string, createdAt: string, name = "An"): Order => ({
    ...baseOrder, id, deliveryAddress: address, createdAt, recipientName: name,
  });
  const history = [
    order("1", "12 Nguyễn Huệ, Quận 1", "2026-10-01T00:00:00Z", "Cũ"),
    order("2", "12 Nguyễn Huệ, Quận 1", "2026-10-10T00:00:00Z", "Mới"),
    order("3", "45 Lê Lợi, Quận 1", "2026-10-05T00:00:00Z"),
  ];

  it("matches accent-insensitively on every typed word and dedupes, newest first", () => {
    const hits = suggestAddresses(history, "nguyen hue quan 1");
    expect(hits).toEqual([{ address: "12 Nguyễn Huệ, Quận 1", recipientName: "Mới", recipientPhone: "0901234567" }]);
    expect(suggestAddresses(history, "quan 1").map((hit) => hit.address)).toEqual([
      "12 Nguyễn Huệ, Quận 1",
      "45 Lê Lợi, Quận 1",
    ]);
  });

  it("stays quiet for short input and for an address that is already fully typed", () => {
    expect(suggestAddresses(history, "n")).toEqual([]);
    expect(suggestAddresses(history, "12 nguyen hue, quan 1")).toEqual([]);
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

  it("makes a gift order cost 0 but still counts it and its quantities", () => {
    const gift = { ...order("new", line(4, 50_000)), isGift: true };
    expect(orderTotal(gift)).toBe(0);
    expect(summarizeOrders([gift, order("new", line(1, 10_000))])).toMatchObject({
      toDeliver: 2,
      gifts: 1,
      unpaidAmount: 10_000,
    });
    expect(summarizeQuantities([gift]).find((row) => row.unit === "hộp")!.total).toEqual({ bought: 0, gift: 4 });
  });

  it("counts per column, splits unpaid/paid money and ignores cancelled orders", () => {
    expect(
      summarizeOrders([
        order("new", line(1, 10_000)),
        order("delivered", line(2, 20_000)),
        order("paid", line(3, 5_000)),
        order("cancelled", line(9, 99_000)),
      ]),
    ).toEqual({ toDeliver: 1, delivered: 1, paid: 1, gifts: 0, unpaidAmount: 50_000, paidAmount: 15_000 });
  });
});
