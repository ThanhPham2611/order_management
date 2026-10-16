import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CatalogItem, Order } from "../domain/order";
import { OrderFormDialog } from "./order-form-dialog";
import { OrderTicket } from "./order-ticket";

const order: Order = {
  id: "order-1",
  orderNo: 1042,
  recipientName: "Nguyễn Minh An",
  recipientPhone: "0901234567",
  deliveryAddress: "12 Nguyễn Huệ, Quận 1",
  deliveryAt: "2026-10-16T05:30:00.000Z",
  status: "new",
  notes: "Gọi trước khi giao",
  isGift: false,
  version: 1,
  createdAt: "2026-10-16T02:00:00.000Z",
  updatedAt: "2026-10-16T02:00:00.000Z",
  items: [{ id: "item-1", name: "Cơm gà", quantity: 2, unit: "phần", unitPrice: 30_000, catalogItemId: null, sortOrder: 0 }],
};

const catalog: CatalogItem[] = [
  { id: "cat-1", name: "Bún bò", price: 55_000, unit: "hộp", active: true },
  { id: "cat-2", name: "Trà tắc", price: 15_000, unit: "cái", active: true },
  { id: "cat-3", name: "Món đã ẩn", price: 1_000, unit: "chiếc", active: false },
];

describe("OrderTicket", () => {
  it("shows operational details and offers an accessible status control", async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    render(
      <OrderTicket
        order={order}
        now={new Date("2026-10-16T05:00:00.000Z")}
        onEdit={vi.fn()}
        onStatusChange={onStatusChange}
      />,
    );

    expect(screen.getByText("#1042")).toBeInTheDocument();
    expect(screen.getByText("Sắp giao")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Món trong đơn" })).toHaveTextContent("2 phần Cơm gà");
    expect(screen.getByText(/Tổng tiền/)).toHaveTextContent("60.000");

    await user.selectOptions(screen.getByLabelText("Chuyển trạng thái đơn #1042"), "delivered");
    expect(onStatusChange).toHaveBeenCalledWith(order, "delivered");
  });
});

describe("OrderFormDialog", () => {
  it("keeps field errors close to inputs and submits a valid multi-item order", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <OrderFormDialog open mode="create" onClose={vi.fn()} onSubmit={onSubmit} isOnline catalog={catalog} />,
    );

    await user.click(screen.getByRole("button", { name: "Lưu đơn" }));
    expect(await screen.findByText("Nhập tên người nhận")).toBeInTheDocument();
    expect(screen.getByText("Nhập địa chỉ giao")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Người nhận"), "Lan");
    await user.type(screen.getByLabelText("Địa chỉ giao"), "18 Võ Văn Tần");
    await user.type(screen.getByLabelText("Ngày giờ giao"), "2026-10-16T12:30");
    await user.selectOptions(screen.getByLabelText("Tên món 1"), "cat-1");
    await user.clear(screen.getByLabelText("Số lượng món 1"));
    await user.type(screen.getByLabelText("Số lượng món 1"), "2");
    await user.click(screen.getByRole("button", { name: "Thêm món" }));
    await user.selectOptions(screen.getByLabelText("Tên món 2"), "cat-2");
    await user.click(screen.getByRole("button", { name: "Lưu đơn" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientName: "Lan",
        items: [
          expect.objectContaining({ name: "Bún bò", quantity: 2, unit: "hộp", unitPrice: 55_000, catalogItemId: "cat-1" }),
          expect.objectContaining({ name: "Trà tắc", quantity: 1, unit: "cái", unitPrice: 15_000, catalogItemId: "cat-2" }),
        ],
      }),
    );
  });

  it("offers only active catalog items and shows line and order totals", async () => {
    const user = userEvent.setup();
    render(<OrderFormDialog open mode="create" onClose={vi.fn()} onSubmit={vi.fn()} isOnline catalog={catalog} />);

    const select = screen.getByLabelText("Tên món 1");
    expect(select).not.toHaveTextContent("Món đã ẩn");
    await user.selectOptions(select, "cat-1");
    await user.clear(screen.getByLabelText("Số lượng món 1"));
    await user.type(screen.getByLabelText("Số lượng món 1"), "3");

    expect(screen.getByText(/Thành tiền/)).toHaveTextContent("165.000");
    expect(screen.getByText(/Tổng tiền đơn/)).toHaveTextContent("165.000");
  });

  it("marks an order as a free gift: total 0 and isGift submitted", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<OrderFormDialog open mode="create" onClose={vi.fn()} onSubmit={onSubmit} isOnline catalog={catalog} />);

    await user.type(screen.getByLabelText("Người nhận"), "Khách thử");
    await user.type(screen.getByLabelText("Địa chỉ giao"), "1 Test");
    await user.type(screen.getByLabelText("Ngày giờ giao"), "2026-10-16T12:30");
    await user.selectOptions(screen.getByLabelText("Tên món 1"), "cat-1");
    expect(screen.getByText(/Tổng tiền đơn/)).toHaveTextContent("55.000");

    await user.click(screen.getByRole("checkbox", { name: /Hàng tặng/ }));
    expect(screen.getByText(/Tổng tiền đơn/)).toHaveTextContent("0");
    expect(screen.getByText(/Tổng tiền đơn/)).not.toHaveTextContent("55.000");

    await user.click(screen.getByRole("button", { name: "Lưu đơn" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ isGift: true }));
  });

  it("suggests addresses from previous orders and fills an empty recipient", async () => {
    const user = userEvent.setup();
    render(
      <OrderFormDialog open mode="create" onClose={vi.fn()} onSubmit={vi.fn()} isOnline orders={[order]} />,
    );

    expect(screen.queryByRole("list", { name: /Gợi ý địa chỉ/ })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Địa chỉ giao"), "nguyen hue");

    const hints = screen.getByRole("list", { name: /Gợi ý địa chỉ/ });
    expect(hints).toHaveTextContent("12 Nguyễn Huệ, Quận 1");
    expect(hints).toHaveTextContent("Nguyễn Minh An · 0901234567");

    await user.click(screen.getByRole("button", { name: /12 Nguyễn Huệ/ }));
    expect(screen.getByLabelText("Địa chỉ giao")).toHaveValue("12 Nguyễn Huệ, Quận 1");
    expect(screen.getByLabelText("Người nhận")).toHaveValue("Nguyễn Minh An");
    expect(screen.getByLabelText("Số điện thoại")).toHaveValue("0901234567");
    expect(screen.queryByRole("list", { name: /Gợi ý địa chỉ/ })).not.toBeInTheDocument();
  });

  it("does not overwrite a recipient that was already typed", async () => {
    const user = userEvent.setup();
    render(
      <OrderFormDialog open mode="create" onClose={vi.fn()} onSubmit={vi.fn()} isOnline orders={[order]} />,
    );

    await user.type(screen.getByLabelText("Người nhận"), "Khách khác");
    await user.type(screen.getByLabelText("Địa chỉ giao"), "nguyen hue");
    await user.click(screen.getByRole("button", { name: /12 Nguyễn Huệ/ }));

    expect(screen.getByLabelText("Người nhận")).toHaveValue("Khách khác");
  });

  it("creates a catalog item inline and selects it for the line", async () => {
    const user = userEvent.setup();
    const created: CatalogItem = { id: "cat-9", name: "Bánh mì", price: 25_000, unit: "chiếc", active: true };
    const onCreateCatalogItem = vi.fn().mockResolvedValue(created);
    render(
      <OrderFormDialog
        open
        mode="create"
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        isOnline
        catalog={catalog}
        onCreateCatalogItem={onCreateCatalogItem}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Tạo vật phẩm mới cho món 1" }));
    await user.type(screen.getByLabelText("Tên vật phẩm"), "Bánh mì");
    await user.type(screen.getByLabelText("Giá (₫)"), "25000");
    await user.selectOptions(screen.getByLabelText("Đơn vị"), "chiếc");
    await user.click(screen.getByRole("button", { name: "Lưu và chọn" }));

    expect(onCreateCatalogItem).toHaveBeenCalledWith({ name: "Bánh mì", price: 25000, unit: "chiếc" });
    // the board adds the new item to `catalog`; this static prop falls back to showing the saved name
    expect(screen.getByLabelText("Tên món 1")).toHaveDisplayValue("Bánh mì");
    expect(screen.getByText(/Tổng tiền đơn/)).toHaveTextContent("25.000");
  });

  it("keeps a legacy free-text line selectable when editing an old order", () => {
    render(
      <OrderFormDialog open mode="edit" order={order} onClose={vi.fn()} onSubmit={vi.fn()} isOnline catalog={catalog} />,
    );

    expect(screen.getByLabelText("Tên món 1")).toHaveDisplayValue("Cơm gà");
  });

  it("disables saving while offline", () => {
    render(
      <OrderFormDialog open mode="create" onClose={vi.fn()} onSubmit={vi.fn()} isOnline={false} />,
    );

    expect(screen.getByRole("button", { name: "Lưu đơn" })).toBeDisabled();
    expect(screen.getByText("Đang offline. Kết nối mạng để lưu đơn.")).toBeInTheDocument();
  });
});
