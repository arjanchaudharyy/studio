import '@testing-library/jest-dom'
import globalJsdom from 'global-jsdom'

if (typeof document === 'undefined') {
  globalJsdom('<!doctype html><html><body></body></html>', { url: 'http://localhost' })
}

if (typeof window !== 'undefined' && window.HTMLElement) {
  Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
    value: function scrollIntoView() {
      /* noop for tests */
    },
    configurable: true,
  })
}
