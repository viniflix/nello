import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import '@/index.css';
import { initializeObservability } from '@/app/bootstrap/observability';
import ExternalProviders from '@/app/providers/ExternalProviders';

initializeObservability(import.meta.env);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ExternalProviders>
      <App />
    </ExternalProviders>
  </React.StrictMode>
);
