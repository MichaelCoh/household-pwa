import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [householdId, setHouseholdId] = useState(null)
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) loadHousehold(session.user.id)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) loadHousehold(session.user.id)
      else { setHouseholdId(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  const loadHousehold = async (userId) => {
    try {
      const { data } = await supabase
        .from('household_members')
        .select('household_id, display_name')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle()
      setHouseholdId(data?.household_id ?? null)
      setDisplayName(data?.display_name ?? '')
    } catch {
      setHouseholdId(null)
    } finally {
      setLoading(false)
    }
  }

  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: undefined }
    })
    if (error) throw error
    // If user exists but not confirmed, try signing in directly
    if (data?.user && !data?.session) {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) throw new Error('Account created! Please sign in.')
    }
    return data
  }

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setHouseholdId(null)
    setUser(null)
  }

  const createHousehold = async (householdName, displayName) => {
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (!currentUser) throw new Error('Not logged in')
    const id = `hh_${Math.random().toString(36).substr(2, 12)}`
    const { error } = await supabase.from('household_members').insert({
      household_id: id,
      user_id: currentUser.id,
      display_name: displayName || householdName,
      role: 'owner'
    })
    if (error) throw error
    setHouseholdId(id)
    return id
  }

  const joinHousehold = async (id, displayName) => {
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (!currentUser) throw new Error('Not logged in')
    const { error } = await supabase.from('household_members').insert({
      household_id: id.trim(),
      user_id: currentUser.id,
      display_name: displayName,
      role: 'member'
    })
    if (error) throw error
    setHouseholdId(id.trim())
  }

  const getMembers = async () => {
    if (!householdId) return []
    const { data, error } = await supabase
      .from('household_members')
      .select('*')
      .eq('household_id', householdId)
      .order('joined_at', { ascending: true })
    if (error) {
      console.error('getMembers:', error.message)
      return []
    }
    const list = data || []
    return [...list].sort((a, b) =>
      (a.display_name || '').localeCompare(b.display_name || '', 'he', { sensitivity: 'base' })
    )
  }

  const removeMember = async (memberId) => {
    if (!householdId) throw new Error('No household')
    const { error } = await supabase
      .from('household_members')
      .delete()
      .eq('id', memberId)
      .eq('household_id', householdId)
    if (error) throw error
  }

  const toggleCanRemoveMembers = async (memberId, canRemove) => {
    if (!householdId) throw new Error('No household')
    const { error } = await supabase
      .from('household_members')
      .update({ can_remove_members: canRemove })
      .eq('id', memberId)
      .eq('household_id', householdId)
    if (error) throw error
  }

  const getMemberRole = async () => {
    if (!householdId || !user) return null
    const { data } = await supabase
      .from('household_members')
      .select('role, can_remove_members, family_role')
      .eq('household_id', householdId)
      .eq('user_id', user.id)
      .maybeSingle()
    return data
  }

  const updateMemberFamilyRole = async (memberId, familyRole) => {
    if (!householdId) throw new Error('No household')
    const { error } = await supabase
      .from('household_members')
      .update({ family_role: familyRole })
      .eq('id', memberId)
      .eq('household_id', householdId)
    if (error) throw error
  }

  return (
    <AuthContext.Provider value={{ user, householdId, displayName, loading, signUp, signIn, signOut, createHousehold, joinHousehold, getMembers, removeMember, toggleCanRemoveMembers, getMemberRole, updateMemberFamilyRole }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
