import React from 'react';
import { useIntl } from 'react-intl';
import { logger } from '@/lib/logger';

function ErrorDisplay({ onRetry }: { onRetry: () => void }): JSX.Element {
  const { formatMessage: t } = useIntl();
  return (
    <section className="rounded-md border border-red-300 bg-red-50 p-4 text-red-700">
      <h2 className="text-base font-semibold">{t({ id: 'error.moduleRender' })}</h2>
      <p className="mt-1 text-sm">{t({ id: 'error.moduleRenderDesc' })}</p>
      <button className="mt-3 rounded-md border border-red-300 px-3 py-1 text-sm" onClick={onRetry} type="button">
        {t({ id: 'error.retry' })}
      </button>
    </section>
  );
}

interface ModuleErrorBoundaryProps {
  children: React.ReactNode;
}

interface ModuleErrorBoundaryState {
  hasError: boolean;
}

export class ModuleErrorBoundary extends React.Component<ModuleErrorBoundaryProps, ModuleErrorBoundaryState> {
  constructor(props: ModuleErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
    };
  }

  static getDerivedStateFromError(): ModuleErrorBoundaryState {
    return {
      hasError: true,
    };
  }

  override componentDidCatch(error: Error): void {
    logger.error('ModuleErrorBoundary', 'Module render error caught', error);
  }

  private handleReset = (): void => {
    this.setState({
      hasError: false,
    });
  };

  override render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return <ErrorDisplay onRetry={this.handleReset} />;
  }
}
