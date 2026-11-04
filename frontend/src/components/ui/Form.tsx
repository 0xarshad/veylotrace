import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import clsx from 'clsx'

export function Field({ label, error, help, children, htmlFor, className }: { label: string; error?: string; help?: string; children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {help && !error && <p className="mt-1 text-xs text-slate-500">{help}</p>}
      {error && (
        <p role="alert" className="mt-1 text-xs text-rose-600">
          {error}
        </p>
      )}
    </div>
  )
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; help?: string; wrapperClass?: string }
export function TextInput({ label, error, help, wrapperClass, className, ...rest }: InputProps) {
  const id = useId()
  return (
    <Field label={label} error={error} help={help} htmlFor={id} className={wrapperClass}>
      <input id={id} aria-invalid={!!error} className={clsx('input', error && 'border-rose-400', className)} {...rest} />
    </Field>
  )
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; help?: string; options: { value: string | number; label: string }[]; placeholder?: string; wrapperClass?: string }
export function SelectInput({ label, error, help, options, placeholder, wrapperClass, className, ...rest }: SelectProps) {
  const id = useId()
  return (
    <Field label={label} error={error} help={help} htmlFor={id} className={wrapperClass}>
      <select id={id} aria-invalid={!!error} className={clsx('input', error && 'border-rose-400', className)} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

type AreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; wrapperClass?: string }
export function TextArea({ label, error, wrapperClass, className, ...rest }: AreaProps) {
  const id = useId()
  return (
    <Field label={label} error={error} htmlFor={id} className={wrapperClass}>
      <textarea id={id} rows={3} className={clsx('input', error && 'border-rose-400', className)} {...rest} />
    </Field>
  )
}

export function Checkbox({ label, checked, onChange, help }: { label: string; checked: boolean; onChange: (v: boolean) => void; help?: string }) {
  const id = useId()
  return (
    <div className="flex items-start gap-2">
      <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id} className="text-sm">
        {label}
        {help && <span className="block text-xs text-slate-500">{help}</span>}
      </label>
    </div>
  )
}
