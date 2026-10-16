"use client";

import { Clock3, GripVertical, MapPin, PencilLine, Phone } from "lucide-react";

import { cn } from "@/lib/cn";
import { formatVnd } from "@/lib/format";
import {
  getDeliveryUrgency,
  orderTotal,
  type Order,
  type OrderStatus,
} from "../domain/order";

export const STATUS_LABELS: Record<OrderStatus, string> = {
  new: "Mới nhận",
  delivered: "Đã giao",
  paid: "Nhận tiền",
  cancelled: "Đã hủy",
};

const URGENCY_LABELS = {
  overdue: "Quá giờ giao",
  "due-soon": "Sắp giao",
  scheduled: "Đúng lịch",
  settled: "Đã xử lý",
} as const;

function formatDeliveryTime(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(iso));
}

interface OrderTicketProps {
  order: Order;
  now?: Date;
  disabled?: boolean;
  onEdit: (order: Order) => void;
  onStatusChange: (order: Order, status: OrderStatus) => void;
  dragHandleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
}

export function OrderTicket({
  order,
  now = new Date(),
  disabled = false,
  onEdit,
  onStatusChange,
  dragHandleProps,
}: OrderTicketProps) {
  const urgency = getDeliveryUrgency(order, now);

  return (
    <article
      className={cn("order-ticket", `order-ticket--${order.status}`, {
        "order-ticket--urgent": urgency === "overdue" || urgency === "due-soon",
      })}
      aria-label={`Đơn #${order.orderNo} của ${order.recipientName}`}
    >
      <div className="ticket-topline">
        <span className="order-number">#{order.orderNo}</span>
        <span className={cn("urgency-badge", `urgency-badge--${urgency}`)}>
          {URGENCY_LABELS[urgency]}
        </span>
        {dragHandleProps ? (
          <button
            type="button"
            className="drag-handle"
            aria-label={`Kéo đơn #${order.orderNo}`}
            {...dragHandleProps}
          >
            <GripVertical aria-hidden="true" size={18} />
          </button>
        ) : null}
      </div>

      <div className="ticket-time">
        <Clock3 aria-hidden="true" size={18} />
        <time dateTime={order.deliveryAt}>{formatDeliveryTime(order.deliveryAt)}</time>
      </div>

      <h3>{order.recipientName}</h3>
      <p className="ticket-address">
        <MapPin aria-hidden="true" size={17} />
        <span>{order.deliveryAddress}</span>
      </p>
      {order.recipientPhone ? (
        <a className="ticket-phone" href={`tel:${order.recipientPhone}`}>
          <Phone aria-hidden="true" size={16} />
          {order.recipientPhone}
        </a>
      ) : null}

      <ul className="ticket-items" aria-label="Món trong đơn">
        {order.items.map((item) => (
          <li key={item.id}>
            <strong>
              {item.quantity} {item.unit ?? ""}
            </strong>{" "}
            {item.name}
          </li>
        ))}
      </ul>

      {order.isGift ? (
        <p className="ticket-total ticket-total--gift">
          <span className="gift-badge">Hàng tặng</span> <strong>{formatVnd(0)}</strong>
        </p>
      ) : orderTotal(order) > 0 ? (
        <p className="ticket-total">
          Tổng tiền <strong>{formatVnd(orderTotal(order))}</strong>
        </p>
      ) : null}

      {order.notes ? <p className="ticket-note">{order.notes}</p> : null}

      <div className="ticket-actions">
        <label className="status-select-label">
          <span className="sr-only">Chuyển trạng thái đơn #{order.orderNo}</span>
          <select
            aria-label={`Chuyển trạng thái đơn #${order.orderNo}`}
            value={order.status}
            disabled={disabled}
            onChange={(event) => onStatusChange(order, event.target.value as OrderStatus)}
          >
            {Object.entries(STATUS_LABELS).map(([status, label]) => (
              <option key={status} value={status}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="icon-text-button"
          onClick={() => onEdit(order)}
          disabled={disabled}
        >
          <PencilLine aria-hidden="true" size={16} />
          Sửa
        </button>
      </div>
    </article>
  );
}

