/**
 * connection.js — phone-calendar subscription state.
 *
 * One row per user in `calendar_connections` (provider='webcal') stores a
 * cryptographically random `feed_token`. Native calendar apps subscribe via:
 *   webcal://<supabase-url>/functions/v1/calendar-feed/<feed_token>.ics
 *
 * The token is generated client-side (UUID v4 from crypto.randomUUID), and
 * RLS guarantees only the owning user can read/write their row.
 */

import { supabase } from '../supabase'

/** Build the public URL the native calendar app subscribes to. */
export function buildFeedUrl(feedToken) {
  if (!feedToken) return null
  const base = import.meta.env.VITE_SUPABASE_URL
  if (!base) return null
  return `${base.replace(/\/$/, '')}/functions/v1/calendar-feed/${feedToken}.ics`
}

/** Webcal scheme for native subscribe prompts. iOS / Android calendar apps prefer this over https. */
export function buildWebcalUrl(feedToken) {
  const url = buildFeedUrl(feedToken)
  return url ? url.replace(/^https?:\/\//, 'webcal://') : null
}

/** Get the user's webcal connection (or null). */
export async function getWebcalConnection(userId) {
  const { data, error } = await supabase
    .from('calendar_connections')
    .select('id, feed_token, last_sync_at, connected_at')
    .eq('user_id', userId)
    .eq('provider', 'webcal')
    .maybeSingle()
  if (error) console.error('getWebcalConnection:', error.message)
  return data || null
}

/**
 * Create or rotate the user's webcal connection. A new feed_token always
 * invalidates any existing subscriptions — useful both on first connect and
 * when the user wants to revoke prior subscribers.
 */
export async function createOrRotateConnection(userId, householdId) {
  const feedToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 8)
  // upsert by (user_id, provider) — table has UNIQUE(user_id, provider)
  const { data, error } = await supabase
    .from('calendar_connections')
    .upsert(
      {
        user_id: userId,
        household_id: householdId,
        provider: 'webcal',
        feed_token: feedToken,
        status: 'active',
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' },
    )
    .select('id, feed_token, last_sync_at, connected_at')
    .single()
  if (error) throw error
  return data
}

/** Delete the connection (immediately invalidates the feed URL). */
export async function disconnectWebcal(userId) {
  const { error } = await supabase
    .from('calendar_connections')
    .delete()
    .eq('user_id', userId)
    .eq('provider', 'webcal')
  if (error) throw error
}
