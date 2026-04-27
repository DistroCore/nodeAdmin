import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Button } from '@/components/ui/button';

interface ImagePreviewOverlayProps {
  fileName: string;
  objectUrl: string;
  onCancel: () => void;
  onConfirm: () => void;
  uploading: boolean;
}

export function ImagePreviewOverlay({
  fileName,
  objectUrl,
  onCancel,
  onConfirm,
  uploading,
}: ImagePreviewOverlayProps): JSX.Element {
  const { formatMessage: t } = useIntl();
  const [error, setError] = useState(false);

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
      {error ? (
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
          {t({ id: 'im.imagePreviewError' })}
        </div>
      ) : (
        <img
          alt={fileName}
          className="h-20 w-20 shrink-0 rounded-md border border-border object-cover"
          onError={() => setError(true)}
          src={objectUrl}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="truncate text-sm font-medium">{fileName}</p>
        <div className="flex gap-2">
          <Button disabled={uploading} onClick={onConfirm} size="sm" type="button">
            {uploading ? t({ id: 'im.uploading' }) : t({ id: 'im.sendImage' })}
          </Button>
          <Button disabled={uploading} onClick={onCancel} size="sm" type="button" variant="secondary">
            {t({ id: 'common.cancel' })}
          </Button>
        </div>
      </div>
    </div>
  );
}
