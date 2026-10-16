import type {
  CatalogItem,
  CatalogItemInput,
  CatalogItemUpdate,
  Order,
  OrderInput,
  OrderStatus,
} from "../domain/order";

export interface OrderRepository {
  list(): Promise<Order[]>;
  create(input: OrderInput): Promise<Order>;
  update(order: Pick<Order, "id" | "version">, input: OrderInput): Promise<Order>;
  setStatus(order: Pick<Order, "id" | "version">, status: OrderStatus): Promise<Order>;
  listCatalog(): Promise<CatalogItem[]>;
  createCatalogItem(input: CatalogItemInput): Promise<CatalogItem>;
  updateCatalogItem(id: string, input: CatalogItemUpdate): Promise<CatalogItem>;
  /** Fires on any change to orders or the catalog. */
  subscribe(onChange: () => void): () => void;
}
