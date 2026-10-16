import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { OrderRepository } from "../data/repository-contract";
import type { Order } from "../domain/order";
import { OrderBoard } from "./order-board";

const order: Order = {
  id: "order-1",
  orderNo: 1042,
  recipientName: "Nguyễn Minh An",
  recipientPhone: "0901234567",
  deliveryAddress: "12 Nguyễn Huệ, Quận 1",
  deliveryAt: "2026-10-16T05:30:00.000Z",
  status: "new",
  notes: null,
  version: 1,
  createdAt: "2026-10-16T02:00:00.000Z",
  updatedAt: "2026-10-16T02:00:00.000Z",
  items: [{ id: "item-1", name: "Cơm gà", quantity: 2, unit: "phần", unitPrice: 30_000, catalogItemId: null, sortOrder: 0 }],
};

function renderBoard(repository: OrderRepository) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OrderBoard repository={repository} initialNow={new Date("2026-10-16T04:00:00.000Z")} />
    </QueryClientProvider>,
  );
}

function createRepository(): OrderRepository {
  return {
    list: vi.fn().mockResolvedValue([order]),
    create: vi.fn(),
    update: vi.fn(),
    setStatus: vi.fn(),
    listCatalog: vi.fn().mockResolvedValue([]),
    createCatalogItem: vi.fn(),
    updateCatalogItem: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => undefined),
  };
}

describe("OrderBoard", () => {
  it("renders the three operational columns and loaded orders", async () => {
    renderBoard(createRepository());

    expect((await screen.findAllByText("Nguyễn Minh An")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Mới nhận").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Đã giao").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Nhận tiền").length).toBeGreaterThan(0);
  });

  it("filters orders from one search field and explains an empty result", async () => {
    const user = userEvent.setup();
    renderBoard(createRepository());
    await screen.findAllByText("Nguyễn Minh An");

    await user.type(screen.getByRole("searchbox", { name: "Tìm đơn" }), "không tồn tại");
    expect(screen.getAllByText("Không tìm thấy đơn phù hợp.").length).toBeGreaterThan(0);
  });

  it("summarizes pending count and money on the dashboard", async () => {
    renderBoard(createRepository());
    await screen.findAllByText("Nguyễn Minh An");

    const dashboard = screen.getByRole("region", { name: "Tổng quan đơn hàng" });
    expect(dashboard).toHaveTextContent("Đơn cần giao1");
    expect(dashboard).toHaveTextContent("Đã nhận tiền0");
    expect(dashboard).toHaveTextContent("Tiền chưa thu");
    expect(dashboard).toHaveTextContent("60.000");
  });

  it("opens the creation form from the primary action", async () => {
    const user = userEvent.setup();
    renderBoard(createRepository());
    await screen.findAllByText("Nguyễn Minh An");

    await user.click(screen.getByRole("button", { name: "Tạo đơn" }));
    expect(screen.getByRole("dialog", { name: "Tạo đơn giao hàng" })).toBeInTheDocument();
  });
});
