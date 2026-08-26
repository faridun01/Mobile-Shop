import React from 'react';
import { cn } from '../../utils/cn';

interface FormFieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({ label, required, hint, error, children, className }) => (
  <label className={cn('block', className)}>
    <span className="block text-xs font-medium text-fg-muted mb-1.5">
      {label}
      {required && <span className="text-danger ml-0.5">*</span>}
    </span>
    {children}
    {hint && !error && <span className="block text-xs text-fg-subtle mt-1">{hint}</span>}
    {error && <span className="block text-xs text-danger mt-1">{error}</span>}
  </label>
);
