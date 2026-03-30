import { className } from '@/lib/className';

interface SpinnerProps {
  className?: string;
}

export function Spinner({ className: customClassName }: SpinnerProps): JSX.Element {
  return (
    <span className={className('spinner', customClassName)} role="status" aria-label="loading" />
  );
}
