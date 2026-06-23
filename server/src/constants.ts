export const PLUGIN_ID = 'store-analytics';

export const ORDER_UID = 'api::order.order';
export const PRODUCT_UID = 'api::product.product';
export const STORE_SETTING_UID = 'api::store-setting.store-setting';

export const REVENUE_STATUSES = ['paid', 'shipped', 'delivered'] as const;
export const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'] as const;

export const READ_PERMISSION_UID = 'read';
export const MCP_AUTH_ACTION = `plugin::${PLUGIN_ID}.${READ_PERMISSION_UID}`;

export type Currency = 'USD' | 'EUR' | 'GBP';

export const DEFAULT_LOW_STOCK_THRESHOLD = 5;
export const DEFAULT_CURRENCY: Currency = 'USD';
export const DEFAULT_STORE_NAME = 'Demo Store';
export const ORDERS_PAGE_SIZE = 1000;
