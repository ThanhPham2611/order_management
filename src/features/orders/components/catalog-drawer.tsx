"use client";

import { EyeOff, Eye, PencilLine, Plus, X } from "lucide-react";
import { useState } from "react";

import { formatVnd } from "@/lib/format";
import type { CatalogItem, CatalogItemInput, CatalogItemUpdate } from "../domain/order";
import { CatalogItemForm } from "./catalog-item-form";

interface CatalogDrawerProps {
  items: CatalogItem[];
  isOnline: boolean;
  onClose: () => void;
  onCreate: (input: CatalogItemInput) => Promise<CatalogItem>;
  onUpdate: (id: string, input: CatalogItemUpdate) => Promise<CatalogItem>;
}

export function CatalogDrawer({ items, isOnline, onClose, onCreate, onUpdate }: CatalogDrawerProps) {
  // "new" = add form open, string = id of the item being edited
  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const toggleActive = async (item: CatalogItem) => {
    setActionError(null);
    try {
      await onUpdate(item.id, { name: item.name, price: item.price, unit: item.unit, active: !item.active });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Không thể cập nhật vật phẩm.");
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="order-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="drawer-header">
          <div>
            <p>Danh mục</p>
            <h2 id="catalog-title">Vật phẩm</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng danh mục vật phẩm">
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="drawer-body catalog-body">
          {editing === "new" ? (
            <CatalogItemForm
              submitLabel="Lưu vật phẩm"
              onCancel={() => setEditing(null)}
              onSubmit={async (input) => {
                await onCreate(input);
                setEditing(null);
              }}
            />
          ) : (
            <button
              type="button"
              className="secondary-button add-item-button"
              onClick={() => setEditing("new")}
              disabled={!isOnline}
            >
              <Plus aria-hidden="true" size={17} />
              Thêm vật phẩm
            </button>
          )}

          {actionError ? <p className="form-submit-error" role="alert">{actionError}</p> : null}
          {!isOnline ? <p className="offline-form-note" role="status">Đang offline. Kết nối mạng để lưu thay đổi.</p> : null}

          {items.length === 0 ? (
            <p className="column-empty">Chưa có vật phẩm nào. Thêm vật phẩm để chọn khi tạo đơn.</p>
          ) : (
            <ul className="catalog-list" aria-label="Danh sách vật phẩm">
              {items.map((item) =>
                editing === item.id ? (
                  <li key={item.id}>
                    <CatalogItemForm
                      initial={item}
                      submitLabel="Lưu thay đổi"
                      onCancel={() => setEditing(null)}
                      onSubmit={async (input) => {
                        await onUpdate(item.id, { ...input, active: item.active });
                        setEditing(null);
                      }}
                    />
                  </li>
                ) : (
                  <li key={item.id} className={item.active ? "catalog-row" : "catalog-row catalog-row--hidden"}>
                    <div className="catalog-row__info">
                      <strong>{item.name}</strong>
                      <span>{formatVnd(item.price)} / {item.unit}</span>
                      {item.active ? null : <em>Đã ẩn</em>}
                    </div>
                    <button
                      type="button"
                      className="icon-text-button"
                      onClick={() => setEditing(item.id)}
                      disabled={!isOnline}
                      aria-label={`Sửa ${item.name}`}
                    >
                      <PencilLine aria-hidden="true" size={16} />
                      Sửa
                    </button>
                    <button
                      type="button"
                      className="icon-text-button"
                      onClick={() => void toggleActive(item)}
                      disabled={!isOnline}
                      aria-label={`${item.active ? "Ẩn" : "Hiện"} ${item.name}`}
                    >
                      {item.active ? <EyeOff aria-hidden="true" size={16} /> : <Eye aria-hidden="true" size={16} />}
                      {item.active ? "Ẩn" : "Hiện"}
                    </button>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
