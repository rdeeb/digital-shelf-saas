type StatusBadgeProps = {
  status: string;
};

const statusClasses: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  claimed: 'bg-green-100 text-green-800',
  running: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const classes = statusClasses[status] ?? 'bg-neutral-100 text-neutral-700';
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}>
      {status}
    </span>
  );
}
