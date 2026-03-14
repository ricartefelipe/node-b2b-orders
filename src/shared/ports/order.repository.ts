export interface CreateOrderItemData {
  sku: string;
  qty: number;
  price: number;
}

export interface CreateOrderData {
  tenantId: string;
  customerId: string;
  status: string;
  items: CreateOrderItemData[];
}

export interface OrderItem {
  id: string;
  sku: string;
  qty: number;
  price: number;
}

export interface Order {
  id: string;
  tenantId: string;
  customerId: string;
  status: string;
  totalAmount: number | null;
  trackingCode: string | null;
  trackingUrl: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: OrderItem[];
}

export interface ListParams {
  status?: string;
  cursor?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}

export interface CursorResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface IOrderRepository {
  create(data: CreateOrderData): Promise<Order>;
  findById(tenantId: string, id: string): Promise<Order | null>;
  findMany(tenantId: string, params: ListParams): Promise<CursorResult<Order>>;
  updateStatus(tenantId: string, id: string, status: string): Promise<Order>;
}
