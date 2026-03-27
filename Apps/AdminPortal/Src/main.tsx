import React from 'react';
import ReactDOM from 'react-dom/client';
import { IntlProvider } from 'react-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { getMessages } from './I18n';
import { useUiStore } from './Stores/useUiStore';
import { AppRoot } from './App/appRoot';
import './Styles/globals.css';

const queryClient = new QueryClient();

function LocalizedApp(): JSX.Element {
  const locale = useUiStore((s) => s.locale);
  const messages = getMessages(locale);

  return (
    <IntlProvider defaultLocale="zh" locale={locale} messages={messages}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppRoot />
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
