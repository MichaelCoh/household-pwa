import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { PageHeader, ThemeToggle, useToast } from '../components/UI'
import {
  isNotificationSupported,
  getNotificationPermission,
  subscribeToNotifications,
  unsubscribeFromNotifications,
} from '../lib/notifications'
import { SettingsInstallButton } from '../components/InstallPrompt'

const NOTIF_CATEGORIES = [
  { key: 'shopping', label: 'קניות', icon: '🛒', desc: 'רשימות ופריטים חדשים' },
  { key: 'tasks',    label: 'משימות', icon: '✅', desc: 'משימות חדשות ועדכונים' },
  { key: 'events',   label: 'אירועים', icon: '📅', desc: 'אירועי לוח שנה' },
  { key: 'baby',     label: 'ילדים 👶', icon: '🍼', desc: 'האכלות וחיתולים' },
]

const defaultPrefs = { shopping: true, tasks: true, events: true, baby: true }

export default function SettingsPage() {
  const { user, householdId, signOut, getMembers, removeMember, toggleCanRemoveMembers, getMemberRole } = useAuth()
  const [members, setMembers] = useState([])
  const [copied, setCopied] = useState(false)
  const [showToast, ToastEl] = useToast()
  const [myRole, setMyRole] = useState(null)
  const [myCanRemove, setMyCanRemove] = useState(false)

  // Notifications state
  const [notifPermission, setNotifPermission] = useState('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notifPrefs, setNotifPrefs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('notif-prefs') || 'null') || defaultPrefs } catch { return defaultPrefs }
  })

  useEffect(() => {
    if (householdId) {
      getMembers().then(setMembers)
      getMemberRole().then(data => {
        if (data) {
          setMyRole(data.role)
          setMyCanRemove(data.role === 'owner' || !!data.can_remove_members)
        }
      })
    }
  }, [householdId])

  useEffect(() => {
    if (isNotificationSupported()) {
      setNotifPermission(getNotificationPermission())
      // בדיקה אם כבר רשום
      navigator.serviceWorker.ready.then(reg => {
        reg.pushManager.getSubscription().then(sub => {
          setIsSubscribed(!!sub)
        })
      })
    }
  }, [])

  const copyHouseholdId = () => {
    navigator.clipboard.writeText(householdId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleEnableNotifications = async () => {
    setLoading(true)
    try {
      await subscribeToNotifications(user.id, householdId)
      setNotifPermission('granted')
      setIsSubscribed(true)
      showToast('✓ התראות הופעלו בהצלחה!')
    } catch (err) {
      showToast('❌ שגיאה: ' + err.message)
      console.error('Notification subscription error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDisableNotifications = async () => {
    setLoading(true)
    try {
      await unsubscribeFromNotifications(user.id)
      setIsSubscribed(false)
      showToast('✓ התראות בוטלו')
    } catch (err) {
      showToast('❌ שגיאה: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleTogglePref = async (key) => {
    const newPrefs = { ...notifPrefs, [key]: !notifPrefs[key] }
    setNotifPrefs(newPrefs)
    localStorage.setItem('notif-prefs', JSON.stringify(newPrefs))
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await supabase.from('push_subscriptions').update({ prefs: newPrefs }).eq('endpoint', sub.endpoint)
      }
    } catch (e) { console.error('Failed to update prefs:', e) }
  }

  const handleCheckForUpdates = async () => {
    if (!('serviceWorker' in navigator)) {
      showToast('⚠️ הדפדפן לא תומך בעדכוני אפליקציה')
      return
    }

    try {
      const reg = await navigator.serviceWorker.ready
      await reg.update()

      // עדכון שכבר ממתין להפעלה
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' })
        showToast('🎉 נמצא עדכון חדש - מפעיל גרסה חדשה...')
        setTimeout(() => window.location.reload(), 500)
        return
      }

      // ייתכן שה-worker בהתקנה כרגע בעקבות update()
      if (reg.installing) {
        await new Promise((resolve) => {
          const worker = reg.installing
          if (!worker) return resolve()
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed') {
              if (reg.waiting) {
                reg.waiting.postMessage({ type: 'SKIP_WAITING' })
                showToast('🎉 נמצא עדכון חדש - מפעיל גרסה חדשה...')
                setTimeout(() => window.location.reload(), 500)
              } else {
                showToast('✓ בדיקת עדכונים הושלמה (אין גרסה חדשה)')
              }
              resolve()
            }
          })
          setTimeout(resolve, 3500)
        })
        return
      }

      showToast('✓ בדיקת עדכונים הושלמה (אין גרסה חדשה)')
    } catch (e) {
      showToast('⚠️ לא ניתן לבדוק עדכונים כרגע')
    }
  }

  const handleRemoveMember = async (member) => {
    if (member.user_id === user.id) return
    if (member.role === 'owner') {
      showToast('❌ לא ניתן להסיר את בעל הבית')
      return
    }
    if (!window.confirm(`להסיר את ${member.display_name || 'חבר בית'} מהבית?`)) return
    try {
      await removeMember(member.id)
      showToast('✓ חבר הבית הוסר')
      getMembers().then(setMembers)
    } catch (err) {
      showToast('❌ שגיאה: ' + err.message)
    }
  }

  const handleToggleCanRemove = async (member) => {
    const current = !!member.can_remove_members
    try {
      await toggleCanRemoveMembers(member.id, !current)
      showToast(current ? '✓ ההרשאה בוטלה' : '✓ הרשאת ניהול חברים ניתנה')
      getMembers().then(setMembers)
    } catch (err) {
      showToast('❌ שגיאה: ' + err.message)
    }
  }

  return (
    <div>
      <PageHeader title="הגדרות" icon="⚙️" accent="var(--primary)" />
      <div className="page" style={{ paddingTop: '20px' }}>

        {/* מראה האפליקציה */}
        <p className="section-label">מראה</p>
        <div className="card" style={{ padding: '16px', marginBottom: '20px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>בחר את מצב התצוגה המועדף עליך</p>
          <ThemeToggle />
        </div>

        {/* התראות */}
        <p className="section-label">התראות</p>
        <div className="card" style={{ padding: '16px', marginBottom: '20px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>קבל התראות על משימות חדשות, קניות ואירועים</p>
          
          {!isNotificationSupported() ? (
            <div style={{ padding: '12px', background: 'var(--amber-light)', color: 'var(--amber)', borderRadius: 'var(--radius-sm)', fontSize: '13px' }}>
              ⚠️ הדפדפן לא תומך בהתראות
            </div>
          ) : notifPermission === 'denied' ? (
            <div style={{ padding: '12px', background: 'var(--coral-light)', color: 'var(--coral)', borderRadius: 'var(--radius-sm)', fontSize: '13px' }}>
              ❌ ההרשאה להתראות נדחתה. שנה את ההגדרות בדפדפן.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
              {isSubscribed ? (
                <>
                  <div style={{ padding: '12px', background: 'var(--mint-light)', color: 'var(--mint)', borderRadius: 'var(--radius-sm)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>✅</span>
                    <span style={{ flex: 1 }}>התראות פעילות</span>
                  </div>
                  <button className="btn btn-ghost btn-full" onClick={handleDisableNotifications} disabled={loading}>
                    {loading ? '...' : '🔕 בטל התראות'}
                  </button>
                </>
              ) : (
                <button className="btn btn-primary btn-full" onClick={handleEnableNotifications} disabled={loading} style={{ background: 'var(--mint)', color: '#fff' }}>
                  {loading ? '...' : '🔔 הפעל התראות'}
                </button>
              )}
            </div>
          )}

          {/* הגדרות קטגוריות */}
          {isSubscribed && notifPermission === 'granted' && (
            <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
              <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                קבל התראות על:
              </p>
              {NOTIF_CATEGORIES.map(cat => (
                <div key={cat.key} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '20px', width: '26px', textAlign: 'center' }}>{cat.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600 }}>{cat.label}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{cat.desc}</div>
                  </div>
                  <button
                    onClick={() => handleTogglePref(cat.key)}
                    style={{
                      width: 46, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', position: 'relative',
                      background: notifPrefs[cat.key] ? 'var(--mint)' : 'var(--border)',
                      transition: 'background 0.2s', flexShrink: 0,
                    }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: 10, background: '#fff',
                      position: 'absolute', top: 3,
                      right: notifPrefs[cat.key] ? 3 : 23,
                      transition: 'right 0.2s',
                    }} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* חשבון */}
        <p className="section-label">חשבון</p>
        <div className="card" style={{ marginBottom: '20px', overflow: 'hidden' }}>
          {[
            ['👤', 'מחובר כ', user?.email],
            ['🏠', 'קוד הבית', householdId?.slice(0, 20) + '...']
          ].map(([icon, label, value]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '20px', width: '28px' }}>{icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{label}</div>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>{value}</div>
              </div>
            </div>
          ))}
          <div style={{ padding: '14px 16px' }}>
            <button className="btn btn-ghost btn-full" onClick={signOut}>🚪 התנתק</button>
          </div>
        </div>

        {/* בני הבית */}
        <p className="section-label">בני הבית</p>
        <div className="card" style={{ marginBottom: '20px', overflow: 'hidden' }}>
          {members.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
              טוען בני בית...
            </div>
          ) : members.map((m, i) => {
            const isMe = m.user_id === user?.id
            const isOwner = m.role === 'owner'
            const canRemoveThis = !isMe && !isOwner && myCanRemove
            const showDelegateToggle = myRole === 'owner' && !isMe && !isOwner
            return (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderBottom: i < members.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--primary)', fontSize: '15px' }}>
                  {(m.display_name || m.user_id).charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>{m.display_name || 'חבר בית'}{isMe ? ' (אני)' : ''}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {isOwner ? 'בעל הבית' : m.can_remove_members ? 'חבר בית · מנהל' : 'חבר בית'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <span style={{ fontSize: '11px', background: isOwner ? 'var(--amber-light)' : m.can_remove_members ? 'var(--sky-light)' : 'var(--primary-light)', color: isOwner ? 'var(--amber)' : m.can_remove_members ? 'var(--sky)' : 'var(--primary)', padding: '3px 8px', borderRadius: '999px', fontWeight: 700 }}>
                    {isOwner ? '👑 בעלים' : m.can_remove_members ? '🛡️ מנהל' : '👤 חבר'}
                  </span>
                  {showDelegateToggle && (
                    <button onClick={() => handleToggleCanRemove(m)} title={m.can_remove_members ? 'בטל הרשאת ניהול' : 'תן הרשאת ניהול'} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '2px', opacity: 0.6 }}>
                      {m.can_remove_members ? '🛡️' : '🔓'}
                    </button>
                  )}
                  {canRemoveThis && (
                    <button onClick={() => handleRemoveMember(m)} title="הסר מהבית" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '2px', opacity: 0.5, color: 'var(--coral)' }}>✕</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* הזמנת בני משפחה */}
        <p className="section-label">הזמנת בני משפחה</p>
        <div className="card" style={{ padding: '16px', marginBottom: '20px' }}>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.6 }}>
            שתף קישור הזמנה — מי שילחץ עליו יוכל להצטרף לבית שלך בקלות.
          </p>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', fontFamily: 'monospace', fontSize: '12px', marginBottom: '12px', wordBreak: 'break-all', color: 'var(--primary)', border: '1px solid var(--border)', lineHeight: 1.5 }}>
            {`${window.location.origin}/join?homeCode=${householdId}`}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => {
              const url = `${window.location.origin}/join?homeCode=${householdId}`
              navigator.clipboard.writeText(url)
              showToast('✅ קישור הזמנה הועתק!')
            }}>
              📋 העתק קישור
            </button>
            {navigator.share && (
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => {
                navigator.share({
                  title: 'הצטרף לבית שלי',
                  text: 'הוזמנת להצטרף לבית שלי באפליקציה — לחץ על הקישור:',
                  url: `${window.location.origin}/join?homeCode=${householdId}`,
                }).catch(() => {})
              }}>
              📤 שתף
              </button>
            )}
          </div>
          <div style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>או שתף קוד בית ידנית:</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', border: '1px solid var(--border)' }}>
              <span style={{ flex: 1, fontFamily: 'monospace', fontSize: '13px', color: 'var(--text-secondary)' }}>{householdId}</span>
              <button onClick={() => { navigator.clipboard.writeText(householdId); showToast('✅ קוד הבית הועתק!') }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--text-muted)', padding: '2px', flexShrink: 0 }} aria-label="העתק קוד בית">📋</button>
            </div>
          </div>
        </div>

        {/* עדכון האפליקציה */}
        <p className="section-label">עדכון האפליקציה</p>
        <div className="card" style={{ padding: '16px', marginBottom: '20px' }}>
          <button
            className="btn btn-ghost btn-full"
            onClick={handleCheckForUpdates}
          >
            🔄 בדוק עדכונים
          </button>
        </div>

        {/* התקנת האפליקציה */}
        <p className="section-label">התקנת האפליקציה</p>
        <div className="card" style={{ padding: '16px', marginBottom: '20px' }}>
          <SettingsInstallButton />
        </div>

        {/* אודות */}
        <p className="section-label">אודות</p>
        <div className="card" style={{ overflow: 'hidden' }}>
          {[
            ['📱', 'אפליקציה', 'הבית שלי PWA'],
            ['🔒', 'פרטיות', 'הנתונים שלך, אצלך בבית'],
            ['💾', 'אחסון', 'שרת פרטי מקומי'],
            ['🌐', 'עבודה ללא אינטרנט', 'כן — Service Worker'],
            ['⚡', 'עדכונים חיים', 'Realtime Sync'],
          ].map(([icon, label, value], i, arr) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <span style={{ fontSize: '18px', width: '24px' }}>{icon}</span>
              <span style={{ flex: 1, fontSize: '14px' }}>{label}</span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{value}</span>
            </div>
          ))}
        </div>

      </div>
      {ToastEl}
    </div>
  )
}
