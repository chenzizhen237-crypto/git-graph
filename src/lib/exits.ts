/**
 * Exit animations for overlays. React removes an element at once, so a
 * `data-exit` element is put back as it leaves, fades out, then goes for good.
 * Only for elements that are `fixed` to the window, since they lose their parent.
 */
const FALLBACK_MS = 420

export function animateExits() {
  new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.removedNodes) {
        if (!(node instanceof HTMLElement) || node.isConnected) continue
        const el = node.matches('[data-exit]') ? node : node.querySelector<HTMLElement>('[data-exit]')
        if (!el) continue
        el.removeAttribute('data-exit')
        el.dataset.leaving = ''
        el.inert = true
        document.body.append(el)
        const remove = () => el.remove()
        el.addEventListener('animationend', remove, { once: true })
        setTimeout(remove, FALLBACK_MS)
      }
    }
  }).observe(document.body, { childList: true, subtree: true })
}
