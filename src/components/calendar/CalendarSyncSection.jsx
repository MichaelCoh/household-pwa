/**
 * CalendarSyncSection — one-tap sync of the app's calendar to the phone's
 * native calendar app. One direction only: app → phone.
 *
 * UX is platform-aware:
 *   • iOS  → "Add to Apple Calendar" (webcal:// → Calendar app prompts subscribe).
 *   • Android → "Add to Google Calendar" (webcal:// → Calendar app subscribe sheet).
 *   • Desktop → instructions + copyable link (subscription is a phone-side action).
 *
 * Mechanism: a per-user `feed_token` is stored in `calendar_connections`. The
 * native calendar app polls `/functions/v1/calendar-feed/<token>.ics` directly;
 * no Google OAuth, no two-way push, no service-worker plumbing.
 */

import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth'
import {
  buildFeedUrl,
  buildWebcalUrl,
  getWebcalConnection,
  createOrRotateConnection,
  disconnectWebcal,
} from '../../lib/calendar/connection'
import { isAndroid, isIOS, isInstalledPWA } from '../../lib/calendar/platform'

/** Open a webcal:// URL via a hidden anchor. Direct location.assign is blocked
 *  by some mobile browsers for non-http(s) schemes. */
function openSubscribeUrl(webcalUrl) {
  if (!webcalUrl || typeof document === 'undefined') return
  const a = document.createElement('a')
  a.href = webcalUrl
  a.rel = 'noopener'
  a.target = '_self'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => a.remove(), 100)
}

function timeAgoHe(ts) {
  if (!ts) return ''
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (m < 1) return 'הרגע'
  if (m < 60) return `לפני ${m} ד׳`
  if (h < 24) return `לפני ${h} ש׳`
  if (d === 1) return 'אתמול'
  if (d < 7) return `לפני ${d} ימים`
  return new Date(ts).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
}

const PLATFORM_LABEL = isIOS
  ? 'Apple Calendar'
  : isAndroid
    ? 'Google Calendar'
    : 'יומן הטלפון'

const PLATFORM_EMOJI = isIOS ? '🍎' : isAndroid ? '📅' : '📲'

const MOBILE = isIOS || isAndroid

export default function CalendarSyncSection({ showToast }) {
  const { user, householdId } = useAuth()
  const [conn, setConn] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const refresh = async () => {
    if (!user) return
    const c = await getWebcalConnection(user.id)
    setConn(c)
    setLoading(false)
  }

  useEffect(() => { if (user) refresh() }, [user?.id])

  const httpsUrl = buildFeedUrl(conn?.feed_token)

  const handleSubscribe = async () => {
    setBusy('subscribe')
    try {
      // Always (re)create on subscribe so the URL we open is guaranteed fresh.
      const fresh = conn || await createOrRotateConnection(user.id, householdId)
      setConn(fresh)
      const url = buildWebcalUrl(fresh.feed_token)
      if (!url) throw new Error('missing_supabase_url')
      if (MOBILE) {
        openSubscribeUrl(url)
        showToast?.(isIOS
          ? '📲 פתחנו את Apple Calendar — אשר את ההרשמה'
          : '📲 פתחנו את היומן — אשר את ההרשמה')
      } else {
        await navigator.clipboard.writeText(url).catch(() => {})
        showToast?.('📋 הקישור הועתק — פתח אותו במכשיר הנייד')
      }
    } catch (e) {
      showToast?.('❌ ' + (e.message || 'שגיאה'))
    } finally {
      setBusy('')
    }
  }

  const handleRotate = async () => {
    if (!window.confirm('זה ייצור קישור חדש ויבטל את המנוי הקיים בטלפון. להמשיך?')) return
    setBusy('rotate')
    try {
      const fresh = await createOrRotateConnection(user.id, householdId)
      setConn(fresh)
      showToast?.('✅ נוצר קישור חדש — הירשם מחדש בטלפון')
    } catch (e) {
      showToast?.('❌ ' + (e.message || 'שגיאה'))
    } finally {
      setBusy('')
    }
  }

  const handleDisconnect = async () => {
    if (!window.confirm('לבטל את הסנכרון? המנוי בטלפון יפסיק לעבוד.')) return
    setBusy('disconnect')
    try {
      await disconnectWebcal(user.id)
      setConn(null)
      showToast?.('✓ הסנכרון בוטל')
    } catch (e) {
      showToast?.('❌ ' + (e.message || 'שגיאה'))
    } finally {
      setBusy('')
    }
  }

  const handleCopy = async () => {
    if (!httpsUrl) return
    try {
      await navigator.clipboard.writeText(httpsUrl)
      showToast?.('📋 הקישור הועתק')
    } catch {
      showToast?.('❌ לא הצלחנו להעתיק — בחר ידנית')
    }
  }

  if (loading) {
    return (
      <div className="card" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
        טוען...
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: '16px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <span style={{ fontSize: '22px' }}>{PLATFORM_EMOJI}</span>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700, flex: 1, margin: 0 }}>
          סנכרון עם {PLATFORM_LABEL}
        </h3>
        {conn && (
          <span className="pill" style={{ background: 'var(--mint-light)', color: 'var(--mint)' }}>
            מחובר
          </span>
        )}
      </div>

      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: 1.6 }}>
        {MOBILE
          ? `המשימות והאירועים שלך יופיעו אוטומטית ב-${PLATFORM_LABEL} של המכשיר הזה. עדכונים מהאפליקציה יסונכרנו תוך כשעה. הסנכרון הוא חד-כיווני: אפליקציה → טלפון.`
          : 'פתח את האפליקציה במכשיר הנייד שלך כדי להוסיף את היומן ליומן של הטלפון. בדפדפן מחשב ניתן רק להעתיק את קישור המנוי.'}
      </p>

      {!conn ? (
        <button
          className="btn btn-primary btn-full"
          onClick={handleSubscribe}
          disabled={!!busy}
          style={{ background: 'var(--sky)', minHeight: '48px', fontWeight: 700 }}
        >
          {busy === 'subscribe' ? 'מתחבר...' : (
            MOBILE
              ? `${PLATFORM_EMOJI} הוסף את היומן ל-${PLATFORM_LABEL}`
              : '📋 צור קישור והעתק'
          )}
        </button>
      ) : (
        <>
          {MOBILE && (
            <button
              className="btn btn-primary btn-full"
              onClick={handleSubscribe}
              disabled={!!busy}
              style={{ background: 'var(--sky)', minHeight: '48px', fontWeight: 700, marginBottom: '8px' }}
            >
              {busy === 'subscribe' ? 'פותח...' : `${PLATFORM_EMOJI} פתח שוב ב-${PLATFORM_LABEL}`}
            </button>
          )}
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '12px' }}>
            חובר {timeAgoHe(conn.connected_at)}
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm btn-full"
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{ fontSize: '12px', color: 'var(--text-muted)' }}
          >
            {showAdvanced ? '▲ הסתר' : '▼ הגדרות מתקדמות'}
          </button>

          {showAdvanced && (
            <div style={{ marginTop: '10px', padding: '12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                כתובת המנוי
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '10px', wordBreak: 'break-all', color: 'var(--text-secondary)', marginBottom: '10px', padding: '8px', background: 'var(--bg-base)', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border)' }}>
                {httpsUrl}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button className="btn btn-ghost btn-sm" style={{ flex: 1, minWidth: '90px' }} onClick={handleCopy}>
                  📋 העתק
                </button>
                <button className="btn btn-ghost btn-sm" style={{ flex: 1, minWidth: '90px' }} onClick={handleRotate} disabled={!!busy}>
                  {busy === 'rotate' ? '...' : '🔁 רענן לינק'}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ flex: 1, minWidth: '90px', color: 'var(--coral)' }}
                  onClick={handleDisconnect}
                  disabled={!!busy}
                >
                  {busy === 'disconnect' ? '...' : '🚪 בטל סנכרון'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {!isInstalledPWA && isIOS && !conn && (
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '12px', lineHeight: 1.5, textAlign: 'center' }}>
          💡 טיפ: הוסף את האפליקציה למסך הבית (שתף → "הוסף למסך הבית") לחוויה מלאה.
        </p>
      )}
    </div>
  )
}
