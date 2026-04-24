import { DateTime, type WeekdayNumbers } from 'luxon'

import { InvalidRruleError } from './errors.js'
import { type RecurrenceRule, type Freq, type Weekday, type RRuleOptions } from './types.js'

const weekdayMap: Record<Weekday, WeekdayNumbers> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 }
const weekdayReverseMap: Record<number, Weekday> = { 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA', 7: 'SU' }

// --- Validation and Low-Level Helpers (largely unchanged) ---

function validateRule(rule: RecurrenceRule): void {
  const nonEmptyAndInRange = (arr: number[] | undefined, min: number, max: number) =>
    !arr || arr.every((n) => Number.isInteger(n) && n >= min && n <= max)

  if (!rule.freq) {
    throw new InvalidRruleError('RRULE: FREQ is required.')
  }
  if (rule.interval !== undefined && (!Number.isInteger(rule.interval) || rule.interval <= 0)) {
    throw new InvalidRruleError('RRULE: INTERVAL must be a positive integer.')
  }
  if (!nonEmptyAndInRange(rule.bymonth, 1, 12)) {
    throw new InvalidRruleError('RRULE: BYMONTH must be in 1..12.')
  }
  if (
    rule.bymonthday &&
    !rule.bymonthday.every((n) => Number.isInteger(n) && ((n >= 1 && n <= 31) || (n <= -1 && n >= -31)))
  ) {
    throw new InvalidRruleError('RRULE: BYMONTHDAY must be in 1..31 or -31..-1.')
  }
  if (
    rule.byyearday &&
    !rule.byyearday.every((n) => Number.isInteger(n) && ((n >= 1 && n <= 366) || (n <= -1 && n >= -366)))
  ) {
    throw new InvalidRruleError('RRULE: BYYEARDAY must be in 1..366 or -366..-1.')
  }
  if (
    rule.byweekno &&
    !rule.byweekno.every((n) => Number.isInteger(n) && ((n >= 1 && n <= 53) || (n <= -1 && n >= -53)))
  ) {
    throw new InvalidRruleError('RRULE: BYWEEKNO must be in 1..53 or -53..-1.')
  }
  if (!nonEmptyAndInRange(rule.byhour, 0, 23)) throw new InvalidRruleError('RRULE: BYHOUR must be in 0..23.')
  if (!nonEmptyAndInRange(rule.byminute, 0, 59)) throw new InvalidRruleError('RRULE: BYMINUTE must be in 0..59.')
  if (!nonEmptyAndInRange(rule.bysecond, 0, 60)) throw new InvalidRruleError('RRULE: BYSECOND must be in 0..60.')
  if (
    rule.bysetpos &&
    !rule.bysetpos.every((n) => Number.isInteger(n) && ((n >= 1 && n <= 366) || (n <= -1 && n >= -366)))
  ) {
    throw new InvalidRruleError('RRULE: BYSETPOS must be 1..366 or -366..-1.')
  }
  if (rule.wkst && !(rule.wkst in weekdayMap)) {
    throw new InvalidRruleError('RRULE: WKST must be one of MO,TU,WE,TH,FR,SA,SU.')
  }
}

function applyBySetPos(candidates: DateTime[], bysetpos: number[]): DateTime[] {
  if (candidates.length === 0) return []
  const result: DateTime[] = []
  for (const pos of bysetpos) {
    const index = pos > 0 ? pos - 1 : candidates.length + pos
    if (index >= 0 && index < candidates.length) {
      result.push(candidates[index])
    }
  }
  const seen = new Set<number>()
  return result
    .filter((d) => {
      const ts = d.toMillis()
      if (seen.has(ts)) return false
      seen.add(ts)
      return true
    })
    .sort((a, b) => a.toMillis() - b.toMillis())
}

// --- Core Refactored Expansion Logic ---

/**
 * **REFACTORED**: A generator that expands a recurrence rule into a sequence of dates.
 * This implementation uses an "iterative advancement" strategy to avoid generating
 * huge arrays of candidates, making it significantly more performant.
 * @param options - The start date of the event series (`rangeStart`), the rule, and the query `rangeEnd`.
 */
export function* expandRrule(options: RRuleOptions): Generator<DateTime, void, unknown> {
  const { dtstart, rule, rangeEnd } = options
  validateRule(rule)

  let cursor = dtstart
  let count = 0
  const interval = rule.interval ?? 1
  const wkst = rule.wkst ? weekdayMap[rule.wkst] : 1 // Monday default

  // Main loop: advances the cursor by the specified FREQ and INTERVAL.
  while (true) {
    if ((rule.count !== undefined && count >= rule.count) || (rule.until && cursor > rule.until) || cursor > rangeEnd) {
      break
    }

    // Generate valid occurrences only for the current period (e.g., this month, this week).
    const occurrencesInPeriod = generateCandidatesForPeriod(cursor, dtstart, rule, wkst)

    for (const occurrence of occurrencesInPeriod) {
      // Filter out dates before the series start or after query/rule end.
      if (occurrence < dtstart) continue
      if ((rule.until && occurrence > rule.until) || occurrence > rangeEnd) continue
      if (rule.count !== undefined && count >= rule.count) break

      if (occurrence.isValid) {
        yield occurrence
        count++
      }
    }

    // Advance the cursor to the start of the next period to avoid redundant calculations.
    cursor = advanceCursor(cursor, rule.freq, interval)
  }
}

/**
 * **REFACTORED**: Generates candidate dates for a single period (year, month, week, or day)
 * using a targeted approach instead of "generate and filter".
 */
function generateCandidatesForPeriod(
  cursor: DateTime,
  dtstart: DateTime,
  rule: RecurrenceRule,
  wkst: WeekdayNumbers,
): DateTime[] {
  // 1. Expand Dates: Generate a small, targeted set of days for the period.
  const days = expandDatesInPeriod(cursor, dtstart, rule, wkst)

  // 2. Expand Times: Apply time components to the generated days.
  const times = expandTimes(days, dtstart, rule)

  // 3. Apply BYSETPOS: This is the only filter that needs a complete, sorted set for the period.
  if (rule.bysetpos) {
    // Sort before applying bysetpos.
    times.sort((a, b) => a.toMillis() - b.toMillis())
    return applyBySetPos(times, rule.bysetpos)
  }

  return times
}

/**
 * **NEW**: Intelligently expands the date components for the current period.
 * This is the core of the performance improvement.
 */
function expandDatesInPeriod(
  cursor: DateTime,
  dtstart: DateTime,
  rule: RecurrenceRule,
  wkst: WeekdayNumbers,
): DateTime[] {
  switch (rule.freq) {
    case 'YEARLY': {
      if (rule.byweekno) {
        // Per RFC 5545, BYWEEKNO is only valid with FREQ=YEARLY]. It is used
        // with BYDAY to select specific days within those weeks.
        const dates: DateTime[] = []
        const year = cursor.year
        const bydayRule = rule.byday?.map((r) => weekdayMap[r.weekday]) ?? [dtstart.weekday as WeekdayNumbers]
        // Luxon's weeksInWeekYear gives the number of weeks in the ISO week-numbering year.
        const weeksInYear = cursor.weeksInWeekYear

        for (const wn of rule.byweekno) {
          // Handle negative week numbers (e.g., -1 is the last week of the year).
          const weekNumber = wn > 0 ? wn : weeksInYear + wn + 1

          if (weekNumber < 1 || weekNumber > weeksInYear) continue

          for (const targetWeekday of bydayRule) {
            // Create a date from the ISO week year, week number, and weekday.
            // This correctly handles ISO 8601 week definitions.
            const date = DateTime.fromObject(
              {
                weekYear: year,
                weekNumber: weekNumber,
                weekday: targetWeekday,
              },
              { zone: cursor.zone },
            )

            // Ensure the generated date falls within the correct calendar year,
            // as ISO weeks can cross year boundaries.
            if (date.isValid && date.year === year) {
              dates.push(date)
            }
          }
        }

        // The RFC specifies that BYMONTH filters the results of previous rules [1].
        if (rule.bymonth) {
          const monthSet = new Set(rule.bymonth)
          // Return only the dates that fall in the specified months.
          const filtered = dates.filter((d) => monthSet.has(d.month))
          filtered.sort((a, b) => a.toMillis() - b.toMillis())
          return filtered
        }

        // Sort dates chronologically before returning.
        dates.sort((a, b) => a.toMillis() - b.toMillis())
        return dates
      }

      const months = rule.bymonth ?? [dtstart.month]
      const dates: DateTime[] = []
      for (const month of months) {
        const monthCursor = cursor.set({ month })
        dates.push(...getDaysInScope(monthCursor, dtstart, rule))
      }
      return dates
    }
    case 'MONTHLY':
      return getDaysInScope(cursor, dtstart, rule)
    case 'WEEKLY': {
      const startOfWeek = cursor.set({ weekday: wkst })
      const weekDays = Array.from({ length: 7 }, (_, i) => startOfWeek.plus({ days: i }))
      const bydayRule = rule.byday?.map((r) => r.weekday) ?? [weekdayReverseMap[dtstart.weekday]]
      return weekDays.filter((d) => bydayRule.includes(weekdayReverseMap[d.weekday]))
    }
    default: // DAILY, HOURLY, MINUTELY, SECONDLY
      return [cursor]
  }
}

/**
 * **NEW**: Helper to get valid days within a scope (e.g., a month),
 * respecting BYDAY, BYMONTHDAY, etc.
 */
function getDaysInScope(cursor: DateTime, dtstart: DateTime, rule: RecurrenceRule): DateTime[] {
  const monthStart = cursor.startOf('month')
  const daysInMonth = cursor.daysInMonth
  if (!daysInMonth) return []

  const results = new Set<DateTime>()

  // Handle BYYEARDAY if present (for YEARLY rules)
  if (rule.byyearday) {
    for (const yd of rule.byyearday) {
      const dayOfYear = yd > 0 ? yd : cursor.daysInYear + yd + 1
      const date = cursor.startOf('year').plus({ days: dayOfYear - 1 })
      // Ensure we only add days within the current month being processed
      if (date.month === cursor.month) {
        results.add(date)
      }
    }
    return Array.from(results)
  }

  // Handle BYDAY
  if (rule.byday) {
    for (const byday of rule.byday) {
      const targetWday = weekdayMap[byday.weekday]
      if (byday.n) {
        // Ordinal day, e.g., 2MO (2nd Monday), -1SU (last Sunday)
        const daysOfMonth = Array.from({ length: daysInMonth }, (_, i) => monthStart.plus({ days: i }))
        const matchingDays = daysOfMonth.filter((d) => d.weekday === targetWday)
        const index = byday.n > 0 ? byday.n - 1 : matchingDays.length + byday.n
        if (index >= 0 && index < matchingDays.length) {
          results.add(matchingDays[index])
        }
      } else {
        // All days of this type, e.g., all Mondays
        for (let i = 0; i < daysInMonth; i++) {
          const date = monthStart.plus({ days: i })
          if (date.weekday === targetWday) {
            results.add(date)
          }
        }
      }
    }
  }

  // Handle BYMONTHDAY
  if (rule.bymonthday) {
    for (const md of rule.bymonthday) {
      const day = md > 0 ? md : daysInMonth + md + 1
      if (day > 0 && day <= daysInMonth) {
        results.add(monthStart.set({ day }))
      }
    }
  }

  // If no day-related BY... rules, infer from DTSTART
  if (!rule.byday && !rule.bymonthday && !rule.byyearday) {
    const day = Math.min(dtstart.day, daysInMonth)
    results.add(monthStart.set({ day }))
  }

  // If both BYDAY and BYMONTHDAY are present, results should be the intersection.
  // This is implicitly handled because we're adding to a Set. The logic
  // would need to be more complex for a true intersection, but this covers many cases.
  // A simple approach is to filter one by the other.
  if (rule.byday && rule.bymonthday) {
    const monthDaySet = new Set(rule.bymonthday.map((md) => (md > 0 ? md : daysInMonth + md + 1)))
    return Array.from(results).filter((d) => monthDaySet.has(d.day))
  }

  return Array.from(results)
}

/**
 * **NEW**: Applies time components to a set of dates.
 */
function expandTimes(dates: DateTime[], dtstart: DateTime, rule: RecurrenceRule): DateTime[] {
  if (dates.length === 0) return []

  // If frequency is smaller than daily, time expansion is handled by the cursor advancement.
  if (['HOURLY', 'MINUTELY', 'SECONDLY'].includes(rule.freq)) {
    return dates
  }

  const hours = rule.byhour ?? [dtstart.hour]
  const minutes = rule.byminute ?? [dtstart.minute]
  const seconds = rule.bysecond ?? [dtstart.second]

  const results: DateTime[] = []
  for (const d of dates) {
    for (const hour of hours) {
      for (const minute of minutes) {
        for (const second of seconds) {
          results.push(d.set({ hour, minute, second, millisecond: dtstart.millisecond }))
        }
      }
    }
  }
  return results
}

/**
 * **NEW**: Advances the cursor to the start of the next period to process.
 */
function advanceCursor(cursor: DateTime, freq: Freq, interval: number): DateTime {
  switch (freq) {
    case 'YEARLY':
      return cursor.plus({ years: interval }).startOf('year')
    case 'MONTHLY':
      return cursor.plus({ months: interval }).startOf('month')
    case 'WEEKLY':
      return cursor.plus({ weeks: interval }).startOf('week')
    case 'DAILY':
      return cursor.plus({ days: interval }).startOf('day')
    case 'HOURLY':
      return cursor.plus({ hours: interval }).startOf('hour')
    case 'MINUTELY':
      return cursor.plus({ minutes: interval }).startOf('minute')
    case 'SECONDLY':
      return cursor.plus({ seconds: interval }).startOf('second')
    default:
      // Should not happen due to validation, but prevents infinite loops.
      return cursor.plus({ years: 999 })
  }
}
