"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useForm, useWatch, type Resolver } from "react-hook-form";

import { formatVnd } from "@/lib/format";
import {
  orderInputSchema,
  type CatalogItem,
  type CatalogItemInput,
  type Order,
  type OrderInput,
} from "../domain/order";
import { CatalogItemForm } from "./catalog-item-form";

/** Select value for a saved line whose item is not (or no longer) in the active catalog. */
const KEEP_CURRENT = "__current";
const EMPTY_ITEM = { name: "", quantity: 1, unit: "", unitPrice: 0, catalogItemId: "" };

function toVietnamLocalInput(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function getDefaults(order?: Order | null): OrderInput {
  return {
    recipientName: order?.recipientName ?? "",
    recipientPhone: order?.recipientPhone ?? "",
    deliveryAddress: order?.deliveryAddress ?? "",
    deliveryAt: order ? toVietnamLocalInput(order.deliveryAt) : "",
    notes: order?.notes ?? "",
    items: order?.items.length
      ? order.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit ?? "",
          unitPrice: item.unitPrice,
          catalogItemId: item.catalogItemId ?? "",
        }))
      : [EMPTY_ITEM],
  };
}

interface OrderFormDialogProps {
  open: boolean;
  mode: "create" | "edit";
  order?: Order | null;
  isOnline: boolean;
  catalog?: CatalogItem[];
  onCreateCatalogItem?: (input: CatalogItemInput) => Promise<CatalogItem>;
  onClose: () => void;
  onSubmit: (input: OrderInput) => Promise<void>;
}

export function OrderFormDialog({
  open,
  mode,
  order,
  isOnline,
  catalog = [],
  onCreateCatalogItem,
  onClose,
  onSubmit,
}: OrderFormDialogProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [creatingFor, setCreatingFor] = useState<number | null>(null);
  const {
    register,
    control,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OrderInput>({
    resolver: zodResolver(orderInputSchema) as Resolver<OrderInput>,
    defaultValues: getDefaults(order),
  });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const lines = useWatch({ control, name: "items" });
  const activeCatalog = catalog.filter((item) => item.active);
  const lineAmount = (index: number) => {
    const line = lines?.[index];
    const amount = Math.round(Number(line?.quantity) * Number(line?.unitPrice));
    return Number.isFinite(amount) ? amount : 0;
  };
  const orderAmount = fields.reduce((sum, _, index) => sum + lineAmount(index), 0);

  const applyCatalogItem = (index: number, item: CatalogItem | null) => {
    const opts = { shouldDirty: true, shouldValidate: true };
    setValue(`items.${index}.name`, item?.name ?? "", opts);
    setValue(`items.${index}.unit`, item?.unit ?? "", opts);
    setValue(`items.${index}.unitPrice`, item?.price ?? 0, opts);
    setValue(`items.${index}.catalogItemId`, item?.id ?? "", opts);
  };

  if (!open) return null;

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await onSubmit(values);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Không thể lưu đơn.");
    }
  });

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="order-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-form-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="drawer-header">
          <div>
            <p>{mode === "create" ? "Đơn mới" : `Đơn #${order?.orderNo}`}</p>
            <h2 id="order-form-title">
              {mode === "create" ? "Tạo đơn giao hàng" : "Cập nhật đơn"}
            </h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng form">
            <X aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={submit} noValidate>
          <div className="drawer-body">
            <div className="field-grid">
              <label className="field">
                <span>Người nhận</span>
                <input
                  aria-label="Người nhận"
                  autoFocus
                  autoComplete="name"
                  {...register("recipientName")}
                />
                {errors.recipientName ? <small role="alert">{errors.recipientName.message}</small> : null}
              </label>
              <label className="field">
                <span>Số điện thoại <em>không bắt buộc</em></span>
                <input
                  aria-label="Số điện thoại"
                  inputMode="tel"
                  autoComplete="tel"
                  {...register("recipientPhone")}
                />
                {errors.recipientPhone ? <small role="alert">{errors.recipientPhone.message}</small> : null}
              </label>
            </div>

            <label className="field">
              <span>Địa chỉ giao</span>
              <textarea
                aria-label="Địa chỉ giao"
                rows={2}
                autoComplete="street-address"
                {...register("deliveryAddress")}
              />
              {errors.deliveryAddress ? <small role="alert">{errors.deliveryAddress.message}</small> : null}
            </label>

            <label className="field field--compact">
              <span>Ngày giờ giao</span>
              <input aria-label="Ngày giờ giao" type="datetime-local" {...register("deliveryAt")} />
              {errors.deliveryAt ? <small role="alert">{errors.deliveryAt.message}</small> : null}
            </label>

            <fieldset className="items-fieldset">
              <legend>Món trong đơn</legend>
              <div className="item-list">
                {fields.map((field, index) => {
                  const line = lines?.[index];
                  const inCatalog = activeCatalog.some((item) => item.id === line?.catalogItemId);
                  const selectValue = inCatalog ? (line?.catalogItemId ?? "") : line?.name ? KEEP_CURRENT : "";
                  return (
                    <div className="item-row" key={field.id}>
                      <label className="field item-name">
                        <span>Tên món {index + 1}</span>
                        <select
                          aria-label={`Tên món ${index + 1}`}
                          value={selectValue}
                          onChange={(event) => {
                            const value = event.target.value;
                            if (value === KEEP_CURRENT) return;
                            applyCatalogItem(index, activeCatalog.find((item) => item.id === value) ?? null);
                          }}
                        >
                          <option value="">Chọn vật phẩm…</option>
                          {selectValue === KEEP_CURRENT ? <option value={KEEP_CURRENT}>{line?.name}</option> : null}
                          {activeCatalog.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} · {formatVnd(item.price)}/{item.unit}
                            </option>
                          ))}
                        </select>
                        {errors.items?.[index]?.name ? (
                          <small role="alert">{errors.items[index]?.name?.message}</small>
                        ) : null}
                      </label>
                      <label className="field item-quantity">
                        <span>Số lượng{line?.unit ? ` (${line.unit})` : ""}</span>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          aria-label={`Số lượng món ${index + 1}`}
                          {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                        />
                      </label>
                      <button
                        type="button"
                        className="remove-item-button"
                        onClick={() => {
                          setCreatingFor(null);
                          remove(index);
                        }}
                        disabled={fields.length === 1}
                        aria-label={`Xóa món ${index + 1}`}
                      >
                        <Trash2 aria-hidden="true" size={18} />
                      </button>
                      {errors.items?.[index]?.quantity ? (
                        <small className="item-error" role="alert">
                          {errors.items[index]?.quantity?.message}
                        </small>
                      ) : null}
                      <div className="item-meta">
                        <span className="item-amount">
                          {lineAmount(index) > 0 ? `Thành tiền ${formatVnd(lineAmount(index))}` : "\u00a0"}
                        </span>
                        {onCreateCatalogItem && creatingFor !== index ? (
                          <button
                            type="button"
                            className="icon-text-button"
                            onClick={() => setCreatingFor(index)}
                            aria-label={`Tạo vật phẩm mới cho món ${index + 1}`}
                          >
                            <Plus aria-hidden="true" size={16} />
                            Vật phẩm mới
                          </button>
                        ) : null}
                      </div>
                      {onCreateCatalogItem && creatingFor === index ? (
                        <div className="item-create">
                          <CatalogItemForm
                            submitLabel="Lưu và chọn"
                            onCancel={() => setCreatingFor(null)}
                            onSubmit={async (input) => {
                              const created = await onCreateCatalogItem(input);
                              applyCatalogItem(index, created);
                              setCreatingFor(null);
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {typeof errors.items?.message === "string" ? (
                <small role="alert">{errors.items.message}</small>
              ) : null}
              <button
                type="button"
                className="secondary-button add-item-button"
                onClick={() => append(EMPTY_ITEM)}
              >
                <Plus aria-hidden="true" size={17} />
                Thêm món
              </button>
              <p className="order-total">
                Tổng tiền đơn <strong>{formatVnd(orderAmount)}</strong>
              </p>
            </fieldset>

            <label className="field">
              <span>Ghi chú <em>không bắt buộc</em></span>
              <textarea aria-label="Ghi chú" rows={3} {...register("notes")} />
              {errors.notes ? <small role="alert">{errors.notes.message}</small> : null}
            </label>

            {!isOnline ? (
              <p className="offline-form-note" role="status">
                Đang offline. Kết nối mạng để lưu đơn.
              </p>
            ) : null}
            {submitError ? <p className="form-submit-error" role="alert">{submitError}</p> : null}
          </div>

          <footer className="drawer-footer">
            <button type="button" className="secondary-button" onClick={onClose}>
              Hủy
            </button>
            <button type="submit" className="primary-button" disabled={!isOnline || isSubmitting}>
              {isSubmitting ? "Đang lưu…" : "Lưu đơn"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
