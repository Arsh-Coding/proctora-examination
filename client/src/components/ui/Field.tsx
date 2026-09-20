import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

const CONTROL =
  'block w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm text-ink-900 ' +
  'placeholder:text-ink-400 transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 ' +
  'disabled:bg-ink-100 disabled:text-ink-500 aria-[invalid=true]:border-rose-400';

function Wrapper({
  id,
  label,
  hint,
  error,
  required,
  children,
}: {
  id: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      {label ? (
        <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-ink-700">
          {label}
          {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-medium text-rose-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
}

export function Input({ label, hint, error, className, id, ...rest }: InputProps) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <Wrapper id={inputId} label={label} hint={hint} error={error} required={rest.required}>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        className={cn(CONTROL, className)}
        {...rest}
      />
    </Wrapper>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
}

export function Textarea({ label, hint, error, className, id, ...rest }: TextareaProps) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <Wrapper id={inputId} label={label} hint={hint} error={error} required={rest.required}>
      <textarea
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        className={cn(CONTROL, 'resize-y', className)}
        {...rest}
      />
    </Wrapper>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
}

export function Select({ label, hint, error, className, id, children, ...rest }: SelectProps) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <Wrapper id={inputId} label={label} hint={hint} error={error} required={rest.required}>
      <select
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        className={cn(CONTROL, 'pr-8', className)}
        {...rest}
      >
        {children}
      </select>
    </Wrapper>
  );
}
