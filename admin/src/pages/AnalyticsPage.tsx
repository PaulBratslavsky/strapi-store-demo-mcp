import { useMemo, useState } from 'react';

import {
  Badge,
  Box,
  Divider,
  EmptyStateLayout,
  Flex,
  Grid,
  SingleSelect,
  SingleSelectOption,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Typography,
} from '@strapi/design-system';
import { Layouts, Page, useFetchClient } from '@strapi/strapi/admin';
import { useQueries } from 'react-query';

import { PERMISSIONS } from '../permissions';

type PeriodPreset = 'last_30_days' | 'last_90_days' | 'all_time';

type DateRange = {
  from?: string;
  to?: string;
};

const resolveDateRange = (preset: PeriodPreset): DateRange => {
  if (preset === 'all_time') {
    return {};
  }

  const days = preset === 'last_30_days' ? 30 : 90;
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  return { from };
};

type Currency = 'USD' | 'EUR' | 'GBP';

type StoreKpis = {
  storeName: string;
  currency: Currency;
  from: string | null;
  to: string | null;
  revenue: number;
  orderCount: number;
  averageOrderValue: number;
  ordersByStatus: Record<string, number>;
};

type TopProduct = {
  documentId: string;
  name: string;
  slug: string;
  unitsSold: number;
  revenue: number;
};

type TopProductsResponse = {
  from: string | null;
  to: string | null;
  currency: Currency;
  products: TopProduct[];
};

type LowStockProduct = {
  documentId: string;
  name: string;
  slug: string;
  sku: string | null;
  stock: number;
  category: { name: string; slug: string } | null;
};

type LowStockResponse = {
  threshold: number;
  currency: Currency;
  products: LowStockProduct[];
};

const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'last_90_days', label: 'Last 90 days' },
  { value: 'all_time', label: 'All time' },
];

const STATUS_ORDER = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'] as const;

const STATUS_VARIANTS: Record<
  string,
  'secondary' | 'success' | 'primary' | 'danger' | 'neutral'
> = {
  pending: 'secondary',
  paid: 'success',
  shipped: 'primary',
  delivered: 'success',
  cancelled: 'danger',
};

const formatMoney = (value: number, currency: Currency): string =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const formatStatusLabel = (status: string): string =>
  status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const getStatusVariant = (
  status: string
): 'secondary' | 'success' | 'primary' | 'danger' | 'neutral' => {
  return STATUS_VARIANTS[status] ?? 'neutral';
};

type KpiCardProps = {
  label: string;
  value: string | number;
  description: string;
};

function KpiCard({ label, value, description }: KpiCardProps) {
  return (
    <Box background="neutral0" padding={6} hasRadius shadow="tableShadow" height="100%">
      <Flex direction="column" gap={2}>
        <Typography variant="sigma" textColor="neutral500" textTransform="uppercase">
          {label}
        </Typography>
        <Typography variant="alpha" textColor="neutral900" fontWeight="bold">
          {value}
        </Typography>
        <Divider />
        <Typography variant="pi" textColor="neutral500">
          {description}
        </Typography>
      </Flex>
    </Box>
  );
}

type SectionProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

function SectionBox({ title, subtitle, children }: SectionProps) {
  return (
    <Box background="neutral0" padding={6} hasRadius shadow="tableShadow">
      <Flex direction="column" gap={4}>
        <Flex direction="column" gap={1}>
          <Typography variant="delta" textColor="neutral700" fontWeight="bold">
            {title}
          </Typography>
          {subtitle !== undefined && (
            <Typography variant="pi" textColor="neutral500">
              {subtitle}
            </Typography>
          )}
        </Flex>
        {children}
      </Flex>
    </Box>
  );
}

function TableSection({ title, subtitle, children }: SectionProps) {
  return (
    <Box background="neutral0" hasRadius shadow="tableShadow" overflow="hidden">
      <Box padding={6} paddingBottom={4}>
        <Flex direction="column" gap={1}>
          <Typography variant="delta" textColor="neutral700" fontWeight="bold">
            {title}
          </Typography>
          {subtitle !== undefined && (
            <Typography variant="pi" textColor="neutral500">
              {subtitle}
            </Typography>
          )}
        </Flex>
      </Box>
      <Divider />
      {children}
    </Box>
  );
}

function AnalyticsPageContent() {
  const { get } = useFetchClient();
  const [preset, setPreset] = useState<PeriodPreset>('last_30_days');

  const [kpisQuery, topProductsQuery, lowStockQuery] = useQueries([
    {
      queryKey: ['store-analytics', 'kpis', preset],
      async queryFn() {
        const { data } = await get<StoreKpis>('/store-analytics/kpis', {
          params: resolveDateRange(preset),
        });

        return data;
      },
    },
    {
      queryKey: ['store-analytics', 'top-products', preset],
      async queryFn() {
        const { data } = await get<TopProductsResponse>('/store-analytics/top-products', {
          params: { ...resolveDateRange(preset), limit: 5 },
        });

        return data;
      },
    },
    {
      queryKey: ['store-analytics', 'low-stock'],
      async queryFn() {
        const { data } = await get<LowStockResponse>('/store-analytics/low-stock', {
          params: { limit: 10 },
        });

        return data;
      },
    },
  ]);

  const kpis = kpisQuery.data;
  const topProducts = topProductsQuery.data;
  const lowStock = lowStockQuery.data;
  const currency = kpis?.currency ?? topProducts?.currency ?? lowStock?.currency ?? 'USD';

  const isLoading =
    kpisQuery.isLoading === true ||
    topProductsQuery.isLoading === true ||
    lowStockQuery.isLoading === true;

  const statusEntries = useMemo(() => {
    return STATUS_ORDER.map((status) => ({
      status,
      count: kpis?.ordersByStatus[status] ?? 0,
    }));
  }, [kpis]);

  if (isLoading === true) {
    return <Page.Loading />;
  }

  if (
    kpisQuery.isError === true ||
    topProductsQuery.isError === true ||
    lowStockQuery.isError === true
  ) {
    return <Page.Error />;
  }

  return (
    <Page.Main>
      <Page.Title>{kpis?.storeName ?? 'Store Analytics'}</Page.Title>

      <Layouts.Header
        title={kpis?.storeName ?? 'Store Analytics'}
        subtitle="Revenue, best sellers, and inventory alerts."
      />

      <Layouts.Action
        endActions={
          <Box minWidth="200px">
            <SingleSelect
              aria-label="Analytics period"
              value={preset}
              onChange={(value) => {
                if (
                  value === 'last_30_days' ||
                  value === 'last_90_days' ||
                  value === 'all_time'
                ) {
                  setPreset(value);
                }
              }}
            >
              {PERIOD_OPTIONS.map((option) => (
                <SingleSelectOption key={option.value} value={option.value}>
                  {option.label}
                </SingleSelectOption>
              ))}
            </SingleSelect>
          </Box>
        }
      />

      <Layouts.Content>
        <Flex direction="column" alignItems="stretch" gap={6}>

          {/* KPI row */}
          <Grid.Root gap={4} gridCols={3}>
            <Grid.Item col={1} xs={12} direction="column" alignItems="stretch">
              <KpiCard
                label="Revenue"
                value={formatMoney(kpis?.revenue ?? 0, currency)}
                description="Paid, shipped &amp; delivered orders"
              />
            </Grid.Item>
            <Grid.Item col={1} xs={12} direction="column" alignItems="stretch">
              <KpiCard
                label="Orders"
                value={kpis?.orderCount ?? 0}
                description="Revenue-eligible orders in period"
              />
            </Grid.Item>
            <Grid.Item col={1} xs={12} direction="column" alignItems="stretch">
              <KpiCard
                label="Avg. order value"
                value={formatMoney(kpis?.averageOrderValue ?? 0, currency)}
                description="Revenue ÷ order count"
              />
            </Grid.Item>
          </Grid.Root>

          {/* Status breakdown */}
          <SectionBox title="Orders by status">
            <Grid.Root gap={3} gridCols={5}>
              {statusEntries.map(({ status, count }) => (
                <Grid.Item key={status} col={1} xs={12} direction="column" alignItems="stretch">
                  <Box background="neutral100" padding={4} hasRadius>
                    <Flex direction="column" alignItems="center" gap={2}>
                      <Badge variant={count > 0 ? getStatusVariant(status) : 'neutral'}>
                        {formatStatusLabel(status)}
                      </Badge>
                      <Typography
                        variant="beta"
                        textColor={count > 0 ? 'neutral800' : 'neutral400'}
                      >
                        {count}
                      </Typography>
                    </Flex>
                  </Box>
                </Grid.Item>
              ))}
            </Grid.Root>
          </SectionBox>

          {/* Top products + Low stock */}
          <Grid.Root gap={4} gridCols={2}>
            <Grid.Item col={1} xs={12} direction="column" alignItems="stretch">
              <TableSection
                title="Top products"
                subtitle="Ranked by line-item revenue (quantity × unit price)"
              >
                {topProducts !== undefined && topProducts.products.length > 0 ? (
                  <Table colCount={4} rowCount={topProducts.products.length + 1}>
                    <Thead>
                      <Tr>
                        <Th>
                          <Typography variant="sigma">#</Typography>
                        </Th>
                        <Th>
                          <Typography variant="sigma">Product</Typography>
                        </Th>
                        <Th>
                          <Typography variant="sigma">Units</Typography>
                        </Th>
                        <Th>
                          <Typography variant="sigma">Revenue</Typography>
                        </Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {topProducts.products.map((product, index) => (
                        <Tr key={product.documentId}>
                          <Td>
                            <Typography variant="pi" textColor="neutral400" fontWeight="bold">
                              {index + 1}
                            </Typography>
                          </Td>
                          <Td>
                            <Typography textColor="neutral800" fontWeight="bold">
                              {product.name}
                            </Typography>
                          </Td>
                          <Td>
                            <Typography textColor="neutral700">{product.unitsSold}</Typography>
                          </Td>
                          <Td>
                            <Typography textColor="neutral800">
                              {formatMoney(product.revenue, currency)}
                            </Typography>
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                ) : (
                  <Box padding={6}>
                    <EmptyStateLayout content="No product sales in this period." />
                  </Box>
                )}
              </TableSection>
            </Grid.Item>

            <Grid.Item col={1} xs={12} direction="column" alignItems="stretch">
              <TableSection
                title="Low stock"
                subtitle={`Products at or below threshold (${lowStock?.threshold ?? '—'})`}
              >
                {lowStock !== undefined && lowStock.products.length > 0 ? (
                  <Table colCount={4} rowCount={lowStock.products.length + 1}>
                    <Thead>
                      <Tr>
                        <Th>
                          <Typography variant="sigma">Product</Typography>
                        </Th>
                        <Th>
                          <Typography variant="sigma">Stock</Typography>
                        </Th>
                        <Th>
                          <Typography variant="sigma">SKU</Typography>
                        </Th>
                        <Th>
                          <Typography variant="sigma">Category</Typography>
                        </Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {lowStock.products.map((product) => (
                        <Tr key={product.documentId}>
                          <Td>
                            <Typography textColor="neutral800" fontWeight="bold">
                              {product.name}
                            </Typography>
                          </Td>
                          <Td>
                            <Typography
                              fontWeight="bold"
                              textColor={product.stock === 0 ? 'danger600' : 'warning600'}
                            >
                              {product.stock}
                            </Typography>
                          </Td>
                          <Td>
                            <Typography textColor="neutral600">{product.sku ?? '—'}</Typography>
                          </Td>
                          <Td>
                            <Typography textColor="neutral600">
                              {product.category?.name ?? '—'}
                            </Typography>
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                ) : (
                  <Box padding={6}>
                    <EmptyStateLayout content="All products are above the low stock threshold." />
                  </Box>
                )}
              </TableSection>
            </Grid.Item>
          </Grid.Root>

        </Flex>
      </Layouts.Content>
    </Page.Main>
  );
}

export default function AnalyticsPage() {
  return (
    <Page.Protect permissions={PERMISSIONS.read}>
      <AnalyticsPageContent />
    </Page.Protect>
  );
}
