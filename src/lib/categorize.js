/**
 * Auto-categorization for shopping items.
 *
 * Strategy:
 *   1. Local dictionary (Hebrew + English) — instant, offline, free.
 *   2. Optional remote fallback (Phase 2) — pluggable via `setRemoteCategorizer`.
 *      Only called when the dictionary returns null. The UI should treat the
 *      remote call as best-effort and never block on it.
 *
 * Categories must match exactly the strings used in ShoppingPage.CATEGORIES.
 */

export const CATEGORIES = [
  '🥦 Produce',
  '🥩 Meat & Fish',
  '🥛 Dairy',
  '🍞 Bakery',
  '🧴 Hygiene',
  '🧹 Cleaning',
  '🍿 Snacks',
  '🥤 Drinks',
  '🧊 Frozen',
  '❓ General',
]

const CATEGORY_DICTIONARY = {
  '🥛 Dairy': [
    'חלב', 'חלב סויה', 'חלב שקדים', 'חלב שיבולת שועל', 'חמאה', 'מרגרינה',
    'גבינה', 'גבינות', 'גבינה צהובה', 'גבינה לבנה', 'גבינת שמנת', 'קוטג', "קוטג'",
    'יוגורט', 'יוגורטים', 'לבנה', 'לבן', 'שמנת', 'שמנת חמוצה', 'שמנת מתוקה', 'שמנת להקצפה',
    'מוצרלה', 'צדר', "צ'דר", 'פטה', 'ברי', 'קממבר', 'ריקוטה', 'גאודה', 'בולגרית',
    'ביצה', 'ביצים', 'מעדן', 'מעדנים', 'פודינג', 'מילקי', 'אשל', 'דנונה',
    'קפיר', 'טופו', 'תחליף חלב',
    'milk', 'soy milk', 'almond milk', 'oat milk', 'butter', 'margarine',
    'cheese', 'yellow cheese', 'white cheese', 'cream cheese', 'cottage cheese', 'cottage',
    'yogurt', 'yoghurt', 'cream', 'sour cream', 'whipping cream', 'heavy cream',
    'mozzarella', 'cheddar', 'feta', 'brie', 'camembert', 'ricotta', 'gouda',
    'egg', 'eggs', 'pudding', 'kefir', 'tofu', 'dairy',
  ],

  '🥦 Produce': [
    'עגבניה', 'עגבנייה', 'עגבניות', 'מלפפון', 'מלפפונים', 'בצל', 'בצלים', 'בצל ירוק',
    'שום', 'תפוח אדמה', 'תפוחי אדמה', 'תפוא', 'בטטה', 'בטטות',
    'גזר', 'גזרים', 'חסה', 'כרוב', 'כרובית', 'ברוקולי', 'סלרי', 'סלק',
    'פלפל', 'פלפלים', 'פלפל חריף', 'קישוא', 'קישואים', 'חציל', 'חצילים', 'תירס',
    'פטרוזיליה', 'כוסברה', 'נענע', 'שמיר', 'בזיליקום', 'רוקט', 'תרד', 'עלי תרד',
    'שעועית', 'שעועית ירוקה', 'אפונה', 'עדשים',
    'פטריות', 'פטרייה', 'ג׳ינג׳ר', "ג'ינג'ר", 'זנגביל', 'לפת', 'צנון', 'צנונית',
    'ירק', 'ירקות',
    'תפוח', 'תפוחים', 'תפוח עץ', 'בננה', 'בננות', 'תפוז', 'תפוזים', 'לימון', 'לימונים',
    'אשכולית', 'אשכוליות', 'קלמנטינה', 'מנדרינה', 'אבוקדו', 'אבוקדואים',
    'ענבים', 'אגס', 'אגסים', 'אפרסק', 'אפרסקים', 'שזיף', 'שזיפים', 'דובדבן', 'דובדבנים',
    'תות', 'תותים', 'תות שדה', 'נקטרינה', 'קיווי', 'מנגו', 'אננס', 'רימון', 'רימונים',
    'תאנה', 'תאנים', 'אבטיח', 'מלון', 'פסיפלורה', 'פפאיה', 'ליצ׳י', "ליצ'י",
    'פרי', 'פירות',
    'tomato', 'tomatoes', 'cucumber', 'cucumbers', 'onion', 'onions', 'garlic',
    'potato', 'potatoes', 'sweet potato',
    'carrot', 'carrots', 'lettuce', 'cabbage', 'cauliflower', 'broccoli', 'celery', 'beet', 'beetroot',
    'pepper', 'peppers', 'bell pepper', 'chili', 'zucchini', 'eggplant', 'aubergine', 'corn',
    'parsley', 'cilantro', 'coriander', 'mint', 'dill', 'basil', 'arugula', 'rocket', 'spinach',
    'bean', 'beans', 'green beans', 'peas', 'lentils',
    'mushroom', 'mushrooms', 'ginger', 'radish', 'turnip',
    'apple', 'apples', 'banana', 'bananas', 'orange', 'oranges', 'lemon', 'lemons',
    'grapefruit', 'clementine', 'mandarin', 'avocado', 'avocados',
    'grapes', 'pear', 'pears', 'peach', 'peaches', 'plum', 'plums', 'cherry', 'cherries',
    'strawberry', 'strawberries', 'nectarine', 'kiwi', 'mango', 'pineapple', 'pomegranate',
    'fig', 'figs', 'watermelon', 'melon', 'passion fruit', 'papaya', 'lychee',
    'fruit', 'fruits', 'vegetable', 'vegetables', 'veg', 'produce', 'greens',
  ],

  '🥩 Meat & Fish': [
    'בשר', 'בשר טחון', 'בקר', 'עגל', 'עוף', 'עופות', 'הודו', 'כבש', 'טלה',
    'כבד', 'לבבות', 'קורקבן', 'חזה עוף', 'שוקיים', 'שוק עוף', 'כנפיים', 'פרגית', 'פרגיות',
    'סטייק', 'אנטריקוט', 'פילה', 'אוסובוקו', 'צלעות', 'קציצות', 'נקניק', 'נקניקיות',
    'סלמי', 'פסטרמה', 'שווארמה', 'קבב', 'המבורגר', 'שניצל',
    'דג', 'דגים', 'סלמון', 'טונה', 'אמנון', 'דניס', 'לברק', 'מושט', 'בורי', 'סרדין', 'סרדינים',
    'הרינג', 'פילה דג', 'קרפיון', 'בקלה', 'שרימפס', 'שרימפ', 'קלמארי',
    'chicken', 'turkey', 'beef', 'veal', 'lamb', 'mutton',
    'liver', 'hearts', 'gizzards', 'chicken breast', 'drumstick', 'drumsticks', 'thighs', 'wings',
    'steak', 'entrecote', 'ribeye', 'fillet', 'filet', 'ribs', 'meatball', 'meatballs',
    'sausage', 'sausages', 'salami', 'pastrami', 'shawarma', 'kebab', 'hamburger', 'burger', 'schnitzel',
    'fish', 'salmon', 'tuna', 'tilapia', 'bass', 'sea bass', 'sardine', 'sardines', 'herring', 'cod', 'sole', 'carp',
    'shrimp', 'shrimps', 'prawn', 'prawns', 'squid', 'calamari', 'mussels', 'clams', 'crab', 'lobster',
    'meat', 'poultry', 'seafood',
  ],

  '🍞 Bakery': [
    'לחם', 'לחם אחיד', 'לחם קל', 'לחם מלא', 'לחם פרוס', 'לחם שיפון', 'חלה', 'חלות',
    'לחמניה', 'לחמנייה', 'לחמניות', 'פיתה', 'פיתות', 'בייגל', 'בייגלה', 'בגט', 'באגט', 'קרואסון', 'קרואסונים',
    'עוגה', 'עוגות', 'עוגיה', 'עוגייה', 'עוגיות', 'טוסט', 'טוסטים', 'פרוסה', 'פרוסות',
    'מצה', 'מצות', 'בצק', 'בצק עלים', 'בצק פילו', 'פיצה',
    'סופגניה', 'סופגניות', 'דונאט', 'מאפין', 'מאפינס', 'מאפה', 'מאפים', 'רוגלך', 'בבקה',
    'bread', 'white bread', 'whole wheat bread', 'sourdough', 'rye bread', 'toast', 'sliced bread',
    'bun', 'buns', 'roll', 'rolls', 'pita', 'challah', 'bagel', 'bagels', 'baguette', 'croissant', 'croissants',
    'cake', 'cakes', 'cookie', 'cookies', 'biscuit', 'biscuits', 'cracker', 'crackers',
    'matzo', 'matzah', 'dough', 'puff pastry', 'phyllo', 'pizza',
    'doughnut', 'donut', 'muffin', 'muffins', 'pastry', 'pastries', 'rugelach', 'babka', 'scone', 'scones',
    'bakery',
  ],

  '🧴 Hygiene': [
    'סבון', 'סבון ידיים', 'סבון רחצה', 'ג׳ל רחצה', "ג'ל רחצה", 'שמפו', 'מרכך שיער', 'מסכת שיער',
    'משחת שיניים', 'מברשת שיניים', 'חוט דנטלי', 'מי פה', 'דאודורנט', 'אנטיפרספירנט', 'בושם', 'פרפיום',
    'נייר טואלט', 'מגבונים', 'מגבונים לחים', 'מגבון', 'טישו', 'טישו לח', 'ממחטות',
    'חיתול', 'חיתולים', 'מגבוני תינוק', 'קרם חיתולים',
    'טמפון', 'טמפונים', 'תחבושת', 'תחבושות', 'תחבושת היגיינית', 'כוסית מחזור',
    'סכין גילוח', 'סכיני גילוח', 'קצף גילוח', 'קרם גוף', 'קרם ידיים', 'קרם פנים',
    'תחליב', 'לוסיון', 'שמן גוף', 'אודם', 'שפתון', 'איפור', 'לק', 'מסיר לק',
    'אקמול', 'אדוויל', 'אופטלגין', 'נורופן',
    'soap', 'hand soap', 'body soap', 'shower gel', 'shampoo', 'conditioner', 'hair mask',
    'toothpaste', 'toothbrush', 'floss', 'mouthwash', 'deodorant', 'antiperspirant', 'perfume', 'cologne',
    'toilet paper', 'wet wipes', 'wipes', 'tissues', 'tissue',
    'diaper', 'diapers', 'baby wipes', 'diaper cream',
    'tampon', 'tampons', 'pad', 'pads', 'sanitary pad', 'menstrual cup',
    'razor', 'razors', 'shaving cream', 'shaving gel', 'after shave', 'body lotion', 'hand cream', 'face cream',
    'lotion', 'body oil', 'lipstick', 'makeup', 'nail polish', 'nail polish remover',
    'aspirin', 'ibuprofen', 'paracetamol', 'acamol', 'advil',
    'hygiene', 'toiletries',
  ],

  '🧹 Cleaning': [
    'אקונומיקה', 'כלור', 'נוזל כלים', 'סבון כלים', 'טבליות למדיח', 'מלח למדיח', 'מבריק למדיח',
    'אבקת כביסה', 'ג׳ל כביסה', "ג'ל כביסה", 'קפסולות כביסה', 'מרכך כביסה', 'מלבין',
    'חומר ניקוי', 'מנקה רב תכליתי', 'מנקה רצפות', 'מנקה שירותים', 'מנקה מטבח', 'מנקה חלונות',
    'שקית זבל', 'שקיות זבל', 'ניילון נצמד', 'נייר אפייה', 'נייר כסף', 'אלומיניום', 'צלחות חד פעמיות', 'כוסות חד פעמיות',
    'סקוטש', 'ספוג', 'ספוגים', 'סמרטוט', 'סמרטוטים', 'מטאטא', 'מגב', 'יעה', 'דלי',
    'כפפות חד פעמיות', 'כפפות לטקס', 'מטהר אוויר', 'קוטל חרקים', 'חומר הדברה',
    'bleach', 'chlorine', 'dish soap', 'dishwashing liquid', 'dishwasher tablets', 'dishwasher salt', 'rinse aid',
    'laundry detergent', 'laundry pods', 'fabric softener', 'whitener',
    'cleaner', 'all purpose cleaner', 'floor cleaner', 'toilet cleaner', 'kitchen cleaner', 'window cleaner', 'glass cleaner',
    'trash bags', 'garbage bags', 'cling film', 'plastic wrap', 'baking paper', 'parchment paper', 'aluminum foil', 'aluminium foil',
    'paper plates', 'paper cups', 'disposable plates', 'disposable cups',
    'sponge', 'sponges', 'scrubber', 'rag', 'rags', 'broom', 'mop', 'dustpan', 'bucket',
    'disposable gloves', 'latex gloves', 'rubber gloves', 'air freshener', 'insecticide', 'pest control', 'bug spray',
    'cleaning', 'detergent',
  ],

  '🍿 Snacks': [
    'ביסלי', 'במבה', 'שוקולד', 'שוקולד חלב', 'שוקולד מריר', 'שוקולד לבן', 'פרה', 'מקופלת', 'קליק',
    'חטיף', 'חטיפים', 'חטיף אנרגיה', 'חטיפי דגנים', "צ'יפס", 'צ׳יפס', 'דוריטוס', 'צ׳יטוס', "צ'יטוס",
    'פופקורן', 'וופל', 'וופלים', 'סוכריה', 'סוכריות', 'סוכריות גומי', 'לוקום', 'מסטיק', 'מסטיקים',
    'אגוזים', 'בוטנים', 'שקדים', 'קשיו', 'פיסטוק', 'פיסטוקים', 'גרעינים', 'גרעיני חמנייה', 'פיצוחים',
    'חמאת בוטנים', 'נוטלה', 'ממרח שוקולד', 'חלבה', 'מרשמלו', 'תמר', 'תמרים',
    'chocolate', 'dark chocolate', 'milk chocolate', 'white chocolate', 'kitkat', 'snickers', 'mars', 'bounty', 'twix',
    'snack', 'snacks', 'granola bar', 'energy bar', 'cereal bar', 'chips', 'crisps', 'pretzel', 'pretzels',
    'doritos', 'cheetos', 'popcorn', 'wafer', 'waffles', 'candy', 'candies', 'gummies', 'gum', 'chewing gum',
    'nuts', 'peanuts', 'almonds', 'cashews', 'pistachios', 'sunflower seeds', 'pumpkin seeds',
    'peanut butter', 'nutella', 'chocolate spread', 'halva', 'marshmallow', 'dates',
  ],

  '🥤 Drinks': [
    'מים', 'מים מינרליים', 'מים מוגזים', 'מים בטעמים', 'סודה', 'סודה סטרים',
    'מיץ', 'מיץ תפוזים', 'מיץ ענבים', 'מיץ תפוחים', 'לימונדה',
    'קולה', 'קוקה קולה', 'קוקה', 'פפסי', 'ספרייט', 'פאנטה', 'שוופס', 'טמפו', 'איסטי', 'איס טי', 'גזוז',
    'בירה', 'בירות', 'יין', 'יין אדום', 'יין לבן', 'שמפניה', 'קאווה', 'פרוסקו', 'וודקה', 'ויסקי', 'וויסקי',
    'ערק', 'רום', 'ג׳ין', "ג'ין", 'טקילה', 'ליקר',
    'תה', 'תה ירוק', 'תה שחור', 'תה צמחים', 'תה קמומיל', 'חליטה', 'קפה', 'קפה שחור', 'קפה נמס', 'נס קפה',
    'קפסולות קפה', 'אספרסו', 'קפוצינו',
    'משקה', 'משקאות', 'משקה אנרגיה', 'רד בול', 'מונסטר', 'אקסטרים', 'משקה ספורט', 'איזוטוני',
    'water', 'mineral water', 'sparkling water', 'soda water', 'flavored water', 'soda',
    'cola', 'coke', 'pepsi', 'sprite', 'fanta', 'schweppes', 'tempo', 'ice tea', 'iced tea',
    'juice', 'orange juice', 'grape juice', 'apple juice', 'lemonade',
    'beer', 'wine', 'red wine', 'white wine', 'champagne', 'cava', 'prosecco',
    'vodka', 'whiskey', 'whisky', 'rum', 'gin', 'tequila', 'liquor', 'arak',
    'tea', 'green tea', 'black tea', 'herbal tea', 'chamomile', 'coffee', 'black coffee', 'instant coffee',
    'nescafe', 'coffee capsules', 'espresso', 'cappuccino',
    'drink', 'drinks', 'beverage', 'beverages', 'energy drink', 'red bull', 'monster', 'sports drink', 'isotonic',
  ],

  '🧊 Frozen': [
    'גלידה', 'גלידות', 'ארטיק', 'שלגון', 'שלגונים', 'פירות קפואים', 'ירקות קפואים', 'אפונה קפואה',
    'פיצה קפואה', 'בורקס קפוא', 'בצק קפוא', 'בורגר קפוא', 'נגטס', 'נגטס עוף',
    'בורקס', 'מלאווח', 'ג׳חנון', "ג'חנון",
    'קפוא', 'קפואים', 'קפוא מראש',
    'ice cream', 'gelato', 'sorbet', 'popsicle', 'popsicles', 'ice pop',
    'frozen fruit', 'frozen vegetables', 'frozen peas',
    'frozen pizza', 'frozen burger', 'nuggets', 'chicken nuggets', 'frozen dough', 'frozen',
  ],
}

function stripNiqqud(s) {
  return s.replace(/[\u0591-\u05C7]/g, '')
}

function normalize(raw) {
  if (!raw) return ''
  let s = stripNiqqud(String(raw)).toLowerCase()
  // Strip geresh/gershayim/quotes/apostrophes
  s = s.replace(/[\u05F3\u05F4'"`]/g, '')
  // Replace basic punctuation with space
  s = s.replace(/[.,!?:;()\-_/]/g, ' ')
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

/**
 * Lazily-built maps:
 *   - exactIndex:    normalized phrase → category
 *   - tokenIndex:    normalized single-token → category
 *   - multiWordPhrases:  [normalizedPhrase, category][] for MULTI-WORD entries only,
 *                        sorted by length desc. Used as a conservative substring fallback.
 *
 * Why only multi-word? Single Hebrew words are often substrings of unrelated
 * words because Hebrew roots are typically 3 letters (e.g. "מצה" sits inside
 * "חומצה"). Restricting substring matches to phrases with a space avoids these
 * collisions while still catching things like "פיצה קפואה" or "Frozen pizza".
 */
let indices = null

function buildIndices() {
  const exactIndex = new Map()
  const tokenIndex = new Map()
  const multiWordPhrases = []

  for (const [category, words] of Object.entries(CATEGORY_DICTIONARY)) {
    for (const w of words) {
      const norm = normalize(w)
      if (!norm) continue
      if (!exactIndex.has(norm)) exactIndex.set(norm, category)
      const tokens = norm.split(' ')
      if (tokens.length === 1) {
        if (!tokenIndex.has(norm)) tokenIndex.set(norm, category)
      } else {
        multiWordPhrases.push([norm, category])
      }
    }
  }
  multiWordPhrases.sort((a, b) => b[0].length - a[0].length)
  return { exactIndex, tokenIndex, multiWordPhrases }
}

// Strip a single-letter Hebrew attached prefix (ה, ו, ב, ל, מ, ש, כ) if the
// rest of the word is still long enough to carry meaning.
const HEBREW_PREFIXES = ['ה', 'ו', 'ב', 'ל', 'מ', 'ש', 'כ']
function stripHebrewPrefix(token) {
  if (token.length < 4) return null
  const first = token[0]
  if (!HEBREW_PREFIXES.includes(first)) return null
  return token.slice(1)
}

const resultCache = new Map()

/**
 * Synchronous, local-only categorization.
 * Returns a category string (from CATEGORIES) or null if unknown.
 */
export function categorizeItem(rawName) {
  const name = normalize(rawName)
  if (!name) return null
  if (resultCache.has(name)) return resultCache.get(name)

  if (!indices) indices = buildIndices()
  const { exactIndex, tokenIndex, multiWordPhrases } = indices

  // 1. Exact match on the full normalized name
  if (exactIndex.has(name)) {
    const r = exactIndex.get(name)
    resultCache.set(name, r)
    return r
  }

  // 2. Multi-word phrase substring match (longest first). Only run BEFORE single
  // token matches so "Frozen pizza" beats "pizza"->Bakery.
  for (const [phrase, category] of multiWordPhrases) {
    if (name.includes(phrase)) {
      resultCache.set(name, category)
      return category
    }
  }

  // 3. Token match: any single whitespace-separated word in the name that's in
  // the token index. Also try stripping a single-letter Hebrew prefix.
  const tokens = name.split(' ').filter(Boolean)
  for (const t of tokens) {
    if (tokenIndex.has(t)) {
      const r = tokenIndex.get(t)
      resultCache.set(name, r)
      return r
    }
    const stripped = stripHebrewPrefix(t)
    if (stripped && tokenIndex.has(stripped)) {
      const r = tokenIndex.get(stripped)
      resultCache.set(name, r)
      return r
    }
  }

  resultCache.set(name, null)
  return null
}

// --- Phase 2: optional remote fallback ------------------------------------

let remoteCategorizer = null

/**
 * Register an async function that takes (itemName) and returns one of
 * CATEGORIES or null. Called only when the local dictionary has no answer.
 *
 * Example (to wire later):
 *   setRemoteCategorizer(async (name) => {
 *     const r = await fetch('/functions/v1/categorize-item', { ... })
 *     return (await r.json()).category
 *   })
 */
export function setRemoteCategorizer(fn) {
  remoteCategorizer = typeof fn === 'function' ? fn : null
}

/**
 * Local-first async categorization. Resolves quickly when the local dictionary
 * has a match; otherwise falls through to the registered remote categorizer
 * (if any). Never throws.
 */
export async function categorizeItemAsync(rawName, options = {}) {
  const local = categorizeItem(rawName)
  if (local) return local
  if (!remoteCategorizer) return null
  try {
    const result = await remoteCategorizer(rawName, options)
    if (typeof result === 'string' && CATEGORIES.includes(result)) {
      resultCache.set(normalize(rawName), result)
      return result
    }
  } catch {
    // Swallow — remote is best-effort.
  }
  return null
}

// Exported for tests / debugging only.
export const __internal = { normalize, stripHebrewPrefix, buildIndices }
