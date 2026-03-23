import { supabase } from './supabase'

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
    const { data } = await supabase.from('shopping_items').select('*').eq('list_id', listId).order('created_at', { ascending: false })
    return data || []
  },
  getAllItems: async (hid) => {
    const { data } = await supabase.from('shopping_items').select('*').eq('household_id', hid)
    return data || []
  },
  addItem: async (listId, hid, name, qty, unit, category, notes = '') => {
    const { data, error } = await supabase.from('shopping_items').insert({ list_id: listId, household_id: hid, name, qty, unit, category, notes: notes || '' }).select().single()
    if (error) throw error; return data
  },
  toggleItem: async (id, checked) => { await supabase.from('shopping_items').update({ checked }).eq('id', id) },
  updateItem: async (id, changes) => { await supabase.from('shopping_items').update(changes).eq('id', id) },
  deleteItem: async (id) => { await supabase.from('shopping_items').delete().eq('id', id) },
  clearChecked: async (listId) => { await supabase.from('shopping_items').delete().eq('list_id', listId).eq('checked', true) },
}

// ── Tasks ─────────────────────────────────────────────────────────────────
export const TaskDB = {
  getAll: async (hid) => {
    const { data } = await supabase.from('tasks').select('*').eq('household_id', hid).order('created_at', { ascending: false })
    return data || []
  },
  add: async (hid, uid, title, priority, dueDate, notes, assignedTo = null) => {
    const row = {
      household_id: hid,
      user_id: uid,
      title,
      priority,
      due_date: dueDate || null,
      notes,
      assigned_to: assignedTo == null || assignedTo === '' ? null : assignedTo,
    }
    const { data, error } = await supabase.from('tasks').insert(row).select().single()
    if (error) throw error; return data
  },
  update: async (id, changes) => { await supabase.from('tasks').update(changes).eq('id', id) },
  toggle: async (id, done) => { await supabase.from('tasks').update({ done, done_at: done ? new Date().toISOString() : null }).eq('id', id) },
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
  add: async (hid, uid, title, date, time, color, notes) => {
    const { data, error } = await supabase.from('events').insert({ household_id: hid, user_id: uid, title, date, time: time || null, color, notes }).select().single()
    if (error) throw error; return data
  },
  delete: async (id) => { await supabase.from('events').delete().eq('id', id) },
}

// ── Children ──────────────────────────────────────────────────────────────
export const ChildrenDB = {
  getAll: async (hid) => {
    const { data } = await supabase.from('children').select('*').eq('household_id', hid).order('created_at', { ascending: true })
    return data || []
  },
  add: async (hid, name, emoji = '👶') => {
    const { data, error } = await supabase.from('children').insert({ household_id: hid, name: name.trim(), emoji }).select().single()
    if (error) throw error; return data
  },
  update: async (id, { name, emoji }) => {
    const { error } = await supabase.from('children').update({ name, emoji }).eq('id', id)
    if (error) throw error
  },
  delete: async (id) => {
    const { error } = await supabase.from('children').delete().eq('id', id)
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
