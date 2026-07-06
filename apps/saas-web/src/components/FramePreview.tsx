import { Button } from './Button';

type FramePreviewProps = {
  pngUrl: string | null;
  loading?: boolean;
  error?: string | null;
  onRegenerate?: () => void;
  regenerating?: boolean;
};

export function FramePreview({
  pngUrl,
  loading = false,
  error = null,
  onRegenerate,
  regenerating = false,
}: FramePreviewProps) {
  return (
    <div className="space-y-3">
      {loading ? <p className="text-sm text-neutral-500">Loading preview…</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {pngUrl ? (
        <img
          src={pngUrl}
          alt="Shelf frame preview"
          className="rounded border border-neutral-200"
          style={{ imageRendering: 'pixelated', maxWidth: '172px' }}
        />
      ) : null}
      {onRegenerate ? (
        <Button variant="secondary" onClick={onRegenerate} disabled={regenerating}>
          {regenerating ? 'Regenerating…' : 'Regenerate frame'}
        </Button>
      ) : null}
    </div>
  );
}
