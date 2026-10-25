import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initKeyVaultPersistence } from './utils/customLLMClient';

// Ensure persistent API keys survive Android WebView process recycles & restarts
initKeyVaultPersistence();

createRoot(document.getElementById('root')!).render(<App />);
