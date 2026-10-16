import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("creates an order in demo mode and keeps it on the active board", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Bếp đang có/ })).toBeVisible();
  await expect(page.getByText("Dữ liệu mẫu")).toBeVisible();

  await page.getByRole("button", { name: "Tạo đơn" }).click();
  await page.getByLabel("Người nhận").fill("Khách kiểm thử");
  await page.getByLabel("Địa chỉ giao").fill("24 Lý Tự Trọng, Quận 1");

  const vietnamNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  vietnamNow.setUTCMinutes(vietnamNow.getUTCMinutes() + 90);
  await page
    .getByLabel("Ngày giờ giao")
    .fill(vietnamNow.toISOString().slice(0, 16));
  await expect(page.getByLabel("Số lượng món 1")).toHaveValue("1");
  await page.getByLabel("Tên món 1").selectOption("demo-cat-3"); // Cơm gà xối mỡ, 45.000 ₫ / hộp
  await page.getByLabel("Số lượng món 1").fill("2");
  await expect(page.getByText(/Tổng tiền đơn/)).toContainText("90.000");
  await page.getByRole("button", { name: "Lưu đơn" }).click();

  // The board renders a desktop and a mobile copy of each ticket; only one is visible.
  await expect(page.getByText("Khách kiểm thử").locator("visible=true").first()).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /Đã tạo đơn/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Tổng quan đơn hàng" })).toContainText("Đơn cần giao");
  await expect(page.getByRole("region", { name: "Tổng quan đơn hàng" })).toContainText("hộp");
});

test("adds a catalog item inline from the order form and manages it in the drawer", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Tạo đơn" }).click();
  await page.getByRole("button", { name: "Tạo vật phẩm mới cho món 1" }).click();
  await page.getByLabel("Tên vật phẩm").fill("Bánh flan");
  await page.getByLabel("Giá (₫)").fill("12000");
  await page.getByLabel("Đơn vị", { exact: true }).selectOption("cái");
  await page.getByRole("button", { name: "Lưu và chọn" }).click();
  await expect(page.getByLabel("Tên món 1").locator("option:checked")).toContainText("Bánh flan");
  await page.getByRole("button", { name: "Đóng form" }).click();

  await page.getByRole("button", { name: "Vật phẩm", exact: true }).click();
  const list = page.getByRole("list", { name: "Danh sách vật phẩm" });
  await expect(list).toContainText("Bánh flan");
  await page.getByRole("button", { name: "Ẩn Bánh flan" }).click();
  await expect(list).toContainText("Đã ẩn");
});

test("has no serious accessibility violations on the desktop board", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Chị Mai").locator("visible=true").first()).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});

test("fits the small mobile viewport without horizontal page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Trạng thái đơn" })).toBeVisible();

  const widths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth);
});
