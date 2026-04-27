/**
 * db.js (calendar)
 * ─────────────────────────────────────────────────────────────────
 * DB ops for imported_calendar_events (events pulled from Google or ICS).
 *
 * Native app events live in the existing `events` table — see ../db.js.
 */

import { supabase } from '../supabase'

export const ImportedEventDB = {
  /** Imported events visible in a given month (joined with native events on the calendar UI). */
  getForMonth: async (hid, year, month) => {
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const nextMonthYear = month === 11 ? year + 1 : year
    const nextMonth = month === 11 ? 1 : month + 2
    const to = `${nextMonthYear}-${String(nextMonth).padStart(2, '0')}-01`
    const { data, error } = await supabase
      .from('imported_calendar_events')
      .select('*')
      .eq('household_id', hid)
      .is('deleted_at', null)
      .gte('date', from)
      .lt('date', to)
      .order('date')
    if (error) console.error('ImportedEventDB.getForMonth:', error)
    return data || []
  },

  /** Insert ICS-imported events (Tier 3 manual file import). */
  bulkInsertFromICS: async (hid, userId, parsedEvents) => {
    const rows = parsedEvents.map((p) => ({
      household_id: hid,
      imported_by_user_id: userId,
      source: 'ics',
      source_event_id: p.uid,
      source_calendar_id: 'manual-import',
      source_calendar_name: 'יבוא ידני',
      title: p.title || '(ללא כותרת)',
      description: p.description || '',
      location: p.location || '',
      date: p.date,
      time: p.time,
      end_date: p.end_date || null,
      end_time: p.end_time || null,
      all_day: !!p.all_day,
      recurrence_rule: p.recurrence_rule || null,
      color: '#9C6FFF',
      raw: p.raw || {},
    }))
    if (rows.length === 0) return { inserted: 0 }
    const { error, data } = await supabase
      .from('imported_calendar_events')
      .upsert(rows, { onConflict: 'household_id,source,source_calendar_id,source_event_id' })
      .select()
    if (error) throw error
    return { inserted: data?.length ?? rows.length }
  },

  /** Hard delete an imported event (used when user disconnects or filters it out). */
  delete: async (id) => {
    const { error } = await supabase.from('imported_calendar_events').delete().eq('id', id)
    if (error) throw error
  },

  /** Soft-delete: mark as removed but keep the row for sync history. */
  softDelete: async (id) => {
    const { error } = await supabase
      .from('imported_calendar_events')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },
}

/**
 * Soft helpers for the Settings UI: nuke everything imported from Google when
 * the user disconnects (the edge function does this server-side too, but we
 * call this from the client for instant UI feedback on optimistic disconnect).
 */
export async function purgeImportedFromSource(hid, source) {
  const { error } = await supabase
    .from('imported_calendar_events')
    .delete()
    .eq('household_id', hid)
    .eq('source', source)
  if (error) console.error('purgeImportedFromSource:', error.message)
}
