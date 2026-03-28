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
        className="h-4 w-4 rounded border border-input"
        disabled={disabled}
        id={id}
        onChange={(e) => onChange(e.target.checked)}
        type="checkbox"
      />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}
