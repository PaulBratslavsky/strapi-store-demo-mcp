import type { Core } from '@strapi/strapi';

import {
  DEFAULT_CURRENCY,
  DEFAULT_LOW_STOCK_THRESHOLD,
  DEFAULT_STORE_NAME,
  ORDER_UID,
  ORDERS_PAGE_SIZE,
  PRODUCT_UID,
  REVENUE_STATUSES,
  STORE_SETTING_UID,
  type Currency,
} from '../constants';

type OrderLine = {
  quantity?: number;
  unitPrice?: number | string;
  product?: {
    documentId?: string;
    name?: string;
    slug?: string;
  } | null;
};

type OrderDocument = {
  documentId?: string;
  status?: string;
  total?: number | string;
  orderedAt?: string;
  lines?: OrderLine[];
};

type ProductDocument = {
  documentId?: string;
  name?: string;
  slug?: string;
  sku?: string | null;
  stock?: number;
  category?: {
    name?: string;
    slug?: string;
  } | null;
};

type StoreSettingsDocument = {
  storeName?: string;
  currency?: Currency;
  lowStockThreshold?: number;
};

export type GetStoreKpisInput = {
  from?: string;
  to?: string;
};

export type GetTopProductsInput = {
  from?: string;
  to?: string;
  limit?: number;
};

export type GetLowStockProductsInput = {
  limit?: number;
};

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

const toNumber = (value: number | string | undefined): number => {
  if (value === undefined) {
    return 0;
  }

  const parsed = typeof value === 'number' ? value : Number(value);

  if (Number.isNaN(parsed) === true) {
    return 0;
  }

  return parsed;
};

const sumLineRevenue = (lines: OrderLine[] | undefined): number => {
  if (lines === undefined || lines.length === 0) {
    return 0;
  }

  return lines.reduce((total, line) => {
    const quantity = line.quantity ?? 0;
    const unitPrice = toNumber(line.unitPrice);

    return total + quantity * unitPrice;
  }, 0);
};

const getOrderRevenue = (order: OrderDocument): number => {
  const lineRevenue = sumLineRevenue(order.lines);

  if (lineRevenue > 0) {
    return roundMoney(lineRevenue);
  }

  return roundMoney(toNumber(order.total));
};

const buildOrderedAtFilter = (from?: string, to?: string) => {
  const filter: Record<string, string> = {};

  if (from !== undefined) {
    filter.$gte = from;
  }

  if (to !== undefined) {
    filter.$lte = to;
  }

  if (Object.keys(filter).length === 0) {
    return undefined;
  }

  return filter;
};

export const analytics = ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * Product is localized; queries use the default locale (no locale param).
   */
  async getStoreSettings() {
    const settings = (await strapi.documents(STORE_SETTING_UID).findFirst({
      fields: ['storeName', 'currency', 'lowStockThreshold'],
    })) as StoreSettingsDocument | null;

    return settings;
  },

  async getOrdersInPeriod(from?: string, to?: string) {
    const orderedAtFilter = buildOrderedAtFilter(from, to);
    const filters: Record<string, unknown> = {
      status: { $in: [...REVENUE_STATUSES] },
    };

    if (orderedAtFilter !== undefined) {
      filters.orderedAt = orderedAtFilter;
    }

    const orders = (await strapi.documents(ORDER_UID).findMany({
      filters,
      populate: {
        lines: {
          populate: {
            product: { fields: ['name', 'slug', 'documentId'] },
          },
        },
      },
      pagination: { pageSize: ORDERS_PAGE_SIZE },
    })) as OrderDocument[];

    return orders;
  },

  async getAllOrdersInPeriod(from?: string, to?: string) {
    const orderedAtFilter = buildOrderedAtFilter(from, to);
    const filters: Record<string, unknown> = {};

    if (orderedAtFilter !== undefined) {
      filters.orderedAt = orderedAtFilter;
    }

    const orders = (await strapi.documents(ORDER_UID).findMany({
      filters,
      fields: ['status'],
      pagination: { pageSize: ORDERS_PAGE_SIZE },
    })) as OrderDocument[];

    return orders;
  },

  async getStoreKpis(input: GetStoreKpisInput = {}) {
    const { from, to } = input;
    const settings = await this.getStoreSettings();
    const revenueOrders = await this.getOrdersInPeriod(from, to);
    const allOrders = await this.getAllOrdersInPeriod(from, to);

    const revenue = roundMoney(
      revenueOrders.reduce((total, order) => total + getOrderRevenue(order), 0)
    );
    const orderCount = revenueOrders.length;
    const averageOrderValue =
      orderCount > 0 ? roundMoney(revenue / orderCount) : 0;

    const ordersByStatus = allOrders.reduce<Record<string, number>>((counts, order) => {
      const status = order.status ?? 'unknown';
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    }, {});

    return {
      storeName: settings?.storeName ?? DEFAULT_STORE_NAME,
      currency: settings?.currency ?? DEFAULT_CURRENCY,
      from: from ?? null,
      to: to ?? null,
      revenue,
      orderCount,
      averageOrderValue,
      ordersByStatus,
    };
  },

  async getTopProducts(input: GetTopProductsInput = {}) {
    const { from, to } = input;
    const limit = Math.min(Math.max(input.limit ?? 5, 1), 20);
    const settings = await this.getStoreSettings();
    const revenueOrders = await this.getOrdersInPeriod(from, to);

    const productMap = new Map<
      string,
      { documentId: string; name: string; slug: string; unitsSold: number; revenue: number }
    >();

    for (const order of revenueOrders) {
      const lines = order.lines ?? [];

      for (const line of lines) {
        const product = line.product;

        if (product === undefined || product === null || product.documentId === undefined) {
          continue;
        }

        const documentId = product.documentId;
        const existing = productMap.get(documentId);
        const lineRevenue = roundMoney((line.quantity ?? 0) * toNumber(line.unitPrice));
        const unitsSold = line.quantity ?? 0;

        if (existing === undefined) {
          productMap.set(documentId, {
            documentId,
            name: product.name ?? 'Unknown product',
            slug: product.slug ?? documentId,
            unitsSold,
            revenue: lineRevenue,
          });
        } else {
          existing.unitsSold += unitsSold;
          existing.revenue = roundMoney(existing.revenue + lineRevenue);
        }
      }
    }

    const products = [...productMap.values()]
      .sort((a, b) => {
        if (b.revenue !== a.revenue) {
          return b.revenue - a.revenue;
        }

        return b.unitsSold - a.unitsSold;
      })
      .slice(0, limit);

    return {
      from: from ?? null,
      to: to ?? null,
      currency: settings?.currency ?? DEFAULT_CURRENCY,
      products,
    };
  },

  async getLowStockProducts(input: GetLowStockProductsInput = {}) {
    const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
    const settings = await this.getStoreSettings();
    const threshold = settings?.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;

    const products = (await strapi.documents(PRODUCT_UID).findMany({
      filters: { stock: { $lte: threshold } },
      fields: ['name', 'slug', 'stock', 'sku'],
      populate: { category: { fields: ['name', 'slug'] } },
      sort: ['stock:asc'],
      pagination: { pageSize: limit },
    })) as ProductDocument[];

    return {
      threshold,
      currency: settings?.currency ?? DEFAULT_CURRENCY,
      products: products.map((product) => ({
        documentId: product.documentId ?? '',
        name: product.name ?? 'Unknown product',
        slug: product.slug ?? '',
        sku: product.sku ?? null,
        stock: product.stock ?? 0,
        category:
          product.category !== undefined && product.category !== null
            ? {
                name: product.category.name ?? '',
                slug: product.category.slug ?? '',
              }
            : null,
      })),
    };
  },
});
