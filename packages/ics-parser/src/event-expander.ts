import { DateTime, Duration } from 'luxon'

import { IcsError } from './errors.js'
import {
  parseCalAddress,
  parseCategories,
  parseDateTimeList,
  parseGeo,
  parseIcsDateTime,
  parseInteger,
  parseRruleString,
  parseString,
} from './property-parsers.js'
import { expandRrule } from './rrule-expander.js'
import {
  type CalAddress,
  type ExpandedEvent,
  type IcsProperty,
  type TimeZoneResolver,
  type UnexpandedEvent,
  type VComponent,
} from './types.js'
import { findProperty, findProperties } from './utils.js'

/**
 * Parses a date-time property into an ISO 8601 string.
 * @param prop - The ICS property.
 * @param resolver - A function that resolves timezone offsets for a given DateTime and TZID.
 * @returns An ISO 8601 string or undefined.
 */
function parseDateTimeValue(prop: IcsProperty | undefined, resolver: TimeZoneResolver): string | undefined {
  if (!prop) return undefined
  // Note: This does not resolve timezones, it just formats the parsed time to UTC.
  // This is suitable for properties like CREATED and LAST-MODIFIED which are often in UTC.
  return parseIcsDateTime(prop, resolver).toUTC().toISO() ?? undefined
}

/**
 * Gathers all standard and custom properties from a VEVENT component.
 * @param event - The VEVENT component.
 * @param resolver - A function that resolves timezone offsets for a given DateTime and TZID.
 * @returns A partially filled ExpandedEvent object containing all static details.
 */
export function extractEventDetails(
  event: VComponent,
  resolver: TimeZoneResolver,
): Omit<ExpandedEvent, 'start' | 'end' | 'allDay'> {
  const customProperties: Record<string, IcsProperty> = {}
  const knownKeys = new Set([
    'UID',
    'SUMMARY',
    'DTSTART',
    'DTEND',
    'DURATION',
    'RRULE',
    'RDATE',
    'EXDATE',
    'DESCRIPTION',
    'LOCATION',
    'STATUS',
    'CLASS',
    'CREATED',
    'LAST-MODIFIED',
    'SEQUENCE',
    'ORGANIZER',
    'ATTENDEE',
    'CATEGORIES',
    'PRIORITY',
    'TRANSP',
    'URL',
    'GEO',
    'RECURRENCE-ID',
  ])

  for (const prop of event.properties) {
    if (prop.key.startsWith('X-') || !knownKeys.has(prop.key)) {
      // Per RFC 5545, non-standard and IANA properties can be included.
      // We store them in a dedicated nested object.
      customProperties[prop.key] = prop
    }
  }

  const attendees = findProperties(event, 'ATTENDEE')
    .map(parseCalAddress)
    .filter((a): a is CalAddress => !!a)

  const categories = parseCategories(findProperties(event, 'CATEGORIES')).filter((a): a is string => !!a)

  return {
    uid: findProperty(event, 'UID')?.value ?? `generated-${Math.random()}`,
    summary: parseString(findProperty(event, 'SUMMARY')) ?? '(No Summary)',
    description: parseString(findProperty(event, 'DESCRIPTION')),
    location: parseString(findProperty(event, 'LOCATION')),
    status: parseString(findProperty(event, 'STATUS')) as ExpandedEvent['status'],
    class: parseString(findProperty(event, 'CLASS')) as ExpandedEvent['class'],
    created: parseDateTimeValue(findProperty(event, 'CREATED'), resolver),
    lastModified: parseDateTimeValue(findProperty(event, 'LAST-MODIFIED'), resolver),
    sequence: parseInteger(findProperty(event, 'SEQUENCE')),
    organizer: parseCalAddress(findProperty(event, 'ORGANIZER')),
    attendees: attendees.length > 0 ? attendees : undefined,
    categories: categories.length > 0 ? categories : undefined,
    priority: parseInteger(findProperty(event, 'PRIORITY')),
    transp: parseString(findProperty(event, 'TRANSP')) as ExpandedEvent['transp'],
    url: parseString(findProperty(event, 'URL')),
    geo: parseGeo(findProperty(event, 'GEO')),
    recurrenceId: parseDateTimeValue(findProperty(event, 'RECURRENCE-ID'), resolver),
    customProperties: Object.keys(customProperties).length > 0 ? customProperties : undefined,
  }
}

/**
 * Parses a single VEVENT component into a structured but unexpanded event object,
 * including parsed recurrence rules.
 * @param event - The VEVENT component.
 * @param resolver - The timezone resolver function.
 * @returns An UnexpandedEvent object.
 * @throws {IcsError} If the VEVENT component is missing a DTSTART property.
 */
export function parseUnexpandedEvent(event: VComponent, resolver: TimeZoneResolver): UnexpandedEvent {
  const eventDetails = extractEventDetails(event, resolver)
  const dtstartProp = findProperty(event, 'DTSTART')

  if (!dtstartProp) {
    throw new IcsError(`Event with UID "${eventDetails.uid}" is missing a DTSTART property.`)
  }

  const tzid = dtstartProp.params['TZID']
  const isAllDay = dtstartProp.params['VALUE'] === 'DATE'
  const dtstart = parseIcsDateTime(dtstartProp, resolver)
  const duration = getEventDuration(event, dtstart, isAllDay, resolver)

  const { startUtc, endUtc } = applyTimeZone(dtstart, duration, tzid, isAllDay, resolver)

  const rruleProp = findProperty(event, 'RRULE')
  const rrule = rruleProp ? parseRruleString(rruleProp.value) : undefined

  const rdates = findProperties(event, 'RDATE')
    .flatMap((prop) => parseDateTimeList(prop, resolver))
    .map((dt) => dt.toISO())
    .filter((d): d is string => !!d)

  const exdates = findProperties(event, 'EXDATE')
    .flatMap((prop) => parseDateTimeList(prop, resolver))
    .map((dt) => dt.toISO())
    .filter((d): d is string => !!d)

  return {
    ...eventDetails,
    start: startUtc.toISO() as string,
    end: endUtc.toISO() ?? undefined,
    allDay: isAllDay,
    rrule: rrule,
    rdates: rdates.length > 0 ? rdates : undefined,
    exdates: exdates.length > 0 ? exdates : undefined,
  }
}

// --- Core Expansion Logic ---

/**
 * Determines the duration of an event from its DTEND or DURATION property.
 * @param event - The VEVENT component.
 * @param dtstart - The start time of the event.
 * @param isAllDay - Whether the event is an all-day event.
 * @param resolver - A function that resolves timezone offsets for a given DateTime and TZID.
 * @returns A Luxon Duration object.
 */
export function getEventDuration(
  event: VComponent,
  dtstart: DateTime,
  isAllDay: boolean,
  resolver?: TimeZoneResolver,
): Duration {
  const dtendProp = findProperty(event, 'DTEND')
  if (dtendProp) {
    return parseIcsDateTime(dtendProp, resolver).diff(dtstart)
  }
  const durationProp = findProperty(event, 'DURATION')
  if (durationProp) {
    return Duration.fromISO(durationProp.value)
  }
  // For all-day events without DTEND/DURATION, the duration is one day.
  // For timed events, it's zero length (ends at the same time it starts).
  return isAllDay ? Duration.fromObject({ days: 1 }) : Duration.fromMillis(0)
}

/**
 * Gathers all inclusion dates from RRULE and RDATE properties.
 * @param event - The VEVENT component.
 * @param dtstart - The start time of the event.
 * @param rangeStart - The start of the query range.
 * @param rangeEnd - The end of the query range.
 * @param resolver - The timezone resolver function.
 * @returns A Set of millisecond timestamps representing inclusion dates.
 */
export function getInclusionDates(
  event: VComponent,
  dtstart: DateTime,
  rangeStart: DateTime,
  rangeEnd: DateTime,
  resolver: TimeZoneResolver,
): Set<number> {
  const dates = new Set<number>()
  dates.add(dtstart.toMillis())

  const rruleProp = findProperty(event, 'RRULE')
  if (rruleProp) {
    const rule = parseRruleString(rruleProp.value)
    const instances = expandRrule({ dtstart, rule, rangeStart, rangeEnd })
    if (instances) {
      for (const instance of instances) {
        dates.add(instance.toMillis())
      }
    }
  }

  findProperties(event, 'RDATE').forEach((prop) => {
    for (const date of parseDateTimeList(prop, resolver)) {
      dates.add(date.toMillis())
    }
  })
  return dates
}

/**
 * Gathers all exclusion dates from the EXDATE property.
 * @returns A Set of timestamps in milliseconds.
 */
export function getExclusionDates(event: VComponent, resolver: TimeZoneResolver): Set<number> {
  const dates = new Set<number>()
  findProperties(event, 'EXDATE').forEach((prop) => {
    for (const date of parseDateTimeList(prop, resolver)) {
      dates.add(date.toMillis())
    }
  })
  return dates
}

/**
 * Converts a single local occurrence to a UTC start/end object using a timezone resolver.
 * @returns UTC start and end DateTimes.
 */
export function applyTimeZone(
  occurrenceStart: DateTime,
  duration: Duration,
  tzid: string | undefined,
  isAllDay: boolean,
  resolver: TimeZoneResolver,
): { startUtc: DateTime; endUtc: DateTime } {
  // All-day events don't have a time-of-day, so we treat them as starting at midnight
  // in the specified timezone, or in UTC if no timezone is given.
  if (isAllDay) {
    const startOfDay = occurrenceStart.startOf('day')
    const startUtc = tzid
      ? startOfDay.setZone('utc', { keepLocalTime: true }).minus({ minutes: resolver(startOfDay, tzid) })
      : startOfDay.toUTC()
    const endUtc = startUtc.plus(duration)
    return { startUtc, endUtc }
  }

  // Floating time (no TZID) is interpreted as UTC per our convention.
  if (!tzid) {
    const startUtc = occurrenceStart.setZone('utc', { keepLocalTime: true })
    return { startUtc, endUtc: startUtc.plus(duration) }
  }

  // For timed events with a TZID, we convert the local time to UTC by subtracting the offset.
  const startUtc = occurrenceStart
    .setZone('utc', { keepLocalTime: true })
    .minus({ minutes: resolver(occurrenceStart, tzid) })

  // The end time offset might be different if the event crosses a DST boundary.
  const occurrenceEnd = occurrenceStart.plus(duration)
  const endUtc = occurrenceEnd.setZone('utc', { keepLocalTime: true }).minus({ minutes: resolver(occurrenceEnd, tzid) })

  return { startUtc, endUtc }
}

/**
 * Expands a single VEVENT component into a list of concrete occurrences.
 * This is a low-level function that handles recurrence for a single component.
 * Use `expandCalendar` for processing a full calendar with UID-based modifications.
 *
 * @param event - The VEVENT component to expand.
 * @param options - Expansion options including the resolver and time range.
 * @returns An array of ExpandedEvent objects.
 * @throws {IcsError} If the VEVENT component is missing a DTSTART property.
 */
export function expandEvent(
  event: VComponent,
  options: {
    resolver: TimeZoneResolver
    rangeStart: DateTime
    rangeEnd: DateTime
    exclusions?: Set<number> // Optional pre-computed exclusion dates
  },
): ExpandedEvent[] {
  const { resolver, rangeStart, rangeEnd, exclusions } = options
  const dtstartProp = findProperty(event, 'DTSTART')
  const eventDetails = extractEventDetails(event, resolver)

  if (!dtstartProp) {
    // According to RFC 5545, DTSTART is required for VEVENTs in most cases.
    throw new IcsError(`Event with UID "${eventDetails.uid}" is missing a DTSTART property.`)
  }

  const tzid = dtstartProp.params['TZID']
  // The 'VALUE=DATE' parameter indicates an all-day event.
  const isAllDay = dtstartProp.params['VALUE'] === 'DATE'
  const dtstart = parseIcsDateTime(dtstartProp, resolver)
  const duration = getEventDuration(event, dtstart, isAllDay, resolver)

  const inclusionDates = getInclusionDates(event, dtstart, rangeStart, rangeEnd, resolver)
  const exclusionDates = exclusions ?? getExclusionDates(event, resolver)

  const finalEvents: ExpandedEvent[] = []
  for (const millis of inclusionDates) {
    if (exclusionDates.has(millis)) continue

    const occurrenceStart = DateTime.fromMillis(millis, { zone: dtstart.zone })
    const { startUtc, endUtc } = applyTimeZone(occurrenceStart, duration, tzid, isAllDay, resolver)

    // Filter out occurrences that do not overlap with the query range.
    if (startUtc < rangeEnd && endUtc > rangeStart) {
      finalEvents.push({
        ...eventDetails,
        start: startUtc.toISO() as string,
        end: endUtc.toISO() ?? undefined,
        allDay: isAllDay,
      })
    }
  }

  return finalEvents
}

/**
 * Expands all VEVENT components from a calendar, correctly handling recurring events
 * and their modifications (exceptions) based on UID and RECURRENCE-ID.
 *
 * @param components - All VComponents parsed from an iCalendar file.
 * @param resolver - The timezone resolver function.
 * @param rangeStart - The start of the query range.
 * @param rangeEnd - The end of the query range.
 * @returns A consolidated array of all expanded event occurrences.
 */
export function expandCalendar(
  components: VComponent[],
  resolver: TimeZoneResolver,
  rangeStart: DateTime,
  rangeEnd: DateTime,
): ExpandedEvent[] {
  const events = components.filter((c) => c.type === 'VEVENT')
  const eventsByUid = new Map<string, VComponent[]>()
  const eventsWithoutUid: VComponent[] = []

  // 1. Group all VEVENTs by their UID.
  for (const event of events) {
    const uid = findProperty(event, 'UID')?.value
    if (uid) {
      if (!eventsByUid.has(uid)) {
        eventsByUid.set(uid, [])
      }
      eventsByUid.get(uid)?.push(event)
    } else {
      // Handle events without a UID as standalone. They cannot be part of a
      // recurrence set with overrides.
      eventsWithoutUid.push(event)
    }
  }

  const allExpandedEvents: ExpandedEvent[] = []

  // 2. Process each UID group.
  for (const group of eventsByUid.values()) {
    const masterEvent = group.find((e) => findProperty(e, 'RRULE') && !findProperty(e, 'RECURRENCE-ID'))
    const exceptionEvents = group.filter((e) => findProperty(e, 'RECURRENCE-ID'))
    const singleEvents = group.filter((e) => !findProperty(e, 'RRULE') && !findProperty(e, 'RECURRENCE-ID'))

    // 3. Gather all dates to be excluded from the master recurring event.
    // This includes both EXDATEs from the master and RECURRENCE-IDs from exceptions.
    const combinedExclusions = new Set<number>()
    if (masterEvent) {
      getExclusionDates(masterEvent, resolver).forEach((d) => combinedExclusions.add(d))
    }
    for (const ex of exceptionEvents) {
      const recurrenceIdProp = findProperty(ex, 'RECURRENCE-ID')
      if (recurrenceIdProp) {
        // Parse RECURRENCE-ID to get a comparable millisecond timestamp.
        const recurrenceDate = parseIcsDateTime(recurrenceIdProp, resolver)
        combinedExclusions.add(recurrenceDate.toMillis())
      }
    }

    // 4. Expand the master event, applying the combined exclusions.
    if (masterEvent) {
      const masterOccurrences = expandEvent(masterEvent, {
        resolver,
        rangeStart,
        rangeEnd,
        exclusions: combinedExclusions,
      })
      allExpandedEvents.push(...masterOccurrences)
    }

    // 5. Expand all exception events. These are treated as individual appointments.
    for (const ex of exceptionEvents) {
      const exceptionOccurrence = expandEvent(ex, { resolver, rangeStart, rangeEnd })
      allExpandedEvents.push(...exceptionOccurrence)
    }

    // 6. Expand any standalone (non-recurring) events in the group.
    for (const single of singleEvents) {
      const singleOccurrence = expandEvent(single, { resolver, rangeStart, rangeEnd })
      allExpandedEvents.push(...singleOccurrence)
    }
  }

  // 7. Expand all events that didn't have a UID.
  for (const single of eventsWithoutUid) {
    const singleOccurrence = expandEvent(single, { resolver, rangeStart, rangeEnd })
    allExpandedEvents.push(...singleOccurrence)
  }

  return allExpandedEvents
}
