/**
 * google.js
 * ─────────────────────────────────────────────────────────────────
 * Thin wrapper around the google-calendar Edge Function.
 *
 * Every action posts the user's Supabase JWT (via supabase.functions.invoke,
 * which automatically attaches Authorization: Bearer <jwt>). The Edge Function
 * resolves the user's identity from that JWT — refresh tokens are stored
 * server-side only.
 *
 * The whole tier is gracefully optional: if GOOGLE_CLIENT_ID is not configured
 * on the server, every action returns 503 google_oauth_not_configured. UI uses
 * `isGoogleEnabled()` to decide whether to show the option at all.
 */

import { supabase } from '../supabase'

export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim()
export const isGoogleConfiguredFrontend = !!GOOGLE_CLIENT_ID

async function callFn(action, body = {}) {
  const { data, error } = await supabase.functions.invoke('google-calendar', {
    body: { action, ...body },
  })
  if (error) {
    // FunctionsHttpError: error.context.json() to get the body
    let detail = error.message
    try {
      const json = await error.context?.json?.()
      if (json) detail = json.error || json.detail || JSON.stringify(json)
    } catch { /* ignore */ }
    throw new Error(detail || `google-calendar ${action} failed`)
  }
  return data
}

export async function getAuthUrl(redirectUri, state) {
  return callFn('auth_url', { redirect_uri: redirectUri, state })
}

export async function exchangeCode(code, redirectUri) {
  return callFn('exchange_code', { code, redirect_uri: redirectUri })
}

export async function pullFromGoogle() {
  return callFn('pull')
}

export async function pushToGoogle(kind /* 'event' | 'task' */, id) {
  return callFn('push', { kind, id })
}

export async function deleteFromGoogle({ google_event_id, google_calendar_id }) {
  return callFn('delete_remote', { google_event_id, google_calendar_id })
}

export async function disconnectGoogle() {
  return callFn('disconnect')
}

export async function rotateFeedToken() {
  return callFn('rotate_feed_token')
}

export async function setSettings({ provider = 'google', settings, calendars }) {
  return callFn('set_settings', { provider, settings, calendars })
}
