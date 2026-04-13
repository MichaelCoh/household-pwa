/**
 * סיכומים שבועיים למעקב תינוקות — ניסוחים ברורים וחמים בעברית
 */

export function getIsoWeekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((t - yearStart) / 86400000) + 1) / 7)
  return `${t.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

/**
 * שם לתצוגה בסיכום — גם כשהמסך על «הכל» אבל יש ילד אחד או רק רשומות של ילד אחד
 */
export function resolveChildNameForInsight(childList, selectedChildId, logs) {
  if (!childList?.length) return null
  if (selectedChildId) {
    const c = childList.find(x => x.id === selectedChildId)
    return c?.name?.trim() || null
  }
  const ids = [...new Set(logs.map(l => l.child_id).filter(Boolean))]
  if (ids.length === 1) {
    const c = childList.find(x => x.id === ids[0])
    return c?.name?.trim() || null
  }
  if (childList.length === 1) return childList[0].name?.trim() || null
  return null
}

/**
 * @param {Array} logs - רשומות baby_logs בטווח
 * @param {string|null} childName - שם פרטי (ללא אימוג'י); אם null — ניסוח נייטרלי
 */
export function buildWeeklyInsight(logs, childName) {
  const name = childName?.trim() || null

  const withDiaper = logs.filter(l => l.diaper_pee || l.diaper_poop)
  const diaperChanges = withDiaper.length
  const peeOnly = logs.filter(l => l.diaper_pee && !l.diaper_poop).length
  const poopOnly = logs.filter(l => l.diaper_poop && !l.diaper_pee).length
  const both = logs.filter(l => l.diaper_pee && l.diaper_poop).length

  const nursing = logs.filter(l => l.feed_type === 'nursing')
  const formula = logs.filter(l => l.feed_type === 'formula')
  const breastmilk = logs.filter(l => l.feed_type === 'breastmilk')

  const formulaCc = formula.reduce((s, l) => s + (Number(l.feed_amount_cc) || 0), 0)
  const bmCc = breastmilk.reduce((s, l) => s + (Number(l.feed_amount_cc) || 0), 0)

  const lines = []

  if (diaperChanges > 0) {
    let detail = ''
    if (both > 0 && peeOnly + poopOnly > 0) {
      detail = ` פירוט: ${both} חיתולים עם פיפי וקקי יחד, ${peeOnly} רק פיפי, ${poopOnly} רק קקי.`
    } else if (both > 0 && peeOnly === 0 && poopOnly === 0) {
      detail = ' בכל החיתולים נרשמו גם פיפי וגם קקי.'
    } else if (peeOnly > 0 || poopOnly > 0) {
      detail = ` מתוכם: ${peeOnly} פיפי בלבד, ${poopOnly} קקי בלבד.`
    }
    const who = name
      ? `עבור ${name} נרשמו השבוע ${diaperChanges} החלפות טיטול.${detail}`
      : `השבוע נרשמו ${diaperChanges} החלפות טיטול.${detail}`
    lines.push({ icon: '🧷', text: who })
  }

  if (nursing.length > 0) {
    lines.push({
      icon: '🤱',
      text: name
        ? `הנקה: ${nursing.length} האכלות השבוע עבור ${name}. שגרה עקבית שמזינה, מרגיעה ומחזקת את הקשר.`
        : `הנקה: ${nursing.length} האכלות השבוע — שגרה נהדרת.`,
    })
  }

  if (formula.length > 0 && formulaCc > 0) {
    const avg = Math.round(formulaCc / formula.length)
    lines.push({
      icon: '🥛',
      text: name
        ? `מטרנה ל${name}: כ-${Math.round(formulaCc)} מ״ל ב־${formula.length} מנות (ממוצע כ-${avg} מ״ל למנה).`
        : `מטרנה: כ-${Math.round(formulaCc)} מ״ל ב־${formula.length} מנות (ממוצע כ-${avg} מ״ל למנה).`,
    })
  } else if (formula.length > 0) {
    lines.push({
      icon: '🥛',
      text: name ? `מטרנה: ${formula.length} האכלות השבוע ל${name}.` : `מטרנה: ${formula.length} האכלות השבוע.`,
    })
  }

  if (breastmilk.length > 0 && bmCc > 0) {
    lines.push({
      icon: '🍼',
      text: name
        ? `חלב שאוב ל${name}: כ-${Math.round(bmCc)} מ״ל ב־${breastmilk.length} האכלות.`
        : `חלב שאוב: כ-${Math.round(bmCc)} מ״ל ב־${breastmilk.length} האכלות.`,
    })
  } else if (breastmilk.length > 0) {
    lines.push({
      icon: '🍼',
      text: name ? `חלב שאוב: ${breastmilk.length} האכלות השבוע ל${name}.` : `חלב שאוב: ${breastmilk.length} האכלות השבוע.`,
    })
  }

  if (lines.length === 0 && logs.length > 0) {
    lines.push({
      icon: '👶',
      text: 'תיעדתם פעילות — כשיירשמו האכלות והחיתולים, כאן יתעדכן סיכום מפורט.',
    })
  }

  return {
    lines,
    stats: { diaperChanges, nursing: nursing.length, formulaCc, bmCc },
  }
}
