import type { CatalogItem, Order, OrderInput, OrderItem, OrderStatus } from "../domain/order";
import {
  createCatalogItem,
  createOrder,
  fetchCatalog,
  fetchOrders,
  isSupabaseConfigured,
  setOrderStatus,
  subscribeToOrders,
  updateCatalogItem,
  updateOrder,
} from "./order-repository";
import type { OrderRepository } from "./repository-contract";

export const supabaseOrderRepository: OrderRepository = {
  list: fetchOrders,
  create: createOrder,
  update: updateOrder,
  setStatus: setOrderStatus,
  listCatalog: fetchCatalog,
  createCatalogItem,
  updateCatalogItem,
  subscribe: subscribeToOrders,
};

function isoAfterMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function createSampleCatalog(): CatalogItem[] {
  return [
    { id: "demo-cat-1", name: "Bún bò đặc biệt", price: 55_000, unit: "hộp", active: true },
    { id: "demo-cat-2", name: "Trà tắc", price: 15_000, unit: "cái", active: true },
    { id: "demo-cat-3", name: "Cơm gà xối mỡ", price: 45_000, unit: "hộp", active: true },
    { id: "demo-cat-4", name: "Cơm trưa văn phòng", price: 50_000, unit: "hộp", active: true },
    { id: "demo-cat-5", name: "Bánh mì thịt", price: 25_000, unit: "chiếc", active: true },
  ];
}

function createSampleOrders(): Order[] {
  const createdAt = new Date().toISOString();
  return [
    {
      id: "demo-1042",
      orderNo: 1042,
      recipientName: "Chị Mai",
      recipientPhone: "0903 456 789",
      deliveryAddress: "28 Nguyễn Thị Minh Khai, Quận 1",
      deliveryAt: isoAfterMinutes(32),
      status: "new",
      notes: "Ít cay, gọi trước khi giao",
      version: 1,
      createdAt,
      updatedAt: createdAt,
      items: [
        { id: "demo-item-1", name: "Bún bò đặc biệt", quantity: 2, unit: "hộp", unitPrice: 55_000, catalogItemId: "demo-cat-1", sortOrder: 0 },
        { id: "demo-item-2", name: "Trà tắc", quantity: 2, unit: "cái", unitPrice: 15_000, catalogItemId: "demo-cat-2", sortOrder: 1 },
      ],
    },
    {
      id: "demo-1041",
      orderNo: 1041,
      recipientName: "Anh Tuấn",
      recipientPhone: "0918 112 233",
      deliveryAddress: "81 Cách Mạng Tháng 8, Quận 3",
      deliveryAt: isoAfterMinutes(75),
      status: "new",
      notes: null,
      version: 2,
      createdAt,
      updatedAt: createdAt,
      items: [{ id: "demo-item-3", name: "Cơm gà xối mỡ", quantity: 3, unit: "hộp", unitPrice: 45_000, catalogItemId: "demo-cat-3", sortOrder: 0 }],
    },
    {
      id: "demo-1040",
      orderNo: 1040,
      recipientName: "Văn phòng Aster",
      recipientPhone: "028 3812 9988",
      deliveryAddress: "15 Lê Thánh Tôn, Quận 1",
      deliveryAt: isoAfterMinutes(-12),
      status: "delivered",
      notes: "Giao tại lễ tân tầng 6",
      version: 3,
      createdAt,
      updatedAt: createdAt,
      items: [{ id: "demo-item-4", name: "Cơm trưa văn phòng", quantity: 8, unit: "hộp", unitPrice: 50_000, catalogItemId: "demo-cat-4", sortOrder: 0 }],
    },
    {
      id: "demo-1039",
      orderNo: 1039,
      recipientName: "Cô Hạnh",
      recipientPhone: null,
      deliveryAddress: "102 Trần Hưng Đạo, Quận 5",
      deliveryAt: isoAfterMinutes(-80),
      status: "paid",
      notes: null,
      version: 4,
      createdAt,
      updatedAt: createdAt,
      items: [{ id: "demo-item-5", name: "Hủ tiếu", quantity: 2, unit: "chiếc", unitPrice: 0, catalogItemId: null, sortOrder: 0 }],
    },
  ];
}

function toOrderItems(items: OrderInput["items"]): OrderItem[] {
  return items.map((item, index) => ({
    id: crypto.randomUUID(),
    name: item.name,
    quantity: Number(item.quantity),
    unit: item.unit || null,
    unitPrice: Number(item.unitPrice ?? 0),
    catalogItemId: item.catalogItemId || null,
    sortOrder: index,
  }));
}

export function createDemoOrderRepository(): OrderRepository {
  let orders = createSampleOrders();
  let catalog = createSampleCatalog();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  return {
    async list() {
      return structuredClone(orders);
    },
    async create(input: OrderInput) {
      const timestamp = new Date().toISOString();
      const nextNo = Math.max(...orders.map((order) => order.orderNo), 1000) + 1;
      const created: Order = {
        id: crypto.randomUUID(),
        orderNo: nextNo,
        recipientName: input.recipientName,
        recipientPhone: input.recipientPhone || null,
        deliveryAddress: input.deliveryAddress,
        deliveryAt: new Date(`${input.deliveryAt}:00+07:00`).toISOString(),
        status: "new",
        notes: input.notes || null,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        items: toOrderItems(input.items),
      };
      orders = [...orders, created];
      notify();
      return structuredClone(created);
    },
    async update(target, input) {
      let updated!: Order;
      orders = orders.map((order) => {
        if (order.id !== target.id) return order;
        updated = {
          ...order,
          recipientName: input.recipientName,
          recipientPhone: input.recipientPhone || null,
          deliveryAddress: input.deliveryAddress,
          deliveryAt: new Date(`${input.deliveryAt}:00+07:00`).toISOString(),
          notes: input.notes || null,
          version: order.version + 1,
          updatedAt: new Date().toISOString(),
          items: toOrderItems(input.items),
        };
        return updated;
      });
      notify();
      return structuredClone(updated);
    },
    async setStatus(target, status: OrderStatus) {
      let updated!: Order;
      orders = orders.map((order) => {
        if (order.id !== target.id) return order;
        updated = {
          ...order,
          status,
          version: order.version + 1,
          updatedAt: new Date().toISOString(),
        };
        return updated;
      });
      notify();
      return structuredClone(updated);
    },
    async listCatalog() {
      return structuredClone(catalog);
    },
    async createCatalogItem(input) {
      if (catalog.some((item) => item.name.trim().toLowerCase() === input.name.trim().toLowerCase())) {
        throw new Error("Vật phẩm này đã có trong danh mục.");
      }
      const created: CatalogItem = { id: crypto.randomUUID(), ...input, name: input.name.trim(), active: true };
      catalog = [...catalog, created];
      notify();
      return structuredClone(created);
    },
    async updateCatalogItem(id, input) {
      if (catalog.some((item) => item.id !== id && item.name.trim().toLowerCase() === input.name.trim().toLowerCase())) {
        throw new Error("Vật phẩm này đã có trong danh mục.");
      }
      const updated: CatalogItem = { id, ...input, name: input.name.trim() };
      catalog = catalog.map((item) => (item.id === id ? updated : item));
      notify();
      return structuredClone(updated);
    },
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };
}

export function getDefaultOrderRepository(): { repository: OrderRepository; isDemo: boolean } {
  if (isSupabaseConfigured()) return { repository: supabaseOrderRepository, isDemo: false };
  return { repository: createDemoOrderRepository(), isDemo: true };
}

