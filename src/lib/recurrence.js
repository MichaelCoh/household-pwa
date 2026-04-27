/**
 * חישוב תאריך יעד הבא למשימה חוזרת (מחרוזת YYYY-MM-DD)
 */
function pad(n) {
  return String(n).padStart(2, '0')
}

export function formatDateOnly(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * @param {string} dueDateStr - YYYY-MM-DD
 * @param {string} recurrence - none|daily|weekly|monthly|yearly|custom
 * @param {number} interval - for custom: every N days; weekly: step weeks when no weekday
 * @param {number|null} weekday - 0-6 (Sun-Sat) for weekly
 */
export function computeNextDueDate(dueDateStr, recurrence, interval = 1, weekday = null) {
  if (!dueDateStr || recurrence === 'none' || !recurrence) return dueDateStr
  const base = new Date(dueDateStr + 'T12:00:00')
  if (Number.isNaN(base.getTime())) return dueDateStr

  const n = Math.max(1, parseInt(interval, 10) || 1)

  switch (recurrence) {
    case 'daily': {
      const d = new Date(base)
      d.setDate(d.getDate() + 1)
      return formatDateOnly(d)
    }
    case 'weekly': {
      if (weekday != null && weekday >= 0 && weekday <= 6) {
        const d = new Date(base)
        d.setDate(d.getDate() + 1)
        let guard = 0
        while (d.getDay() !== weekday && guard < 14) {
          d.setDate(d.getDate() + 1)
          guard++
        }
        return formatDateOnly(d)
      }
      const d = new Date(base)
      d.setDate(d.getDate() + 7 * n)
      return formatDateOnly(d)
    }
    case 'monthly': {
      const d = new Date(base)
      d.setMonth(d.getMonth() + n)
      return formatDateOnly(d)
    }
    case 'yearly': {
      const d = new Date(base)
      d.setFullYear(d.getFullYear() + n)
      return formatDateOnly(d)
    }
    case 'custom': {
      const d = new Date(base)
      d.setDate(d.getDate() + n)
      return formatDateOnly(d)
    }
    default:
      return dueDateStr
  }
}

function parseDate(s) {
  return new Date(s + 'T12:00:00')
}

function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

/**
 * Does the recurring item with anchor `anchorStr` (YYYY-MM-DD) land on `targetStr`?
 *
 * Mirrors the server-side logic in dispatch-task-reminders so the calendar UI and
 * the reminder dispatcher always agree on which days a task/event "occurs".
 *
 * - `none` recurrence ⇒ true only when target === anchor.
 * - `endDate` (inclusive, YYYY-MM-DD) caps the series; targets past it return false.
 *
 * @param {string} anchorStr  - first occurrence (YYYY-MM-DD)
 * @param {string} targetStr  - day to test (YYYY-MM-DD)
 * @param {string} recurrence - none|daily|weekly|monthly|yearly|custom
 * @param {number} interval
 * @param {number|null} weekday - 0–6 for weekly with fixed day
 * @param {string|null} endDate - inclusive end date or null
 */
export function isOccurrenceOn(anchorStr, targetStr, recurrence, interval = 1, weekday = null, endDate = null) {
  if (!anchorStr || !targetStr) return false
  if (anchorStr === targetStr) {
    if (endDate && targetStr > endDate) return false
    return true
  }
  if (!recurrence || recurrence === 'none') return false
  if (endDate && targetStr > endDate) return false

  const anchor = parseDate(anchorStr)
  const target = parseDate(targetStr)
  if (Number.isNaN(anchor.getTime()) || Number.isNaN(target.getTime())) return false
  if (target < anchor) return false

  const n = Math.max(1, parseInt(interval, 10) || 1)
  const diff = daysBetween(anchor, target)

  switch (recurrence) {
    case 'daily':
      return diff % n === 0
    case 'weekly':
      if (weekday != null && weekday >= 0 && weekday <= 6) return target.getDay() === weekday
      return diff % (7 * n) === 0
    case 'monthly': {
      if (target.getDate() !== anchor.getDate()) return false
      const monthDiff = (target.getFullYear() - anchor.getFullYear()) * 12 + (target.getMonth() - anchor.getMonth())
      return monthDiff > 0 && monthDiff % n === 0
    }
    case 'yearly': {
      if (target.getDate() !== anchor.getDate() || target.getMonth() !== anchor.getMonth()) return false
      const yearDiff = target.getFullYear() - anchor.getFullYear()
      return yearDiff > 0 && yearDiff % n === 0
    }
    case 'custom':
      return diff % n === 0
    default:
      return false
  }
}

/**
 * Build the set of YYYY-MM-DD dates within [fromStr, toStr] (inclusive both ends)
 * that the recurring item lands on. Used by the calendar to render every
 * occurrence within the visible month, not just the anchor date.
 *
 * Bounded to a sane upper limit (~370 iterations = 1 year) to never run away.
 */
export function expandOccurrences(anchorStr, recurrence, interval, weekday, fromStr, toStr, endDate = null) {
  if (!anchorStr) return []
  const out = []
  const start = parseDate(fromStr > anchorStr ? fromStr : anchorStr)
  const stopStr = endDate && endDate < toStr ? endDate : toStr
  const stop = parseDate(stopStr)
  if (start > stop) return out
  const cursor = new Date(start)
  let guard = 0
  while (cursor <= stop && guard < 400) {
    const ds = formatDateOnly(cursor)
    if (isOccurrenceOn(anchorStr, ds, recurrence, interval, weekday, endDate)) out.push(ds)
    cursor.setDate(cursor.getDate() + 1)
    guard++
  }
  return out
}

export const RECURRENCE_OPTIONS = [
  { key: 'none', label: 'ללא חזרה' },
  { key: 'daily', label: 'יומי' },
  { key: 'weekly', label: 'שבועי' },
  { key: 'monthly', label: 'חודשי' },
  { key: 'yearly', label: 'שנתי' },
  { key: 'custom', label: 'כל X ימים' },
]

export const WEEKDAY_OPTIONS_HE = [
  { key: 0, label: 'יום א׳' },
  { key: 1, label: 'יום ב׳' },
  { key: 2, label: 'יום ג׳' },
  { key: 3, label: 'יום ד׳' },
  { key: 4, label: 'יום ה׳' },
  { key: 5, label: 'יום ו׳' },
  { key: 6, label: 'שבת' },
]
