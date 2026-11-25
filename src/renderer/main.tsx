import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './app/App'
import { flushAll } from './lib/flush'

window.api.onFlushRequest(flushAll)
// Dropping a file anywhere outside a drop zone must never navigate the window away.
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => e.preventDefault())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
