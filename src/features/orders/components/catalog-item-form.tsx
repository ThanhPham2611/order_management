"use client";

import { useState } from "react";

import {
  DEFAULT_UNIT,
  ORDER_UNITS,
  catalogItemInputSchema,
  type CatalogItem,
  type CatalogItemInput,
} from "../domain/order";

interface CatalogItemFormProps {
  initial?: CatalogItem | null;
  submitLabel: string;
  onSubmit: (input: CatalogItemInput) => Promise<void>;
  onCancel: () => void;
}

/** Not a <form>: it is also rendered inside the order form, and forms cannot nest. */
export function CatalogItemForm({ initial, submitLabel, onSubmit, onCancel }: CatalogItemFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [price, setPrice] = useState(initial ? String(initial.price) : "");
  const [unit, setUnit] = useState<CatalogItemInput["unit"]>(initial?.unit ?? DEFAULT_UNIT);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const parsed = catalogItemInputSchema.safeParse({
      name,
      price: price === "" ? undefined : Number(price),
      unit,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSubmit(parsed.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể lưu vật phẩm.");
    } finally {
      setBusy(false);
    }
  };

  const submitOnEnter = (event: React.KeyboardEvent) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void submit();
  };

  return (
    <div className="inline-form" role="group" aria-label={initial ? "Sửa vật phẩm" : "Vật phẩm mới"}>
      <label className="field inline-form__name">
        <span>Tên vật phẩm</span>
        <input aria-label="Tên vật phẩm" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={submitOnEnter} autoFocus />
      </label>
      <label className="field">
        <span>Giá (₫)</span>
        <input
          aria-label="Giá (₫)"
          type="number"
          inputMode="numeric"
          min="0"
          step="1000"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onKeyDown={submitOnEnter}
        />
      </label>
      <label className="field">
        <span>Đơn vị</span>
        <select aria-label="Đơn vị" value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)}>
          {ORDER_UNITS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
      {error ? <small className="inline-form__error" role="alert">{error}</small> : null}
      <div className="inline-form__actions">
        <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>Hủy</button>
        <button type="button" className="primary-button" onClick={() => void submit()} disabled={busy}>
          {busy ? "Đang lưu…" : submitLabel}
        </button>
      </div>
    </div>
  );
}
