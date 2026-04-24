import { DateTime } from 'luxon'
import { describe, it, expect } from 'vitest'

import { expandRrule } from './rrule-expander'
import { type RRuleOptions } from './types'

/**
 * Helper function to collect all yielded DateTime objects from the expandRrule generator
 * into an array of ISO strings for easy comparison.
 * @param options - The RRuleOptions to pass to the expandRrule generator.
 * @returns An array of ISO 8601 formatted date-time strings.
 */
const expandToArray = (options: RRuleOptions): string[] => {
  const results: string[] = []
  // @ts-expect-error TS2802
  for (const dt of expandRrule(options)) {
    results.push(dt.toUTC().toISO())
  }
  return results
}

describe('expandRrule', () => {
  const rangeEnd = DateTime.fromISO('2030-01-01T00:00:00Z', { zone: 'utc' })

  describe('Basic Frequency and Limits', () => {
    it('should expand daily occurrences correctly respecting COUNT', () => {
      const options: RRuleOptions = {
        dtstart: DateTime.fromISO('2024-01-01T10:00:00Z', { zone: 'utc' }),
        rule: { freq: 'DAILY', count: 3 },
        rangeEnd,
      }
      const expected = ['2024-01-01T10:00:00.000Z', '2024-01-02T10:00:00.000Z', '2024-01-03T10:00:00.000Z']
      expect(expandToArray(options)).toEqual(expected)
    })

    it('should expand weekly occurrences correctly respecting UNTIL', () => {
      const options: RRuleOptions = {
        dtstart: DateTime.fromISO('2024-03-01T12:00:00Z', { zone: 'utc' }),
        rule: { freq: 'WEEKLY', until: DateTime.fromISO('2024-03-22T12:00:00Z', { zone: 'utc' }) },
        rangeEnd,
      }
      const expected = [
        '2024-03-01T12:00:00.000Z',
        '2024-03-08T12:00:00.000Z',
        '2024-03-15T12:00:00.000Z',
        '2024-03-22T12:00:00.000Z',
      ]
      expect(expandToArray(options)).toEqual(expected)
    })

    it('should expand monthly occurrences', () => {
      const options: RRuleOptions = {
        dtstart: DateTime.fromISO('2024-01-15T09:00:00Z', { zone: 'utc' }),
        rule: { freq: 'MONTHLY', count: 3 },
        rangeEnd,
      }
      const expected = ['2024-01-15T09:00:00.000Z', '2024-02-15T09:00:00.000Z', '2024-03-15T09:00:00.000Z']
      expect(expandToArray(options)).toEqual(expected)
    })

    it('should expand yearly occurrences', () => {
      const options: RRuleOptions = {
        dtstart: DateTime.fromISO('2024-03-10T11:00:00Z', { zone: 'utc' }),
        rule: { freq: 'YEARLY', count: 3 },
        rangeEnd,
      }
      const expected = ['2024-03-10T11:00:00.000Z', '2025-03-10T11:00:00.000Z', '2026-03-10T11:00:00.000Z']
      expect(expandToArray(options)).toEqual(expected)
    })
  })

  describe('INTERVAL modifier', () => {
    it('should respect INTERVAL for daily rules (every other day)', () => {
      const options: RRuleOptions = {
        dtstart: DateTime.fromISO('2024-02-01T10:00:00Z', { zone: 'utc' }),
        rule: { freq: 'DAILY', interval: 2, count: 4 },
        rangeEnd,
      }
      const expected = [
        '2024-02-01T10:00:00.000Z',
        '2024-02-03T10:00:00.000Z',
        '2024-02-05T10:00:00.000Z',
        '2024-02-07T10:00:00.000Z',
      ]
      expect(expandToArray(options)).toEqual(expected)
    })

    it('should respect INTERVAL for weekly rules (every 3 weeks)', () => {
      const options: RRuleOptions = {
        dtstart: DateTime.fromISO('2024-06-01T10:00:00Z', { zone: 'utc' }),
        rule: { freq: 'WEEKLY', interval: 3, count: 3 },
        rangeEnd,
      }
      const expected = [
        '2024-06-01T10:00:00.000Z', // Sat
        '2024-06-22T10:00:00.000Z', // Sat, 3 weeks later
        '2024-07-13T10:00:00.000Z', // Sat, 3 weeks later
      ]
      expect(expandToArray(options)).toEqual(expected)
    })
  })

  describe('BYxxx modifiers', () => {
    it('should handle BYDAY for weekly frequency', () => {
      const options: RRuleOptions = {
        dtstart: DateTime.fromISO('2024-07-01T10:00:00Z', { zone: 'utc' }), // Monday
        rule: { freq: 'WEEKLY', byday: [{ weekday: 'MO' }, { weekday: 'FR' }], count: 4 },
        rangeEnd,
      }
      const expected = [
        '2024-07-01T10:00:00.000Z', // Mon
        '2024-07-05T10:00:00.000Z', // Fri
        '2024-07-08T10:00:00.000Z', // Mon
        '2024-07-12T10:00:00.000Z', // Fri
      ]
      expect(expandToArray(options)).toEqual(expected)
    })

    it('should handle BYMONTHDAY for monthly frequency', () => {
      const options: RRuleOptions = {
        dtstart: DateTime.fromISO('2024-01-01T10:00:00Z', { zone: 'utc' }),
        rule: { freq: 'MONTHLY', bymonthday: [1, 15], count: 4 },
        rangeEnd,
      }
      const expected = [
        '2024-01-01T10:00:00.000Z',
        '2024-01-15T10:00:00.000Z',
        '2024-02-01T10:00:00.000Z',
        '2024-02-15T10:00:00.000Z',
      ]
      expect(expandToArray(options)).toEqual(expected)
    })

    it('should handle Nth BYDAY for monthly frequency (e.g., 2nd Sunday)', () => {
      const options: RRuleOptions = {
        dtstart: DateTime.fromISO('2024-01-14T10:00:00Z', { zone: 'utc' }), // 2nd Sunday of Jan 2024
        rule: { freq: 'MONTHLY', byday: [{ weekday: 'SU', n: 2 }], count: 3 },
        rangeEnd,
      }
      const expected = [
        '2024-01-14T10:00:00.000Z', // Jan
        '2024-02-11T10:00:00.000Z', // Feb
        '2024-03-10T10:00:00.000Z', // Mar
      ]
      expect(expandToArray(options)).toEqual(expected)
    })

    it('should handle negative Nth BYDAY (e.g., last Friday)', () => {
      const options: RRuleOptions = {
        dtstart: DateTime.fromISO('2024-05-31T18:00:00Z', { zone: 'utc' }), // Last Friday of May 2024
        rule: { freq: 'MONTHLY', byday: [{ weekday: 'FR', n: -1 }], count: 3 },
        rangeEnd,
      }
      const expected = [
        '2024-05-31T18:00:00.000Z', // May
        '2024-06-28T18:00:00.000Z', // June
        '2024-07-26T18:00:00.000Z', // July
      ]
      expect(expandToArray(options)).toEqual(expected)
    })

    it('should handle BYMONTH for yearly frequency', () => {
      const options: RRuleOptions = {
        dtstart: DateTime.fromISO('2024-03-15T10:00:00Z', { zone: 'utc' }),
        rule: { freq: 'YEARLY', bymonth: [5, 7], count: 4 },
        rangeEnd,
      }
      const expected = [
        '2024-05-15T10:00:00.000Z',
        '2024-07-15T10:00:00.000Z',
        '2025-05-15T10:00:00.000Z',
        '2025-07-15T10:00:00.000Z',
      ]
      expect(expandToArray(options)).toEqual(expected)
    })

    it('should correctly handle a complex DST-like rule (2nd Sunday in March)', () => {
      const options: RRuleOptions = {
        dtstart: DateTime.fromISO('2022-03-13T02:00:00', { zone: 'America/New_York' }), // 2nd Sun of Mar 2022
        rule: { freq: 'YEARLY', bymonth: [3], byday: [{ weekday: 'SU', n: 2 }], count: 3 },
        rangeEnd,
      }
      const expected = [
        '2022-03-13T07:00:00.000Z', // 2022
        '2023-03-12T07:00:00.000Z', // 2023
        '2024-03-10T07:00:00.000Z', // 2024
      ]
      expect(expandToArray(options)).toEqual(expected)
    })
  })

  describe('Edge Cases', () => {
    it('should yield nothing if COUNT is 0', () => {
      const options: RRuleOptions = {
        dtstart: DateTime.fromISO('2024-01-01T10:00:00Z', { zone: 'utc' }),
        rule: { freq: 'DAILY', count: 0 },
        rangeEnd,
      }
      expect(expandToArray(options)).toEqual([])
    })

    it('should yield only dtstart if COUNT is 1', () => {
      const options: RRuleOptions = {
        dtstart: DateTime.fromISO('2024-01-01T10:00:00Z', { zone: 'utc' }),
        rule: { freq: 'DAILY', count: 1 },
        rangeEnd,
      }
      expect(expandToArray(options)).toEqual(['2024-01-01T10:00:00.000Z'])
    })

    it('should yield nothing if UNTIL is before dtstart', () => {
      const options: RRuleOptions = {
        dtstart: DateTime.fromISO('2024-01-01T10:00:00Z', { zone: 'utc' }),
        rule: { freq: 'DAILY', until: DateTime.fromISO('2023-12-31T23:59:59Z', { zone: 'utc' }) },
        rangeEnd,
      }
      expect(expandToArray(options)).toEqual([])
    })

    it('should yield only dtstart if UNTIL is the same as dtstart', () => {
      const options: RRuleOptions = {
        dtstart: DateTime.fromISO('2024-01-01T10:00:00Z', { zone: 'utc' }),
        rule: { freq: 'DAILY', until: DateTime.fromISO('2024-01-01T10:00:00Z', { zone: 'utc' }) },
        rangeEnd,
      }
      expect(expandToArray(options)).toEqual(['2024-01-01T10:00:00.000Z'])
    })

    it('should stop generating dates after rangeEnd', () => {
      const options: RRuleOptions = {
        dtstart: DateTime.fromISO('2024-12-29T10:00:00Z', { zone: 'utc' }),
        rule: { freq: 'DAILY' }, // Potentially infinite rule
        rangeEnd: DateTime.fromISO('2025-01-02T00:00:00Z', { zone: 'utc' }),
      }
      const results = expandToArray(options)
      // Should include 29, 30, 31, and Jan 1, but not Jan 2.
      expect(results.length).toBe(4)
      expect(results).toContain('2025-01-01T10:00:00.000Z')
      expect(results).not.toContain('2025-01-02T10:00:00.000Z')
    })

    it('should preserve the timezone of dtstart', () => {
      const zone = 'America/New_York'
      const options: RRuleOptions = {
        dtstart: DateTime.fromISO('2024-11-02T10:00:00', { zone }), // Before DST change
        rule: { freq: 'DAILY', count: 3 },
        rangeEnd,
      }
      const results: DateTime[] = []
      // @ts-expect-error Iterating works
      for (const dt of expandRrule(options)) {
        results.push(dt)
      }

      expect(results.length).toBe(3)
      // Check that the zone name is preserved on all yielded dates
      results.forEach((dt) => expect(dt.zone.name).toBe(zone))

      // Check that the time and offset are correct across a DST transition
      expect(results[0].toISO()).toBe('2024-11-02T10:00:00.000-04:00') // EDT
      expect(results[1].toISO()).toBe('2024-11-03T10:00:00.000-05:00') // EST
      expect(results[2].toISO()).toBe('2024-11-04T10:00:00.000-05:00') // EST
    })

    it('should handle monthly rule starting on day 31 and crossing shorter months', () => {
      const options: RRuleOptions = {
        dtstart: DateTime.fromISO('2024-01-31T10:00:00Z', { zone: 'utc' }),
        rule: { freq: 'MONTHLY', count: 4 },
        rangeEnd,
      }
      const expected = [
        '2024-01-31T10:00:00.000Z',
        '2024-02-29T10:00:00.000Z', // Land on last day of Feb (leap year)
        '2024-03-31T10:00:00.000Z',
        '2024-04-30T10:00:00.000Z', // Land on last day of Apr
      ]
      expect(expandToArray(options)).toEqual(expected)
    })

    it('should skip invalid dates when using BYMONTHDAY (e.g., Feb 30)', () => {
      const options: RRuleOptions = {
        dtstart: DateTime.fromISO('2024-01-30T10:00:00Z', { zone: 'utc' }),
        rule: { freq: 'YEARLY', bymonth: [1, 2, 3], bymonthday: [30] },
        rangeEnd,
      }
      // Should generate Jan 30 and Mar 30, but skip Feb 30.
      const expected = [
        '2024-01-30T10:00:00.000Z',
        '2024-03-30T10:00:00.000Z',
        '2025-01-30T10:00:00.000Z',
        '2025-03-30T10:00:00.000Z',
      ]
      // Limit with UNTIL for a predictable test
      options.rule.until = DateTime.fromISO('2026-01-01T00:00:00Z', { zone: 'utc' })
      expect(expandToArray(options)).toEqual(expected)
    })
  })

  describe('BYWEEKNO modifier', () => {
    it('should expand yearly on a specific week and day (RFC Example)', () => {
      // Corresponds to RFC 5545 example: Monday of week number 20
      const options: RRuleOptions = {
        dtstart: DateTime.fromISO('1997-05-12T09:00:00Z', { zone: 'utc' }),
        rule: { freq: 'YEARLY', byweekno: [20], byday: [{ weekday: 'MO' }], count: 3 },
        rangeEnd,
      }
      const expected = [
        '1997-05-12T09:00:00.000Z', // Week 20 starts on Mon, May 12
        '1998-05-11T09:00:00.000Z', // Week 20 starts on Mon, May 11
        '1999-05-17T09:00:00.000Z', // Week 20 starts on Mon, May 17
      ]
      expect(expandToArray(options)).toEqual(expected)
    })

    it('should handle multiple BYWEEKNO and BYDAY values', () => {
      const options: RRuleOptions = {
        dtstart: DateTime.fromISO('2024-01-01T10:00:00Z', { zone: 'utc' }),
        rule: { freq: 'YEARLY', byweekno: [2, 10], byday: [{ weekday: 'TU' }, { weekday: 'TH' }], count: 5 },
        rangeEnd,
      }
      const expected = [
        '2024-01-09T10:00:00.000Z', // Year 2024, Week 2, Tuesday
        '2024-01-11T10:00:00.000Z', // Year 2024, Week 2, Thursday
        '2024-03-05T10:00:00.000Z', // Year 2024, Week 10, Tuesday
        '2024-03-07T10:00:00.000Z', // Year 2024, Week 10, Thursday
        '2025-01-07T10:00:00.000Z', // Year 2025, Week 2, Tuesday
      ]
      expect(expandToArray(options)).toEqual(expected)
    })

    it('should handle negative BYWEEKNO (e.g., last week of the year)', () => {
      const options: RRuleOptions = {
        dtstart: DateTime.fromISO('2024-01-01T08:00:00Z', { zone: 'utc' }),
        rule: { freq: 'YEARLY', byweekno: [-1], byday: [{ weekday: 'WE' }], count: 3 },
        rangeEnd,
      }
      const expected = [
        '2024-12-25T08:00:00.000Z', // Wednesday of the last week of 2024 (W52)
        '2025-12-24T08:00:00.000Z', // Wednesday of the last week of 2025 (W52)
        '2026-12-30T08:00:00.000Z', // Wednesday of the last week of 2026 (W53)
      ]
      expect(expandToArray(options)).toEqual(expected)
    })

    it('should correctly expand on week 53 in years that have it', () => {
      const options: RRuleOptions = {
        dtstart: DateTime.fromISO('2020-01-01T11:00:00Z', { zone: 'utc' }),
        rule: { freq: 'YEARLY', byweekno: [53], byday: [{ weekday: 'TU' }] },
        // Range includes 2020 (has W53) and 2026 (has W53)
        rangeEnd: DateTime.fromISO('2027-01-01T00:00:00Z', { zone: 'utc' }),
      }
      const expected = [
        '2020-12-29T11:00:00.000Z', // 2020 is a leap year starting on Wednesday, has 53 weeks.
        '2026-12-29T11:00:00.000Z', // 2026 starts on a Thursday, has 53 weeks.
      ]
      expect(expandToArray(options)).toEqual(expected)
    })

    it('should handle week 1 correctly when Jan 1 is late in the previous year week', () => {
      // In 2027, Jan 1-3 are part of week 53 of 2026. Week 1 of 2027 starts on Mon, Jan 4.
      const options: RRuleOptions = {
        dtstart: DateTime.fromISO('2027-01-01T14:00:00Z', { zone: 'utc' }),
        rule: { freq: 'YEARLY', byweekno: [1], byday: [{ weekday: 'MO' }], count: 1 },
        rangeEnd,
      }
      const expected = [
        '2027-01-04T14:00:00.000Z', // Monday of the first week of 2027.
      ]
      expect(expandToArray(options)).toEqual(expected)
    })

    it('should ignore BYWEEKNO when FREQ is not YEARLY', () => {
      const options: RRuleOptions = {
        dtstart: DateTime.fromISO('2024-05-13T10:00:00Z', { zone: 'utc' }), // A Monday in Week 20
        rule: { freq: 'MONTHLY', byweekno: [20], count: 3 },
        rangeEnd,
      }
      // BYWEEKNO should be ignored, and it should just be a simple monthly rule.
      const expected = ['2024-05-13T10:00:00.000Z', '2024-06-13T10:00:00.000Z', '2024-07-13T10:00:00.000Z']
      expect(expandToArray(options)).toEqual(expected)
    })

    it('should likely ignore WKST and use ISO 8601 week definition', () => {
      // With WKST=SU, week 1 of 2027 starts Sunday, Jan 3rd. The Sunday of that week is Jan 3rd.
      // With ISO standard (WKST=MO), week 1 of 2027 starts Monday, Jan 4th. The Sunday of that week is Jan 10th.
      // This test verifies that the ISO standard (used by Luxon) is followed, and WKST is ignored for week numbering.
      const options: RRuleOptions = {
        dtstart: DateTime.fromISO('2027-01-01T12:00:00Z', { zone: 'utc' }),
        rule: { freq: 'YEARLY', wkst: 'SU', byweekno: [1], byday: [{ weekday: 'SU' }], count: 1 },
        rangeEnd,
      }
      const expected = [
        '2027-01-10T12:00:00.000Z', // Sunday of ISO Week 1
      ]
      expect(expandToArray(options)).toEqual(expected)
    })
  })
})
