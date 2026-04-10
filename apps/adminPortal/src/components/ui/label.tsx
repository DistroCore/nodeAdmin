import { className } from '@/lib/className';

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  children?: React.ReactNode;
}

export function Label({ children, className: cls, ...props }: LabelProps): JSX.Element {
  return (
    <label
      className={className(
        'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        cls,
      )}
      {...props}
    >
      {children}
    </label>
  );
}
