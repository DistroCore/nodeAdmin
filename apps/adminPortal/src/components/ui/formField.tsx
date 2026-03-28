import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

export interface FormFieldProps {
  label: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  error?: string;
}

export function FormField({ label, htmlFor, children, error }: FormFieldProps): JSX.Element {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
