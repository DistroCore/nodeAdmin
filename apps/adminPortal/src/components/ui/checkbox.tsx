import { Label } from '@/components/ui/label';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
}

export function Checkbox({ checked, onChange, label, disabled, id }: CheckboxProps): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <input
        checked={checked}
        className="h-4 w-4 shrink-0 cursor-pointer rounded border border-input accent-[hsl(var(--primary))] transition-all duration-150 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        id={id}
        onChange={(e) => onChange(e.target.checked)}
        type="checkbox"
      />
      <Label className={`cursor-pointer ${disabled ? 'opacity-50' : ''}`} htmlFor={id}>
        {label}
      </Label>
    </div>
  );
}
