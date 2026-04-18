import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// Set global locale to Portugal
if (typeof window !== 'undefined') {
  document.documentElement.lang = 'pt-PT';

  // Auto dark mode based on system preference
  const applyColorScheme = (dark) => {
    document.documentElement.classList.toggle('dark', dark);
  };
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  applyColorScheme(mq.matches);
  mq.addEventListener('change', (e) => applyColorScheme(e.matches));
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)