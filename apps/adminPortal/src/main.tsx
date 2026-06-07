import React from 'react';
import ReactDOM from 'react-dom/client';
import { IntlProvider } from 'react-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { getMessages } from './i18n';
import { ToastContainer } from './components/ui/toast';
import { useUiStore } from './stores/useUiStore';
import { logger } from './lib/logger';
import { AppRoot } from './app/appRoot';
import './styles/globals.css';

// Expose the shell's React instance so runtime-loaded plugin UI bundles share it (a separate React
// instance would break hooks/context). Plugin bundles resolve `react` to this global.
(window as unknown as { __NODEADMIN_REACT__?: typeof React }).__NODEADMIN_REACT__ = React;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      logger.error('main', 'Service worker registration failed', err);
    });
  });
}

const queryClient = new QueryClient();

function LocalizedApp(): JSX.Element {
  const locale = useUiStore((s) => s.locale);
  const messages = getMessages(locale);

  return (
    <IntlProvider
      defaultLocale="zh"
      locale={locale}
      messages={messages}
      // Plugin/dynamic labels (e.g. DB-stored menu names) are intentionally rendered via t() with a
      // defaultMessage fallback. Under a non-source locale these raise MISSING_TRANSLATION, which is
      // expected and already handled by the fallback — silence just that code so it doesn't spam the
      // console as an error; surface any other intl error through the logger.
      onError={(error) => {
        if (error.code === 'MISSING_TRANSLATION') return;
        logger.error('[i18n]', error);
      }}
    >
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppRoot />
          <ToastContainer />
        </BrowserRouter>
      </QueryClientProvider>
    </IntlProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LocalizedApp />
  </React.StrictMode>,
);
