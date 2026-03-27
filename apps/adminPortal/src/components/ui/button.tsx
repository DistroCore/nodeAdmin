import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { className } from '@/lib/className';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:opacity-90',
        secondary: 'bg-muted text-foreground hover:bg-muted/80',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
      },
    },
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className: customClassName, size, variant, ...props }, ref) => {
    return (
      <button
        className={className(buttonVariants({ size, variant }), customClassName)}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
