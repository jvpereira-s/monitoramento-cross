import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// ErrorBoundary na raiz, por fora do App: pega exceção de render de qualquer tela
// (Painel, Relatório, Usuários, Login) num lugar só. Erro em handler assíncrono continua
// sendo tratado onde acontece — boundary do React só intercepta render/lifecycle.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
