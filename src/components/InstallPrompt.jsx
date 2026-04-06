import { useEffect, useState } from 'react'
import { canPromptInstall, triggerInstall, isStandalone, onInstallChange } from '../lib/installPrompt'

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
}

export function InstallBanner({ context }) {
  const [canInstall, setCanInstall] = useState(canPromptInstall())
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem('install-banner-dismissed') === '1' } catch { return false }
  })
  const [standalone] = useState(isStandalone())
  const [showIOSGuide, setShowIOSGuide] = useState(false)

  useEffect(() => onInstallChange(() => setCanInstall(canPromptInstall())), [])

  if (standalone || dismissed) return null

  const handleInstall = async () => {
    const accepted = await triggerInstall()
    if (!accepted) dismiss()
  }

  const dismiss = () => {
    setDismissed(true)
    localStorage.setItem('install-banner-dismissed', '1')
  }

  if (isIOS() && !standalone) {
    return (
      <>
        <div style={{
          background: 'linear-gradient(135deg, var(--primary) 0%, #4455E0 100%)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px',
          marginBottom: '16px',
          position: 'relative',
          color: '#fff',
        }}>
          <button onClick={dismiss} style={{ position: 'absolute', top: '10px', left: '10px', background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', color: '#fff', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="סגור">✕</button>
          <div style={{ fontSize: '32px', marginBottom: '10px' }}>📲</div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '17px', fontWeight: 800, marginBottom: '6px' }}>התקן את האפליקציה</h3>
          <p style={{ fontSize: '13px', opacity: 0.9, lineHeight: 1.5, marginBottom: '12px' }}>הוסף למסך הבית לחוויה מלאה עם התראות ועבודה מהירה</p>
          <button onClick={() => setShowIOSGuide(true)} style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 'var(--radius-sm)', padding: '10px 16px', color: '#fff', fontWeight: 700, fontSize: '14px', cursor: 'pointer', width: '100%' }}>
            איך מתקינים? (Safari)
          </button>
        </div>
        {showIOSGuide && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <div role="presentation" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} onClick={() => setShowIOSGuide(false)} />
            <div role="dialog" aria-modal="true" style={{ position: 'relative', width: '100%', maxWidth: 360, background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)', boxShadow: '0 24px 48px rgba(0,0,0,0.35)', padding: '24px 20px 20px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '18px', textAlign: 'center', marginBottom: '16px' }}>התקנה ב-Safari</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {[
                  { step: '1', text: 'לחץ על כפתור השיתוף ⬆️ בתחתית המסך' },
                  { step: '2', text: 'גלול למטה ובחר "הוסף למסך הבית"' },
                  { step: '3', text: 'לחץ "הוסף" — האפליקציה תופיע במסך הבית' },
                ].map(s => (
                  <div key={s.step} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 800, fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.step}</div>
                    <span style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>{s.text}</span>
                  </div>
                ))}
              </div>
              <button className="btn btn-primary btn-full" style={{ marginTop: '20px' }} onClick={() => setShowIOSGuide(false)}>הבנתי</button>
            </div>
          </div>
        )}
      </>
    )
  }

  if (!canInstall) return null

  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--primary) 0%, #4455E0 100%)',
      borderRadius: 'var(--radius-lg)',
      padding: '20px',
      marginBottom: '16px',
      position: 'relative',
      color: '#fff',
    }}>
      <button onClick={dismiss} style={{ position: 'absolute', top: '10px', left: '10px', background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', color: '#fff', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="סגור">✕</button>
      <div style={{ fontSize: '32px', marginBottom: '10px' }}>📲</div>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '17px', fontWeight: 800, marginBottom: '6px' }}>התקן את האפליקציה</h3>
      <p style={{ fontSize: '13px', opacity: 0.9, lineHeight: 1.5, marginBottom: '12px' }}>הוסף למסך הבית לחוויה מלאה עם התראות ועבודה מהירה</p>
      <button onClick={handleInstall} style={{ background: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: '10px 16px', color: 'var(--primary)', fontWeight: 700, fontSize: '14px', cursor: 'pointer', width: '100%' }}>
        התקן עכשיו
      </button>
    </div>
  )
}

export function SettingsInstallButton() {
  const [canInstall, setCanInstall] = useState(canPromptInstall())
  const [standalone] = useState(isStandalone())
  const [showIOSGuide, setShowIOSGuide] = useState(false)

  useEffect(() => onInstallChange(() => setCanInstall(canPromptInstall())), [])

  if (standalone) {
    return (
      <div style={{ padding: '12px', background: 'var(--mint-light)', color: 'var(--mint)', borderRadius: 'var(--radius-sm)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>✅</span><span>האפליקציה מותקנת</span>
      </div>
    )
  }

  if (isIOS()) {
    return (
      <>
        <button className="btn btn-primary btn-full" onClick={() => setShowIOSGuide(true)} style={{ background: 'var(--primary)' }}>
          📲 איך להתקין (Safari)
        </button>
        {showIOSGuide && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <div role="presentation" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} onClick={() => setShowIOSGuide(false)} />
            <div role="dialog" aria-modal="true" style={{ position: 'relative', width: '100%', maxWidth: 360, background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)', boxShadow: '0 24px 48px rgba(0,0,0,0.35)', padding: '24px 20px 20px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '18px', textAlign: 'center', marginBottom: '16px' }}>התקנה ב-Safari</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {[
                  { step: '1', text: 'לחץ על כפתור השיתוף ⬆️ בתחתית המסך' },
                  { step: '2', text: 'גלול למטה ובחר "הוסף למסך הבית"' },
                  { step: '3', text: 'לחץ "הוסף" — האפליקציה תופיע במסך הבית' },
                ].map(s => (
                  <div key={s.step} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 800, fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.step}</div>
                    <span style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>{s.text}</span>
                  </div>
                ))}
              </div>
              <button className="btn btn-primary btn-full" style={{ marginTop: '20px' }} onClick={() => setShowIOSGuide(false)}>הבנתי</button>
            </div>
          </div>
        )}
      </>
    )
  }

  if (!canInstall) {
    return (
      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
        <strong>Android:</strong> לחץ על התפריט (⋮) ב-Chrome ← "הוסף למסך הבית"<br /><br />
        <strong>מחשב:</strong> לחץ על אייקון ההתקנה (⊕) בשורת הכתובת
      </p>
    )
  }

  return (
    <button className="btn btn-primary btn-full" onClick={triggerInstall} style={{ background: 'var(--primary)' }}>
      📲 התקן למסך הבית
    </button>
  )
}
