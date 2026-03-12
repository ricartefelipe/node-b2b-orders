import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../../shared/audit/audit.service';
import {
  ImportFormat,
  ImportResult,
  ImportError,
  ProductImportRow,
  InventoryImportRow,
  OrderImportRow,
} from './dto';

const MAX_IMPORT_ROWS = 1000;

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async importProducts(
    tenantId: string,
    actorSub: string,
    correlationId: string,
    format: ImportFormat,
    rawData: any,
  ): Promise<ImportResult> {
    const rows = this.parseRows<ProductImportRow>(format, rawData, ['sku', 'name', 'price']);
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(`Maximum ${MAX_IMPORT_ROWS} rows per import`);
    }

    const errors: ImportError[] = [];
    const validRows: { index: number; row: ProductImportRow }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowErrors: string[] = [];

      if (!row.sku || typeof row.sku !== 'string') rowErrors.push('sku is required');
      if (!row.name || typeof row.name !== 'string') rowErrors.push('name is required');

      const price = Number(row.price);
      if (isNaN(price) || price < 0) {
        rowErrors.push('price must be a non-negative number');
      } else {
        row.price = price;
      }

      if (rowErrors.length > 0) {
        errors.push({ row: i + 1, message: rowErrors.join('; ') });
      } else {
        validRows.push({ index: i, row });
      }
    }

    let imported = 0;
    if (validRows.length > 0) {
      try {
        await this.prisma.$transaction(async (tx) => {
          for (const { row } of validRows) {
            await tx.product.upsert({
              where: { tenantId_sku: { tenantId, sku: row.sku } },
              create: {
                tenantId,
                sku: row.sku,
                name: row.name,
                description: row.description ?? '',
                price: row.price,
                currency: row.currency ?? 'BRL',
                category: row.category ?? '',
                inStock: row.inStock ?? true,
              },
              update: {
                name: row.name,
                ...(row.description !== undefined && { description: row.description }),
                price: row.price,
                ...(row.currency !== undefined && { currency: row.currency }),
                ...(row.category !== undefined && { category: row.category }),
                ...(row.inStock !== undefined && { inStock: row.inStock }),
              },
            });
          }
        });
        imported = validRows.length;
      } catch (err: any) {
        errors.push({ row: 0, message: `Transaction failed: ${err.message}` });
      }
    }

    await this.audit.log({
      tenantId,
      actorSub,
      action: 'import.products',
      target: `Products:${tenantId}`,
      detail: { total: rows.length, imported, errorCount: errors.length },
      correlationId,
    });

    return { total: rows.length, imported, errors };
  }

  async importInventory(
    tenantId: string,
    actorSub: string,
    correlationId: string,
    format: ImportFormat,
    rawData: any,
  ): Promise<ImportResult> {
    const rows = this.parseRows<InventoryImportRow>(format, rawData, ['sku', 'qty', 'type']);
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(`Maximum ${MAX_IMPORT_ROWS} rows per import`);
    }

    const errors: ImportError[] = [];
    const validRows: { index: number; row: InventoryImportRow }[] = [];
    const validTypes = ['IN', 'OUT', 'ADJUSTMENT'];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowErrors: string[] = [];

      if (!row.sku || typeof row.sku !== 'string') rowErrors.push('sku is required');

      const qty = Number(row.qty);
      if (isNaN(qty) || qty < 1 || !Number.isInteger(qty)) {
        rowErrors.push('qty must be a positive integer');
      } else {
        row.qty = qty;
      }

      const type = String(row.type).toUpperCase();
      if (!validTypes.includes(type)) {
        rowErrors.push(`type must be one of: ${validTypes.join(', ')}`);
      } else {
        row.type = type as InventoryImportRow['type'];
      }

      if (rowErrors.length > 0) {
        errors.push({ row: i + 1, message: rowErrors.join('; ') });
      } else {
        validRows.push({ index: i, row });
      }
    }

    let imported = 0;
    if (validRows.length > 0) {
      try {
        await this.prisma.$transaction(async (tx) => {
          for (const { row } of validRows) {
            let inv = await tx.inventoryItem.findUnique({
              where: { tenantId_sku: { tenantId, sku: row.sku } },
            });

            if (!inv) {
              if (row.type === 'OUT') {
                throw new BadRequestException(`SKU ${row.sku} not found for OUT adjustment`);
              }
              inv = await tx.inventoryItem.create({
                data: { tenantId, sku: row.sku, availableQty: 0, reservedQty: 0 },
              });
            }

            let newAvailable = inv.availableQty;
            switch (row.type) {
              case 'IN':
                newAvailable += row.qty;
                break;
              case 'OUT':
                if (inv.availableQty < row.qty) {
                  throw new BadRequestException(
                    `Insufficient qty (${inv.availableQty}) for OUT of ${row.qty} on SKU ${row.sku}`,
                  );
                }
                newAvailable -= row.qty;
                break;
              case 'ADJUSTMENT':
                newAvailable = row.qty;
                break;
            }

            await tx.inventoryItem.update({
              where: { tenantId_sku: { tenantId, sku: row.sku } },
              data: { availableQty: newAvailable },
            });

            await tx.inventoryAdjustment.create({
              data: {
                tenantId,
                sku: row.sku,
                type: row.type,
                qty: row.qty,
                reason: row.reason ?? 'bulk import',
                actorSub,
                correlationId,
              },
            });
          }
        });
        imported = validRows.length;
      } catch (err: any) {
        errors.push({ row: 0, message: `Transaction failed: ${err.message}` });
      }
    }

    await this.audit.log({
      tenantId,
      actorSub,
      action: 'import.inventory',
      target: `Inventory:${tenantId}`,
      detail: { total: rows.length, imported, errorCount: errors.length },
      correlationId,
    });

    return { total: rows.length, imported, errors };
  }

  async importOrders(
    tenantId: string,
    actorSub: string,
    correlationId: string,
    format: ImportFormat,
    rawData: any,
  ): Promise<ImportResult> {
    let orderRows: OrderImportRow[];

    if (format === ImportFormat.CSV) {
      orderRows = this.parseOrdersCsv(rawData);
    } else {
      if (!Array.isArray(rawData)) {
        throw new BadRequestException('data must be an array for JSON format');
      }
      orderRows = rawData;
    }

    if (orderRows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(`Maximum ${MAX_IMPORT_ROWS} orders per import`);
    }

    const errors: ImportError[] = [];
    const validRows: { index: number; row: OrderImportRow }[] = [];

    for (let i = 0; i < orderRows.length; i++) {
      const row = orderRows[i];
      const rowErrors: string[] = [];

      if (!row.customerId || typeof row.customerId !== 'string') {
        rowErrors.push('customerId is required');
      }
      if (!Array.isArray(row.items) || row.items.length === 0) {
        rowErrors.push('items must be a non-empty array');
      } else {
        for (let j = 0; j < row.items.length; j++) {
          const item = row.items[j];
          if (!item.sku) rowErrors.push(`items[${j}].sku is required`);
          if (!Number.isInteger(Number(item.qty)) || Number(item.qty) < 1) {
            rowErrors.push(`items[${j}].qty must be a positive integer`);
          }
          if (isNaN(Number(item.price)) || Number(item.price) < 0) {
            rowErrors.push(`items[${j}].price must be non-negative`);
          }
        }
      }

      if (rowErrors.length > 0) {
        errors.push({ row: i + 1, message: rowErrors.join('; ') });
      } else {
        validRows.push({ index: i, row });
      }
    }

    let imported = 0;
    if (validRows.length > 0) {
      try {
        await this.prisma.$transaction(async (tx) => {
          for (const { row } of validRows) {
            const totalAmount = row.items.reduce(
              (sum, item) => sum + Number(item.price) * Number(item.qty),
              0,
            );

            await tx.order.create({
              data: {
                tenantId,
                customerId: row.customerId,
                status: 'CREATED',
                totalAmount,
                items: {
                  create: row.items.map((item) => ({
                    sku: item.sku,
                    qty: Number(item.qty),
                    price: Number(item.price),
                  })),
                },
              },
            });
          }
        });
        imported = validRows.length;
      } catch (err: any) {
        errors.push({ row: 0, message: `Transaction failed: ${err.message}` });
      }
    }

    await this.audit.log({
      tenantId,
      actorSub,
      action: 'import.orders',
      target: `Orders:${tenantId}`,
      detail: { total: orderRows.length, imported, errorCount: errors.length },
      correlationId,
    });

    return { total: orderRows.length, imported, errors };
  }

  private parseRows<T extends Record<string, any>>(
    format: ImportFormat,
    rawData: any,
    requiredHeaders: string[],
  ): T[] {
    if (format === ImportFormat.JSON) {
      if (!Array.isArray(rawData)) {
        throw new BadRequestException('data must be an array for JSON format');
      }
      return rawData;
    }

    if (typeof rawData !== 'string') {
      throw new BadRequestException('data must be a string for CSV format');
    }

    const csvRows = this.parseCsv(rawData);
    if (csvRows.length < 2) {
      throw new BadRequestException('CSV must have a header row and at least one data row');
    }

    const headers = csvRows[0].map((h) => h.trim().toLowerCase());
    for (const req of requiredHeaders) {
      if (!headers.includes(req.toLowerCase())) {
        throw new BadRequestException(`CSV missing required header: ${req}`);
      }
    }

    return csvRows
      .slice(1)
      .filter((row) => row.some((cell) => cell.trim() !== ''))
      .map((row) => {
        const obj: Record<string, any> = {};
        headers.forEach((header, idx) => {
          const val = row[idx]?.trim() ?? '';
          if (val !== '') {
            if (header === 'instock') {
              obj['inStock'] = val.toLowerCase() === 'true';
            } else {
              obj[header] = val;
            }
          }
        });
        return obj as T;
      });
  }

  /**
   * CSV for orders uses a flat row-per-item format:
   *   customerId,sku,qty,price
   * Rows with the same customerId are grouped into a single order.
   */
  private parseOrdersCsv(rawData: any): OrderImportRow[] {
    if (typeof rawData !== 'string') {
      throw new BadRequestException('data must be a string for CSV format');
    }

    const csvRows = this.parseCsv(rawData);
    if (csvRows.length < 2) {
      throw new BadRequestException('CSV must have a header row and at least one data row');
    }

    const headers = csvRows[0].map((h) => h.trim().toLowerCase());
    for (const req of ['customerid', 'sku', 'qty', 'price']) {
      if (!headers.includes(req)) {
        throw new BadRequestException(`CSV missing required header: ${req}`);
      }
    }

    const orderMap = new Map<string, { sku: string; qty: number; price: number }[]>();

    for (const row of csvRows.slice(1)) {
      const obj: Record<string, string> = {};
      headers.forEach((header, idx) => {
        obj[header] = row[idx]?.trim() ?? '';
      });

      if (!obj.customerid) continue;

      const items = orderMap.get(obj.customerid) ?? [];
      items.push({
        sku: obj.sku,
        qty: parseInt(obj.qty, 10),
        price: parseFloat(obj.price),
      });
      orderMap.set(obj.customerid, items);
    }

    return Array.from(orderMap.entries()).map(([customerId, items]) => ({
      customerId,
      items,
    }));
  }

  /** RFC 4180 compliant CSV parser — handles quoted fields, escaped quotes, and newlines in values. */
  parseCsv(content: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;
    let i = 0;

    while (i < content.length) {
      const char = content[i];

      if (inQuotes) {
        if (char === '"') {
          if (i + 1 < content.length && content[i + 1] === '"') {
            currentField += '"';
            i += 2;
          } else {
            inQuotes = false;
            i++;
          }
        } else {
          currentField += char;
          i++;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
          i++;
        } else if (char === ',') {
          currentRow.push(currentField);
          currentField = '';
          i++;
        } else if (char === '\r') {
          currentRow.push(currentField);
          currentField = '';
          rows.push(currentRow);
          currentRow = [];
          if (i + 1 < content.length && content[i + 1] === '\n') {
            i += 2;
          } else {
            i++;
          }
        } else if (char === '\n') {
          currentRow.push(currentField);
          currentField = '';
          rows.push(currentRow);
          currentRow = [];
          i++;
        } else {
          currentField += char;
          i++;
        }
      }
    }

    if (currentField !== '' || currentRow.length > 0) {
      currentRow.push(currentField);
      rows.push(currentRow);
    }

    return rows;
  }
}
