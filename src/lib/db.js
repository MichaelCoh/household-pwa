import { supabase } from './supabase'
import { computeNextDueDate } from './recurrence'
import { computeRegulars } from './regulars'

// ── time ago helper ──────────────────────────────────────────────────────
export function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  if (d === 1) return 'yesterday'
  if (d < 7) return `${d}d ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Shopping Lists ────────────────────────────────────────────────────────
export const ShoppingDB = {
  getLists: async (hid) => {
    const { data } = await supabase.from('shopping_lists').select('*').eq('household_id', hid).order('created_at', { ascending: false })
    return data || []
  },
  getList: async (id) => {
    const { data, error } = await supabase.from('shopping_lists').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data || null
  },
  createList: async (hid, uid, name, emoji, color, notes = '') => {
    const { data, error } = await supabase.from('shopping_lists').insert({ household_id: hid, user_id: uid, name, emoji, color, notes: notes || '' }).select().single()
    if (error) throw error; return data
  },
  updateList: async (id, changes) => {
    const { error } = await supabase.from('shopping_lists').update(changes).eq('id', id)
    if (error) throw error
  },
  deleteList: async (id) => { await supabase.from('shopping_lists').delete().eq('id', id) },
  getItems: async (listId) => {
    const { data } = await supabase.from('shopping_items').select('*').eq('list_id', listId).is('cleared_at', null).order('created_at', { ascending: false })
    return data || []
  },
  getAllItems: async (hid) => {
    const { data } = await supabase.from('shopping_items').select('*').eq('household_id', hid).is('cleared_at', null)
    return data || []
  },
  addItem: async (listId, hid, name, qty, unit, category, notes = '') => {
    const { data, error } = await supabase.from('shopping_items').insert({ list_id: listId, household_id: hid, name, qty, unit, category, notes: notes || '' }).select().single()
    if (error) throw error; return data
  },
  toggleItem: async (id, checked) => { await supabase.from('shopping_items').update({ checked }).eq('id', id) },
  updateItem: async (id, changes) => { await supabase.from('shopping_items').update(changes).eq('id', id) },
  deleteItem: async (id) => { await supabase.from('shopping_items').delete().eq('id', id) },
  clearChecked: async (listId) => { await supabase.from('shopping_items').update({ cleared_at: new Date().toISOString() }).eq('list_id', listId).eq('checked', true).is('cleared_at', null) },
  getSuggestions: async (hid) => {
    const { data } = await supabase
      .from('shopping_items')
      .select('name, qty, unit, category, notes')
      .eq('household_id', hid)
      .eq('checked', false)
      .is('cleared_at', null)
      .order('created_at', { ascending: false })
    if (!data || data.length === 0) return []
    const seen = new Map()
    for (const item of data) {
      const key = item.name.trim().toLowerCase()
      if (!seen.has(key)) seen.set(key, item)
    }
    return [...seen.values()]
  },
  /** Top recurring items across the household, with cadence detection.
   *  Looks at BOTH checked and unchecked history because repeat-purchase
   *  pattern is exactly what we want to detect. */
  getRegulars: async (hid) => {
    const { data } = await supabase
      .from('shopping_items')
      .select('name, qty, unit, category, notes, created_at')
      .eq('household_id', hid)
      .order('created_at', { ascending: false })
      .limit(2000)
    if (!data || data.length === 0) return []
    return computeRegulars(data, { limit: 20 })
  },
}

// ── Tasks ─────────────────────────────────────────────────────────────────
export const TaskDB = {
  getAll: async (hid) => {
    const { data } = await supabase.from('tasks').select('*').eq('household_id', hid).order('created_at', { ascending: false })
    return data || []
  },
  /** משימות עם תאריך יעד בטווח חודש (לסנכרון יומן) */
  getForMonth: async (hid, year, month) => {
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const nextMonthYear = month === 11 ? year + 1 : year
    const nextMonth = month === 11 ? 1 : month + 2
    const to = `${nextMonthYear}-${String(nextMonth).padStart(2, '0')}-01`
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('household_id', hid)
      .not('due_date', 'is', null)
      .gte('due_date', from)
      .lt('due_date', to)
    if (error) console.error('TaskDB.getForMonth:', error)
    return data || []
  },
  /**
   * Recurring tasks whose recurrence period overlaps the window
   * [`windowStart`, `windowEnd`] (inclusive). The DB stores only the anchor row;
   * the calendar paints every matching day itself via isOccurrenceOn.
   *
   * Overlap conditions:
   *   - anchor `due_date` is on or before `windowEnd` (series has started by the window's end)
   *   - `recurrence_end_date` is null OR on/after `windowStart` (series hasn't ended before the window begins)
   */
  getActiveRecurring: async (hid, windowStart, windowEnd) => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('household_id', hid)
      .neq('recurrence', 'none')
      .not('recurrence', 'is', null)
      .not('due_date', 'is', null)
      .lte('due_date', windowEnd)
      .or(`recurrence_end_date.is.null,recurrence_end_date.gte.${windowStart}`)
    if (error) console.error('TaskDB.getActiveRecurring:', error)
    return data || []
  },
  add: async (hid, uid, title, priority, dueDate, notes, assignedTo = null, opts = {}) => {
    const row = {
      household_id: hid,
      user_id: uid,
      title,
      priority,
      due_date: dueDate || null,
      notes: notes || '',
      assigned_to: (assignedTo == null || assignedTo === '' || assignedTo === 'none') ? null : assignedTo,
      recurrence: opts.recurrence || 'none',
      recurrence_interval: opts.recurrence_interval ?? 1,
      recurrence_weekday: opts.recurrence_weekday ?? null,
      recurrence_end_date: opts.recurrence_end_date || null,
      reminder_enabled: !!opts.reminder_enabled,
      reminder_time: opts.reminder_time || null,
    }
    const { data, error } = await supabase.from('tasks').insert(row).select().single()
    if (error) throw error; return data
  },
  update: async (id, changes) => { await supabase.from('tasks').update(changes).eq('id', id) },
  /**
   * סימון בוצע: משימה חוזרת → מקפיץ תאריך יעד; אחרת → done רגיל
   */
  toggle: async (id, markDone) => {
    const { data: task, error } = await supabase.from('tasks').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    if (!task) return
    const rec = task.recurrence || 'none'
    if (markDone) {
      if (rec !== 'none') {
        if (!task.due_date) {
          await supabase.from('tasks').update({ done: true, done_at: new Date().toISOString() }).eq('id', id)
          return
        }
        const next = computeNextDueDate(
          task.due_date,
          rec,
          task.recurrence_interval || 1,
          task.recurrence_weekday,
        )
        await supabase.from('tasks').update({
          done: false,
          done_at: null,
          due_date: next,
        }).eq('id', id)
        return
      }
      await supabase.from('tasks').update({ done: true, done_at: new Date().toISOString() }).eq('id', id)
    } else {
      await supabase.from('tasks').update({ done: false, done_at: null }).eq('id', id)
    }
  },
  delete: async (id) => { await supabase.from('tasks').delete().eq('id', id) },
  clearDone: async (hid) => { await supabase.from('tasks').delete().eq('household_id', hid).eq('done', true) },
}

// ── Events ────────────────────────────────────────────────────────────────
export const EventDB = {
  getAll: async (hid) => {
    const { data } = await supabase.from('events').select('*').eq('household_id', hid).order('date')
    return data || []
  },
  getForMonth: async (hid, year, month) => {
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`
    // חישוב היום האחרון האמיתי של החודש (פותר בעיה עם יוני/אפריל וכו')
    const nextMonthYear = month === 11 ? year + 1 : year
    const nextMonth = month === 11 ? 1 : month + 2
    const to = `${nextMonthYear}-${String(nextMonth).padStart(2, '0')}-01`
    const { data, error } = await supabase.from('events').select('*').eq('household_id', hid).gte('date', from).lt('date', to)
    if (error) console.error('EventDB.getForMonth error:', error)
    return data || []
  },
  /** Mirror of TaskDB.getActiveRecurring — see comment there. */
  getActiveRecurring: async (hid, windowStart, windowEnd) => {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('household_id', hid)
      .neq('recurrence', 'none')
      .not('recurrence', 'is', null)
      .lte('date', windowEnd)
      .or(`recurrence_end_date.is.null,recurrence_end_date.gte.${windowStart}`)
    if (error) console.error('EventDB.getActiveRecurring:', error)
    return data || []
  },
  /**
   * Add an event. Optional fields (passed via `extra`) are persisted only when
   * present so old call sites continue to work unchanged.
   */
  add: async (hid, uid, title, date, time, color, notes, extra = {}) => {
    const row = {
      household_id: hid,
      user_id: uid,
      title,
      date,
      time: time || null,
      color,
      notes,
    }
    const allowed = ['end_date', 'end_time', 'all_day', 'location', 'recurrence', 'recurrence_interval', 'recurrence_end_date', 'reminder_minutes']
    for (const k of allowed) { if (extra[k] !== undefined) row[k] = extra[k] }
    const { data, error } = await supabase.from('events').insert(row).select().single()
    if (error) throw error; return data
  },
  update: async (id, changes) => {
    const allowed = ['title', 'date', 'time', 'color', 'notes', 'end_date', 'end_time', 'all_day', 'location', 'recurrence', 'recurrence_interval', 'recurrence_end_date', 'reminder_minutes']
    const patch = {}
    for (const k of allowed) { if (changes[k] !== undefined) patch[k] = changes[k] }
    const { data, error } = await supabase.from('events').update(patch).eq('id', id).select().maybeSingle()
    if (error) throw error
    return data
  },
  /** Fetch one row (used right before pushing to Google to capture the latest state). */
  getOne: async (id) => {
    const { data, error } = await supabase.from('events').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data
  },
  delete: async (id) => { await supabase.from('events').delete().eq('id', id) },
}

// ── Children ──────────────────────────────────────────────────────────────
export const ChildrenDB = {
  getAll: async (hid) => {
    const { data } = await supabase.from('children').select('*').eq('household_id', hid).order('created_at', { ascending: true })
    return data || []
  },
  getOne: async (id) => {
    const { data, error } = await supabase.from('children').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data
  },
  add: async (hid, name, emoji = '👶', dateOfBirth = null) => {
    const row = { household_id: hid, name: name.trim(), emoji }
    if (dateOfBirth) row.date_of_birth = dateOfBirth
    const { data, error } = await supabase.from('children').insert(row).select().single()
    if (error) throw error; return data
  },
  update: async (id, changes) => {
    const allowed = {}
    const keys = ['name', 'emoji', 'date_of_birth', 'allergies', 'medications', 'pediatrician_name', 'pediatrician_phone', 'active_features', 'army_prep', 'driving_log']
    for (const k of keys) { if (changes[k] !== undefined) allowed[k] = changes[k] }
    const { error } = await supabase.from('children').update(allowed).eq('id', id)
    if (error) throw error
  },
  delete: async (id) => {
    const { error } = await supabase.from('children').delete().eq('id', id)
    if (error) throw error
  },
}

// ── Milestones ────────────────────────────────────────────────────────────
export const MilestonesDB = {
  getAll: async (childId) => {
    const { data, error } = await supabase.from('child_milestones').select('*').eq('child_id', childId).order('milestone_date', { ascending: false })
    if (error) console.error('MilestonesDB.getAll:', error)
    return data || []
  },
  add: async (childId, hid, milestoneDate, description) => {
    const { data, error } = await supabase.from('child_milestones').insert({ child_id: childId, household_id: hid, milestone_date: milestoneDate, description }).select().single()
    if (error) throw error; return data
  },
  update: async (id, changes) => {
    const { error } = await supabase.from('child_milestones').update(changes).eq('id', id)
    if (error) throw error
  },
  delete: async (id) => {
    const { error } = await supabase.from('child_milestones').delete().eq('id', id)
    if (error) throw error
  },
}

// ── Vaccinations ──────────────────────────────────────────────────────────
export const VaccinationsDB = {
  getAll: async (childId) => {
    const { data, error } = await supabase.from('child_vaccinations').select('*').eq('child_id', childId).order('given_date', { ascending: false })
    if (error) console.error('VaccinationsDB.getAll:', error)
    return data || []
  },
  add: async (childId, hid, vaccineName, givenDate, nextDate) => {
    const { data, error } = await supabase.from('child_vaccinations').insert({ child_id: childId, household_id: hid, vaccine_name: vaccineName, given_date: givenDate || null, next_date: nextDate || null }).select().single()
    if (error) throw error; return data
  },
  update: async (id, changes) => {
    const { error } = await supabase.from('child_vaccinations').update(changes).eq('id', id)
    if (error) throw error
  },
  delete: async (id) => {
    const { error } = await supabase.from('child_vaccinations').delete().eq('id', id)
    if (error) throw error
  },
}

// ── Baby Tracker ──────────────────────────────────────────────────────────
export const BabyDB = {
  // טעינת רשומות לטווח תאריכים, אופציונלי לפי ילד
  getLogs: async (hid, fromDate, toDate, childId = null) => {
    let query = supabase.from('baby_logs').select('*').eq('household_id', hid).order('logged_at', { ascending: false })
    if (fromDate) query = query.gte('logged_at', fromDate)
    if (toDate)   query = query.lt('logged_at', toDate)
    if (childId)  query = query.eq('child_id', childId)
    const { data, error } = await query
    if (error) console.error('BabyDB.getLogs error:', error)
    return data || []
  },
  // הרשומה האחרונה
  getLast: async (hid, childId = null) => {
    let query = supabase.from('baby_logs').select('*').eq('household_id', hid).order('logged_at', { ascending: false }).limit(1)
    if (childId) query = query.eq('child_id', childId)
    const { data } = await query
    return data?.[0] || null
  },
  // ההאכלה האחרונה (לא חיתול בלבד)
  getLastFeed: async (hid, childId = null) => {
    let query = supabase.from('baby_logs').select('*').eq('household_id', hid).not('feed_type', 'is', null).order('logged_at', { ascending: false }).limit(1)
    if (childId) query = query.eq('child_id', childId)
    const { data } = await query
    return data?.[0] || null
  },
  add: async (hid, uid, loggedAt, feedType, feedAmountCc, diaperPee, diaperPoop, notes, childId = null) => {
    const { data, error } = await supabase
      .from('baby_logs')
      .insert({
        household_id:   hid,
        user_id:        uid,
        logged_at:      loggedAt,
        feed_type:      feedType   || null,
        feed_amount_cc: feedAmountCc != null ? Number(feedAmountCc) : null,
        diaper_pee:     !!diaperPee,
        diaper_poop:    !!diaperPoop,
        notes:          notes || '',
        child_id:       childId || null,
      })
      .select()
      .single()
    if (error) throw error
    return data
  },
  update: async (id, { loggedAt, feedType, feedAmountCc, diaperPee, diaperPoop, notes, childId }) => {
    const { error } = await supabase
      .from('baby_logs')
      .update({
        logged_at:      loggedAt,
        feed_type:      feedType || null,
        feed_amount_cc: feedAmountCc != null ? Number(feedAmountCc) : null,
        diaper_pee:     !!diaperPee,
        diaper_poop:    !!diaperPoop,
        notes:          notes || '',
        child_id:       childId || null,
      })
      .eq('id', id)
    if (error) throw error
  },
  delete: async (id) => {
    const { error } = await supabase.from('baby_logs').delete().eq('id', id)
    if (error) throw error
  },
}

// ── Expenses ──────────────────────────────────────────────────────────────
export const ExpenseDB = {
  getForMonth: async (hid, year, month) => {
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const nextMonthYear = month === 11 ? year + 1 : year
    const nextMonth = month === 11 ? 1 : month + 2
    const to = `${nextMonthYear}-${String(nextMonth).padStart(2, '0')}-01`
    const { data, error } = await supabase.from('expenses').select('*').eq('household_id', hid).gte('date', from).lt('date', to).order('date', { ascending: false })
    if (error) console.error('ExpenseDB.getForMonth error:', error)
    return data || []
  },
  add: async (hid, uid, description, amount, category, type, date) => {
    const { data, error } = await supabase.from('expenses').insert({ household_id: hid, user_id: uid, description, amount: parseFloat(amount), category, type, date }).select().single()
    if (error) throw error; return data
  },
  delete: async (id) => { await supabase.from('expenses').delete().eq('id', id) },
}

// ── Child Activities / Chugim ─────────────────────────────────────────────
export const ActivitiesDB = {
  getAll: async (childId) => {
    const { data, error } = await supabase.from('child_activities').select('*').eq('child_id', childId).order('day_of_week').order('start_time')
    if (error) console.error('ActivitiesDB.getAll:', error)
    return data || []
  },
  add: async (childId, hid, { name, daysOfWeek, startTime, endTime, location, notes, reminderMinutes, color }) => {
    const days = Array.isArray(daysOfWeek) && daysOfWeek.length > 0 ? daysOfWeek : [0]
    const { data, error } = await supabase.from('child_activities').insert({
      child_id: childId, household_id: hid, name,
      day_of_week: days[0],
      days_of_week: days,
      start_time: startTime, end_time: endTime || null, location: location || '',
      notes: notes || '', reminder_minutes: reminderMinutes ?? 30, color: color || '#6C63FF',
    }).select().single()
    if (error) throw error; return data
  },
  update: async (id, changes) => {
    if (changes.daysOfWeek !== undefined) {
      const days = Array.isArray(changes.daysOfWeek) && changes.daysOfWeek.length > 0 ? changes.daysOfWeek : [0]
      changes = { ...changes, day_of_week: days[0], days_of_week: days }
      delete changes.daysOfWeek
    }
    const { error } = await supabase.from('child_activities').update(changes).eq('id', id)
    if (error) throw error
  },
  delete: async (id) => {
    const { error } = await supabase.from('child_activities').delete().eq('id', id)
    if (error) throw error
  },
  getExceptions: async (childId, fromDate, toDate) => {
    let q = supabase.from('activity_exceptions').select('*').eq('child_id', childId)
    if (fromDate) q = q.gte('exception_date', fromDate)
    if (toDate)   q = q.lte('exception_date', toDate)
    const { data, error } = await q
    if (error) console.error('ActivitiesDB.getExceptions:', error)
    return data || []
  },
  addException: async (childId, hid, { activityId, exceptionDate, type, title, notes, startTime, location }) => {
    const { data, error } = await supabase.from('activity_exceptions').insert({
      child_id: childId, household_id: hid, activity_id: activityId || null,
      exception_date: exceptionDate, type, title: title || null,
      notes: notes || '', start_time: startTime || null, location: location || '',
    }).select().single()
    if (error) throw error; return data
  },
  deleteException: async (id) => {
    const { error } = await supabase.from('activity_exceptions').delete().eq('id', id)
    if (error) throw error
  },
}

// ── Homework & Exams ──────────────────────────────────────────────────────
export const HomeworkDB = {
  getAll: async (childId) => {
    const { data, error } = await supabase.from('child_homework').select('*').eq('child_id', childId).order('due_date')
    if (error) console.error('HomeworkDB.getAll:', error)
    return data || []
  },
  add: async (childId, hid, { type, subject, description, dueDate, status, prepStatus, grade }) => {
    const { data, error } = await supabase.from('child_homework').insert({
      child_id: childId, household_id: hid, type: type || 'homework', subject,
      description: description || '', due_date: dueDate, status: status || 'pending',
      prep_status: prepStatus || 'not_started', grade: grade || '',
    }).select().single()
    if (error) throw error; return data
  },
  update: async (id, changes) => {
    const { error } = await supabase.from('child_homework').update(changes).eq('id', id)
    if (error) throw error
  },
  delete: async (id) => {
    const { error } = await supabase.from('child_homework').delete().eq('id', id)
    if (error) throw error
  },
}

// ── Sleep Logs ────────────────────────────────────────────────────────────
export const SleepDB = {
  getAll: async (childId, fromDate, toDate) => {
    let q = supabase.from('child_sleep_logs').select('*').eq('child_id', childId).order('sleep_date', { ascending: false })
    if (fromDate) q = q.gte('sleep_date', fromDate)
    if (toDate)   q = q.lte('sleep_date', toDate)
    const { data, error } = await q
    if (error) console.error('SleepDB.getAll:', error)
    return data || []
  },
  upsert: async (childId, hid, { sleepDate, bedtime, wakeTime, napMinutes, notes }) => {
    const { data, error } = await supabase.from('child_sleep_logs').upsert({
      child_id: childId, household_id: hid, sleep_date: sleepDate,
      bedtime: bedtime || null, wake_time: wakeTime || null,
      nap_minutes: napMinutes || 0, notes: notes || '',
    }, { onConflict: 'child_id,sleep_date' }).select().single()
    if (error) throw error; return data
  },
  delete: async (id) => {
    const { error } = await supabase.from('child_sleep_logs').delete().eq('id', id)
    if (error) throw error
  },
}

// ── Teen: Hobbies & Interests ─────────────────────────────────────────────
export const HobbiesDB = {
  getAll: async (childId) => {
    const { data, error } = await supabase.from('child_hobbies').select('*').eq('child_id', childId).order('created_at', { ascending: false })
    if (error) console.error('HobbiesDB.getAll:', error)
    return data || []
  },
  add: async (childId, hid, { name, type, frequencyNotes }) => {
    const { data, error } = await supabase.from('child_hobbies').insert({
      child_id: childId, household_id: hid, name, type: type || 'hobby', frequency_notes: frequencyNotes || '',
    }).select().single()
    if (error) throw error; return data
  },
  update: async (id, changes) => {
    const { error } = await supabase.from('child_hobbies').update(changes).eq('id', id)
    if (error) throw error
  },
  delete: async (id) => {
    const { error } = await supabase.from('child_hobbies').delete().eq('id', id)
    if (error) throw error
  },
}

// ── Teen: Work Shifts ─────────────────────────────────────────────────────
export const WorkShiftsDB = {
  getAll: async (childId) => {
    const { data, error } = await supabase.from('child_work_shifts').select('*').eq('child_id', childId).order('shift_date', { ascending: false })
    if (error) console.error('WorkShiftsDB.getAll:', error)
    return data || []
  },
  add: async (childId, hid, { shiftDate, workplace, startTime, endTime, earnings, notes }) => {
    const { data, error } = await supabase.from('child_work_shifts').insert({
      child_id: childId, household_id: hid, shift_date: shiftDate, workplace: workplace || '',
      start_time: startTime || null, end_time: endTime || null,
      earnings: earnings ? parseFloat(earnings) : null, notes: notes || '',
    }).select().single()
    if (error) throw error; return data
  },
  delete: async (id) => {
    const { error } = await supabase.from('child_work_shifts').delete().eq('id', id)
    if (error) throw error
  },
}

// ── Teen: Pocket Money ────────────────────────────────────────────────────
export const PocketMoneyDB = {
  getAll: async (childId) => {
    const { data, error } = await supabase.from('child_pocket_money').select('*').eq('child_id', childId).order('entry_date', { ascending: false })
    if (error) console.error('PocketMoneyDB.getAll:', error)
    return data || []
  },
  add: async (childId, hid, { type, amount, description, category, entryDate }) => {
    const { data, error } = await supabase.from('child_pocket_money').insert({
      child_id: childId, household_id: hid, type, amount: parseFloat(amount),
      description: description || '', category: category || '', entry_date: entryDate,
    }).select().single()
    if (error) throw error; return data
  },
  delete: async (id) => {
    const { error } = await supabase.from('child_pocket_money').delete().eq('id', id)
    if (error) throw error
  },
}
