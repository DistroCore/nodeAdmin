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
    <IntlProvider defaultLocale="zh" locale={locale} messages={messages}>
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
