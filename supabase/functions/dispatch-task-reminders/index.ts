import { createClient } from 'npm:@supabase/supabase-js@2'

const TZ = 'Asia/Jerusalem'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
}

function todayStrJerusalem(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function hmJerusalem(now: Date): { h: number; m: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '0'
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '0'
  return { h: parseInt(hour, 10), m: parseInt(minute, 10) }
}

function parseReminderTime(t: string | null): { h: number; m: number } | null {
  if (!t) return null
  const p = String(t).trim().split(':')
  if (p.length < 2) return null
  return { h: parseInt(p[0], 10) || 0, m: parseInt(p[1], 10) || 0 }
}

function minutesSinceMidnight(h: number, m: number): number {
  return h * 60 + m
}

function parseDate(s: string): Date {
  return new Date(s + 'T12:00:00')
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

function isRecurrenceDueToday(
  dueDate: string,
  today: string,
  recurrence: string | null,
  interval: number,
  weekday: number | null,
): boolean {
  if (dueDate === today) return true
  if (!recurrence || recurrence === 'none') return false

  const due = parseDate(dueDate)
  const now = parseDate(today)
  if (now < due) return false

  const diff = daysBetween(due, now)

  switch (recurrence) {
    case 'daily':
      return diff % Math.max(1, interval) === 0
    case 'weekly':
      if (weekday != null && weekday >= 0 && weekday <= 6)
        return now.getDay() === weekday
      return diff % (7 * Math.max(1, interval)) === 0
    case 'monthly': {
      if (now.getDate() !== due.getDate()) return false
      const monthDiff =
        (now.getFullYear() - due.getFullYear()) * 12 +
        (now.getMonth() - due.getMonth())
      return monthDiff > 0 && monthDiff % Math.max(1, interval) === 0
    }
    case 'yearly': {
      if (now.getDate() !== due.getDate() || now.getMonth() !== due.getMonth())
        return false
      const yearDiff = now.getFullYear() - due.getFullYear()
      return yearDiff > 0 && yearDiff % Math.max(1, interval) === 0
    }
    case 'custom':
      return diff % Math.max(1, interval) === 0
    default:
      return false
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const supabase = createClient(supabaseUrl, serviceKey)
  const now = new Date()
  const today = todayStrJerusalem(now)
  const { h: curH, m: curM } = hmJerusalem(now)
  const curMinutes = minutesSinceMidnight(curH, curM)

  console.log(`[dispatch] start — ${today} ${String(curH).padStart(2, '0')}:${String(curM).padStart(2, '0')} (${curMinutes} min)`)

  try {
    const { data: tasks, error: tasksErr } = await supabase
      .from('tasks')
      .select('id, household_id, title, assigned_to, due_date, reminder_time, reminder_enabled, done, recurrence, recurrence_interval, recurrence_weekday')
      .eq('reminder_enabled', true)
      .eq('done', false)
      .not('reminder_time', 'is', null)
      .not('due_date', 'is', null)
      .lte('due_date', today)

    if (tasksErr) throw tasksErr
    console.log(`[dispatch] tasks with reminders (due_date <= today): ${tasks?.length ?? 0}`)

    const { data: sentRows } = await supabase
      .from('task_reminder_sent')
      .select('task_id, reminder_time')
      .eq('fire_date', today)

    // Dedup key = "task_id|reminder_time" so a changed reminder hour fires again
    const already = new Set((sentRows ?? []).map((r) => `${r.task_id}|${r.reminder_time}`))
    console.log(`[dispatch] already sent today: ${already.size}`)

    type TaskRow = typeof tasks extends (infer T)[] | null ? T : never
    const debugRows: { id: string; title: string; due_date: string; recurrence: string; reminder_time: string; skip?: string }[] = []

    const candidates = (tasks ?? []).filter((task) => {
      const dueToday = isRecurrenceDueToday(
        task.due_date as string,
        today,
        task.recurrence as string | null,
        (task.recurrence_interval as number) || 1,
        task.recurrence_weekday as number | null,
      )
      if (!dueToday) {
        debugRows.push({ id: task.id as string, title: task.title as string, due_date: task.due_date as string, recurrence: (task.recurrence as string) || 'none', reminder_time: task.reminder_time as string, skip: `not_due_today (due=${task.due_date}, rec=${task.recurrence}, interval=${task.recurrence_interval}, weekday=${task.recurrence_weekday})` })
        return false
      }
      const rt = parseReminderTime(task.reminder_time as string)
      if (!rt) {
        debugRows.push({ id: task.id as string, title: task.title as string, due_date: task.due_date as string, recurrence: (task.recurrence as string) || 'none', reminder_time: task.reminder_time as string, skip: 'unparseable_reminder_time' })
        return false
      }
      const reminderMinutes = minutesSinceMidnight(rt.h, rt.m)
      if (reminderMinutes > curMinutes) {
        debugRows.push({ id: task.id as string, title: task.title as string, due_date: task.due_date as string, recurrence: (task.recurrence as string) || 'none', reminder_time: task.reminder_time as string, skip: `reminder_not_yet (reminder=${task.reminder_time} = ${reminderMinutes}min, now=${curMinutes}min)` })
        return false
      }
      if (already.has(`${task.id}|${task.reminder_time}`)) {
        debugRows.push({ id: task.id as string, title: task.title as string, due_date: task.due_date as string, recurrence: (task.recurrence as string) || 'none', reminder_time: task.reminder_time as string, skip: 'already_sent_today' })
        return false
      }
      debugRows.push({ id: task.id as string, title: task.title as string, due_date: task.due_date as string, recurrence: (task.recurrence as string) || 'none', reminder_time: task.reminder_time as string })
      return true
    })

    console.log(`[dispatch] candidates to fire: ${candidates.length}`)
    console.log(`[dispatch] per-task debug:\n${JSON.stringify(debugRows, null, 2)}`)

    if (candidates.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          date: today,
          time: `${String(curH).padStart(2, '0')}:${String(curM).padStart(2, '0')}`,
          curMinutes,
          dispatched: 0,
          totalTasks: tasks?.length ?? 0,
          alreadySent: already.size,
          debug: debugRows,
        }),
        { headers: { ...cors, 'Content-Type': 'application/json' } },
      )
    }

    const householdIds = [...new Set(candidates.map((t) => t.household_id))]
    const { data: allMembers, error: memErr } = await supabase
      .from('household_members')
      .select('household_id, user_id')
      .in('household_id', householdIds)

    if (memErr) throw memErr

    const membersByHouse = new Map<string, string[]>()
    for (const m of allMembers ?? []) {
      const hid = m.household_id as string
      const uid = m.user_id as string
      if (!membersByHouse.has(hid)) membersByHouse.set(hid, [])
      membersByHouse.get(hid)!.push(uid)
    }

    const allUserIds = [...new Set((allMembers ?? []).map((m) => m.user_id as string))]
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('user_id, endpoint')
      .in('user_id', allUserIds)
    console.log(`[dispatch] push subscriptions found for relevant users: ${subs?.length ?? 0}`)

    let dispatched = 0
    const errors: string[] = []

    for (const task of candidates) {
      try {
        const memberIds = membersByHouse.get(task.household_id) ?? []
        const a = task.assigned_to as string | null
        let onlyUserIds: string[]

        if (a && a.startsWith('[')) {
          try {
            const parsed = JSON.parse(a)
            onlyUserIds = Array.isArray(parsed) ? parsed : memberIds
          } catch {
            onlyUserIds = memberIds
          }
        } else if (a && UUID_RE.test(a)) {
          onlyUserIds = [a]
        } else {
          onlyUserIds = memberIds
        }

        if (onlyUserIds.length === 0) {
          await supabase.from('task_reminder_sent').insert({ task_id: task.id, fire_date: today, reminder_time: task.reminder_time })
          continue
        }

        console.log(`[dispatch] task ${task.id} "${task.title}" → sending to ${onlyUserIds.length} user(s)`)

        const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Use service key (valid JWT) — send-push has verify_jwt:true
            // anonKey may be sb_publishable_* format which fails JWT verification
            Authorization: `Bearer ${serviceKey}`,
            apikey: anonKey,
          },
          body: JSON.stringify({
            household_id: task.household_id,
            only_user_ids: onlyUserIds,
            title: '📋 תזכורת למשימה',
            body: task.title as string,
            url: '/tasks',
            category: 'tasks',
          }),
        })

        const pushBody = await pushRes.text()
        console.log(`[dispatch] send-push response: ${pushRes.status} — ${pushBody}`)

        if (!pushRes.ok) {
          errors.push(`${task.id}: HTTP ${pushRes.status} ${pushBody}`)
          continue
        }

        const { error: insErr } = await supabase.from('task_reminder_sent').insert({
          task_id: task.id,
          fire_date: today,
          reminder_time: task.reminder_time,
        })

        if (insErr) {
          if (insErr.code === '23505') {
            dispatched += 1
            continue
          }
          errors.push(`${task.id}: dedup ${insErr.message}`)
          continue
        }

        dispatched += 1
      } catch (taskErr) {
        const msg = taskErr instanceof Error ? taskErr.message : String(taskErr)
        errors.push(`${task.id}: ${msg}`)
        console.error(`[dispatch] task ${task.id} error: ${msg}`)
      }
    }

    console.log(`[dispatch] done — dispatched: ${dispatched}, errors: ${errors.length}`)

    return new Response(
      JSON.stringify({
        ok: true,
        date: today,
        time: `${String(curH).padStart(2, '0')}:${String(curM).padStart(2, '0')}`,
        curMinutes,
        dispatched,
        subscriptionsFound: subs?.length ?? 0,
        errors: errors.length ? errors : undefined,
        debug: debugRows,
      }),
      { headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[dispatch] fatal error: ${msg}`)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
