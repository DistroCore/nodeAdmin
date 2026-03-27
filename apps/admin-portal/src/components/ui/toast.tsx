import * as React from 'react';
import { className } from '@/lib/className';

export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  variant?: 'default' | 'destructive';
}

export function Toast({
  className: customClassName,
  title,
  variant = 'default',
  ...props
}: ToastProps): JSX.Element {
  return (
    <div
      className={className(
        'rounded-md border px-3 py-2 text-sm shadow-sm',
        variant === 'destructive'
          ? 'border-destructive bg-destructive text-destructive-foreground'
          : 'border-border bg-card text-card-foreground',
        customClassName
      )}
      {...props}
    >
      {title}
    </div>
  );
}
