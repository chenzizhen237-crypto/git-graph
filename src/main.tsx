import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './styles/index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { autoHideScrollbars } from './lib/scrollbars'
import { apply, getSettings } from './lib/settings'
import { playSound } from './lib/sound'
import { setToastSound } from './lib/toasts'

apply(getSettings())
autoHideScrollbars()
setToastSound(playSound)
document.documentElement.dataset.stage = 'Clean'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
