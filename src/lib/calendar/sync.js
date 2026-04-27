/**
 * sync.js
 * ─────────────────────────────────────────────────────────────────
 * Two-way sync orchestrator. Glue between:
 *   • the app's events/tasks tables (Supabase)
 *   • the google-calendar Edge Function (Tier 1)
 *   • the local ICS export/import (Tier 3)
 *
 * Conflict policy (per spec):
 *   • App event edited + Google edited → app version wins (we re-push).
 *   • Google event deleted → mark imported_calendar_events.deleted_at on next pull.
 *     UI surfaces a banner/notification before fully removing them client-side.
 *   • Same event matched by Google ID → merged, never duplicated. ICS imports
 *     match by (source, source_calendar_id, source_event_id) UNIQUE constraint.
 */

import { supabase } from '../supabase'
import { getConnection } from './connection'
import { pullFromGoogle, pushToGoogle, deleteFromGoogle, isGoogleConfiguredFrontend } from './google'

let pullInflight = null

/**
 * Pull events from all enabled Google calendars into imported_calendar_events.
 * Deduplicates concurrent calls (multiple components mounting at once).
 */
export async function syncPullGoogle(userId) {
  if (!isGoogleConfiguredFrontend) return { ok: false, reason: 'not_configured' }
  if (pullInflight) return pullInflight
  pullInflight = (async () => {
    try {
      const conn = await getConnection(userId, 'google')
      if (!conn) return { ok: false, reason: 'not_connected' }
      if (conn.status === 'revoked') return { ok: false, reason: 'revoked' }
      const settings = conn.settings || {}
      if (settings.import_external === false) return { ok: false, reason: 'import_disabled' }
      const result = await pullFromGoogle()
      return { ok: true, ...result }
    } catch (e) {
      return { ok: false, error: e.message }
    } finally {
      pullInflight = null
    }
  })()
  return pullInflight
}

/**
 * Push a single app event to Google. Honours per-event sync_to_phone and the
 * connection-level default. Errors are logged + swallowed — never break the
 * app flow because of a sync failure.
 */
export async function syncPushEventToGoogle(userId, eventRow) {
  try {
    if (!isGoogleConfiguredFrontend) return
    const conn = await getConnection(userId, 'google')
    if (!conn) return
    if (conn.status === 'revoked') return
    const settings = conn.settings || {}
    const enabled = eventRow.sync_to_phone === null || eventRow.sync_to_phone === undefined
      ? settings.default_event_sync !== false
      : !!eventRow.sync_to_phone
    if (!enabled) return
    await pushToGoogle('event', eventRow.id)
  } catch (e) {
    console.warn('syncPushEventToGoogle:', e.message)
  }
}

export async function syncPushTaskToGoogle(userId, taskRow) {
  try {
    if (!isGoogleConfiguredFrontend) return
    if (!taskRow?.due_date) return
    const conn = await getConnection(userId, 'google')
    if (!conn) return
    if (conn.status === 'revoked') return
    const settings = conn.settings || {}
    const enabled = taskRow.sync_to_phone === null || taskRow.sync_to_phone === undefined
      ? settings.default_event_sync !== false
      : !!taskRow.sync_to_phone
    if (!enabled) return
    await pushToGoogle('task', taskRow.id)
  } catch (e) {
    console.warn('syncPushTaskToGoogle:', e.message)
  }
}

/**
 * Delete the remote Google copy of an event/task that was just deleted in the app.
 */
export async function syncDeleteFromGoogle({ google_event_id, google_calendar_id }) {
  try {
    if (!google_event_id) return
    if (!isGoogleConfiguredFrontend) return
    await deleteFromGoogle({ google_event_id, google_calendar_id })
  } catch (e) {
    console.warn('syncDeleteFromGoogle:', e.message)
  }
}

/**
 * Background-Sync handler client-side bootstrapping. Registers a sync tag
 * so the SW can wake up and broadcast 'do-pull' to clients. If the API is
 * not available (iOS), falls back to firing on every app open + on every
 * calendar screen visit.
 */
export async function registerBackgroundSync() {
  try {
    if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return false
    const reg = await navigator.serviceWorker.ready
    if (reg.sync) {
      await reg.sync.register('calendar-sync')
      return true
    }
    return false
  } catch (e) {
    console.warn('registerBackgroundSync:', e.message)
    return false
  }
}

/**
 * Listen for messages from the service worker triggering a sync.
 * Wire in App.jsx so the global app react to SW background sync events.
 */
export function listenForServiceWorkerSync(onTrigger) {
  if (!('serviceWorker' in navigator)) return () => {}
  const handler = (e) => {
    if (e.data?.type === 'CALENDAR_SYNC_TRIGGER') onTrigger?.()
  }
  navigator.serviceWorker.addEventListener('message', handler)
  return () => navigator.serviceWorker.removeEventListener('message', handler)
}

/**
 * Convenience helper to load the user's id from a connection row when
 * we don't have AuthContext (e.g. background tasks).
 */
export async function getCurrentUserId() {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id || null
}
