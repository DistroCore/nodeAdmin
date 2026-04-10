import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export interface DataColumn<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

export interface PaginationConfig {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageInfo?: string;
  prevLabel: string;
  nextLabel: string;
}

export interface DataTableProps<T> {
  columns: DataColumn<T>[];
  data: T[];
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  emptyMessage: string;
  retryLabel?: string;
  pagination?: PaginationConfig;
  rowKey: (row: T) => string;
}

export function DataTable<T>({
  columns,
  data,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  emptyMessage,
  retryLabel,
  pagination,
  rowKey,
}: DataTableProps<T>): JSX.Element {
  const colSpan = columns.length;

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col, i) => (
                <TableHead key={i} className={col.className}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 3 }).map((_, idx) => (
                  <TableRow key={`skeleton-${idx}`}>
                    {columns.map((_, ci) => (
                      <TableCell key={ci}>
                        <div className="h-4 w-full animate-pulse rounded bg-muted" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : null}
            {isError ? (
              <TableRow>
                <TableCell className="py-8 text-center" colSpan={colSpan}>
                  <p className="text-sm text-destructive">{errorMessage}</p>
                  {onRetry ? (
                    <button className="mt-2 text-xs text-primary hover:underline" onClick={onRetry} type="button">
                      {retryLabel}
                    </button>
                  ) : null}
                </TableCell>
              </TableRow>
            ) : null}
            {!isLoading && !isError && data.length === 0 ? (
              <TableRow>
                <TableCell className="py-8 text-center text-sm text-muted-foreground" colSpan={colSpan}>
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : null}
            {!isLoading && !isError && data.length > 0
              ? data.map((row) => (
                  <TableRow key={rowKey(row)} className="even:bg-muted/20">
                    {columns.map((col, ci) => (
                      <TableCell key={ci} className={col.className}>
                        {col.cell(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      </div>
      {pagination ? (
        <div className="mt-4 flex items-center justify-between gap-4">
          <Button
            className="h-11 flex-1 md:h-9 md:w-auto md:flex-initial"
            disabled={pagination.page === 0}
            onClick={() => pagination.onPageChange(pagination.page - 1)}
            size="sm"
            type="button"
            variant="secondary"
          >
            {pagination.prevLabel}
          </Button>
          {pagination.pageInfo ? (
            <span className="text-xs text-muted-foreground sm:text-sm">{pagination.pageInfo}</span>
          ) : null}
          <Button
            className="h-11 flex-1 md:h-9 md:w-auto md:flex-initial"
            disabled={pagination.page >= pagination.totalPages - 1}
            onClick={() => pagination.onPageChange(pagination.page + 1)}
            size="sm"
            type="button"
            variant="secondary"
          >
            {pagination.nextLabel}
          </Button>
        </div>
      ) : null}
    </>
  );
}
