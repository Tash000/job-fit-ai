import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { AuthProvider } from './lib/auth.tsx'
import { installFetchInterceptor } from './lib/api.ts'
import { registerSW } from 'virtual:pwa-register'

// Attach the Supabase Bearer token to API calls before the app renders.
installFetchInterceptor()

// PWA: register the service worker (auto-update on new builds).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  registerSW({ immediate: true })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
