import { describe, it, expect } from 'vitest'

import { InvalidRruleError } from './errors.js'
import {
  parseString,
  parseInteger,
  parseCategories,
  parseGeo,
  parseCalAddress,
  parseIcsDateTime,
  parseOffset,
  parseDateTimeList,
  parseRruleString,
} from './property-parsers.js'
import { type IcsProperty, type Geo, type CalAddress, type RecurrenceRule } from './types.js'

describe('property-parsers', () => {
  describe('parseString', () => {
    it('should return the string value of a property', () => {
      const prop: IcsProperty = { key: 'SUMMARY', value: 'Test Event', params: {} }
      expect(parseString(prop)).toBe('Test Event')
    })

    it('should return undefined for an undefined property', () => {
      expect(parseString(undefined)).toBeUndefined()
    })

    it('should return an empty string if the value is empty', () => {
      const prop: IcsProperty = { key: 'DESCRIPTION', value: '', params: {} }
      expect(parseString(prop)).toBe('')
    })
  })

  describe('parseInteger', () => {
    it('should parse a valid integer string', () => {
      const prop: IcsProperty = { key: 'PRIORITY', value: '5', params: {} }
      expect(parseInteger(prop)).toBe(5)
    })

    it('should return undefined for a non-numeric string', () => {
      const prop: IcsProperty = { key: 'PRIORITY', value: 'high', params: {} }
      expect(parseInteger(prop)).toBeUndefined()
    })

    it('should return undefined for an undefined property', () => {
      expect(parseInteger(undefined)).toBeUndefined()
    })

    it('should parse a negative integer string', () => {
      const prop: IcsProperty = { key: 'SEQUENCE', value: '-1', params: {} }
      expect(parseInteger(prop)).toBe(-1)
    })
  })

  describe('parseCategories', () => {
    it('should return an empty array for no properties', () => {
      expect(parseCategories([])).toEqual([])
    })

    it('should parse a single category from a single property', () => {
      const props: IcsProperty[] = [{ key: 'CATEGORIES', value: 'BUSINESS', params: {} }]
      expect(parseCategories(props)).toEqual(['BUSINESS'])
    })

    it('should parse multiple comma-separated categories from a single property', () => {
      const props: IcsProperty[] = [{ key: 'CATEGORIES', value: 'BUSINESS,HUMAN RESOURCES', params: {} }]
      expect(parseCategories(props)).toEqual(['BUSINESS', 'HUMAN RESOURCES'])
    })

    it('should parse categories from multiple properties and combine them', () => {
      const props: IcsProperty[] = [
        { key: 'CATEGORIES', value: 'PERSONAL,SPECIAL OCCASION', params: {} },
        { key: 'CATEGORIES', value: 'ANNIVERSARY', params: {} },
      ]
      expect(parseCategories(props)).toEqual(['PERSONAL', 'SPECIAL OCCASION', 'ANNIVERSARY'])
    })

    it('should handle and filter out empty or whitespace-only values', () => {
      const props: IcsProperty[] = [{ key: 'CATEGORIES', value: 'BUSINESS,,GARDENING, ', params: {} }]
      expect(parseCategories(props)).toEqual(['BUSINESS', 'GARDENING'])
    })
  })

  describe('parseGeo', () => {
    it('should parse a valid geo property', () => {
      const prop: IcsProperty = { key: 'GEO', value: '37.386013;-122.082932', params: {} }
      const expected: Geo = { lat: 37.386013, lon: -122.082932 }
      expect(parseGeo(prop)).toEqual(expected)
    })

    it('should return undefined for an invalid format (e.g., comma separator)', () => {
      const prop: IcsProperty = { key: 'GEO', value: '37.386013,-122.082932', params: {} }
      expect(parseGeo(prop)).toBeUndefined()
    })

    it('should return undefined if parts are not numbers', () => {
      const prop: IcsProperty = { key: 'GEO', value: 'latitude;longitude', params: {} }
      expect(parseGeo(prop)).toBeUndefined()
    })

    it('should return undefined for an undefined property', () => {
      expect(parseGeo(undefined)).toBeUndefined()
    })
  })

  describe('parseCalAddress', () => {
    it('should parse a simple mailto address', () => {
      const prop: IcsProperty = { key: 'ATTENDEE', value: 'mailto:jane.doe@example.com', params: {} }
      const expected: CalAddress = { email: 'jane.doe@example.com' }
      expect(parseCalAddress(prop)).toEqual(expected)
    })

    it('should parse an address with a common name parameter', () => {
      const prop: IcsProperty = {
        key: 'ORGANIZER',
        value: 'mailto:john.doe@example.com',
        params: { CN: 'John Doe' },
      }
      const expected: CalAddress = { email: 'john.doe@example.com', commonName: 'John Doe' }
      expect(parseCalAddress(prop)).toEqual(expected)
    })

    it('should parse an address with multiple parameters like PARTSTAT and ROLE', () => {
      const prop: IcsProperty = {
        key: 'ATTENDEE',
        value: 'mailto:employee@example.com',
        params: {
          CN: 'Employee',
          PARTSTAT: 'ACCEPTED',
          ROLE: 'REQ-PARTICIPANT',
        },
      }
      const expected: CalAddress = {
        email: 'employee@example.com',
        commonName: 'Employee',
        partstat: 'ACCEPTED',
        role: 'REQ-PARTICIPANT',
      }
      expect(parseCalAddress(prop)).toEqual(expected)
    })

    it('should return undefined for an undefined property', () => {
      expect(parseCalAddress(undefined)).toBeUndefined()
    })

    it('should handle values without the "mailto:" prefix', () => {
      const prop: IcsProperty = { key: 'ATTENDEE', value: 'jane.doe@example.com', params: {} }
      const expected: CalAddress = { email: 'jane.doe@example.com' }
      expect(parseCalAddress(prop)).toEqual(expected)
    })
  })

  describe('parseIcsDateTime', () => {
    it('should parse a DATE value', () => {
      const prop: IcsProperty = { key: 'DTSTART', value: '19971102', params: { VALUE: 'DATE' } }
      const dt = parseIcsDateTime(prop)
      expect(dt.year).toBe(1997)
      expect(dt.month).toBe(11)
      expect(dt.day).toBe(2)
      expect(dt.hour).toBe(0)
    })

    it('should parse a UTC DATE-TIME value', () => {
      const prop: IcsProperty = { key: 'DTSTAMP', value: '19970901T130000Z', params: {} }
      const dt = parseIcsDateTime(prop)
      expect(dt.toUTC().toISO()).toBe('1997-09-01T13:00:00.000Z')
    })

    it('should parse a floating DATE-TIME value as local time', () => {
      const prop: IcsProperty = { key: 'DTSTART', value: '19970903T163000', params: {} }
      const dt = parseIcsDateTime(prop)
      expect(dt.toFormat("yyyyMMdd'T'HHmmss")).toBe('19970903T163000')
      expect(dt.zone.type).toBe('system')
    })

    it('should parse a DATE-TIME with a TZID, preserving the zone info', () => {
      const prop: IcsProperty = { key: 'DTSTART', value: '20070313T020000', params: { TZID: 'America/New_York' } }
      const dt = parseIcsDateTime(prop)
      expect(dt.zone.name).toBe('America/New_York')
      expect(dt.toFormat("yyyy-MM-dd'T'HH:mm:ss")).toBe('2007-03-13T02:00:00')
    })

    it('should resolve a Windows TZID to a fixed offset', () => {
      const prop: IcsProperty = { key: 'DTSTART', value: '20070313T020000', params: { TZID: 'Eastern Standard Time' } }
      const dt = parseIcsDateTime(prop)
      // The date is during EDT, which is UTC-4.
      // The windows-iana library resolves "Eastern Standard Time" to "America/New_York",
      // the resolver calculates the offset (-240), and a FixedOffsetZone is created.
      expect(dt.zone.name).toBe('UTC-4')
      expect(dt.toFormat("yyyy-MM-dd'T'HH:mm:ss")).toBe('2007-03-13T02:00:00')
    })
  })

  describe('parseOffset', () => {
    it('should parse a positive offset string (+0530) to minutes', () => {
      expect(parseOffset('+0530')).toBe(330)
    })

    it('should parse a negative offset string (-0800) to minutes', () => {
      expect(parseOffset('-0800')).toBe(-480)
    })

    it('should parse a zero offset string (+0000)', () => {
      expect(parseOffset('+0000')).toBe(0)
    })

    it('should throw an error for an invalid offset string', () => {
      expect(() => parseOffset('invalid')).toThrow('Invalid offset string: invalid')
    })
  })

  describe('parseDateTimeList', () => {
    it('should parse a single DATE value', () => {
      const prop: IcsProperty = { key: 'RDATE', value: '19970714', params: { VALUE: 'DATE' } }
      const dts = parseDateTimeList(prop)
      expect(dts.length).toBe(1)
      expect(dts[0].toISODate()).toBe('1997-07-14')
    })

    it('should parse multiple comma-separated UTC DATE-TIME values', () => {
      const prop: IcsProperty = { key: 'EXDATE', value: '19960402T010000Z,19960403T010000Z', params: {} }
      const dts = parseDateTimeList(prop)
      expect(dts.length).toBe(2)
      expect(dts[0].toUTC().toISO()).toBe('1996-04-02T01:00:00.000Z')
      expect(dts[1].toUTC().toISO()).toBe('1996-04-03T01:00:00.000Z')
    })

    it('should apply a TZID parameter to all values in the list', () => {
      const prop: IcsProperty = {
        key: 'RDATE',
        value: '19970101T180000,19970102T180000',
        params: { TZID: 'America/New_York' },
      }
      const dts = parseDateTimeList(prop)
      expect(dts.length).toBe(2)
      dts.forEach((dt) => expect(dt.zone.name).toBe('America/New_York'))
    })
  })

  describe('parseRruleString', () => {
    it('should parse a simple RRULE string with FREQ and COUNT', () => {
      const rruleString = 'FREQ=YEARLY;COUNT=5'
      const expected: Partial<RecurrenceRule> = { freq: 'YEARLY', count: 5 }
      expect(parseRruleString(rruleString)).toMatchObject(expected)
    })

    it('should parse an RRULE with an UNTIL date-time', () => {
      const rruleString = 'FREQ=DAILY;UNTIL=20240131T235959Z'
      const result = parseRruleString(rruleString)
      expect(result.freq).toBe('DAILY')
      expect(result.until?.toUTC().toISO()).toBe('2024-01-31T23:59:59.000Z')
    })

    it('should parse BYDAY with day names', () => {
      const rruleString = 'FREQ=WEEKLY;BYDAY=MO,TU,FR'
      const expected: Partial<RecurrenceRule> = {
        freq: 'WEEKLY',
        byday: [{ weekday: 'MO' }, { weekday: 'TU' }, { weekday: 'FR' }],
      }
      expect(parseRruleString(rruleString)).toMatchObject(expected)
    })

    it('should parse BYDAY with numeric prefixes', () => {
      const rruleString = 'FREQ=MONTHLY;BYDAY=1MO,-1FR'
      const expected: Partial<RecurrenceRule> = {
        freq: 'MONTHLY',
        byday: [
          { n: 1, weekday: 'MO' },
          { n: -1, weekday: 'FR' },
        ],
      }
      expect(parseRruleString(rruleString)).toMatchObject(expected)
    })

    it('should parse multiple numeric BY* rules', () => {
      const rruleString = 'FREQ=YEARLY;INTERVAL=2;BYMONTH=1,2;BYMONTHDAY=15,30'
      const expected: Partial<RecurrenceRule> = {
        freq: 'YEARLY',
        interval: 2,
        bymonth: [1, 2],
        bymonthday: [15, 30],
      }
      expect(parseRruleString(rruleString)).toMatchObject(expected)
    })

    it('should throw InvalidRruleError if FREQ is missing', () => {
      const rruleString = 'COUNT=10'
      expect(() => parseRruleString(rruleString)).toThrow(
        new InvalidRruleError('RRULE string must contain a FREQ part.'),
      )
    })

    it('should throw InvalidRruleError for an invalid FREQ value', () => {
      const rruleString = 'FREQ=BIMONTHLY;COUNT=10'
      expect(() => parseRruleString(rruleString)).toThrow(new InvalidRruleError('Invalid FREQ value: BIMONTHLY'))
    })
  })
})
