import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../utils/cn';

const fieldBase =
  'w-full min-h-11 rounded-lg bg-surface border border-border px-3 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50 transition-colors';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input ref={ref} className={cn(fieldBase, 'py-2', className)} {...rest} />
  )
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...rest }, ref) => (
    <textarea ref={ref} className={cn(fieldBase, 'min-h-24 py-2 resize-y', className)} {...rest} />
  )
);
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...rest }, ref) => (
    <select ref={ref} className={cn(fieldBase, 'py-2 pr-8', className)} {...rest}>
      {children}
    </select>
  )
);
Select.displayName = 'Select';

interface ToggleRowProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

/** Full-width, thumb-friendly tappable row — replaces tiny native checkboxes for consequential toggles. */
export const ToggleRow: React.FC<ToggleRowProps> = ({ checked, onChange, label, description, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn(
      'w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left transition-colors disabled:opacity-50',
      checked ? 'border-accent bg-accent/10' : 'border-border bg-surface'
    )}
  >
    <span className="min-w-0">
      <span className={cn('block text-sm font-medium', checked ? 'text-accent' : 'text-fg')}>{label}</span>
      {description && <span className="block text-xs text-fg-subtle mt-0.5">{description}</span>}
    </span>
    <span
      className={cn(
        'shrink-0 w-11 h-6 rounded-full relative transition-colors',
        checked ? 'bg-accent' : 'bg-border'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform flex items-center justify-center',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        )}
      >
        {checked && <Check className="w-3 h-3 text-accent" />}
      </span>
    </span>
  </button>
);
