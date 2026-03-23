import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export default function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      if (!r) return

      // בדיקה יזומה: בעת פתיחה וכל 5 דקות
      r.update()
      const intervalId = setInterval(() => r.update(), 5 * 60 * 1000)
      window.addEventListener('beforeunload', () => clearInterval(intervalId), { once: true })
    },
  })

  useEffect(() => {
    let isMounted = true

    const checkWaitingWorker = async () => {
      if (!('serviceWorker' in navigator)) return
      try {
        const reg = await navigator.serviceWorker.ready
        if (isMounted && reg.waiting) setNeedRefresh(true)
      } catch {
        // ignore
      }
    }

    checkWaitingWorker()

    // ריענון בדיקת SW כשחוזרים לטאב
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        updateServiceWorker(false)
        checkWaitingWorker()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    const onControllerChange = () => window.location.reload()
    navigator.serviceWorker?.addEventListener?.('controllerchange', onControllerChange)

    return () => {
      isMounted = false
      document.removeEventListener('visibilitychange', onVisible)
      navigator.serviceWorker?.removeEventListener?.('controllerchange', onControllerChange)
    }
  }, [setNeedRefresh, updateServiceWorker])

  if (!needRefresh) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(72px + env(safe-area-inset-bottom))',
      left: '12px',
      right: '12px',
      zIndex: 99999,
      background: 'var(--primary)',
      color: '#fff',
      borderRadius: 'var(--radius-lg)',
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }}>
      <span style={{ fontSize: '22px' }}>🎉</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: '14px' }}>עדכון חדש זמין!</div>
        <div style={{ fontSize: '12px', opacity: 0.85, marginTop: '2px' }}>גרסה חדשה מוכנה</div>
      </div>
      <button
        onClick={() => updateServiceWorker(true)}
        style={{
          background: '#fff',
          color: 'var(--primary)',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          padding: '8px 14px',
          fontWeight: 700,
          fontSize: '13px',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        עדכן עכשיו
      </button>
      <button
        onClick={() => setNeedRefresh(false)}
        style={{
          background: 'none',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          fontSize: '20px',
          opacity: 0.7,
          padding: '2px 4px',
          flexShrink: 0,
          lineHeight: 1,
        }}
      >✕</button>
    </div>
  )
}
