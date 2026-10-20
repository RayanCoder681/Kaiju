import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-border bg-surface p-5 ${className}`}>{children}</div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger';
};
export function Button({ variant = 'primary', className = '', ...props }: BtnProps) {
  const styles: Record<string, string> = {
    primary: 'bg-brand text-brand-contrast hover:bg-brand-hover',
    secondary: 'border border-border bg-surface text-fg hover:bg-surface-elevated',
    danger: 'border border-border bg-surface text-danger hover:bg-surface-elevated',
  };
  return (
    <button
      className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    />
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-md border border-border bg-bg px-3 py-2 text-fg outline-none placeholder:text-muted focus:border-brand ${className}`}
      {...props}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-xs uppercase tracking-wider text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

export function Badge({ children, tone = 'brand' }: { children: ReactNode; tone?: 'brand' | 'muted' | 'danger' }) {
  const tones: Record<string, string> = {
    brand: 'bg-brand-soft text-brand',
    muted: 'bg-surface-elevated text-muted',
    danger: 'bg-surface-elevated text-danger',
  };
  return (
    <span className={`rounded-md px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider ${tones[tone]}`}>
      {children}
    </span>
  );
}
