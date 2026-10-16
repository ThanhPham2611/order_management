import { formatVnd } from "@/lib/format";
import { summarizeOrders, summarizeUnits, type Order } from "../domain/order";

const formatQuantity = (total: number) =>
  new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(total);

export function BoardDashboard({ orders }: { orders: Order[] }) {
  const stats = summarizeOrders(orders);
  const units = summarizeUnits(orders.filter((order) => order.status !== "cancelled"));
  const kpis = [
    { label: "Đơn cần giao", value: String(stats.toDeliver), tone: "pending" },
    { label: "Đã giao, chờ thu", value: String(stats.delivered), tone: "wait" },
    { label: "Đã nhận tiền", value: String(stats.paid), tone: "done" },
    { label: "Tiền chưa thu", value: formatVnd(stats.unpaidAmount), tone: "wait" },
    { label: "Doanh thu đã thu", value: formatVnd(stats.paidAmount), tone: "done" },
  ];

  return (
    <section className="dashboard" aria-label="Tổng quan đơn hàng">
      <h2 className="dashboard__title">
        Tổng quan <span>· {stats.toDeliver + stats.delivered + stats.paid} đơn đang hiển thị</span>
      </h2>
      <dl className="kpi-grid">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={`kpi kpi--${kpi.tone}`}>
            <dt>{kpi.label}</dt>
            <dd>{kpi.value}</dd>
          </div>
        ))}
      </dl>
      <dl className="unit-row" aria-label="Tổng số lượng theo đơn vị">
        {units.map(({ unit, total }) => (
          <div key={unit} className={total ? "unit-chip" : "unit-chip unit-chip--empty"}>
            <dt>{unit}</dt>
            <dd>{formatQuantity(total)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
