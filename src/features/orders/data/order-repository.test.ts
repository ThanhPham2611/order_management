import { describe, expect, it } from "vitest";

import {
  OrderConflictError,
  mapOrderRow,
  serializeOrderInput,
  toOrderRepositoryError,
} from "./order-repository";

describe("order repository mapping", () => {
  it("maps snake_case database records and sorts items", () => {
    const order = mapOrderRow({
      id: "order-1",
      order_no: 42,
      recipient_name: "Lan",
      recipient_phone: null,
      delivery_address: "Quận 3",
      delivery_at: "2026-10-16T05:00:00.000Z",
      status: "delivered",
      notes: null,
      is_gift: true,
      version: 3,
      created_at: "2026-10-16T01:00:00.000Z",
      updated_at: "2026-10-16T02:00:00.000Z",
      order_items: [
        { id: "b", name: "Canh", quantity: "1.00", unit: "tô", sort_order: 1 },
        { id: "a", name: "Cơm", quantity: 2, unit: "phần", unit_price: "30000", catalog_item_id: "cat-1", sort_order: 0 },
      ],
    });

    expect(order.orderNo).toBe(42);
    expect(order.isGift).toBe(true);
    expect(order.items.map((item) => item.name)).toEqual(["Cơm", "Canh"]);
    expect(order.items[0].quantity).toBe(2);
    expect(order.items[0]).toMatchObject({ unitPrice: 30000, catalogItemId: "cat-1" });
    expect(order.items[1]).toMatchObject({ unitPrice: 0, catalogItemId: null });
  });

  it("serializes Vietnam local time as an absolute instant", () => {
    const payload = serializeOrderInput({
      recipientName: "Lan",
      recipientPhone: "",
      deliveryAddress: "Quận 3",
      deliveryAt: "2026-10-16T12:30",
      notes: "",
      isGift: true,
      items: [{ name: "Cơm", quantity: 2, unit: "phần", unitPrice: 30000, catalogItemId: "cat-1" }],
    });

    expect(payload.delivery_at).toBe("2026-10-16T05:30:00.000Z");
    expect(payload.recipient_phone).toBeNull();
    expect(payload.is_gift).toBe(true);
    expect(payload.items[0]).toMatchObject({ unit_price: 30000, catalog_item_id: "cat-1" });
  });

  it("turns a duplicate catalog name into a readable error", () => {
    expect(toOrderRepositoryError({ message: "CATALOG_NAME_EXISTS" }).message).toBe(
      "Vật phẩm này đã có trong danh mục.",
    );
  });

  it("turns an ORDER_CONFLICT database response into a typed error", () => {
    const error = toOrderRepositoryError({ message: "ORDER_CONFLICT" });

    expect(error).toBeInstanceOf(OrderConflictError);
  });
});
