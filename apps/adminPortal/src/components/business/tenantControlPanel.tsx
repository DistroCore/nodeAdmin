import { useQuery } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useApiClient } from '@/hooks/useApiClient';

interface TenantRow {
  key: string;
  name: string;
  roleCount: number;
  status: 'active' | 'review';
}

interface TenantResponse {
  rows: TenantRow[];
}

export function TenantControlPanel(): JSX.Element {
  const { formatMessage: t } = useIntl();
  const apiClient = useApiClient();
  const tenantQuery = useQuery({
    queryFn: () => apiClient.get<TenantResponse>('/api/v1/console/tenants'),
    queryKey: ['console-tenants'],
  });

  const tenantRows = tenantQuery.data?.rows ?? [];

  return (
    <section className="h-full overflow-y-auto">
      <Card className="p-4">
        <CardHeader className="mb-4 flex-row items-start justify-between space-y-0 p-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base">{t({ id: 'tenant.title' })}</CardTitle>
            <CardDescription>{t({ id: 'tenant.desc' })}</CardDescription>
          </div>
          <span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium">
            {t({ id: 'tenant.total' }, { count: tenantRows.length })}
          </span>
        </CardHeader>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t({ id: 'tenant.colId' })}</TableHead>
              <TableHead>{t({ id: 'tenant.colName' })}</TableHead>
              <TableHead>{t({ id: 'tenant.colRoles' })}</TableHead>
              <TableHead>{t({ id: 'tenant.colStatus' })}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenantQuery.isLoading
              ? Array.from({ length: 3 }).map((_, index) => (
                  <TableRow className="hover:bg-muted/50" key={`tenant-skeleton-${index}`}>
                    <TableCell>
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </TableCell>
                  </TableRow>
                ))
              : null}

            {tenantQuery.isError ? (
              <TableRow className="hover:bg-transparent">
                <TableCell className="py-8 text-center text-sm text-destructive" colSpan={4}>
                  {t({ id: 'tenant.loadFailed' })}
                </TableCell>
              </TableRow>
            ) : null}

            {!tenantQuery.isLoading && !tenantQuery.isError && tenantRows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell className="py-8 text-center text-sm text-muted-foreground" colSpan={4}>
                  {t({ id: 'tenant.empty' })}
                </TableCell>
              </TableRow>
            ) : null}

            {!tenantQuery.isLoading && !tenantQuery.isError
              ? tenantRows.map((tenant) => (
                  <TableRow className="hover:bg-muted/50" key={tenant.key}>
                    <TableCell className="font-medium">{tenant.key}</TableCell>
                    <TableCell>{tenant.name}</TableCell>
                    <TableCell>{tenant.roleCount}</TableCell>
                    <TableCell>
                      <span
                        className={
                          tenant.status === 'active'
                            ? 'inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200'
                            : 'inline-flex rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                        }
                      >
                        {tenant.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      </Card>
    </section>
  );
}
