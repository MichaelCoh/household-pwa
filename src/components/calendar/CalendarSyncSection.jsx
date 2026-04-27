/**
 * CalendarSyncSection
 * ─────────────────────────────────────────────────────────────────
 * Self-contained "חיבור יומן" block embedded in the Settings page.
 *
 * Implements the three tiers:
 *   • Google Calendar (full OAuth2 + two-way sync) — Tier 1
 *   • webcal subscription (Apple Calendar / any calendar app) — Tier 2
 *   • ICS export/import — Tier 3
 *
 * Plus:
 *   • Per-source toggles for the user's Google calendars
 *   • Global sync settings + sync history
 *   • Privacy disclosure flow on first connect
 *   • Platform-aware ordering (Apple webcal first on iOS PWA, Google first on Android)
 */

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { EventDB, TaskDB } from '../../lib/db'
import { generateICS, downloadICS, parseICS } from '../../lib/calendar/ics'
import {
  isGoogleConfiguredFrontend,
  getAuthUrl,
  exchangeCode,
  disconnectGoogle,
  rotateFeedToken,
  setSettings as setRemoteSettings,
} from '../../lib/calendar/google'
import {
  getConnections,
  getRecentSyncLog,
  buildFeedUrl,
  acknowledgePrivacy,
  isPrivacyAcknowledged,
} from '../../lib/calendar/connection'
import { syncPullGoogle } from '../../lib/calendar/sync'
import { ImportedEventDB } from '../../lib/calendar/db'
import { isAndroid, isIOS, isInstalledPWA, recommendedTier, openWebcalUrl, platformLabel } from '../../lib/calendar/platform'
import CalendarPrivacyDisclosure from './CalendarPrivacyDisclosure'

const REDIRECT_PATH = '/settings'

function StatusPill({ status, label }) {
  const map = {
    connected: { bg: 'var(--mint-light)', fg: 'var(--mint)', text: label || 'מחובר' },
    error:     { bg: 'var(--coral-light)', fg: 'var(--coral)', text: label || 'שגיאה' },
    none:      { bg: 'var(--bg-elevated)', fg: 'var(--text-muted)', text: label || 'לא מחובר' },
    info:      { bg: 'var(--sky-light)', fg: 'var(--sky)', text: label },
  }
  const m = map[status] || map.none
  return (
    <span className="pill" style={{ background: m.bg, color: m.fg }}>{m.text}</span>
  )
}

function ToggleRow({ checked, onChange, label, desc, color = 'var(--mint)' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '14px', fontWeight: 600 }}>{label}</div>
        {desc && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{desc}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{
          width: 46, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', position: 'relative',
          background: checked ? color : 'var(--border)', transition: 'background 0.2s', flexShrink: 0,
        }}
        aria-pressed={!!checked}
      >
        <div style={{
          width: 20, height: 20, borderRadius: 10, background: '#fff',
          position: 'absolute', top: 3, right: checked ? 3 : 23, transition: 'right 0.2s',
        }} />
      </button>
    </div>
  )
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

export default function CalendarSyncSection({ showToast }) {
  const { user, householdId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [connections, setConnections] = useState([])
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState('')
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [pendingTier, setPendingTier] = useState(null) // 'google' | 'webcal'
  const [importPreview, setImportPreview] = useState(null) // { events: [...] } from ICS
  const [importing, setImporting] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const googleConn = useMemo(() => connections.find((c) => c.provider === 'google'), [connections])
  const webcalConn = useMemo(() => connections.find((c) => c.provider === 'webcal'), [connections])

  const refresh = async () => {
    if (!user) return
    const [conns, log] = await Promise.all([
      getConnections(user.id),
      getRecentSyncLog(user.id, 10),
    ])
    setConnections(conns)
    setHistory(log)
    setLoading(false)
  }

  useEffect(() => {
    if (user) refresh()
  }, [user?.id])

  // Catch the OAuth callback when Google redirects back to /settings?code=...&state=...
  useEffect(() => {
    if (!user) return
    const url = new URL(window.location.href)
    const code = url.searchParams.get('code')
    const stateParam = url.searchParams.get('state')
    const expectedState = sessionStorage.getItem('hh_google_oauth_state')
    if (!code) return

    // Always strip the code from the URL bar before doing anything else.
    url.searchParams.delete('code')
    url.searchParams.delete('state')
    url.searchParams.delete('scope')
    url.searchParams.delete('authuser')
    url.searchParams.delete('prompt')
    window.history.replaceState({}, '', url.pathname + (url.search ? `?${url.searchParams}` : '') + url.hash)

    if (expectedState && stateParam !== expectedState) {
      showToast?.('❌ פרמטר state לא תואם — נסה שוב')
      return
    }
    sessionStorage.removeItem('hh_google_oauth_state')
    ;(async () => {
      setBusy('google-exchange')
      try {
        const redirect = window.location.origin + REDIRECT_PATH
        await exchangeCode(code, redirect)
        showToast?.('✅ Google Calendar חובר בהצלחה')
        await syncPullGoogle(user.id).catch(() => {})
        await refresh()
      } catch (e) {
        showToast?.('❌ ' + (e.message || 'חיבור Google נכשל'))
      } finally {
        setBusy('')
      }
    })()
  }, [user?.id])

  const ensurePrivacy = async (tier) => {
    const ok = await isPrivacyAcknowledged(user.id)
    if (ok) return true
    setPendingTier(tier)
    setShowPrivacy(true)
    return false
  }

  const handleAcceptPrivacy = async () => {
    setShowPrivacy(false)
    // Pre-create a dummy connection row to anchor privacy_acknowledged_at,
    // OR acknowledge on every existing row. We use the latter — and rely on
    // the connect path to create the row.
    try {
      await acknowledgePrivacy(user.id)
    } catch { /* will retry next time */ }
    if (pendingTier === 'google') startGoogleAuth()
    if (pendingTier === 'webcal') startWebcal()
    setPendingTier(null)
  }

  const startGoogleAuth = async () => {
    if (!isGoogleConfiguredFrontend) {
      showToast?.('⚠️ Google Client ID לא הוגדר — ראה הוראות בהגדרות')
      return
    }
    if (!(await ensurePrivacy('google'))) return
    setBusy('google-start')
    try {
      const redirect = window.location.origin + REDIRECT_PATH
      const state = crypto.randomUUID()
      sessionStorage.setItem('hh_google_oauth_state', state)
      const { url } = await getAuthUrl(redirect, state)
      window.location.href = url
    } catch (e) {
      showToast?.('❌ ' + (e.message || 'שגיאת התחלת חיבור Google'))
      setBusy('')
    }
  }

  const startWebcal = async () => {
    if (!(await ensurePrivacy('webcal'))) return
    setBusy('webcal-start')
    try {
      const { feed_token } = await rotateFeedToken()
      await refresh()
      const url = buildFeedUrl(feed_token)
      if (url) {
        openWebcalUrl(url)
        showToast?.('✅ קישור webcal נוצר — בחר את אפליקציית היומן')
      }
    } catch (e) {
      showToast?.('❌ ' + (e.message || 'שגיאת יצירת קישור webcal'))
    } finally {
      setBusy('')
    }
  }

  const handleRotate = async () => {
    if (!window.confirm('פעולה זו תבטל את כל המנויים הקיימים ל-webcal ותיצור קישור חדש. להמשיך?')) return
    setBusy('webcal-rotate')
    try {
      await rotateFeedToken()
      await refresh()
      showToast?.('✅ הקישור רוענן')
    } catch (e) {
      showToast?.('❌ ' + (e.message || 'שגיאת רענון קישור'))
    } finally {
      setBusy('')
    }
  }

  const handleCopyFeed = () => {
    const url = buildFeedUrl(webcalConn?.feed_token)
    if (!url) return
    navigator.clipboard.writeText(url)
    showToast?.('✅ הקישור הועתק')
  }

  const handleDisconnectGoogle = async () => {
    if (!window.confirm('להתנתק מ-Google Calendar? כל האירועים שיובאו יימחקו מהאפליקציה.')) return
    setBusy('google-disconnect')
    try {
      await disconnectGoogle()
      await refresh()
      showToast?.('✓ נותקת מ-Google Calendar')
    } catch (e) {
      showToast?.('❌ ' + (e.message || 'שגיאת ניתוק'))
    } finally {
      setBusy('')
    }
  }

  const handleSyncNow = async () => {
    setBusy('sync-now')
    try {
      const r = await syncPullGoogle(user.id)
      if (!r.ok) throw new Error(r.error || r.reason || 'sync_failed')
      await refresh()
      showToast?.(`✅ סונכרנו ${r.imported || 0} אירועים`)
    } catch (e) {
      showToast?.('❌ ' + (e.message || 'שגיאת סנכרון'))
    } finally {
      setBusy('')
    }
  }

  const handleToggleCalendar = async (calId, enabled) => {
    const cals = (googleConn?.google_calendars || []).map((c) =>
      c.id === calId ? { ...c, enabled } : c
    )
    setBusy('cal-toggle-' + calId)
    try {
      await setRemoteSettings({ provider: 'google', settings: googleConn.settings || {}, calendars: cals })
      await refresh()
    } catch (e) {
      showToast?.('❌ ' + (e.message || 'שגיאה בעדכון יומן'))
    } finally {
      setBusy('')
    }
  }

  const handleToggleSetting = async (provider, key) => {
    const conn = connections.find((c) => c.provider === provider)
    if (!conn) return
    const cur = conn.settings || {}
    const next = { ...cur, [key]: !(cur[key] !== false) }
    setBusy(`set-${provider}-${key}`)
    try {
      await setRemoteSettings({ provider, settings: next })
      await refresh()
    } catch (e) {
      showToast?.('❌ ' + (e.message || 'שגיאה'))
    } finally {
      setBusy('')
    }
  }

  // ── Tier 3 export/import ────────────────────────────────────────────────
  const handleExport = async () => {
    setBusy('export')
    try {
      const now = new Date()
      const fromYear = now.getFullYear() - 1
      const toYear = now.getFullYear() + 2
      const allEvents = []
      const allTasks = []
      // Pull a wide range using getForMonth (existing API)
      for (let y = fromYear; y <= toYear; y++) {
        for (let m = 0; m < 12; m++) {
          const [ev, tk] = await Promise.all([
            EventDB.getForMonth(householdId, y, m),
            TaskDB.getForMonth(householdId, y, m),
          ])
          allEvents.push(...ev)
          allTasks.push(...tk)
        }
      }
      const body = generateICS({
        events: allEvents,
        tasks: allTasks,
        appOrigin: window.location.origin,
        calendarName: 'הבית שלנו',
      })
      downloadICS(body, 'home-calendar.ics')
      showToast?.(`📥 יוצאו ${allEvents.length} אירועים + ${allTasks.length} משימות`)
    } catch (e) {
      showToast?.('❌ ' + (e.message || 'שגיאה ביצוא'))
    } finally {
      setBusy('')
    }
  }

  const handleImportFile = async (file) => {
    if (!file) return
    setBusy('import-parse')
    try {
      const text = await file.text()
      const parsed = parseICS(text)
      setImportPreview({ events: parsed, fileName: file.name })
    } catch (e) {
      showToast?.('❌ קובץ לא תקין: ' + e.message)
    } finally {
      setBusy('')
    }
  }

  const handleConfirmImport = async () => {
    if (!importPreview?.events?.length) return
    setImporting(true)
    try {
      const r = await ImportedEventDB.bulkInsertFromICS(householdId, user.id, importPreview.events)
      showToast?.(`✅ יובאו ${r.inserted} אירועים`)
      setImportPreview(null)
    } catch (e) {
      showToast?.('❌ ' + (e.message || 'שגיאה ביבוא'))
    } finally {
      setImporting(false)
    }
  }

  // Order tiers per platform
  const order = useMemo(() => {
    const rec = recommendedTier()
    if (rec === 'webcal') return ['webcal', 'google', 'ics']
    return ['google', 'webcal', 'ics']
  }, [])

  if (loading) {
    return (
      <div className="card" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
        טוען חיבורי יומן...
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      {!isInstalledPWA && isIOS && (
        <div className="card" style={{ padding: '14px', marginBottom: '12px', background: 'var(--amber-light)', border: '1px solid var(--amber)' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--amber)', marginBottom: '4px' }}>
            📱 מומלץ להתקין את האפליקציה תחילה
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            כדי להפעיל סנכרון מלא ב-iPhone — שתף → "הוסף למסך הבית". התראות Push זמינות רק באפליקציה מותקנת ב-iOS 16.4 ומעלה.
          </div>
        </div>
      )}

      {order.map((tier) => {
        if (tier === 'google') return (
          <GoogleTier
            key="google"
            conn={googleConn}
            busy={busy}
            isPrimary={recommendedTier() === 'google'}
            onConnect={startGoogleAuth}
            onDisconnect={handleDisconnectGoogle}
            onSyncNow={handleSyncNow}
            onToggleSetting={(k) => handleToggleSetting('google', k)}
            onToggleCalendar={handleToggleCalendar}
          />
        )
        if (tier === 'webcal') return (
          <WebcalTier
            key="webcal"
            conn={webcalConn}
            busy={busy}
            isPrimary={recommendedTier() === 'webcal'}
            onCreate={startWebcal}
            onRotate={handleRotate}
            onCopy={handleCopyFeed}
            onToggleSetting={(k) => handleToggleSetting('webcal', k)}
          />
        )
        if (tier === 'ics') return (
          <IcsTier
            key="ics"
            busy={busy}
            onExport={handleExport}
            onImport={handleImportFile}
          />
        )
        return null
      })}

      {/* Sync history */}
      <div style={{ marginTop: '12px' }}>
        <button
          className="btn btn-ghost btn-sm btn-full"
          onClick={() => setShowHistory((v) => !v)}
        >
          {showHistory ? '▲ הסתר היסטוריית סנכרון' : `📜 היסטוריית סנכרון (${history.length})`}
        </button>
        {showHistory && (
          <div className="card" style={{ marginTop: '8px', overflow: 'hidden' }}>
            {history.length === 0 ? (
              <div style={{ padding: '14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                אין פעולות סנכרון בהיסטוריה
              </div>
            ) : history.map((h, i) => (
              <div key={h.id} style={{
                padding: '10px 14px',
                borderBottom: i < history.length - 1 ? '1px solid var(--border)' : 'none',
                display: 'flex', alignItems: 'center', gap: '10px',
              }}>
                <span style={{ fontSize: '16px' }}>
                  {h.status === 'success' ? '✅' : h.status === 'error' ? '⚠️' : '➖'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>
                    {h.provider} · {h.direction} · {h.items_count}
                  </div>
                  {h.error_message && (
                    <div className="truncate" style={{ fontSize: '11px', color: 'var(--coral)' }}>{h.error_message}</div>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{timeAgoHe(h.synced_at)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CalendarPrivacyDisclosure
        open={showPrivacy}
        onAccept={handleAcceptPrivacy}
        onCancel={() => { setShowPrivacy(false); setPendingTier(null) }}
      />

      {importPreview && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !importing && setImportPreview(null)}>
          <div className="modal">
            <div className="modal-handle" />
            <div className="modal-header">
              <h2 className="modal-title">יבוא {importPreview.events.length} אירועים</h2>
              <button className="modal-close" onClick={() => !importing && setImportPreview(null)}>✕</button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              נמצאו {importPreview.events.length} אירועים בקובץ {importPreview.fileName}. הם יסומנו במקור "יומן חיצוני".
            </p>
            <div style={{ maxHeight: '40vh', overflowY: 'auto', marginBottom: '12px' }}>
              {importPreview.events.slice(0, 50).map((e, i) => (
                <div key={i} className="list-item" style={{ marginBottom: '6px' }}>
                  <div className="list-item-body">
                    <div className="list-item-title">{e.title}</div>
                    <div className="list-item-meta">
                      {e.date}{e.time ? ` · ${e.time}` : ''}{e.location ? ` · ${e.location}` : ''}
                    </div>
                  </div>
                </div>
              ))}
              {importPreview.events.length > 50 && (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '8px' }}>
                  ועוד {importPreview.events.length - 50} אירועים...
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn" style={{ flex: 2, background: 'var(--sky)', color: '#fff' }} onClick={handleConfirmImport} disabled={importing}>
                {importing ? 'מייבא...' : 'יבא הכל'}
              </button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setImportPreview(null)} disabled={importing}>ביטול</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Tier 1: Google ──────────────────────────────────────────────────────────
function GoogleTier({ conn, busy, isPrimary, onConnect, onDisconnect, onSyncNow, onToggleSetting, onToggleCalendar }) {
  const settings = conn?.settings || {}
  const cals = conn?.google_calendars || []

  return (
    <div className="card" style={{ padding: '16px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <span style={{ fontSize: '20px' }}>🟢</span>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700, flex: 1 }}>
          Google Calendar
        </h3>
        {isPrimary && <StatusPill status="info" label="מומלץ" />}
        {!conn && <StatusPill status="none" />}
        {conn && conn.status === 'active' && <StatusPill status="connected" />}
        {conn && conn.status === 'error' && <StatusPill status="error" />}
      </div>

      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.5 }}>
        סנכרון דו-כיווני מלא: אירועים מהאפליקציה עוברים ל-Google Calendar וחזרה.
      </p>

      {!isGoogleConfiguredFrontend ? (
        <div style={{ padding: '10px 12px', fontSize: '12px', background: 'var(--amber-light)', color: 'var(--amber)', borderRadius: 'var(--radius-sm)', lineHeight: 1.5 }}>
          ⚠️ מנהל המערכת לא הגדיר Google Client ID. הוסף <code>VITE_GOOGLE_CLIENT_ID</code> ל-<code>.env</code> ואת <code>GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI</code> ל-Edge Function secrets.
        </div>
      ) : !conn ? (
        <button className="btn btn-primary btn-full" onClick={onConnect} disabled={!!busy} style={{ background: 'var(--sky)' }}>
          {busy === 'google-start' || busy === 'google-exchange' ? 'מתחבר...' : '🟢 חבר חשבון Google'}
        </button>
      ) : (
        <>
          <div style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', marginBottom: '10px', fontSize: '13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
              <span style={{ fontWeight: 600 }}>👤 {conn.google_email || 'חשבון מחובר'}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {conn.last_sync_at ? `סונכרן ${timeAgoHe(conn.last_sync_at)}` : 'טרם סונכרן'}
              </span>
            </div>
            {conn.last_error && (
              <div style={{ fontSize: '11px', color: 'var(--coral)', marginTop: '6px' }}>⚠️ {conn.last_error}</div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={onSyncNow} disabled={!!busy}>
              {busy === 'sync-now' ? 'מסנכרן...' : '🔄 סנכרן עכשיו'}
            </button>
            <button className="btn btn-ghost btn-sm" style={{ flex: 1, color: 'var(--coral)' }} onClick={onDisconnect} disabled={!!busy}>
              {busy === 'google-disconnect' ? 'מנתק...' : '🚪 נתק'}
            </button>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
            <ToggleRow
              checked={settings.auto_sync_new !== false}
              onChange={() => onToggleSetting('auto_sync_new')}
              label="סנכרן אירועים חדשים אוטומטית"
              desc="אירוע שתוסיפו יעבור ליומן Google מיד"
            />
            <ToggleRow
              checked={settings.import_external !== false}
              onChange={() => onToggleSetting('import_external')}
              label="ייבא אירועים מ-Google Calendar"
              desc="אירועים מהיומן שלך יוצגו באפליקציה"
            />
            <ToggleRow
              checked={settings.suppress_app_notifications_when_synced !== false}
              onChange={() => onToggleSetting('suppress_app_notifications_when_synced')}
              label="הימנע מהתראות כפולות"
              desc="כשהיומן מחובר — Push מהאפליקציה כבוי כברירת מחדל"
            />
          </div>

          {cals.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', marginTop: '8px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                יומנים לסנכרון
              </div>
              {cals.map((c) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.color || '#4285F4', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="truncate" style={{ fontSize: '13px', fontWeight: 600 }}>
                      {c.name || c.id}{c.primary ? ' · ראשי' : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleCalendar(c.id, !c.enabled)}
                    style={{
                      width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', position: 'relative',
                      background: c.enabled ? 'var(--mint)' : 'var(--border)', flexShrink: 0,
                    }}
                    aria-pressed={!!c.enabled}
                  >
                    <div style={{
                      width: 16, height: 16, borderRadius: 8, background: '#fff',
                      position: 'absolute', top: 3, right: c.enabled ? 3 : 21,
                    }} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Tier 2: webcal ──────────────────────────────────────────────────────────
function WebcalTier({ conn, busy, isPrimary, onCreate, onRotate, onCopy, onToggleSetting }) {
  const url = buildFeedUrl(conn?.feed_token)
  const settings = conn?.settings || {}

  return (
    <div className="card" style={{ padding: '16px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <span style={{ fontSize: '20px' }}>📡</span>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700, flex: 1 }}>
          {isIOS ? 'Apple Calendar (webcal)' : 'מנוי webcal — כל אפליקציית יומן'}
        </h3>
        {isPrimary && <StatusPill status="info" label="מומלץ" />}
        {!conn && <StatusPill status="none" />}
        {conn && <StatusPill status="connected" label="פעיל" />}
      </div>

      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.5 }}>
        קישור חי שאליו תירשם אפליקציית היומן בטלפון. עדכון של אירוע באפליקציה מופיע אוטומטית בטלפון. כיוון אחד: אפליקציה → טלפון.
      </p>

      {!conn ? (
        <button className="btn btn-primary btn-full" onClick={onCreate} disabled={!!busy} style={{ background: isPrimary ? 'var(--sky)' : 'var(--primary)' }}>
          {busy === 'webcal-start' ? 'מייצר...' : (isIOS ? '🍎 הירשם ב-Apple Calendar' : '📡 צור קישור webcal')}
        </button>
      ) : (
        <>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all', color: 'var(--text-secondary)', marginBottom: '10px', border: '1px solid var(--border)' }}>
            {url}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <button className="btn btn-primary btn-sm" style={{ flex: 1, background: 'var(--sky)' }} onClick={() => url && openWebcalUrl(url)}>
              📲 הירשם ביומן
            </button>
            <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={onCopy}>
              📋 העתק
            </button>
            <button className="btn btn-ghost btn-sm" style={{ flex: 1, color: 'var(--coral)' }} onClick={onRotate} disabled={!!busy}>
              {busy === 'webcal-rotate' ? '...' : '🔁 רענן לינק'}
            </button>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
            <ToggleRow
              checked={settings.default_event_sync !== false}
              onChange={() => onToggleSetting('default_event_sync')}
              label="סנכרן אירועים חדשים אוטומטית"
              desc="כל אירוע חדש יופיע ב-feed אלא אם תכבה ידנית"
            />
          </div>
          {isAndroid && (
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
              ב-Android, "הירשם ביומן" יפתח את Google Calendar. שמור את הקישור גם לגיבוי.
            </p>
          )}
        </>
      )}
    </div>
  )
}

// ── Tier 3: ICS ─────────────────────────────────────────────────────────────
function IcsTier({ busy, onExport, onImport }) {
  return (
    <div className="card" style={{ padding: '16px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <span style={{ fontSize: '20px' }}>📁</span>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700, flex: 1 }}>
          ייצוא / ייבוא ICS
        </h3>
        <StatusPill status="info" label="חד-פעמי" />
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.5 }}>
        עובד עם כל אפליקציית יומן. לא חי — תצלום מצב חד-פעמי.
      </p>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={onExport} disabled={!!busy}>
          {busy === 'export' ? 'מייצא...' : '⬇️ ייצוא לקובץ ICS'}
        </button>
        <label className="btn btn-ghost btn-sm" style={{ flex: 1, cursor: 'pointer' }}>
          {busy === 'import-parse' ? 'קורא...' : '⬆️ ייבוא מקובץ'}
          <input
            type="file"
            accept=".ics,text/calendar"
            style={{ display: 'none' }}
            onChange={(e) => { onImport(e.target.files?.[0]); e.target.value = '' }}
          />
        </label>
      </div>
    </div>
  )
}
