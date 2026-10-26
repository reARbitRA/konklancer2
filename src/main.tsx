import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initKeyVaultPersistence } from './utils/customLLMClient';
import { AuthProvider } from './components/auth/AuthProvider';
import AuthGate from './components/auth/AuthGate';

// Ensure persistent API keys survive Android WebView process recycles & restarts
initKeyVaultPersistence();

createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <AuthGate>
      <App />
    </AuthGate>
  </AuthProvider>,
);
