import { DateTime, Duration } from 'luxon'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  getEventDuration,
  getInclusionDates,
  getExclusionDates,
  applyTimeZone,
  extractEventDetails,
  expandCalendar,
} from './event-expander.js'
import { expandRrule } from './rrule-expander.js'
import { type VComponent, type TimeZoneResolver } from './types.js'

// We only mock the rrule-expander, as its logic is complex and tested elsewhere.
// All property finders and parsers will use their real implementations.
vi.mock('./rrule-expander.js', () => ({
  expandRrule: vi.fn(),
}))

describe('event-expander.test.ts', () => {
  let mockEvent: VComponent

  beforeEach(() => {
    vi.resetAllMocks()
    mockEvent = {
      type: 'VEVENT',
      properties: [],
      subComponents: [],
    }
  })

  describe('getEventDuration', () => {
    const dtstart = DateTime.fromISO('2023-10-26T10:00:00Z')

    it('should calculate duration from DTEND', () => {
      mockEvent.properties = [{ key: 'DTEND', value: '20231026T113000Z', params: {} }]
      const duration = getEventDuration(mockEvent, dtstart, false)
      expect(duration.as('minutes')).toBe(90)
    })

    it('should calculate duration from DURATION property', () => {
      mockEvent.properties = [{ key: 'DURATION', value: 'PT1H30M', params: {} }]
      const duration = getEventDuration(mockEvent, dtstart, false)
      expect(duration.toObject()).toEqual({ hours: 1, minutes: 30 })
    })

    it('should return 1-day duration for all-day events without DTEND/DURATION', () => {
      const duration = getEventDuration(mockEvent, dtstart, true)
      expect(duration.toObject()).toEqual({ days: 1 })
    })

    it('should return 0 duration for non-all-day events without DTEND/DURATION', () => {
      const duration = getEventDuration(mockEvent, dtstart, false)
      expect(duration.toMillis()).toBe(0)
    })
  })

  describe('getInclusionDates', () => {
    const rangeEnd = DateTime.fromISO('2024-12-31T23:59:59Z')
    const dtstart = DateTime.fromISO('2024-01-01T10:00:00Z')

    it('should include dates from RRULE and RDATE', () => {
      const occurrence2 = DateTime.fromISO('2024-01-08T10:00:00Z')
      const rdate = DateTime.fromISO('2024-01-31T12:00:00Z')

      mockEvent.properties = [
        { key: 'RRULE', value: 'FREQ=WEEKLY;COUNT=2', params: {} },
        { key: 'RDATE', value: '20240131T120000Z', params: {} },
      ]

      // Mock the generator returned by expandRrule
      function* createMockOccurrences() {
        yield dtstart
        yield occurrence2
      }
      vi.mocked(expandRrule).mockReturnValue(createMockOccurrences())

      const dates = getInclusionDates(mockEvent, dtstart, dtstart, rangeEnd, () => undefined)
      expect(dates).toEqual(new Set([dtstart.toMillis(), occurrence2.toMillis(), rdate.toMillis()]))
    })
  })

  describe('getExclusionDates', () => {
    it('should parse multiple EXDATE properties', () => {
      const exdate1 = DateTime.fromISO('2024-02-01T10:00:00Z')
      const exdate2 = DateTime.fromISO('2024-03-01T10:00:00Z')
      mockEvent.properties = [
        { key: 'EXDATE', value: '20240201T100000Z', params: {} },
        { key: 'EXDATE', value: '20240301T100000Z', params: {} },
      ]

      const dates = getExclusionDates(mockEvent, () => undefined)
      expect(dates).toEqual(new Set([exdate1.toMillis(), exdate2.toMillis()]))
    })
  })

  describe('applyTimeZone', () => {
    const occurrenceStart = DateTime.fromISO('2024-07-04T10:00:00') // Local, no zone
    const duration = Duration.fromObject({ hours: 1 })
    const mockResolver: TimeZoneResolver = vi.fn()

    it('should handle floating time (no TZID) as UTC', () => {
      const { startUtc, endUtc } = applyTimeZone(occurrenceStart, duration, undefined, false, mockResolver)
      expect(mockResolver).not.toHaveBeenCalled()
      expect(startUtc.toISO()).toBe('2024-07-04T10:00:00.000Z')
      expect(endUtc.toISO()).toBe('2024-07-04T11:00:00.000Z')
    })

    it('should apply timezone offset using the resolver', () => {
      vi.mocked(mockResolver).mockReturnValue(-240) // EDT is -4 hours
      const { startUtc } = applyTimeZone(occurrenceStart, duration, 'America/New_York', false, mockResolver)
      expect(mockResolver).toHaveBeenCalledWith(occurrenceStart, 'America/New_York')
      expect(startUtc.toISO()).toBe('2024-07-04T14:00:00.000Z')
    })
  })

  describe('expandCalendar', () => {
    const rangeStart = DateTime.fromISO('2024-01-01T00:00:00Z')
    const rangeEnd = DateTime.fromISO('2024-01-31T23:59:59Z')
    const mockResolver: TimeZoneResolver = vi.fn().mockReturnValue(0) // Mock UTC

    it('should expand a simple, non-recurring event in range', () => {
      mockEvent.properties = [
        { key: 'UID', value: 'simple-event', params: {} },
        { key: 'SUMMARY', value: 'My Simple Event', params: {} },
        { key: 'DTSTART', value: '20240110T100000Z', params: {} },
      ]

      const expanded = expandCalendar([mockEvent], mockResolver, rangeStart, rangeEnd)

      expect(expanded).toHaveLength(1)
      expect(expanded[0].uid).toBe('simple-event')
      expect(expanded[0].summary).toBe('My Simple Event')
      expect(expanded[0].start).toBe('2024-01-10T10:00:00.000Z')
    })

    it('should filter out events outside the query range', () => {
      mockEvent.properties = [{ key: 'DTSTART', value: '20240210T100000Z', params: {} }]
      const expanded = expandCalendar([mockEvent], mockResolver, rangeStart, rangeEnd)
      expect(expanded).toHaveLength(0)
    })

    it('should expand a recurring event and filter out excluded dates', () => {
      const dtstart = DateTime.fromISO('2024-01-01T10:00:00Z')
      const occurrence2 = DateTime.fromISO('2024-01-08T10:00:00Z') // To be excluded
      const occurrence3 = DateTime.fromISO('2024-01-15T10:00:00Z')

      mockEvent.properties = [
        { key: 'DTSTART', value: '20240101T100000Z', params: {} },
        { key: 'RRULE', value: 'FREQ=WEEKLY;COUNT=3', params: {} },
        { key: 'EXDATE', value: '20240108T100000Z', params: {} },
      ]

      function* createMockOccurrences() {
        yield dtstart
        yield occurrence2
        yield occurrence3
      }
      vi.mocked(expandRrule).mockReturnValue(createMockOccurrences())

      const expanded = expandCalendar([mockEvent], mockResolver, rangeStart, rangeEnd)
      expect(expanded).toHaveLength(2)
      expect(expanded.map((e) => e.start)).toEqual(['2024-01-01T10:00:00.000Z', '2024-01-15T10:00:00.000Z'])
    })

    it('should throw an error if DTSTART is missing', () => {
      mockEvent.properties = [{ key: 'UID', value: 'event-no-dtstart', params: {} }]
      expect(() => expandCalendar([mockEvent], mockResolver, rangeStart, rangeEnd)).toThrow(
        'Event with UID "event-no-dtstart" is missing a DTSTART property.',
      )
    })
  })

  describe('extractEventDetails', () => {
    it('should extract all standard properties correctly', () => {
      const event: VComponent = {
        type: 'VEVENT',
        properties: [
          { key: 'UID', value: 'test-uid-123', params: {} },
          { key: 'SUMMARY', value: 'Team Meeting', params: {} },
          { key: 'DESCRIPTION', value: 'A meeting to discuss project goals.', params: {} },
          { key: 'LOCATION', value: 'Conference Room 4', params: {} },
          { key: 'STATUS', value: 'CONFIRMED', params: {} },
          { key: 'CLASS', value: 'PRIVATE', params: {} },
          { key: 'TRANSP', value: 'OPAQUE', params: {} },
          { key: 'URL', value: 'http://example.com/meeting-info', params: {} },
          { key: 'SEQUENCE', value: '3', params: {} },
          { key: 'PRIORITY', value: '5', params: {} },
          { key: 'CREATED', value: '2024-01-01T12:00:00Z', params: {} },
          { key: 'GEO', value: '37.38;-122.08', params: {} },
          { key: 'ORGANIZER', value: 'mailto:org@example.com', params: { CN: 'The Organizer' } },
          { key: 'ATTENDEE', value: 'mailto:att1@example.com', params: { PARTSTAT: 'ACCEPTED' } },
          { key: 'CATEGORIES', value: 'WORK,PROJECT', params: {} },
        ],
        subComponents: [],
      }

      const details = extractEventDetails(event)

      expect(details.uid).toBe('test-uid-123')
      expect(details.summary).toBe('Team Meeting')
      expect(details.description).toBe('A meeting to discuss project goals.')
      expect(details.location).toBe('Conference Room 4')
      expect(details.status).toBe('CONFIRMED')
      expect(details.class).toBe('PRIVATE')
      expect(details.transp).toBe('OPAQUE')
      expect(details.url).toBe('http://example.com/meeting-info')
      expect(details.sequence).toBe(3)
      expect(details.priority).toBe(5)
      expect(details.created).toBe('2024-01-01T12:00:00.000Z')
      expect(details.geo).toEqual({ lat: 37.38, lon: -122.08 })
      expect(details.organizer).toEqual({ email: 'org@example.com', commonName: 'The Organizer' })
      expect(details.attendees).toEqual([{ email: 'att1@example.com', partstat: 'ACCEPTED' }])
      expect(details.categories).toEqual(['WORK', 'PROJECT'])
    })

    it('should generate a UID if missing and return "(No Summary)" for summary', () => {
      const details = extractEventDetails(mockEvent)
      expect(details.uid).toMatch(/^generated-0\.\d+$/)
      expect(details.summary).toBe('(No Summary)')
    })

    it('should return undefined for missing optional properties', () => {
      const details = extractEventDetails(mockEvent)
      expect(details.description).toBeUndefined()
      expect(details.location).toBeUndefined()
      expect(details.organizer).toBeUndefined()
      expect(details.attendees).toBeUndefined()
      expect(details.categories).toBeUndefined()
      expect(details.customProperties).toBeUndefined()
      expect(details.geo).toBeUndefined()
    })

    it('should collect non-standard (X-) and IANA properties into customProperties', () => {
      mockEvent.properties = [
        { key: 'X-CUSTOM-ID', value: '12345', params: {} },
        { key: 'IANA-PROP', value: 'some-iana-value', params: {} },
        { key: 'SUMMARY', value: 'Standard Event', params: {} },
      ]

      const details = extractEventDetails(mockEvent)

      expect(details.summary).toBe('Standard Event')
      expect(details.customProperties).toEqual({
        'X-CUSTOM-ID': { key: 'X-CUSTOM-ID', value: '12345', params: {} },
        'IANA-PROP': { key: 'IANA-PROP', value: 'some-iana-value', params: {} },
      })
    })
  })
})
