"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChefHat, Package, Plus, Search, WifiOff } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { cn } from "@/lib/cn";
import { OrderConflictError } from "../data/order-repository";
import type { OrderRepository } from "../data/repository-contract";
import {
  filterOrders,
  shouldShowInDefaultWindow,
  sortOrdersByDelivery,
  type CatalogItem,
  type CatalogItemInput,
  type CatalogItemUpdate,
  type Order,
  type OrderInput,
  type OrderStatus,
} from "../domain/order";
import { BoardDashboard } from "./board-dashboard";
import { CatalogDrawer } from "./catalog-drawer";
import { OrderFormDialog } from "./order-form-dialog";
import { OrderTicket, STATUS_LABELS } from "./order-ticket";

const BOARD_STATUSES: OrderStatus[] = ["new", "delivered", "paid"];
const QUERY_KEY = ["orders"] as const;
const CATALOG_KEY = ["catalog"] as const;

const byName = (left: CatalogItem, right: CatalogItem) => left.name.localeCompare(right.name, "vi");

function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("online", onStoreChange);
      window.addEventListener("offline", onStoreChange);
      return () => {
        window.removeEventListener("online", onStoreChange);
        window.removeEventListener("offline", onStoreChange);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

function localDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isTomorrow(deliveryAt: string, now: Date): boolean {
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return localDateKey(new Date(deliveryAt)) === localDateKey(tomorrow);
}

interface DraggableTicketProps {
  order: Order;
  now: Date;
  disabled: boolean;
  onEdit: (order: Order) => void;
  onStatusChange: (order: Order, status: OrderStatus) => void;
}

function DraggableTicket(props: DraggableTicketProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: props.order.id,
    data: { order: props.order },
    disabled: props.disabled,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn({ "dragging-ticket": isDragging })}
    >
      <OrderTicket
        {...props}
        dragHandleProps={{
          ...attributes,
          ...listeners,
        } as React.ButtonHTMLAttributes<HTMLButtonElement>}
      />
    </div>
  );
}

interface OrderColumnProps extends Omit<DraggableTicketProps, "order"> {
  status: OrderStatus;
  orders: Order[];
}

function OrderColumn({ status, orders, ...ticketProps }: OrderColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section ref={setNodeRef} className={cn("board-column", { "board-column--over": isOver })}>
      <header className="column-header">
        <h2>{STATUS_LABELS[status]}</h2>
        <span aria-label={`${orders.length} đơn`}>{orders.length}</span>
      </header>
      <div className="column-body">
        {orders.length ? (
          orders.map((order) => <DraggableTicket key={order.id} {...ticketProps} order={order} />)
        ) : (
          <p className="column-empty">Chưa có đơn.</p>
        )}
      </div>
    </section>
  );
}

interface OrderBoardProps {
  repository: OrderRepository;
  isDemo?: boolean;
  initialNow?: Date;
}

export function OrderBoard({ repository, isDemo = false, initialNow }: OrderBoardProps) {
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const [now, setNow] = useState(initialNow ?? new Date());
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [dateFilter, setDateFilter] = useState<"default" | "today" | "tomorrow" | "all">("default");
  const [statusFilter, setStatusFilter] = useState<"board" | OrderStatus>("board");
  const [mobileStatus, setMobileStatus] = useState<OrderStatus>("new");
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const ordersQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => repository.list(),
    staleTime: 20_000,
  });

  const catalogQuery = useQuery({
    queryKey: CATALOG_KEY,
    queryFn: () => repository.listCatalog(),
    staleTime: 20_000,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return repository.subscribe(() => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: CATALOG_KEY });
    });
  }, [queryClient, repository]);

  useEffect(() => {
    if (isOnline) void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }, [isOnline, queryClient]);

  const visibleOrders = useMemo(() => {
    const source = filterOrders(ordersQuery.data ?? [], deferredQuery).filter((order) => {
      if (statusFilter !== "board" && order.status !== statusFilter) return false;
      if (statusFilter === "board" && order.status === "cancelled") return false;
      if (dateFilter === "all") return true;
      if (dateFilter === "today") return localDateKey(new Date(order.deliveryAt)) === localDateKey(now);
      if (dateFilter === "tomorrow") return isTomorrow(order.deliveryAt, now);
      return shouldShowInDefaultWindow(order, now);
    });
    return sortOrdersByDelivery(source);
  }, [dateFilter, deferredQuery, now, ordersQuery.data, statusFilter]);

  const grouped = useMemo(
    () =>
      Object.fromEntries(
        BOARD_STATUSES.map((status) => [
          status,
          visibleOrders.filter((order) => order.status === status),
        ]),
      ) as Record<OrderStatus, Order[]>,
    [visibleOrders],
  );

  const refreshAfterError = async (error: unknown) => {
    if (error instanceof OrderConflictError) {
      setNotice("Đơn vừa được cập nhật ở thiết bị khác. Đã tải bản mới nhất.");
    } else {
      setNotice(error instanceof Error ? error.message : "Không thể cập nhật đơn.");
    }
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    throw error;
  };

  const saveOrder = async (input: OrderInput) => {
    try {
      const saved = editingOrder
        ? await repository.update(editingOrder, input)
        : await repository.create(input);
      queryClient.setQueryData<Order[]>(QUERY_KEY, (current = []) => {
        const withoutSaved = current.filter((order) => order.id !== saved.id);
        return [...withoutSaved, saved];
      });
      setFormOpen(false);
      setEditingOrder(null);
      setNotice(editingOrder ? `Đã cập nhật đơn #${saved.orderNo}.` : `Đã tạo đơn #${saved.orderNo}.`);
    } catch (error) {
      await refreshAfterError(error);
    }
  };

  const changeStatus = async (order: Order, status: OrderStatus) => {
    if (!isOnline || order.status === status) return;
    try {
      const updated = await repository.setStatus(order, status);
      queryClient.setQueryData<Order[]>(QUERY_KEY, (current = []) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice(`Đơn #${order.orderNo} đã chuyển sang ${STATUS_LABELS[status].toLocaleLowerCase("vi")}.`);
    } catch (error) {
      try {
        await refreshAfterError(error);
      } catch {
        // The notice already explains the recoverable failure.
      }
    }
  };

  const createCatalogItem = async (input: CatalogItemInput) => {
    const created = await repository.createCatalogItem(input);
    queryClient.setQueryData<CatalogItem[]>(CATALOG_KEY, (current = []) => [...current, created].sort(byName));
    return created;
  };

  const updateCatalogItem = async (id: string, input: CatalogItemUpdate) => {
    const updated = await repository.updateCatalogItem(id, input);
    queryClient.setQueryData<CatalogItem[]>(CATALOG_KEY, (current = []) =>
      current.map((item) => (item.id === id ? updated : item)).sort(byName),
    );
    return updated;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const order = event.active.data.current?.order as Order | undefined;
    const status = event.over?.id as OrderStatus | undefined;
    if (order && status && BOARD_STATUSES.includes(status)) void changeStatus(order, status);
  };

  const openCreate = () => {
    setEditingOrder(null);
    setFormOpen(true);
  };
  const openEdit = (order: Order) => {
    setEditingOrder(order);
    setFormOpen(true);
  };

  const activeCount = (ordersQuery.data ?? []).filter((order) => order.status === "new").length;

  return (
    <main className="app-shell">
      {!isOnline ? (
        <div className="offline-banner" role="status">
          <WifiOff aria-hidden="true" size={18} />
          Đang offline — bạn vẫn có thể xem dữ liệu hiện tại, nhưng chưa thể lưu thay đổi.
        </div>
      ) : null}

      <header className="app-header">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true"><ChefHat /></span>
          <div>
            <p>Bảng giao hôm nay</p>
            <h1>Bếp đang có {activeCount} đơn cần giao</h1>
          </div>
        </div>
        <div className="header-actions">
          {isDemo ? <span className="demo-badge">Dữ liệu mẫu</span> : <span className="live-badge">Realtime</span>}
          <button type="button" className="secondary-button" onClick={() => setCatalogOpen(true)}>
            <Package aria-hidden="true" size={19} />
            Vật phẩm
          </button>
          <button type="button" className="primary-button" onClick={openCreate} disabled={!isOnline}>
            <Plus aria-hidden="true" size={19} />
            Tạo đơn
          </button>
        </div>
      </header>

      <section className="filter-bar" aria-label="Bộ lọc đơn hàng">
        <label className="search-field">
          <Search aria-hidden="true" size={18} />
          <span className="sr-only">Tìm đơn</span>
          <input
            type="search"
            aria-label="Tìm đơn"
            placeholder="Mã đơn, người nhận, địa chỉ, món…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="filter-select">
          <CalendarDays aria-hidden="true" size={18} />
          <span className="sr-only">Lọc theo ngày giao</span>
          <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value as typeof dateFilter)}>
            <option value="default">Hôm nay + quá hạn</option>
            <option value="today">Chỉ hôm nay</option>
            <option value="tomorrow">Ngày mai</option>
            <option value="all">Tất cả ngày</option>
          </select>
        </label>
        <label className="filter-select">
          <span className="sr-only">Lọc theo trạng thái</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
            <option value="board">Bảng đang xử lý</option>
            {Object.entries(STATUS_LABELS).map(([status, label]) => (
              <option key={status} value={status}>{label}</option>
            ))}
          </select>
        </label>
      </section>

      {ordersQuery.data && statusFilter !== "cancelled" ? <BoardDashboard orders={visibleOrders} /> : null}

      {notice ? <div className="toast" role="status" aria-live="polite">{notice}</div> : null}

      {ordersQuery.isLoading ? (
        <div className="board-loading" role="status">Đang tải bảng đơn…</div>
      ) : ordersQuery.isError ? (
        <div className="board-error" role="alert">
          <p>Không tải được bảng đơn.</p>
          <button type="button" className="secondary-button" onClick={() => void ordersQuery.refetch()}>
            Thử lại
          </button>
        </div>
      ) : statusFilter === "cancelled" ? (
        <section className="cancelled-list">
          <h2>Đơn đã hủy</h2>
          {visibleOrders.length ? visibleOrders.map((order) => (
            <OrderTicket key={order.id} order={order} now={now} disabled={!isOnline} onEdit={openEdit} onStatusChange={changeStatus} />
          )) : <p>Không tìm thấy đơn phù hợp.</p>}
        </section>
      ) : (
        <>
          <nav className="mobile-status-tabs" aria-label="Trạng thái đơn">
            {BOARD_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                aria-pressed={mobileStatus === status}
                onClick={() => setMobileStatus(status)}
              >
                {STATUS_LABELS[status]} <span>{grouped[status].length}</span>
              </button>
            ))}
          </nav>

          <div className="mobile-order-list">
            {grouped[mobileStatus].length ? grouped[mobileStatus].map((order) => (
              <OrderTicket key={order.id} order={order} now={now} disabled={!isOnline} onEdit={openEdit} onStatusChange={changeStatus} />
            )) : <p className="mobile-empty">Không tìm thấy đơn phù hợp.</p>}
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="desktop-board">
              {BOARD_STATUSES.map((status) => (
                <OrderColumn
                  key={status}
                  status={status}
                  orders={grouped[status]}
                  now={now}
                  disabled={!isOnline}
                  onEdit={openEdit}
                  onStatusChange={changeStatus}
                />
              ))}
            </div>
          </DndContext>
        </>
      )}

      {formOpen ? (
        <OrderFormDialog
          open
          mode={editingOrder ? "edit" : "create"}
          order={editingOrder}
          isOnline={isOnline}
          catalog={catalogQuery.data ?? []}
          onCreateCatalogItem={createCatalogItem}
          onClose={() => setFormOpen(false)}
          onSubmit={saveOrder}
        />
      ) : null}

      {catalogOpen ? (
        <CatalogDrawer
          items={catalogQuery.data ?? []}
          isOnline={isOnline}
          onClose={() => setCatalogOpen(false)}
          onCreate={createCatalogItem}
          onUpdate={updateCatalogItem}
        />
      ) : null}
    </main>
  );
}
