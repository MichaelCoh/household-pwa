import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { PageHeader, ThemeToggle, useToast } from '../components/UI'
import {
  isNotificationSupported,
  getNotificationPermission,
  subscribeToNotifications,
  unsubscribeFromNotifications,
  sendTestNotification
} from '../lib/notifications'

export default function SettingsPage() {
  const { user, householdId, signOut, getMembers } = useAuth()
  const [members, setMembers] = useState([])
  const [copied, setCopied] = useState(false)
  const [showToast, ToastEl] = useToast()

  // Notifications state
  const [notifPermission, setNotifPermission] = useState('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (householdId) getMembers().then(setMembers)
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

  const handleTestNotification = async () => {
    try {
      await sendTestNotification(householdId, user.id)
      showToast('✓ התראת בדיקה נשלחה!')
    } catch (err) {
      showToast('❌ שגיאה בשליחה: ' + err.message)
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
                  <button className="btn btn-ghost btn-full" onClick={handleTestNotification}>
                    🔔 שלח התראת בדיקה
                  </button>
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
          ) : members.map((m, i) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderBottom: i < members.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--primary)', fontSize: '15px' }}>
                {(m.display_name || m.user_id).charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>{m.display_name || 'חבר בית'}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {m.role === 'owner' ? 'בעל הבית' : 'חבר בית'}
                </div>
              </div>
              <span style={{ fontSize: '11px', background: m.role === 'owner' ? 'var(--amber-light)' : 'var(--primary-light)', color: m.role === 'owner' ? 'var(--amber)' : 'var(--primary)', padding: '3px 8px', borderRadius: '999px', fontWeight: 700 }}>
                {m.role === 'owner' ? '👑 בעלים' : '👤 חבר'}
              </span>
            </div>
          ))}
        </div>

        {/* הזמנת בני משפחה */}
        <p className="section-label">הזמנת בני משפחה</p>
        <div className="card" style={{ padding: '16px', marginBottom: '20px' }}>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.6 }}>
            שתף את קוד הבית עם בני המשפחה. הם יזינו אותו בעת ההרשמה כדי להצטרף לבית שלך.
          </p>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', fontFamily: 'monospace', fontSize: '13px', marginBottom: '12px', wordBreak: 'break-all', color: 'var(--primary)', border: '1px solid var(--border)' }}>
            {householdId}
          </div>
          <button className="btn btn-primary btn-full" onClick={copyHouseholdId}>
            {copied ? '✅ הועתק!' : '📋 העתק קוד הבית'}
          </button>
        </div>

        {/* התקנת האפליקציה */}
        <p className="section-label">התקנת האפליקציה</p>
        <div className="card" style={{ padding: '16px', marginBottom: '20px' }}>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <strong>iPhone/iPad:</strong> לחץ על כפתור השיתוף בספארי ← "הוסף למסך הבית"<br /><br />
            <strong>Android:</strong> לחץ על התפריט (⋮) ב-Chrome ← "הוסף למסך הבית"<br /><br />
            <strong>מחשב:</strong> לחץ על אייקון ההתקנה (⊕) בשורת הכתובת
          </p>
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
