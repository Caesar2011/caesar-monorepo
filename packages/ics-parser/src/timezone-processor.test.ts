import { DateTime } from 'luxon'
import { describe, it, expect } from 'vitest'

import { TimeZoneDefinitionNotFoundError, InvalidObservanceError } from './errors'
import {
  processVTimeZone,
  buildTimeZoneData,
  expandObservanceTransitions,
  findOffset,
  createTimeZoneResolver,
} from './timezone-processor'
import { type VComponent, type TimeZoneData, type TimeZoneObservance, type IcsProperty } from './types'

// Helper to create a VComponent for testing
const createVTimezoneComponent = (
  tzid: string | undefined,
  subComponents: VComponent[],
  tzurl?: string,
): VComponent => {
  const properties: IcsProperty[] = []
  if (tzid) {
    properties.push({ key: 'TZID', value: tzid, params: {} })
  }
  if (tzurl) {
    properties.push({ key: 'TZURL', value: tzurl, params: {} })
  }
  return {
    type: 'VTIMEZONE',
    properties,
    subComponents,
  }
}

// Helper to create STANDARD/DAYLIGHT sub-components
const createObservanceComponent = (
  type: 'STANDARD' | 'DAYLIGHT',
  dtstart: string,
  offsetFrom: string,
  offsetTo: string,
  rrule?: string,
  rdates?: string[],
): VComponent => {
  const properties: IcsProperty[] = [
    { key: 'DTSTART', value: dtstart, params: {} },
    { key: 'TZOFFSETFROM', value: offsetFrom, params: {} },
    { key: 'TZOFFSETTO', value: offsetTo, params: {} },
  ]
  if (rrule) {
    properties.push({ key: 'RRULE', value: rrule, params: {} })
  }
  if (rdates) {
    rdates.forEach((rdate) => {
      properties.push({ key: 'RDATE', value: rdate, params: { VALUE: 'DATE-TIME' } })
    })
  }
  return {
    type,
    properties,
    subComponents: [],
  }
}

// Based on RFC 5545 example for America/New_York
const nyDaylightRule = createObservanceComponent(
  'DAYLIGHT',
  '20070311T020000',
  '-0500',
  '-0400',
  'FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
)

const nyStandardRule = createObservanceComponent(
  'STANDARD',
  '20071104T020000',
  '-0400',
  '-0500',
  'FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
)

const nyVTimezone = createVTimezoneComponent(
  'America/New_York',
  [nyDaylightRule, nyStandardRule],
  'http://zones.example.com/tz/America-New_York.ics',
)

describe('processVTimeZone', () => {
  it('should process a valid VTIMEZONE component with URL', () => {
    const result = processVTimeZone(nyVTimezone)

    expect(result).toBeDefined()
    expect(result?.tzid).toBe('America/New_York')
    expect(result?.data.url).toBe('http://zones.example.com/tz/America-New_York.ics')
    expect(result?.data.observances).toHaveLength(2)

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const [daylight, standard] = result!.data.observances

    expect(daylight.dtstart).toBe('20070311T020000')
    expect(daylight.offsetFrom).toBe(-300) // -0500
    expect(daylight.offsetTo).toBe(-240) // -0400
    expect(daylight.rrule).toBe('FREQ=YEARLY;BYMONTH=3;BYDAY=2SU')

    expect(standard.dtstart).toBe('20071104T020000')
    expect(standard.offsetFrom).toBe(-240) // -0400
    expect(standard.offsetTo).toBe(-300) // -0500
    expect(standard.rrule).toBe('FREQ=YEARLY;BYMONTH=11;BYDAY=1SU')
  })

  it('should return undefined for a VTIMEZONE component without a TZID', () => {
    const invalidTz = createVTimezoneComponent(undefined, [nyStandardRule])
    const result = processVTimeZone(invalidTz)
    expect(result).toBeUndefined()
  })

  it('should return undefined for a VTIMEZONE with no STANDARD or DAYLIGHT sub-components', () => {
    const invalidTz = createVTimezoneComponent('America/New_York', [])
    const result = processVTimeZone(invalidTz)
    // The spec requires at least one observance
    expect(result).toBeUndefined()
  })

  it('should handle missing optional properties like RRULE or TZURL', () => {
    const standardRuleNoRrule = createObservanceComponent('STANDARD', '20071104T020000', '-0400', '-0500')
    const simpleVTimezone = createVTimezoneComponent('Simple/Zone', [standardRuleNoRrule])
    const result = processVTimeZone(simpleVTimezone)

    expect(result).toBeDefined()
    expect(result?.tzid).toBe('Simple/Zone')
    expect(result?.data.url).toBeUndefined()
    expect(result?.data.observances).toHaveLength(1)
    expect(result?.data.observances[0].rrule).toBeUndefined()
  })

  it('should correctly parse RDATE properties', () => {
    const rdateObservance = createObservanceComponent('DAYLIGHT', '19740106T020000', '-0500', '-0400', undefined, [
      '19750223T020000',
    ])
    const vtimezone = createVTimezoneComponent('Zone/With_RDATE', [rdateObservance])
    const result = processVTimeZone(vtimezone)

    expect(result).toBeDefined()
    expect(result?.data.observances).toHaveLength(1)
    expect(result?.data.observances[0].rdates).toHaveLength(1)
    expect(result?.data.observances[0].rdates[0].value).toBe('19750223T020000')
  })
})

describe('buildTimeZoneData', () => {
  it('should build a map of TimeZoneData from an array of VTIMEZONE components', () => {
    const fictitiousVTimezone = createVTimezoneComponent('Fictitious/Zone', [nyStandardRule])
    const timezones = [nyVTimezone, fictitiousVTimezone]

    const tzDataMap = buildTimeZoneData(timezones)

    expect(tzDataMap.size).toBe(2)
    expect(tzDataMap.has('America/New_York')).toBe(true)
    expect(tzDataMap.has('Fictitious/Zone')).toBe(true)

    const nyData = tzDataMap.get('America/New_York')
    expect(nyData?.observances).toHaveLength(2)
    expect(nyData?.url).toBeDefined()
  })

  it('should ignore invalid VTIMEZONE components', () => {
    const invalidTz = createVTimezoneComponent(undefined, [nyStandardRule])
    const timezones = [nyVTimezone, invalidTz]

    const tzDataMap = buildTimeZoneData(timezones)

    expect(tzDataMap.size).toBe(1)
    expect(tzDataMap.has('America/New_York')).toBe(true)
    expect(tzDataMap.has('Invalid/Zone')).toBe(false)
  })

  it('should return an empty map for an empty array of timezones', () => {
    const tzDataMap = buildTimeZoneData([])
    expect(tzDataMap.size).toBe(0)
  })
})

describe('expandObservanceTransitions', () => {
  const rangeEnd = DateTime.fromISO('20100101T000000Z')

  it('should expand a yearly RRULE', () => {
    const observance: TimeZoneObservance = {
      dtstart: '20070311T020000',
      offsetTo: -240,
      offsetFrom: -300,
      rrule: 'FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
      rdates: [],
    }
    const transitions = expandObservanceTransitions(observance, rangeEnd)

    // 2007, 2008, 2009
    expect(transitions).toHaveLength(3)
    expect(transitions.map((t) => t.transitionTime.toISODate())).toEqual(['2007-03-11', '2008-03-09', '2009-03-08'])
    expect(transitions.every((t) => t.offsetTo === -240)).toBe(true)
  })

  it('should expand RDATEs', () => {
    const observance: TimeZoneObservance = {
      dtstart: '20070101T000000',
      offsetTo: -300,
      offsetFrom: -240,
      rdates: [
        { key: 'RDATE', value: '20080501T100000', params: {} },
        { key: 'RDATE', value: '20090501T100000', params: {} },
      ],
    }
    const transitions = expandObservanceTransitions(observance, rangeEnd)
    // DTSTART is also an occurrence, plus 2 RDATEs
    expect(transitions).toHaveLength(3)
    expect(transitions[0].transitionTime.toISODate()).toBe('2007-01-01')
    expect(transitions[1].transitionTime.toISODate()).toBe('2008-05-01')
    expect(transitions[2].transitionTime.toISODate()).toBe('2009-05-01')
  })

  it('should expand RRULE with UNTIL', () => {
    const observance: TimeZoneObservance = {
      dtstart: '20070311T020000',
      offsetTo: -240,
      offsetFrom: -300,
      rrule: 'FREQ=YEARLY;BYMONTH=3;BYDAY=2SU;UNTIL=20080401T000000Z',
      rdates: [],
    }
    const transitions = expandObservanceTransitions(observance, rangeEnd)

    // 2007, 2008
    expect(transitions).toHaveLength(2)
    expect(transitions.map((t) => t.transitionTime.toISODate())).toEqual(['2007-03-11', '2008-03-09'])
  })

  it('should handle only DTSTART if no RRULE or RDATE', () => {
    const observance: TimeZoneObservance = {
      dtstart: '20070311T020000',
      offsetTo: -240,
      offsetFrom: -300,
      rdates: [],
    }
    const transitions = expandObservanceTransitions(observance, rangeEnd)

    expect(transitions).toHaveLength(1)
    expect(transitions[0].transitionTime.toISODate()).toBe('2007-03-11')
  })

  it('should return empty array if rangeEnd is before DTSTART', () => {
    const observance: TimeZoneObservance = {
      dtstart: '20110101T000000',
      offsetTo: -240,
      offsetFrom: -300,
      rrule: 'FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
      rdates: [],
    }
    const transitions = expandObservanceTransitions(observance, rangeEnd)
    expect(transitions).toHaveLength(0)
  })
})

describe('findOffset', () => {
  const nyTzData: TimeZoneData = {
    observances: [
      {
        // Standard Time
        dtstart: '20071104T020000',
        offsetTo: -300,
        offsetFrom: -240,
        rrule: 'FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
        rdates: [],
      },
      {
        // Daylight Time
        dtstart: '20070311T020000',
        offsetTo: -240,
        offsetFrom: -300,
        rrule: 'FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
        rdates: [],
      },
    ],
  }

  it('should find the standard time offset', () => {
    const localTime = DateTime.fromObject({ year: 2023, month: 1, day: 15, hour: 10 }) // Jan 15th
    const offset = findOffset(localTime, nyTzData)
    expect(offset).toBe(-300) // EST
  })

  it('should find the daylight saving time offset', () => {
    const localTime = DateTime.fromObject({ year: 2023, month: 7, day: 15, hour: 10 }) // July 15th
    const offset = findOffset(localTime, nyTzData)
    expect(offset).toBe(-240) // EDT
  })

  it('should handle time just before a daylight saving transition (spring forward)', () => {
    // Transition in 2023 is on March 12 at 2 AM
    const localTime = DateTime.fromObject({ year: 2023, month: 3, day: 12, hour: 1, minute: 59 })
    const offset = findOffset(localTime, nyTzData)
    expect(offset).toBe(-300) // Still EST
  })

  it('should handle time just after a daylight saving transition (spring forward)', () => {
    // Transition in 2023 is on March 12 at 2 AM, jumps to 3 AM
    const localTime = DateTime.fromObject({ year: 2023, month: 3, day: 12, hour: 3, minute: 1 })
    const offset = findOffset(localTime, nyTzData)
    expect(offset).toBe(-240) // Now EDT
  })

  it('should handle the non-existent hour during "spring forward"', () => {
    // The spec says to use the offset *before* the gap.
    const localTime = DateTime.fromObject({ year: 2023, month: 3, day: 12, hour: 2, minute: 30 })
    const offset = findOffset(localTime, nyTzData)
    expect(offset).toBe(-300) // Use EST offset
  })

  it('should handle the ambiguous hour during "fall back" (first occurrence)', () => {
    // Transition in 2023 is on Nov 5 at 2 AM, falls back to 1 AM
    // The time 1:30 AM occurs twice. The spec says this refers to the first occurrence.
    const localTime = DateTime.fromObject({ year: 2023, month: 11, day: 5, hour: 1, minute: 30 })
    const offset = findOffset(localTime, nyTzData)
    expect(offset).toBe(-240) // First occurrence is EDT
  })

  it('should throw an error if no valid observances are found', () => {
    const localTime = DateTime.fromObject({ year: 2023, month: 1, day: 1 })
    const emptyTzData: TimeZoneData = { observances: [] }
    expect(() => findOffset(localTime, emptyTzData)).toThrow(InvalidObservanceError)
  })

  it('should use the initial offsetFrom for times before any transition', () => {
    // Before the first DTSTART, the function should find the first rule and use its `offsetFrom`.
    const localTime = DateTime.fromObject({ year: 2006, month: 1, day: 1 })
    const offset = findOffset(localTime, nyTzData)

    // The first transition in our data set is March 11, 2007. It transitions from -0500.
    // So any time before that should be -0500.
    expect(offset).toBe(-300) // EST
  })
})

describe('createTimeZoneResolver', () => {
  const nyTzData: TimeZoneData = {
    observances: [
      {
        // Standard
        dtstart: '20071104T020000',
        offsetTo: -300,
        offsetFrom: -240,
        rrule: 'FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
        rdates: [],
      },
      {
        // Daylight
        dtstart: '20070311T020000',
        offsetTo: -240,
        offsetFrom: -300,
        rrule: 'FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
        rdates: [],
      },
    ],
  }
  const tzDataMap = new Map<string, TimeZoneData>([['America/New_York', nyTzData]])
  const resolver = createTimeZoneResolver(tzDataMap)

  it('should return a function that resolves a known TZID', () => {
    const localTime = DateTime.fromObject({ year: 2023, month: 7, day: 15 })
    const offset = resolver(localTime, 'America/New_York')
    expect(offset).toBe(-240) // EDT in July
  })

  it('should return a function that resolves a different time in the same zone', () => {
    const localTime = DateTime.fromObject({ year: 2023, month: 1, day: 15 })
    const offset = resolver(localTime, 'America/New_York')
    expect(offset).toBe(-300) // EST in January
  })

  it('should return a function that resolves a known TZID for an TZID resolved by luxon', () => {
    const localTime = DateTime.fromObject({ year: 2023, month: 7, day: 15 })
    const offset = resolver(localTime, 'Europe/London')
    expect(offset).toBe(+60) // GMT in July
  })

  it('should throw TimeZoneDefinitionNotFoundError for an unknown TZID', () => {
    const localTime = DateTime.fromObject({ year: 2023, month: 7, day: 15 })
    expect(() => resolver(localTime, 'Atlantis')).toThrow(TimeZoneDefinitionNotFoundError)
    expect(() => resolver(localTime, 'Atlantis')).toThrow('Timezone definition for TZID="Atlantis" not found.')
  })
})
