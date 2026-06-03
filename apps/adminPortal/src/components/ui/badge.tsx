import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { className } from '@/lib/className';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    defaultVariants: {
      variant: 'default',
    },
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        success: 'border-emerald-500/25 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
        warning: 'border-amber-500/25 bg-amber-500/15 text-amber-600 dark:text-amber-400',
      },
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className: customClassName, variant, ...props }: BadgeProps): JSX.Element {
  return <div className={className(badgeVariants({ variant }), customClassName)} {...props} />;
}
