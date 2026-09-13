import { Loader2 } from 'lucide-react';
import clsx from 'clsx';

interface SpinnerProps {
  size?: number;
  className?: string;
  label?: string;
}

export function Spinner({ size = 18, className, label }: SpinnerProps) {
  return (
    <span className={clsx('inline-flex items-center gap-2', className)} role="status">
      <Loader2 size={size} className="animate-spin" aria-hidden="true" />
      {label ? <span>{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  );
}
