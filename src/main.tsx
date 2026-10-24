import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './styles/index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { autoHideScrollbars } from './lib/scrollbars'
import { applyTheme, readTheme } from './state'

applyTheme(readTheme())
autoHideScrollbars()
document.documentElement.dataset.stage = 'Clean'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
