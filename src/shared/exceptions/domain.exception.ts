export class DomainException extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class OrderNotFoundException extends DomainException {
  constructor(orderId: string) {
    super(`Order not found: ${orderId}`, 404);
  }
}

export class InvalidOrderStateException extends DomainException {
  constructor(current: string, attempted: string) {
    super(`Cannot transition order from ${current} to ${attempted}`, 409);
  }
}

export class InsufficientStockException extends DomainException {
  constructor(sku: string) {
    super(`Insufficient stock for SKU: ${sku}`, 409);
  }
}

export class ProductNotFoundException extends DomainException {
  constructor(productId: string) {
    super(`Product not found: ${productId}`, 404);
  }
}

export class DuplicateOrderException extends DomainException {
  constructor(idempotencyKey: string) {
    super(`Order already exists for idempotency key: ${idempotencyKey}`, 409);
  }
}
