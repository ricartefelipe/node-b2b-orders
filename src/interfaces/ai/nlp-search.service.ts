import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export interface ParsedOrderQuery {
  status?: string;
  customerId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  minAmount?: number;
  maxAmount?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'totalAmount';
  sortOrder?: 'asc' | 'desc';
}

export interface ParsedProductQuery {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  nameSearch?: string;
  limit?: number;
  sortBy?: 'price' | 'sales' | 'createdAt' | 'rating';
  sortOrder?: 'asc' | 'desc';
}

const MONTH_MAP: Record<string, number> = {
  janeiro: 0, fevereiro: 1, marco: 2, março: 2,
  abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8,
  outubro: 9, novembro: 10, dezembro: 11,
};

const STATUS_MAP: Record<string, string> = {
  criado: 'CREATED', criados: 'CREATED',
  confirmado: 'CONFIRMED', confirmados: 'CONFIRMED',
  pago: 'PAID', pagos: 'PAID',
  enviado: 'SHIPPED', enviados: 'SHIPPED',
  entregue: 'DELIVERED', entregues: 'DELIVERED',
  cancelado: 'CANCELLED', cancelados: 'CANCELLED',
};

@Injectable()
export class NlpSearchService {
  constructor(private readonly prisma: PrismaService) {}

  parseOrderQuery(query: string): ParsedOrderQuery {
    const q = this.normalize(query);
    const result: ParsedOrderQuery = {};

    this.extractOrderStatus(q, result);
    this.extractAmountFilters(q, result);
    this.extractDateFilters(q, result);
    this.extractLimit(q, result);
    this.extractOrderSort(q, result);
    this.extractCustomerId(q, result);

    return result;
  }

  parseProductQuery(query: string): ParsedProductQuery {
    const q = this.normalize(query);
    const result: ParsedProductQuery = {};

    this.extractPriceFilters(q, result);
    this.extractStockFilter(q, result);
    this.extractCategory(q, result);
    this.extractProductLimit(q, result);
    this.extractProductSort(q, result);

    return result;
  }

  async searchOrders(tenantId: string, naturalQuery: string) {
    const filters = this.parseOrderQuery(naturalQuery);

    const where: Record<string, unknown> = { tenantId };

    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.customerId) {
      where.customerId = filters.customerId;
    }

    const dateFilter: Record<string, Date> = {};
    if (filters.dateFrom) dateFilter.gte = filters.dateFrom;
    if (filters.dateTo) dateFilter.lte = filters.dateTo;
    if (Object.keys(dateFilter).length > 0) {
      where.createdAt = dateFilter;
    }

    const amountFilter: Record<string, number> = {};
    if (filters.minAmount !== undefined) amountFilter.gte = filters.minAmount;
    if (filters.maxAmount !== undefined) amountFilter.lte = filters.maxAmount;
    if (Object.keys(amountFilter).length > 0) {
      where.totalAmount = amountFilter;
    }

    const orders = await this.prisma.order.findMany({
      where,
      include: { items: true },
      orderBy: {
        [filters.sortBy ?? 'createdAt']: filters.sortOrder ?? 'desc',
      },
      take: filters.limit ?? 20,
    });

    return {
      parsedFilters: filters,
      total: orders.length,
      orders,
    };
  }

  async searchProducts(tenantId: string, naturalQuery: string) {
    const filters = this.parseProductQuery(naturalQuery);

    const where: Record<string, unknown> = { tenantId, active: true };

    if (filters.category) {
      where.category = { contains: filters.category, mode: 'insensitive' };
    }
    if (filters.inStock !== undefined) {
      where.inStock = filters.inStock;
    }
    if (filters.nameSearch) {
      where.name = { contains: filters.nameSearch, mode: 'insensitive' };
    }

    const priceFilter: Record<string, number> = {};
    if (filters.minPrice !== undefined) priceFilter.gte = filters.minPrice;
    if (filters.maxPrice !== undefined) priceFilter.lte = filters.maxPrice;
    if (Object.keys(priceFilter).length > 0) {
      where.price = priceFilter;
    }

    let orderBy: Record<string, string> = {};
    if (filters.sortBy === 'price') {
      orderBy = { price: filters.sortOrder ?? 'asc' };
    } else if (filters.sortBy === 'rating') {
      orderBy = { rating: filters.sortOrder ?? 'desc' };
    } else if (filters.sortBy === 'createdAt') {
      orderBy = { createdAt: filters.sortOrder ?? 'desc' };
    } else if (filters.sortBy === 'sales') {
      orderBy = { reviewCount: filters.sortOrder ?? 'desc' };
    }

    const products = await this.prisma.product.findMany({
      where,
      orderBy: Object.keys(orderBy).length > 0 ? orderBy : { createdAt: 'desc' },
      take: filters.limit ?? 20,
    });

    return {
      parsedFilters: filters,
      total: products.length,
      products,
    };
  }

  private normalize(query: string): string {
    return query
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  private extractOrderStatus(q: string, result: ParsedOrderQuery): void {
    for (const [word, status] of Object.entries(STATUS_MAP)) {
      if (q.includes(word)) {
        result.status = status;
        return;
      }
    }
  }

  private extractAmountFilters(q: string, result: ParsedOrderQuery): void {
    const aboveMatch = q.match(/acima\s+de\s+(\d+(?:[.,]\d+)?)\s*(?:reais|r\$|brl)?/);
    if (aboveMatch) {
      result.minAmount = this.parseNumber(aboveMatch[1]);
    }

    const belowMatch = q.match(/abaixo\s+de\s+(\d+(?:[.,]\d+)?)\s*(?:reais|r\$|brl)?/);
    if (belowMatch) {
      result.maxAmount = this.parseNumber(belowMatch[1]);
    }

    const rsMatch = q.match(/r\$\s*(\d+(?:[.,]\d+)?)/);
    if (rsMatch && result.minAmount === undefined && result.maxAmount === undefined) {
      result.minAmount = this.parseNumber(rsMatch[1]);
    }

    if (!aboveMatch && !belowMatch && !rsMatch) {
      const reaisMatch = q.match(/(\d+(?:[.,]\d+)?)\s*reais/);
      if (reaisMatch) {
        result.minAmount = this.parseNumber(reaisMatch[1]);
      }
    }
  }

  private extractDateFilters(q: string, result: ParsedOrderQuery): void {
    const monthMatch = q.match(
      /(?:de\s+)?(janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+(\d{4}))?/,
    );
    if (monthMatch) {
      const monthName = monthMatch[1].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const month = MONTH_MAP[monthName];
      const year = monthMatch[2] ? parseInt(monthMatch[2], 10) : new Date().getFullYear();
      if (month !== undefined) {
        result.dateFrom = new Date(year, month, 1);
        result.dateTo = new Date(year, month + 1, 0, 23, 59, 59, 999);
      }
    }

    const lastDaysMatch = q.match(/ultimos?\s+(\d+)\s*dias/);
    if (lastDaysMatch) {
      const days = parseInt(lastDaysMatch[1], 10);
      const from = new Date();
      from.setDate(from.getDate() - days);
      from.setHours(0, 0, 0, 0);
      result.dateFrom = from;
      result.dateTo = new Date();
    }

    if (q.includes('ultimo mes') || q.includes('mes passado')) {
      const now = new Date();
      result.dateFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      result.dateTo = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    }

    if (q.includes('esta semana') || q.includes('essa semana')) {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const from = new Date(now);
      from.setDate(from.getDate() - dayOfWeek);
      from.setHours(0, 0, 0, 0);
      result.dateFrom = from;
      result.dateTo = new Date();
    }

    if (q.includes('hoje')) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      result.dateFrom = today;
      result.dateTo = new Date();
    }
  }

  private extractLimit(q: string, result: ParsedOrderQuery): void {
    const ultimosMatch = q.match(/ultimos?\s+(\d+)\s+pedidos/);
    if (ultimosMatch) {
      result.limit = parseInt(ultimosMatch[1], 10);
      result.sortOrder = result.sortOrder ?? 'desc';
      return;
    }

    const topMatch = q.match(/top\s+(\d+)/);
    if (topMatch) {
      result.limit = parseInt(topMatch[1], 10);
      return;
    }

    const primeirosMatch = q.match(/primeiros?\s+(\d+)/);
    if (primeirosMatch) {
      result.limit = parseInt(primeirosMatch[1], 10);
      result.sortOrder = result.sortOrder ?? 'asc';
    }
  }

  private extractOrderSort(q: string, result: ParsedOrderQuery): void {
    if (q.includes('mais recente') || q.includes('mais novos') || q.includes('mais novo')) {
      result.sortBy = 'createdAt';
      result.sortOrder = 'desc';
    } else if (q.includes('mais antigo') || q.includes('mais velhos') || q.includes('mais velho')) {
      result.sortBy = 'createdAt';
      result.sortOrder = 'asc';
    } else if (q.includes('mais caro') || q.includes('maior valor')) {
      result.sortBy = 'totalAmount';
      result.sortOrder = 'desc';
    } else if (q.includes('mais barato') || q.includes('menor valor')) {
      result.sortBy = 'totalAmount';
      result.sortOrder = 'asc';
    }
  }

  private extractCustomerId(q: string, result: ParsedOrderQuery): void {
    const clienteMatch = q.match(/cliente\s+([a-z0-9-]+)/i);
    if (clienteMatch) {
      result.customerId = clienteMatch[1];
    }
  }

  private extractPriceFilters(q: string, result: ParsedProductQuery): void {
    const aboveMatch = q.match(/acima\s+de\s+(\d+(?:[.,]\d+)?)\s*(?:reais|r\$|brl)?/);
    if (aboveMatch) {
      result.minPrice = this.parseNumber(aboveMatch[1]);
    }

    const belowMatch = q.match(/abaixo\s+de\s+(\d+(?:[.,]\d+)?)\s*(?:reais|r\$|brl)?/);
    if (belowMatch) {
      result.maxPrice = this.parseNumber(belowMatch[1]);
    }

    const rsMatch = q.match(/r\$\s*(\d+(?:[.,]\d+)?)/);
    if (rsMatch && result.minPrice === undefined && result.maxPrice === undefined) {
      result.maxPrice = this.parseNumber(rsMatch[1]);
    }

    const entreMatch = q.match(/entre\s+(\d+(?:[.,]\d+)?)\s*(?:e|a)\s*(\d+(?:[.,]\d+)?)/);
    if (entreMatch) {
      result.minPrice = this.parseNumber(entreMatch[1]);
      result.maxPrice = this.parseNumber(entreMatch[2]);
    }
  }

  private extractStockFilter(q: string, result: ParsedProductQuery): void {
    if (q.includes('em estoque') || q.includes('disponivel') || q.includes('disponivel')) {
      result.inStock = true;
    } else if (q.includes('sem estoque') || q.includes('esgotado') || q.includes('indisponivel')) {
      result.inStock = false;
    }
  }

  private extractCategory(q: string, result: ParsedProductQuery): void {
    const categories = [
      'eletronico', 'eletronicos', 'informatica', 'moveis', 'movel',
      'roupa', 'roupas', 'vestuario', 'alimento', 'alimentos',
      'bebida', 'bebidas', 'ferramenta', 'ferramentas',
      'brinquedo', 'brinquedos', 'esporte', 'esportes',
      'livro', 'livros', 'papelaria', 'escritorio',
      'higiene', 'limpeza', 'automotivo', 'jardim',
      'pet', 'saude', 'beleza', 'cosmetico', 'cosmeticos',
    ];

    for (const cat of categories) {
      if (q.includes(cat)) {
        result.category = cat;
        return;
      }
    }
  }

  private extractProductLimit(q: string, result: ParsedProductQuery): void {
    const topMatch = q.match(/top\s+(\d+)/);
    if (topMatch) {
      result.limit = parseInt(topMatch[1], 10);
      return;
    }

    const primeirosMatch = q.match(/primeiros?\s+(\d+)/);
    if (primeirosMatch) {
      result.limit = parseInt(primeirosMatch[1], 10);
    }
  }

  private extractProductSort(q: string, result: ParsedProductQuery): void {
    if (q.includes('mais vendido') || q.includes('mais vendidos') || q.includes('popular')) {
      result.sortBy = 'sales';
      result.sortOrder = 'desc';
    } else if (q.includes('mais caro') || q.includes('maior preco')) {
      result.sortBy = 'price';
      result.sortOrder = 'desc';
    } else if (q.includes('mais barato') || q.includes('menor preco')) {
      result.sortBy = 'price';
      result.sortOrder = 'asc';
    } else if (q.includes('melhor avaliado') || q.includes('mais bem avaliado') || q.includes('melhor nota')) {
      result.sortBy = 'rating';
      result.sortOrder = 'desc';
    } else if (q.includes('mais recente') || q.includes('lancamento') || q.includes('novo')) {
      result.sortBy = 'createdAt';
      result.sortOrder = 'desc';
    }
  }

  private parseNumber(value: string): number {
    return parseFloat(value.replace(',', '.'));
  }
}
