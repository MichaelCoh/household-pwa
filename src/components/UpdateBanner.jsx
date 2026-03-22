import { useRegisterSW } from 'virtual:pwa-register/react'

export default function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      // בדוק עדכונים כל 30 דקות
      r && setInterval(() => r.update(), 30 * 60 * 1000)
    },
  })

  if (!needRefresh) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(70px + env(safe-area-inset-bottom))',
      left: '16px',
      right: '16px',
      zIndex: 9999,
      background: 'var(--primary)',
      color: '#fff',
      borderRadius: 'var(--radius-lg)',
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
      animation: 'slideUp 0.3s ease',
    }}>
      <span style={{ fontSize: '22px' }}>🎉</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: '14px' }}>עדכון חדש זמין!</div>
        <div style={{ fontSize: '12px', opacity: 0.85, marginTop: '2px' }}>לחץ לעדכון ורענון</div>
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
        style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '18px', opacity: 0.7, padding: '4px', flexShrink: 0 }}
      >✕</button>
    </div>
  )
}
