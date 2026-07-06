type BannerProps = {
  tone: 'success' | 'error' | 'info';
  message: string;
};

const toneClasses: Record<BannerProps['tone'], string> = {
  success: 'bg-green-50 text-green-800 border-green-200',
  error: 'bg-red-50 text-red-800 border-red-200',
  info: 'bg-blue-50 text-blue-800 border-blue-200',
};

export function Banner({ tone, message }: BannerProps) {
  return (
    <div className={`rounded border px-4 py-3 text-sm ${toneClasses[tone]}`} role="status">
      {message}
    </div>
  );
}
