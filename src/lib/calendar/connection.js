/**
 * connection.js
 * ─────────────────────────────────────────────────────────────────
 * CRUD for calendar_connections + calendar_sync_log.
 *
 * Uses Supabase client directly (RLS scopes everything to auth.uid()).
 * Sensitive operations (Google OAuth code exchange, token refresh, push,
 * pull, disconnect) go through the google-calendar Edge Function so that
 * refresh tokens never touch the client.
 */

import { supabase } from '../supabase'

export async function getConnections(userId) {
  const { data, error } = await supabase
    .from('calendar_connections')
    .select('id, provider, google_email, google_calendars, settings, status, last_error, last_sync_at, connected_at, feed_token, privacy_acknowledged_at')
    .eq('user_id', userId)
    .order('connected_at', { ascending: true })
  if (error) console.error('getConnections:', error.message)
  return data || []
}

export async function getConnection(userId, provider) {
  const { data } = await supabase
    .from('calendar_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle()
  return data || null
}

export async function getRecentSyncLog(userId, limit = 10) {
  const { data, error } = await supabase
    .from('calendar_sync_log')
    .select('id, provider, direction, status, items_count, error_message, synced_at')
    .eq('user_id', userId)
    .order('synced_at', { ascending: false })
    .limit(limit)
  if (error) console.error('getRecentSyncLog:', error.message)
  return data || []
}

export async function logSync(userId, householdId, { provider, direction, status, itemsCount = 0, errorMessage = null }) {
  await supabase.from('calendar_sync_log').insert({
    user_id: userId, household_id: householdId,
    provider, direction, status,
    items_count: itemsCount,
    error_message: errorMessage,
  })
}

export async function acknowledgePrivacy(userId) {
  await supabase
    .from('calendar_connections')
    .update({ privacy_acknowledged_at: new Date().toISOString() })
    .eq('user_id', userId)
}

export async function isPrivacyAcknowledged(userId) {
  const { data } = await supabase
    .from('calendar_connections')
    .select('privacy_acknowledged_at')
    .eq('user_id', userId)
    .not('privacy_acknowledged_at', 'is', null)
    .limit(1)
  return Array.isArray(data) && data.length > 0
}

/**
 * Build the public webcal URL from a feed token.
 * Native calendar apps follow webcal:// → https:// transparently.
 */
export function buildFeedUrl(feedToken) {
  if (!feedToken) return null
  const base = import.meta.env.VITE_SUPABASE_URL
  if (!base) return null
  // Path-style URL works best with Apple Calendar (it strips query strings on subscribe)
  return `${base.replace(/\/$/, '')}/functions/v1/calendar-feed/${feedToken}.ics`
}
