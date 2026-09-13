import clsx from 'clsx';

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-lg bg-slate-800', className)} />;
}

export function CardSkeleton() {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
      <Skeleton className="mb-3 h-5 w-40" />
      <Skeleton className="mb-4 h-10 w-full" />
      <div className="flex justify-between gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-12 w-28" />
      </div>
    </div>
  );
}
