import { className } from '@/lib/className';

function Skeleton({ className: customClassName, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={className('animate-pulse rounded-md bg-muted', customClassName)} {...props} />
  );
}

export { Skeleton };
