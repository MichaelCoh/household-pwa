// Wires the remote (Groq-backed) categorizer used by src/lib/categorize.js.
// Called ONLY when the local dictionary returns null. Best-effort: every
// failure returns null so the UI simply falls back to "❓ General".

import { supabase, isSupabaseConfigured } from './supabase'
import { setRemoteCategorizer } from './categorize'

// How long the UI is willing to wait for the AI answer before giving up.
// Picked a little above typical Groq latency so we don't cancel on a flaky
// network, but low enough that the user doesn't sit on a stale category.
const REMOTE_TIMEOUT_MS = 4000

let initialized = false

export function initRemoteCategorizer() {
  if (initialized) return
  if (!isSupabaseConfigured) return

  const baseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!baseUrl || !anonKey) return

  const endpoint = `${String(baseUrl).trim().replace(/\/$/, '')}/functions/v1/categorize-item`

  setRemoteCategorizer(async (name) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return null

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS)
      let res
      try {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: anonKey,
          },
          body: JSON.stringify({ name }),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timer)
      }

      if (!res.ok) return null
      const data = await res.json()
      return typeof data?.category === 'string' ? data.category : null
    } catch {
      return null
    }
  })

  initialized = true
}
