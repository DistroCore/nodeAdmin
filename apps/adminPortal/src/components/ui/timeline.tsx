// apps/adminPortal/src/components/ui/timeline.tsx
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export interface TimelineItem {
  id: string;
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  timestamp?: string;
}

export interface TimelineProps {
  items: TimelineItem[];
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  emptyMessage: string;
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadMoreLabel?: string;
}

export function Timeline({
  items,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  emptyMessage,
  hasMore,
  onLoadMore,
  loadMoreLabel = 'Load more',
}: TimelineProps): JSX.Element {
  return (
    <div className="space-y-0">
      {isLoading && items.length === 0
        ? Array.from({ length: 5 }).map((_, idx) => (
            <div key={`skeleton-${idx}`} className="flex gap-3 py-3">
              <div className="flex-shrink-0">
                <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))
        : null}

      {isError ? (
        <div className="py-8 text-center">
          <p className="text-sm text-destructive">{errorMessage}</p>
          {onRetry ? (
            <button className="mt-2 text-xs text-primary hover:underline" onClick={onRetry} type="button">
              {loadMoreLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      {!isLoading && !isError && items.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</div>
      ) : null}

      {!isLoading && !isError && items.length > 0
        ? items.map((item) => (
            <div key={item.id} className="flex gap-3 border-b border-border/50 py-3 last:border-0">
              {item.icon ? (
                <div className="flex flex-shrink-0 items-start pt-0.5">{item.icon}</div>
              ) : (
                <div className="flex flex-shrink-0 items-start pt-0.5">
                  <div className="h-8 w-8 rounded-full bg-muted" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm">{item.title}</div>
                {item.subtitle ? (
                  <div className="mt-0.5 text-xs text-muted-foreground">{item.subtitle}</div>
                ) : null}
                {item.timestamp ? (
                  <div className="mt-0.5 text-xs text-muted-foreground/70">{item.timestamp}</div>
                ) : null}
              </div>
            </div>
          ))
        : null}

      {hasMore && onLoadMore ? (
        <div className="flex justify-center pt-4">
          <Button onClick={onLoadMore} size="sm" type="button" variant="secondary">
            {loadMoreLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
