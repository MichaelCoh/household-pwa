// Phase 2: AI fallback for shopping item categorization.
//
// Called by the PWA ONLY when the local dictionary in src/lib/categorize.js
// returns null. Flow:
//   1. Check shopping_item_categories cache in Postgres.
//   2. On miss, ask Groq (llama-3.1-8b-instant) to classify into one of the
//      10 app categories.
//   3. Persist the answer to cache so the same item is never re-queried.
//
// Required Edge Function secrets:
//   GROQ_API_KEY                    — from https://console.groq.com
//   SUPABASE_URL                    — auto-provided by Supabase
//   SUPABASE_SERVICE_ROLE_KEY       — auto-provided by Supabase

import { createClient } from 'npm:@supabase/supabase-js@2'

const CATEGORIES = [
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
] as const

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
}

function stripNiqqud(s: string): string {
  return s.replace(/[\u0591-\u05C7]/g, '')
}

function normalize(raw: string): string {
  if (!raw) return ''
  let s = stripNiqqud(String(raw)).toLowerCase()
  s = s.replace(/[\u05F3\u05F4'"`]/g, '')
  s = s.replace(/[.,!?:;()\-_/]/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

const SYSTEM_PROMPT = `You classify a household shopping item into EXACTLY ONE category.
The item may be in Hebrew, English, or mixed Hebrew-English.
Respond with a SINGLE JSON object: {"category": "<one of the listed strings>"}.
No prose, no explanation, no markdown — JSON only.

Allowed categories (copy the emoji + label EXACTLY, including the space between):
🥦 Produce — fresh fruits, vegetables, herbs, mushrooms
🥩 Meat & Fish — raw/fresh meat, poultry, fish, seafood, cold cuts
🥛 Dairy — milk, cheese, yogurt, cream, butter, eggs, plant milks
🍞 Bakery — bread, buns, pastries, cookies, cakes, dough, pizza (non-frozen)
🧴 Hygiene — soap, shampoo, toothpaste, diapers, cosmetics, OTC drugs
🧹 Cleaning — detergents, bleach, sponges, trash bags, disposables
🍿 Snacks — chocolate, candy, chips, nuts, spreads
🥤 Drinks — water, soda, juice, beer, wine, spirits, coffee, tea
🧊 Frozen — anything explicitly frozen (ice cream, frozen pizza/veg)
❓ General — ambiguous, generic, or not a typical shopping item

Rules:
- Prefer the most specific category. "frozen pizza" is Frozen, not Bakery.
- Use "❓ General" for non-food/non-household items or genuinely ambiguous words.`

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const groqKey = Deno.env.get('GROQ_API_KEY')

  let body: { name?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid json' }, 400)
  }

  const name = String(body?.name ?? '').trim()
  if (!name) return json({ error: 'empty name' }, 400)
  if (name.length > 100) return json({ error: 'name too long' }, 400)

  const normalized = normalize(name)
  if (!normalized) return json({ category: null })

  const supabase = createClient(supabaseUrl, serviceKey)

  // 1. Cache lookup
  const { data: cached } = await supabase
    .from('shopping_item_categories')
    .select('category')
    .eq('normalized_name', normalized)
    .maybeSingle()

  if (cached?.category && (CATEGORIES as readonly string[]).includes(cached.category)) {
    return json({ category: cached.category, source: 'cache' })
  }

  // 2. Groq fallback
  if (!groqKey) {
    console.error('[categorize-item] GROQ_API_KEY not set')
    return json({ category: null, error: 'GROQ_API_KEY not set' }, 503)
  }

  let parsedCategory: string | null = null
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        temperature: 0,
        max_tokens: 40,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Item: ${name}` },
        ],
      }),
    })

    if (!groqRes.ok) {
      const errText = await groqRes.text()
      console.error(`[categorize-item] groq ${groqRes.status}: ${errText}`)
      return json({ category: null, error: `groq ${groqRes.status}` }, 502)
    }

    const groqJson = await groqRes.json()
    const content = groqJson?.choices?.[0]?.message?.content ?? ''
    try {
      const obj = JSON.parse(content)
      if (typeof obj?.category === 'string' && (CATEGORIES as readonly string[]).includes(obj.category)) {
        parsedCategory = obj.category
      }
    } catch {
      console.warn('[categorize-item] unparseable groq response:', content)
    }
  } catch (e) {
    console.error('[categorize-item] groq fetch failed', e)
    return json({ category: null, error: 'groq fetch failed' }, 502)
  }

  if (!parsedCategory) return json({ category: null })

  // 3. Persist
  const { error: upsertErr } = await supabase
    .from('shopping_item_categories')
    .upsert({
      normalized_name: normalized,
      category: parsedCategory,
      source: 'groq',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'normalized_name' })
  if (upsertErr) console.error('[categorize-item] cache upsert failed', upsertErr.message)

  return json({ category: parsedCategory, source: 'groq' })
})
