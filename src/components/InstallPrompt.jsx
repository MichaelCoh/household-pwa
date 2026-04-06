import { useEffect, useState } from 'react'
import { canPromptInstall, triggerInstall, isStandalone, onInstallChange } from '../lib/installPrompt'

/*
 * PWA Install — Platform Capabilities (2026):
 *
 * Android/Chrome + Desktop Chrome/Edge:
 *   beforeinstallprompt API is supported → ONE-TAP native install dialog.
 *   No manual steps needed from the user.
 *
 * iOS/Safari:
 *   Apple does NOT support beforeinstallprompt (no programmatic install).
 *   The ONLY way to install is: Share → Add to Home Screen.
 *   Best we can do: a polished animated visual guide.
 *
 * iOS/Chrome (or other non-Safari browsers):
 *   Cannot install PWA at all. Must open in Safari first.
 *
 * Standalone detection:
 *   display-mode: standalone (standard) + navigator.standalone (Safari).
 *   When app is already installed, all install UI is suppressed.
 */

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
}

function isIOSSafari() {
  const ua = navigator.userAgent
  return isIOS() && /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua)
}

function IOSGuideSheet({ onClose }) {
  const [visible, setVisible] = useState(false)
  const inSafari = isIOSSafari()

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, 250)
  }

  if (!inSafari) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'flex-end' }}>
        <div role="presentation" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', transition: 'opacity 0.25s', opacity: visible ? 1 : 0 }} onClick={handleClose} />
        <div style={{
          position: 'relative', width: '100%', background: 'var(--bg-card)',
          borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.3)',
          padding: '24px 20px', paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        }}>
          <div style={{ textAlign: 'center', marginBottom: '8px' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)', display: 'inline-block' }} />
          </div>
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🌐</div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '18px', marginBottom: '8px', color: 'var(--text-primary)' }}>פתח ב-Safari</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 280, margin: '0 auto' }}>
              כדי להתקין את האפליקציה באייפון, יש לפתוח את הדף הזה <strong>בדפדפן Safari</strong>.<br/>הדפדפן הנוכחי לא תומך בהתקנת אפליקציות.
            </p>
            <button className="btn btn-primary btn-full" style={{ marginTop: '20px' }} onClick={handleClose}>הבנתי</button>
          </div>
        </div>
      </div>
    )
  }

  const steps = [
    { icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
      </svg>
    ), text: 'לחץ על כפתור השיתוף בתחתית המסך', highlight: true },
    { icon: <span style={{ fontSize: '24px' }}>➕</span>, text: 'בחר "הוסף למסך הבית" מהתפריט' },
    { icon: <span style={{ fontSize: '24px' }}>✅</span>, text: 'לחץ "הוסף" — זהו!' },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'flex-end' }}>
      <div role="presentation" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', transition: 'opacity 0.25s', opacity: visible ? 1 : 0 }} onClick={handleClose} />
      <div role="dialog" aria-modal="true" style={{
        position: 'relative', width: '100%', background: 'var(--bg-card)',
        borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.3)',
        padding: '20px 20px', paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)', display: 'inline-block' }} />
        </div>

        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '18px', textAlign: 'center', marginBottom: '20px', color: 'var(--text-primary)' }}>
          התקנה למסך הבית
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: '14px', alignItems: 'center', padding: '14px 12px', borderRadius: 'var(--radius-md)', background: s.highlight ? 'var(--primary-light)' : 'transparent', border: s.highlight ? '1px solid var(--primary)' : '1px solid transparent', position: 'relative' }}>
              <div style={{ width: 40, height: 40, borderRadius: '12px', background: s.highlight ? 'var(--primary)' : 'var(--bg-elevated)', border: s.highlight ? 'none' : '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: s.highlight ? '#fff' : 'var(--text-secondary)' }}>
                {s.icon}
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 700 }}>שלב {i + 1}</span>
                <p style={{ fontSize: '15px', color: 'var(--text-primary)', fontWeight: 600, margin: '2px 0 0', lineHeight: 1.4 }}>{s.text}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Animated arrow pointing to Safari share button */}
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--primary-light)', border: '1px solid var(--primary)' }}>
            <span style={{ fontSize: '18px', animation: 'bounceDown 1.5s ease-in-out infinite' }}>👇</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)' }}>כפתור השיתוף נמצא למטה</span>
            <span style={{ fontSize: '18px', animation: 'bounceDown 1.5s ease-in-out infinite' }}>👇</span>
          </div>
        </div>

        <style>{`
          @keyframes bounceDown {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(6px); }
          }
        `}</style>

        <button className="btn btn-ghost btn-full" style={{ marginTop: '16px' }} onClick={handleClose}>סגור</button>
      </div>
    </div>
  )
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
          <p style={{ fontSize: '13px', opacity: 0.9, lineHeight: 1.5, marginBottom: '12px' }}>הוסף למסך הבית לחוויה מלאה עם גישה מהירה</p>
          <button onClick={() => setShowIOSGuide(true)} style={{ background: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: '10px 16px', color: 'var(--primary)', fontWeight: 700, fontSize: '14px', cursor: 'pointer', width: '100%' }}>
            📲 התקן (3 שלבים קצרים)
          </button>
        </div>
        {showIOSGuide && <IOSGuideSheet onClose={() => setShowIOSGuide(false)} />}
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
      <p style={{ fontSize: '13px', opacity: 0.9, lineHeight: 1.5, marginBottom: '12px' }}>הוסף למסך הבית לחוויה מלאה עם גישה מהירה</p>
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
        <span>✅</span><span>האפליקציה מותקנת במסך הבית</span>
      </div>
    )
  }

  if (isIOS()) {
    return (
      <>
        <button className="btn btn-primary btn-full" onClick={() => setShowIOSGuide(true)} style={{ background: 'var(--primary)' }}>
          📲 התקן למסך הבית
        </button>
        {showIOSGuide && <IOSGuideSheet onClose={() => setShowIOSGuide(false)} />}
      </>
    )
  }

  if (canInstall) {
    return (
      <button className="btn btn-primary btn-full" onClick={triggerInstall} style={{ background: 'var(--primary)' }}>
        📲 התקן למסך הבית
      </button>
    )
  }

  return (
    <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
      <p style={{ marginBottom: '8px', fontWeight: 600, color: 'var(--text-primary)' }}>איך להתקין:</p>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: '20px' }}>🤖</span>
        <span><strong>Android:</strong> תפריט (⋮) → "הוסף למסך הבית"</span>
      </div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '8px 0' }}>
        <span style={{ fontSize: '20px' }}>💻</span>
        <span><strong>מחשב:</strong> אייקון ⊕ בשורת הכתובת</span>
      </div>
    </div>
  )
}
