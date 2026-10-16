import { formatVnd } from "@/lib/format";
import {
  BREAKDOWN_STATUSES,
  summarizeOrders,
  summarizeQuantities,
  type BreakdownStatus,
  type Order,
  type QuantitySplit,
} from "../domain/order";

const formatQuantity = (total: number) =>
  new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(total);

const ROW_LABELS: Record<BreakdownStatus, string> = {
  new: "Cần giao",
  delivered: "Đã giao",
  paid: "Nhận tiền",
};

function Cells({ split }: { split: QuantitySplit }) {
  const cell = (value: number, className?: string) => (
    <td className={value === 0 ? `${className ?? ""} qty-zero` : className}>{formatQuantity(value)}</td>
  );
  return (
    <>
      {cell(split.bought)}
      {cell(split.gift, "qty-gift")}
      {cell(split.bought + split.gift, "qty-sum")}
    </>
  );
}

export function BoardDashboard({ orders, itemLabel }: { orders: Order[]; itemLabel?: string }) {
  const stats = summarizeOrders(orders);
  const units = summarizeQuantities(orders);
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
        Tổng quan{itemLabel ? ` · ${itemLabel}` : ""} <span>· {itemLabel ? "chỉ tính món này, " : ""}{stats.toDeliver + stats.delivered + stats.paid} đơn đang hiển thị{stats.gifts ? `, ${stats.gifts} đơn tặng` : ""}</span>
      </h2>
      <dl className="kpi-grid">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={`kpi kpi--${kpi.tone}`}>
            <dt>{kpi.label}</dt>
            <dd>{kpi.value}</dd>
          </div>
        ))}
      </dl>

      <h3 className="dashboard__subtitle">Số lượng theo đơn vị <span>· mua / tặng, tách theo cột</span></h3>
      <div className="qty-grid" role="group" aria-label="Số lượng theo đơn vị">
        {units.map((row) => {
          const all = row.total.bought + row.total.gift;
          return (
            <table key={row.unit} className={all ? "qty-table" : "qty-table qty-table--empty"}>
              <caption>
                <div className="qty-caption">
                  <span className="qty-unit">{row.unit}</span>
                  <span className="qty-all">{formatQuantity(all)}</span>
                </div>
              </caption>
              <thead>
                <tr>
                  <th scope="col"><span className="sr-only">Trạng thái</span></th>
                  <th scope="col">Mua</th>
                  <th scope="col" className="qty-gift">Tặng</th>
                  <th scope="col">Tổng</th>
                </tr>
              </thead>
              <tbody>
                {BREAKDOWN_STATUSES.map((status) => (
                  <tr key={status}>
                    <th scope="row">{ROW_LABELS[status]}</th>
                    <Cells split={row.byStatus[status]} />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Tổng {row.unit}</th>
                  <Cells split={row.total} />
                </tr>
              </tfoot>
            </table>
          );
        })}
      </div>
    </section>
  );
}
