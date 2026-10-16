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
  isGift: false,
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

  it("breaks quantities down per unit by column, bought and gift", async () => {
    renderBoard(createRepository());
    await screen.findAllByText("Nguyễn Minh An");

    const group = screen.getByRole("group", { name: "Số lượng theo đơn vị" });
    expect(group.querySelectorAll("table")).toHaveLength(4); // cái, hộp, chiếc + "phần" from the fixture
    const phan = [...group.querySelectorAll("table")].find((table) => table.textContent?.includes("phần"))!;
    expect(phan).toHaveTextContent("Cần giao2");
    expect(phan).toHaveTextContent("Tổng phần");
  });

  it("shows every day by default", async () => {
    renderBoard(createRepository());
    await screen.findAllByText("Nguyễn Minh An");

    expect(screen.getByLabelText("Lọc theo ngày giao")).toHaveValue("all");
  });

  it("filters by item and counts only that item on the dashboard", async () => {
    const user = userEvent.setup();
    const other: Order = {
      ...order,
      id: "order-2",
      orderNo: 1043,
      recipientName: "Lê Hoa",
      items: [{ id: "item-2", name: "Trà tắc", quantity: 3, unit: "cái", unitPrice: 15_000, catalogItemId: null, sortOrder: 0 }],
    };
    const repository = createRepository();
    repository.list = vi.fn().mockResolvedValue([order, other]);
    renderBoard(repository);
    await screen.findAllByText("Nguyễn Minh An");

    await user.selectOptions(screen.getByLabelText("Lọc theo vật phẩm"), "trà tắc");

    expect(screen.queryAllByText("Nguyễn Minh An")).toHaveLength(0);
    expect(screen.getAllByText("Lê Hoa").length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "Tổng quan đơn hàng" })).toHaveTextContent("Trà tắc");
    expect(screen.getByRole("region", { name: "Tổng quan đơn hàng" })).toHaveTextContent("45.000");
  });

  it("offers a date picker for a specific delivery day", async () => {
    const user = userEvent.setup();
    renderBoard(createRepository());
    await screen.findAllByText("Nguyễn Minh An");

    expect(screen.queryByLabelText("Ngày giao cụ thể")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Lọc theo ngày giao"), "date");
    const picker = screen.getByLabelText("Ngày giao cụ thể");
    expect(picker).toHaveValue("2026-10-16");

    await user.clear(picker);
    await user.type(picker, "2026-10-20");
    expect(screen.getAllByText("Không tìm thấy đơn phù hợp.").length).toBeGreaterThan(0);
  });

  it("opens the creation form from the primary action", async () => {
    const user = userEvent.setup();
    renderBoard(createRepository());
    await screen.findAllByText("Nguyễn Minh An");

    await user.click(screen.getByRole("button", { name: "Tạo đơn" }));
    expect(screen.getByRole("dialog", { name: "Tạo đơn giao hàng" })).toBeInTheDocument();
  });
});
