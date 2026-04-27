/**
 * platform.js
 * ─────────────────────────────────────────────────────────────────
 * Runtime detection for the three-tier calendar sync UI.
 *
 * The UI adapts based on what the platform actually supports:
 *   • Android  → Google Calendar primary, webcal opens Google.
 *                Background Sync available.
 *   • iOS PWA  → Apple Calendar webcal primary, Google secondary.
 *                Web Push only on iOS 16.4+ when installed to home screen.
 *   • iOS web  → must install first; sync UI shows install prompt.
 *   • Desktop  → all three options equally.
 */

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''

export const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream
export const isAndroid = /Android/.test(ua)
export const isMacOS = /Macintosh/.test(ua) && !isIOS

export const isInstalledPWA =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS standalone flag
    window.navigator?.standalone === true)

export const iOSVersion = (() => {
  if (!isIOS) return null
  const m = ua.match(/OS (\d+)_(\d+)(?:_(\d+))?/)
  if (!m) return null
  return {
    major: parseInt(m[1], 10),
    minor: parseInt(m[2], 10),
    patch: m[3] ? parseInt(m[3], 10) : 0,
  }
})()

export const supportsWebPush = (() => {
  if (typeof window === 'undefined') return false
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window))
    return false
  if (!isIOS) return true
  if (!iOSVersion) return false
  // Web Push is available on iOS 16.4+ for PWAs added to home screen
  const major = iOSVersion.major
  const minor = iOSVersion.minor
  if (major > 16) return isInstalledPWA
  if (major === 16 && minor >= 4) return isInstalledPWA
  return false
})()

export const supportsBackgroundSync =
  typeof window !== 'undefined' && 'SyncManager' in window

export const supportsPeriodicBackgroundSync =
  typeof window !== 'undefined' && 'PeriodicSyncManager' in window

/**
 * Which tier should be presented as the primary "recommended" option?
 *   - Android → google
 *   - iOS PWA → webcal (Apple Calendar deep integration)
 *   - iOS browser (not installed) → install (must install first)
 *   - desktop → google
 */
export function recommendedTier() {
  if (isIOS && !isInstalledPWA) return 'install_first'
  if (isIOS && isInstalledPWA) return 'webcal'
  if (isAndroid) return 'google'
  return 'google'
}

/**
 * Human-readable platform label for use in microcopy.
 */
export function platformLabel() {
  if (isAndroid) return 'Android'
  if (isIOS) return isInstalledPWA ? 'iPhone (מותקן)' : 'iPhone'
  if (isMacOS) return 'Mac'
  return 'מחשב'
}

/**
 * Open a webcal:// URL in the most reliable way for the current platform.
 *
 * iOS handles webcal:// natively (prompts "Add to Apple Calendar").
 * Android opens Google Calendar with the subscribe sheet.
 * Desktop browsers may bounce to the OS calendar app.
 */
export function openWebcalUrl(httpsUrl) {
  if (typeof window === 'undefined') return
  const webcalUrl = httpsUrl.replace(/^https?:\/\//, 'webcal://')
  // Some browsers block direct location.assign for webcal — use a hidden anchor.
  const a = document.createElement('a')
  a.href = webcalUrl
  a.rel = 'noopener'
  a.target = '_self'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => a.remove(), 100)
}
