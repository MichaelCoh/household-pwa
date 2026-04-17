// Compute a household's "regular" shopping items from their full item history.
//
// Signal model:
//   score = recency-weighted frequency, boosted when the item has a detectable
//   purchase rhythm AND is currently "due soon" based on that rhythm.
//
//   - Recency weighting: each past add contributes exp(-ageDays / HALF_LIFE_DAYS).
//     A weekly staple stays high for months; a one-off from a year ago decays out.
//   - Cadence: if an item has enough history (>= MIN_ADDS_FOR_CADENCE) and the
//     intervals between consecutive adds are reasonably regular (coefficient of
//     variation <= CV_REGULAR_THRESHOLD) within a sensible groceries cadence
//     (MIN/MAX_INTERVAL_DAYS), we flag it "regular". If the time since the last
//     add >= mean interval × DUE_SOON_FACTOR, it is "due soon".
//
// All timestamps are parsed from `created_at`; normalization is shared with
// the categorization module's spirit (lowercase + strip Hebrew niqqud + trim).

const HALF_LIFE_DAYS = 45
const DECAY = Math.log(2) / HALF_LIFE_DAYS
const MIN_ADDS = 3
const MIN_ADDS_FOR_CADENCE = 3
const CV_REGULAR_THRESHOLD = 0.75
const MIN_INTERVAL_DAYS = 2
const MAX_INTERVAL_DAYS = 75
const DUE_SOON_FACTOR = 0.85
const DUE_SOON_SCORE_MULTIPLIER = 1.6
const DAY_MS = 86_400_000
// Items not purchased within this window are considered inactive, regardless
// of how many times they were bought historically.
const ACTIVE_WINDOW_DAYS = 90

const NIQQUD_RE = /[\u0591-\u05C7]/g

function stripNiqqud(s) {
  return s.replace(NIQQUD_RE, '')
}

/** Normalize a shopping-item name for grouping across history. */
export function normalizeName(raw) {
  if (!raw) return ''
  return stripNiqqud(String(raw))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Compute the household's regulars from a flat array of shopping_items.
 *
 * @param {Array<{name:string, qty?:number, unit?:string, category?:string, notes?:string, created_at?:string}>} items
 * @param {{ now?: number, limit?: number, minAdds?: number }} [options]
 * @returns {Array<{
 *   name: string, qty: number, unit: string, category: string, notes: string,
 *   count: number, lastAt: number, score: number, regular: boolean, dueSoon: boolean,
 *   intervalDays: number | null,
 * }>}
 */
export function computeRegulars(items, options = {}) {
  const now = options.now ?? Date.now()
  const minAdds = options.minAdds ?? MIN_ADDS
  const limit = options.limit ?? 40

  if (!Array.isArray(items) || items.length === 0) return []

  const groups = new Map()

  for (const raw of items) {
    if (!raw || !raw.name) continue
    const key = normalizeName(raw.name)
    if (!key) continue
    const ts = raw.created_at ? new Date(raw.created_at).getTime() : now
    if (!Number.isFinite(ts)) continue
    let g = groups.get(key)
    if (!g) {
      g = { key, adds: [], latest: null }
      groups.set(key, g)
    }
    g.adds.push(ts)
    if (!g.latest || ts > new Date(g.latest.created_at || 0).getTime()) {
      g.latest = raw
    }
  }

  const out = []
  for (const g of groups.values()) {
    if (g.adds.length < minAdds) continue

    // Gate: must have been purchased at least once within the active window.
    const mostRecent = Math.max(...g.adds)
    if ((now - mostRecent) / DAY_MS > ACTIVE_WINDOW_DAYS) continue

    // Recency-weighted frequency.
    let score = 0
    for (const ts of g.adds) {
      const ageDays = Math.max(0, (now - ts) / DAY_MS)
      score += Math.exp(-DECAY * ageDays)
    }

    g.adds.sort((a, b) => a - b)
    const lastAt = g.adds[g.adds.length - 1]

    let regular = false
    let dueSoon = false
    let intervalDays = null

    if (g.adds.length >= MIN_ADDS_FOR_CADENCE) {
      const gaps = []
      for (let i = 1; i < g.adds.length; i++) {
        gaps.push((g.adds[i] - g.adds[i - 1]) / DAY_MS)
      }
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
      if (mean >= MIN_INTERVAL_DAYS && mean <= MAX_INTERVAL_DAYS) {
        const variance = gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length
        const cv = Math.sqrt(variance) / mean
        if (cv <= CV_REGULAR_THRESHOLD) {
          regular = true
          intervalDays = Math.round(mean)
          const daysSinceLast = (now - lastAt) / DAY_MS
          if (daysSinceLast >= mean * DUE_SOON_FACTOR) {
            dueSoon = true
            score *= DUE_SOON_SCORE_MULTIPLIER
          }
        }
      }
    }

    const latest = g.latest || {}
    out.push({
      name: latest.name || g.key,
      qty: Number(latest.qty) > 0 ? Number(latest.qty) : 1,
      unit: latest.unit || '',
      category: latest.category || '❓ General',
      notes: latest.notes || '',
      count: g.adds.length,
      lastAt,
      score,
      regular,
      dueSoon,
      intervalDays,
    })
  }

  out.sort((a, b) => {
    if (a.dueSoon !== b.dueSoon) return a.dueSoon ? -1 : 1
    return b.score - a.score
  })

  return out.slice(0, limit)
}
