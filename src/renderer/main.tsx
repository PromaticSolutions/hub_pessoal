import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './app/App'
import { flushAll } from './lib/flush'

// Save typed text when the tab is hidden or the page is closed (replaces the desktop flush-on-close).
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flushAll() })
window.addEventListener('pagehide', () => { void flushAll() })
// Dropping a file anywhere outside a drop zone must never navigate the window away.
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => e.preventDefault())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
