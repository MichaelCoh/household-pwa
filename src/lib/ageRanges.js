/**
 * Age-range system for the Children section.
 * Determines which features are available per child based on DOB.
 */

export const AGE_RANGES = [
  {
    key: 'infant',
    label: 'תינוק',
    emoji: '👶',
    minMonths: 0,
    maxMonths: 12,
    features: ['feeding', 'diapers', 'weekly_summary'],
  },
  {
    key: 'toddler',
    label: 'פעוט',
    emoji: '🧒',
    minMonths: 12,
    maxMonths: 36,
    features: ['sleep_tracking', 'food_reminder', 'milestones', 'vaccinations'],
  },
  {
    key: 'kindergarten',
    label: 'גן',
    emoji: '🎒',
    minMonths: 36,
    maxMonths: 72,
    features: ['activities', 'food_reminder', 'special_events', 'vaccinations'],
  },
  {
    key: 'school',
    label: 'בית ספר',
    emoji: '📚',
    minMonths: 72,
    maxMonths: 144,
    features: ['activities', 'homework', 'food_reminder', 'special_events'],
  },
  {
    key: 'preteen',
    label: 'נוער צעיר',
    emoji: '🎮',
    minMonths: 144,
    maxMonths: 192,
    features: ['activities', 'homework', 'pocket_money', 'food_reminder', 'special_events'],
  },
  {
    key: 'teenager',
    label: 'נוער',
    emoji: '🧑',
    minMonths: 192,
    maxMonths: Infinity,
    features: ['homework', 'hobbies', 'work_shifts', 'pocket_money', 'army_prep', 'driving_log', 'special_events'],
  },
]

/**
 * Timezone-safe age calculation — parses DOB as local date to avoid UTC offset issues.
 */
export function getAgeInMonths(dob) {
  if (!dob) return null
  const parts = String(dob).split('-').map(Number)
  if (parts.length < 3 || parts.some(isNaN)) return null
  const birth = new Date(parts[0], parts[1] - 1, parts[2])
  const now = new Date()
  return (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth())
}

export function getAgeDisplay(dob) {
  const months = getAgeInMonths(dob)
  if (months == null) return null
  if (months < 1) return 'יילוד'
  if (months < 12) return `${months} חודשים`
  const years = Math.floor(months / 12)
  const rem = months % 12
  if (rem === 0) return years === 1 ? 'שנה' : `${years} שנים`
  return years === 1 ? `שנה ו-${rem} חודשים` : `${years} שנים ו-${rem} חודשים`
}

export function getAgeRange(dob) {
  const months = getAgeInMonths(dob)
  if (months == null) return null
  for (let i = AGE_RANGES.length - 1; i >= 0; i--) {
    if (months >= AGE_RANGES[i].minMonths) return AGE_RANGES[i]
  }
  return AGE_RANGES[0]
}

export function getFeaturesForChild(child) {
  const range = getAgeRange(child.date_of_birth)
  if (!range) return []
  return range.features
}

export function isFeatureActive(child, featureKey) {
  const rangeFeatures = getFeaturesForChild(child)
  if (!rangeFeatures.includes(featureKey)) return false
  if (child.active_features && Array.isArray(child.active_features) && child.active_features.length > 0) {
    return child.active_features.includes(featureKey)
  }
  return true
}

export const FEATURE_META = {
  feeding:        { label: 'האכלות',             emoji: '🍼', group: 'daily' },
  diapers:        { label: 'חיתולים',             emoji: '🧷', group: 'daily' },
  weekly_summary: { label: 'סיכום שבועי',         emoji: '✨', group: 'daily' },
  sleep_tracking: { label: 'מעקב שינה',           emoji: '🌙', group: 'daily' },
  food_reminder:  { label: 'תזכורת אוכל',         emoji: '🥪', group: 'daily' },
  milestones:     { label: 'אבני דרך',             emoji: '🌟', group: 'health' },
  vaccinations:   { label: 'חיסונים',              emoji: '💉', group: 'health' },
  activities:     { label: 'חוגים',                emoji: '⚽', group: 'schedule' },
  special_events: { label: 'אירועים מיוחדים',     emoji: '🎉', group: 'schedule' },
  homework:       { label: 'שיעורי בית ומבחנים',  emoji: '📝', group: 'school' },
  pocket_money:   { label: 'תקציב כיס',            emoji: '💰', group: 'teen' },
  work_shifts:    { label: 'עבודה ומשמרות',        emoji: '💼', group: 'teen' },
  hobbies:        { label: 'תחביבים',              emoji: '🎨', group: 'teen' },
  army_prep:      { label: 'הכנה לצבא',            emoji: '🎖️', group: 'teen' },
  driving_log:    { label: 'רישיון נהיגה',         emoji: '🚗', group: 'teen' },
}

export const FEATURE_GROUPS = [
  { key: 'daily',    label: 'יומי',        emoji: '📅' },
  { key: 'health',   label: 'על הילד',     emoji: '👤' },
  { key: 'schedule', label: 'לוח זמנים',  emoji: '🗓️' },
  { key: 'school',   label: 'לימודים',    emoji: '🎓' },
  { key: 'teen',     label: 'אישי',        emoji: '🧑' },
]
