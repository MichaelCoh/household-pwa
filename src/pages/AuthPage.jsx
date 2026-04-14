import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
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
  const [showPassword, setShowPassword] = useState(false)
  const [name, setName] = useState('')
  const [householdName, setHouseholdName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [joinMode, setJoinMode] = useState('create')
  const [fromInvite, setFromInvite] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resetSent, setResetSent] = useState(false)

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

  const backFromSignupToSignIn = () => {
    setError('')
    setMode('signin')
  }

  useEffect(() => {
    if (user && !householdId) setMode('household')
    else if (!user) setMode('signin')
  }, [user, householdId])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('homeCode')
    if (code) {
      setInviteCode(code)
      setFromInvite(true)
      setJoinMode('join')
    }
  }, [])

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('נא להזין אימייל קודם')
      return
    }
    setError('')
    setLoading(true)
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      })
      if (resetErr) throw resetErr
      setResetSent(true)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

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
          if (!hm?.household_id) {
            const params = new URLSearchParams(window.location.search)
            const code = params.get('homeCode')
            if (code) {
              setInviteCode(code)
              setFromInvite(true)
              setJoinMode('join')
            }
            setMode('household')
          }
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

  // ── מסך: חיבור לבית (אחרי התחברות / הרשמה) ─────────────────────────────
  if (mode === 'household') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <BackLink onClick={backToSignInScreen}>← חזרה למסך ההתחברות</BackLink>

          <div className="auth-logo">🏠 הבית שלי</div>
          <p className="auth-step-label">שלב 2 מתוך 2</p>
          <h2 className="auth-hero-title" style={{ marginBottom: '8px' }}>למי משתייכים בבית?</h2>
          <p className="auth-subtitle" style={{ marginBottom: '18px' }}>
            &quot;בית&quot; הוא המקום שבו כל בני המשפחה רואים את אותן רשימות ומשימות.
            צרו בית חדש — או הצטרפו עם הקוד שקיבלתם ממי שכבר נרשם.
          </p>

          <div className="auth-progress" aria-hidden="true">
            <span className="auth-progress-step done">1 · חשבון</span>
            <span style={{ opacity: 0.4 }}>→</span>
            <span className="auth-progress-step active">2 · בית משפחה</span>
          </div>

          <div className="input-group">
            <label className="input-label">איך לקרוא לך בבית?</label>
            <input
              className="input"
              placeholder="למשל: מיכאל"
              value={name}
              onChange={e => setName(e.target.value)}
              autoComplete="name"
            />
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
              השם יוצג לבני הבית ברשימת החברים
            </p>
          </div>

          <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '10px' }}>
            בחרו אחת מהאפשרויות:
          </p>
          <div className="auth-household-options">
            <button
              type="button"
              className={`auth-household-option ${joinMode === 'create' ? 'selected' : ''}`}
              onClick={() => { setJoinMode('create'); setError('') }}
            >
              <div className="auth-household-option-title">🆕 יוצרים בית חדש</div>
              <div className="auth-household-option-desc">
                מתאים כשאתם מגדירים את הבית לראשונה. אחר כך תקבלו קוד הזמנה לשתף עם בן הזוג/משפחה.
              </div>
            </button>
            <button
              type="button"
              className={`auth-household-option ${joinMode === 'join' ? 'selected' : ''}`}
              onClick={() => { setJoinMode('join'); setError('') }}
            >
              <div className="auth-household-option-title">🔗 יש לי קוד בית</div>
              <div className="auth-household-option-desc">
                מתאים כשמישהו מהמשפחה כבר פתח בית ושלח לכם קוד (מופיע אצלו בהגדרות).
              </div>
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
              {fromInvite && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--mint-light)', border: '1px solid rgba(52,199,89,0.3)', marginBottom: '8px', fontSize: '13px', color: 'var(--mint)', fontWeight: 600 }}>
                  🏠 הוזמנת להצטרף לבית!
                </div>
              )}
              <input
                className="input"
                placeholder="hh_xxxxxxxxxxxxx"
                value={inviteCode}
                onChange={e => { setInviteCode(e.target.value); if (!e.target.value.trim()) setFromInvite(false) }}
                onKeyDown={e => e.key === 'Enter' && handleHousehold()}
                autoFocus
                dir="ltr"
                style={{ textAlign: 'right', background: fromInvite ? 'var(--mint-light)' : undefined }}
                readOnly={fromInvite}
              />
              {fromInvite ? (
                <button type="button" onClick={() => { setFromInvite(false); setInviteCode('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', textDecoration: 'underline' }}>
                  שנה קוד ידנית
                </button>
              ) : (
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                  הקוד מופיע אצל מי שיצר את הבית — תחת &quot;הגדרות&quot; → קוד הבית
                </p>
              )}
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
            {loading ? 'שומר...' : 'נכנסים לבית'}
          </button>
        </div>
      </div>
    )
  }

  // ── מסך: התחברות / הרשמה ───────────────────────────────────────────────
  return (
    <div className="auth-page">
      <div className="auth-card">
        {mode === 'signup' && (
          <BackLink onClick={backFromSignupToSignIn}>← חזרה להתחברות</BackLink>
        )}

        <div className="auth-logo" style={{ marginBottom: '14px' }}>🏠 הבית שלי</div>

        <ul className="auth-benefits">
          <li>התחברות פעם אחת — אחר כך מחברים &quot;בית משפחה&quot; משותף</li>
          <li>כבר רשומים? התחברו באימייל. חדשים? נרשמים ואז נכנסים לבית</li>
        </ul>

        <p className="auth-step-label">שלב 1 מתוך 2</p>
        <div className="auth-progress" aria-hidden="true" style={{ marginBottom: '14px' }}>
          <span className="auth-progress-step active">1 · חשבון</span>
          <span style={{ opacity: 0.4 }}>→</span>
          <span className="auth-progress-step">2 · בית משפחה</span>
        </div>

        <div className="auth-segmented" role="tablist" aria-label="בחירת מצב">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signin'}
            onClick={() => { setMode('signin'); setError('') }}
          >
            יש לי חשבון
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            onClick={() => { setMode('signup'); setError('') }}
          >
            חדשים כאן
          </button>
        </div>

        <p className="auth-subtitle" style={{ marginTop: 0, marginBottom: '18px' }}>
          {mode === 'signin'
            ? 'הזינו אימייל וסיסמה. אחרי ההתחברות יופיע מסך קצר: יצירת בית חדש או הזנת קוד שקיבלתם ממי שכבר בבית.'
            : 'אחרי שליחת הטופס תעברו למסך הבא — שם תבחרו אם ליצור בית (ותקבלו קוד לשיתוף) או להצטרף עם קוד קיים.'}
        </p>

        {mode === 'signup' && (
          <div className="input-group">
            <label className="input-label">שם מלא</label>
            <input className="input" placeholder="למשל: מיכאל" value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
          </div>
        )}

        <div className="input-group">
          <label className="input-label">אימייל</label>
          <input
            className="input"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAuth()}
            autoComplete="email"
            inputMode="email"
            dir="ltr"
            style={{ textAlign: 'right' }}
          />
        </div>

        <div className="input-group">
          <label className="input-label">סיסמה</label>
          <div style={{ position: 'relative' }}>
            <input
              className="input"
              type={showPassword ? 'text' : 'password'}
              placeholder="לפחות 6 תווים"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAuth()}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              style={{ paddingLeft: '44px' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--text-muted)', padding: '4px', lineHeight: 1 }}
              aria-label={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
              tabIndex={-1}
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
          {mode === 'signin' && (
            <button
              type="button"
              onClick={handleForgotPassword}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--primary)', marginTop: '8px', fontWeight: 600, textDecoration: 'underline', padding: 0 }}
            >
              שכחת סיסמה?
            </button>
          )}
          {resetSent && (
            <p style={{ fontSize: '12px', color: 'var(--mint)', marginTop: '6px', fontWeight: 600 }}>
              ✓ קישור לאיפוס סיסמה נשלח לאימייל שהזנת
            </p>
          )}
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

        <button type="button" className="btn btn-primary btn-full" onClick={handleAuth} disabled={loading} style={{ marginBottom: '8px' }}>
          {loading ? 'רגע...' : mode === 'signin' ? 'התחברות לחשבון' : 'הרשמה והמשך לבית'}
        </button>

        <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {mode === 'signin'
            ? 'אין לכם חשבון? לחצו על «חדשים כאן» למעלה.'
            : 'כבר נרשמתם? לחצו על «יש לי חשבון» למעלה.'}
        </p>

        <Link to="/landing" className="auth-learn-more">
          רוצים לראות מה האפליקציה יודעת לעשות לפני שמצטרפים?
        </Link>
      </div>
    </div>
  )
}
