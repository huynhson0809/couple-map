import { createRoot } from 'react-dom/client'
import 'maplibre-gl/dist/maplibre-gl.css'
import './index.css'
import App from './App.tsx'

type NavigatorWithStandalone = Navigator & { standalone?: boolean }

const standaloneQuery = window.matchMedia('(display-mode: standalone)')

function syncStandaloneClass() {
  const isStandalone =
    standaloneQuery.matches ||
    Boolean((window.navigator as NavigatorWithStandalone).standalone)

  document.documentElement.classList.toggle('is-standalone', isStandalone)
}

syncStandaloneClass()
standaloneQuery.addEventListener('change', syncStandaloneClass)

createRoot(document.getElementById('root')!).render(<App />)
