import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

/** כפתור טקסט — חזרה (עקבי בכל המסכים) */
function BackLink({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn btn-ghost btn-full"
      style={{
        marginBottom: '16px',
        fontSize: '14px',
        fontWeight: 600,
        color: 'var(--text-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 14px',
      }}
    >
      {children}
    </button>
  )
}

export default function AuthPage() {
  const { signIn, signUp, signOut, createHousehold, joinHousehold, user, householdId } = useAuth()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [householdName, setHouseholdName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [joinMode, setJoinMode] = useState('create')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  /** חזרה למסך התחברות ראשי + התנתקות (נדרש כשכבר מחוברים — למשל לפני יצירת בית) */
  const backToSignInScreen = async () => {
    setError('')
    setLoading(true)
    try {
      await signOut()
    } catch (_) {
      /* ignore */
    }
    setMode('signin')
    setHouseholdName('')
    setInviteCode('')
    setJoinMode('create')
    setPassword('')
    setLoading(false)
  }

  /** חזרה ממסך הרשמה בלבד — עדיין לא מחוברים */
  const backFromSignupToSignIn = () => {
    setError('')
    setMode('signin')
  }

  // סשן קיים בלי בית — להמשיך ישר להגדרת בית (עם אופציית חזרה למסך התחברות)
  useEffect(() => {
    if (user && !householdId) setMode('household')
    else if (!user) setMode('signin')
  }, [user, householdId])

  const handleAuth = async () => {
    setError('')
    setLoading(true)
    try {
      if (mode === 'signin') {
        await signIn(email, password)
        const { data: { user: u } } = await supabase.auth.getUser()
        if (u) {
          const { data: hm } = await supabase
            .from('household_members')
            .select('household_id')
            .eq('user_id', u.id)
            .maybeSingle()
          if (!hm?.household_id) setMode('household')
        }
      } else {
        await signUp(email, password, name)
        setMode('household')
      }
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  const handleHousehold = async () => {
    setError('')
    setLoading(true)
    try {
      if (joinMode === 'create') {
        if (!householdName.trim()) {
          setError('נא להזין שם לבית')
          setLoading(false)
          return
        }
        await createHousehold(householdName.trim(), name.trim())
      } else {
        if (!inviteCode.trim()) {
          setError('נא להזין את קוד הבית')
          setLoading(false)
          return
        }
        await joinHousehold(inviteCode.trim(), name.trim())
      }
    } catch (e) {
      setError(e.message || String(e))
    }
    setLoading(false)
  }

  // ── מסך: יצירת / הצטרפות לבית ─────────────────────────────────────────
  if (mode === 'household') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <BackLink onClick={backToSignInScreen}>← חזרה למסך ההתחברות</BackLink>

          <div className="auth-logo">🏠 הבית שלי</div>
          <p className="auth-subtitle" style={{ lineHeight: 1.5 }}>
            כדי להמשיך — צור בית חדש או הצטרף עם קוד מהמשפחה
          </p>

          <div className="input-group">
            <label className="input-label">השם שלך</label>
            <input
              className="input"
              placeholder="למשל: מיכאל"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <button
              type="button"
              onClick={() => { setJoinMode('create'); setError('') }}
              className="type-btn"
              style={
                joinMode === 'create'
                  ? { borderColor: 'var(--primary)', color: 'var(--primary)', background: 'var(--primary-light)' }
                  : {}
              }
            >
              🆕 בית חדש
            </button>
            <button
              type="button"
              onClick={() => { setJoinMode('join'); setError('') }}
              className="type-btn"
              style={
                joinMode === 'join'
                  ? { borderColor: 'var(--primary)', color: 'var(--primary)', background: 'var(--primary-light)' }
                  : {}
              }
            >
              🔗 יש לי קוד
            </button>
          </div>

          {joinMode === 'create' ? (
            <div className="input-group">
              <label className="input-label">שם הבית</label>
              <input
                className="input"
                placeholder="למשל: משפחת כהן"
                value={householdName}
                onChange={e => setHouseholdName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleHousehold()}
                autoFocus
              />
            </div>
          ) : (
            <div className="input-group">
              <label className="input-label">קוד הבית</label>
              <input
                className="input"
                placeholder="hh_xxxxxxxxxxxxx"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleHousehold()}
                autoFocus
              />
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                הקוד מופיע בהגדרות אצל מי שיצר את הבית
              </p>
            </div>
          )}

          {error && (
            <p
              style={{
                color: 'var(--coral)',
                fontSize: '13px',
                marginBottom: '12px',
                background: 'var(--coral-light)',
                padding: '10px',
                borderRadius: '8px',
              }}
            >
              {error}
            </p>
          )}

          <button type="button" className="btn btn-primary btn-full" onClick={handleHousehold} disabled={loading}>
            {loading ? 'שומר...' : '✓ המשך'}
          </button>
        </div>
      </div>
    )
  }

  // ── מסך: התחברות / הרשמה ───────────────────────────────────────────
  return (
    <div className="auth-page">
      <div className="auth-card">
        {mode === 'signup' && (
          <BackLink onClick={backFromSignupToSignIn}>← חזרה להתחברות</BackLink>
        )}

        <div className="auth-logo">🏠 הבית שלי</div>
        <p className="auth-subtitle">
          {mode === 'signin' ? 'התחברות לחשבון שלך' : 'יצירת חשבון חדש'}
        </p>

        {mode === 'signup' && (
          <div className="input-group">
            <label className="input-label">שם מלא</label>
            <input className="input" placeholder="למשל: מיכאל" value={name} onChange={e => setName(e.target.value)} />
          </div>
        )}

        <div className="input-group">
          <label className="input-label">אימייל</label>
          <input
            className="input"
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAuth()}
            autoComplete="email"
          />
        </div>

        <div className="input-group">
          <label className="input-label">סיסמה</label>
          <input
            className="input"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAuth()}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
        </div>

        {error && (
          <p
            style={{
              color: 'var(--coral)',
              fontSize: '13px',
              marginBottom: '12px',
              background: 'var(--coral-light)',
              padding: '10px',
              borderRadius: '8px',
            }}
          >
            {error}
          </p>
        )}

        <button type="button" className="btn btn-primary btn-full" onClick={handleAuth} disabled={loading} style={{ marginBottom: '14px' }}>
          {loading ? 'רגע...' : mode === 'signin' ? 'התחבר' : 'הרשמה'}
        </button>

        <p style={{ textAlign: 'center', fontSize: '14px', color: 'var(--text-secondary)' }}>
          {mode === 'signin' ? 'אין לך חשבון? ' : 'כבר נרשמת? '}
          <span
            role="button"
            tabIndex={0}
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin')
              setError('')
            }}
            onKeyDown={e => e.key === 'Enter' && (setMode(mode === 'signin' ? 'signup' : 'signin'), setError(''))}
            style={{ color: 'var(--primary)', fontWeight: 600, cursor: 'pointer' }}
          >
            {mode === 'signin' ? 'הירשם כאן' : 'התחבר'}
          </span>
        </p>
      </div>
    </div>
  )
}
