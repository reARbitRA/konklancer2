import { createRoot } from 'react-dom/client';
import App from './rebuild/App.tsx';
import './rebuild/console.css';
import { initKeyVaultPersistence } from './utils/customLLMClient';
import { AuthProvider } from './components/auth/AuthProvider';
import AuthGate from './rebuild/AuthGate';
import { LanguageProvider } from './rebuild/i18n';

// Ensure persistent API keys survive Android WebView process recycles & restarts
initKeyVaultPersistence();

createRoot(document.getElementById('root')!).render(
  <LanguageProvider><AuthProvider>
    <AuthGate><App /></AuthGate>
  </AuthProvider></LanguageProvider>,
);
