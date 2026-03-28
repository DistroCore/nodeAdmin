import { useIntl } from 'react-intl';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function NotFoundPage(): JSX.Element {
  const { formatMessage: t } = useIntl();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-4">
      <div className="text-6xl font-bold text-muted-foreground/30">404</div>
      <h2 className="text-xl font-semibold">{t({ id: 'notFound.title' })}</h2>
      <p className="text-sm text-muted-foreground">{t({ id: 'notFound.desc' })}</p>
      <Link to="/overview">
        <Button>{t({ id: 'notFound.backHome' })}</Button>
      </Link>
    </div>
  );
}
