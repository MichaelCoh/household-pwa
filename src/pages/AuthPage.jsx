import { useState } from 'react'
import { useAuth } from '../lib/auth'

export default function AuthPage() {
  const { signIn, signUp, createHousehold, joinHousehold, user } = useAuth()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [householdName, setHouseholdName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [joinMode, setJoinMode] = useState('create')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleAuth = async () => {
    setError(''); setLoading(true)
    try {
      if (mode === 'signin') {
        await signIn(email, password)
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
    setError(''); setLoading(true)
    try {
      if (joinMode === 'create') {
        if (!householdName.trim()) { setError('Please enter a household name'); setLoading(false); return }
        await createHousehold(householdName.trim(), name.trim())
      } else {
        if (!inviteCode.trim()) { setError('Please enter the invite code'); setLoading(false); return }
        await joinHousehold(inviteCode.trim(), name.trim())
      }
    } catch (e) {
      setError('Error: ' + e.message)
    }
    setLoading(false)
  }

  if (mode === 'household') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">🏠 Household</div>
          <p className="auth-subtitle">Set up your household</p>

          <div className="input-group">
            <label className="input-label">Your name</label>
            <input className="input" placeholder="e.g. Michael" value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <button onClick={() => { setJoinMode('create'); setError('') }}
              className="type-btn"
              style={joinMode === 'create' ? { borderColor: 'var(--primary)', color: 'var(--primary)', background: 'var(--primary-light)' } : {}}>
              🆕 Create new
            </button>
            <button onClick={() => { setJoinMode('join'); setError('') }}
              className="type-btn"
              style={joinMode === 'join' ? { borderColor: 'var(--primary)', color: 'var(--primary)', background: 'var(--primary-light)' } : {}}>
              🔗 Join existing
            </button>
          </div>

          {joinMode === 'create' ? (
            <div className="input-group">
              <label className="input-label">Household name</label>
              <input className="input" placeholder="e.g. The Cohen Family" value={householdName} onChange={e => setHouseholdName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleHousehold()} autoFocus />
            </div>
          ) : (
            <div className="input-group">
              <label className="input-label">Household invite code</label>
              <input className="input" placeholder="hh_xxxxxxxxxxxxx" value={inviteCode} onChange={e => setInviteCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleHousehold()} autoFocus />
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>Ask the household owner for this code from Settings</p>
            </div>
          )}

          {error && <p style={{ color: 'var(--coral)', fontSize: '13px', marginBottom: '12px', background: 'var(--coral-light)', padding: '10px', borderRadius: '8px' }}>{error}</p>}

          <button className="btn btn-primary btn-full" onClick={handleHousehold} disabled={loading}>
            {loading ? 'Setting up...' : '✓ Continue'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">🏠 Household</div>
        <p className="auth-subtitle">
          {mode === 'signin' ? 'Sign in to your family space' : 'Create your account'}
        </p>

        {mode === 'signup' && (
          <div className="input-group">
            <label className="input-label">Your name</label>
            <input className="input" placeholder="e.g. Michael" value={name} onChange={e => setName(e.target.value)} />
          </div>
        )}

        <div className="input-group">
          <label className="input-label">Email</label>
          <input className="input" type="email" placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAuth()} />
        </div>

        <div className="input-group">
          <label className="input-label">Password</label>
          <input className="input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAuth()} />
        </div>

        {error && <p style={{ color: 'var(--coral)', fontSize: '13px', marginBottom: '12px', background: 'var(--coral-light)', padding: '10px', borderRadius: '8px' }}>{error}</p>}

        <button className="btn btn-primary btn-full" onClick={handleAuth} disabled={loading} style={{ marginBottom: '14px' }}>
          {loading ? 'Loading...' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>

        <p style={{ textAlign: 'center', fontSize: '14px', color: 'var(--text-secondary)' }}>
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <span onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError('') }}
            style={{ color: 'var(--primary)', fontWeight: 600, cursor: 'pointer' }}>
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </span>
        </p>
      </div>
    </div>
  )
}
