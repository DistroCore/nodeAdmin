import * as React from 'react';
import { className } from '@/lib/className';

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className: customClassName, ...props }, ref) => (
    <div
      className={className(
        'rounded-lg border bg-card text-card-foreground shadow-sm',
        customClassName
      )}
      ref={ref}
      {...props}
    />
  )
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className: customClassName, ...props }, ref) => (
    <div
      className={className('flex flex-col space-y-1.5 p-6', customClassName)}
      ref={ref}
      {...props}
    />
  )
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className: customClassName, ...props }, ref) => (
  <h3
    className={className('text-2xl font-semibold leading-none tracking-tight', customClassName)}
    ref={ref}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className: customClassName, ...props }, ref) => (
  <p className={className('text-sm text-muted-foreground', customClassName)} ref={ref} {...props} />
));
CardDescription.displayName = 'CardDescription';

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className: customClassName, ...props }, ref) => (
    <div className={className('p-6 pt-0', customClassName)} ref={ref} {...props} />
  )
);
CardContent.displayName = 'CardContent';

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className: customClassName, ...props }, ref) => (
    <div
      className={className('flex items-center p-6 pt-0', customClassName)}
      ref={ref}
      {...props}
    />
  )
);
CardFooter.displayName = 'CardFooter';
