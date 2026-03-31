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
