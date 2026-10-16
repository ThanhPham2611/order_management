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

test("a free-sample order costs 0 but is still counted", async ({ page }) => {
  await page.goto("/");
  const dashboard = page.getByRole("region", { name: "Tổng quan đơn hàng" });
  await expect(dashboard).not.toContainText("đơn tặng");

  await page.getByRole("button", { name: "Tạo đơn" }).click();
  await page.getByLabel("Người nhận").fill("Ăn thử");
  await page.getByLabel("Địa chỉ giao").fill("5 Test, Quận 1");
  const t = new Date(Date.now() + 7 * 3600e3 + 60 * 60e3);
  await page.getByLabel("Ngày giờ giao").fill(t.toISOString().slice(0, 16));
  await page.getByLabel("Tên món 1").selectOption("demo-cat-3");
  await page.getByRole("checkbox", { name: /Hàng tặng/ }).check();
  await expect(page.getByText(/Tổng tiền đơn/)).not.toContainText("45.000");
  await page.getByRole("button", { name: "Lưu đơn" }).click();

  await expect(dashboard).toContainText("1 đơn tặng");
  await expect(dashboard).toContainText("675.000"); // unpaid money unchanged by the gift order

  // hộp: bought 13 (2 new + 3 + 8 delivered), gift 1 -> total 14
  const hop = page.locator("table.qty-table", { hasText: "Tổng hộp" });
  await expect(hop.locator("tfoot td")).toHaveText(["13", "1", "14"]);
});

test("suggests a previous address and fills the recipient", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Tạo đơn" }).click();
  await page.getByLabel("Địa chỉ giao").fill("minh khai q1");
  await page.getByLabel("Địa chỉ giao").fill("minh khai");
  await page.getByRole("button", { name: /28 Nguyễn Thị Minh Khai/ }).click();
  await expect(page.getByLabel("Địa chỉ giao")).toHaveValue("28 Nguyễn Thị Minh Khai, Quận 1");
  await expect(page.getByLabel("Người nhận")).toHaveValue("Chị Mai");
});

test("filters by item and by a picked date", async ({ page }) => {
  await page.goto("/");
  const dashboard = page.getByRole("region", { name: "Tổng quan đơn hàng" });
  await expect(dashboard).toContainText("4 đơn đang hiển thị");

  await page.getByLabel("Lọc theo vật phẩm").selectOption({ label: "Bún bò đặc biệt" });
  await expect(dashboard).toContainText("1 đơn đang hiển thị");
  await expect(dashboard).toContainText("chỉ tính món này");
  await page.getByLabel("Lọc theo vật phẩm").selectOption({ label: "Tất cả vật phẩm" });

  await page.getByLabel("Lọc theo ngày giao").selectOption("date");
  await page.getByLabel("Ngày giao cụ thể").fill("2020-01-01");
  await expect(dashboard).toContainText("0 đơn đang hiển thị");
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
