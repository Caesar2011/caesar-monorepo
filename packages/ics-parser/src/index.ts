import { DateTime } from 'luxon'

import { expandCalendar, parseUnexpandedEvent } from './event-expander.js'
import { parseIcs } from './parser.js'
import { buildTimeZoneData, createTimeZoneResolver } from './timezone-processor.js'
import { type ExpandedEvent, type TimeZoneData, type UnexpandedEvent, type VComponent } from './types.js'
export { ExpandedEvent, UnexpandedEvent } from './types.js'

/**
 * Represents the pre-processed, structured data from an ICS file.
 * This object contains the VEVENT components and a `Map` of processed VTIMEZONE
 * data. While the `Map` itself isn't directly serializable, the `serialize`
 * and `deserialize` functions handle its conversion to/from a JSON-compatible format.
 */
export interface PreparedIcs {
  /**
   * An array of all VEVENT components found in the ICS file.
   */
  events: VComponent[]
  /**
   * A map from a Time Zone ID (TZID) to its structured `TimeZoneData`.
   */
  tzData: Map<string, TimeZoneData>
}

/**
 * Parses a raw ICS string and prepares it for event expansion.
 * This function performs the initial parsing of the ICS data into a structured
 * format containing event components and processed timezone information.
 * The result can be serialized for caching.
 *
 * @param icsString - The full content of the .ics file.
 * @returns A `PreparedIcs` object containing parsed events and a `Map` of timezone data.
 */
export function prepare(icsString: string): PreparedIcs {
  const { timezones, events } = parseIcs(icsString)
  const tzData = buildTimeZoneData(timezones)

  return {
    events,
    tzData,
  }
}

/**
 * Serializes the prepared ICS data into a JSON string for caching.
 * It converts the `tzData` Map into an array of `[key, value]` pairs under
 * a `timezones` key to ensure it is JSON-serializable.
 *
 * @param preparedIcs - The `PreparedIcs` object to serialize.
 * @returns A JSON string representation of the prepared data.
 */
export function serialize({ events, tzData }: PreparedIcs): string {
  return JSON.stringify({
    events: events,
    timezones: Array.from(tzData.entries()),
  })
}

/**
 * Deserializes a JSON string back into a `PreparedIcs` object.
 * It expects the JSON to contain an `events` array and a `timezones` array,
 * which it uses to reconstruct the `tzData` Map.
 *
 * @param jsonString - The JSON string to deserialize from a cache.
 * @returns The deserialized `PreparedIcs` object with a reconstructed `tzData` Map.
 */
export function deserialize(jsonString: string): PreparedIcs {
  const { events, timezones } = JSON.parse(jsonString) as {
    events: VComponent[]
    timezones: [string, TimeZoneData][]
  }
  return {
    events,
    tzData: new Map(timezones),
  }
}

/**
 * Expands all recurring events from the prepared data within a given time range.
 * This is the second step after `prepare`, taking the structured data and a date range
 * to generate the final list of event occurrences.
 *
 * @param preparedIcs - The `PreparedIcs` object from `prepare` or `deserialize`.
 * @param rangeStartIso - The start of the desired time frame (UTC ISO string).
 * @param rangeEndIso - The end of the desired time frame (UTC ISO string).
 * @returns An array of all event occurrences within the range, sorted by start time.
 */
export function getEventsBetween(
  { events, tzData }: PreparedIcs,
  rangeStartIso: string,
  rangeEndIso: string,
): ExpandedEvent[] {
  const timeZoneResolver = createTimeZoneResolver(tzData)

  const rangeStart = DateTime.fromISO(rangeStartIso, { zone: 'utc' })
  const rangeEnd = DateTime.fromISO(rangeEndIso, { zone: 'utc' })

  const finalEvents = expandCalendar(events, timeZoneResolver, rangeStart, rangeEnd)
  finalEvents.sort((a, b) => a.start.localeCompare(b.start))

  return finalEvents
}

/**
 * Parses all VEVENT components into a structured, but not expanded, format.
 * This is ideal for searching, as it provides all event details without generating
 * every single recurrence instance.
 *
 * @param preparedIcs - The `PreparedIcs` object from `prepare` or `deserialize`.
 * @returns An array of `UnexpandedEvent` objects.
 */
export function getUnexpandedEvents({ events, tzData }: PreparedIcs): UnexpandedEvent[] {
  const timeZoneResolver = createTimeZoneResolver(tzData)
  const unexpandedEvents: UnexpandedEvent[] = []

  for (const event of events) {
    try {
      unexpandedEvents.push(parseUnexpandedEvent(event, timeZoneResolver))
    } catch {
      // Silently ignore events that fail to parse (e.g., missing DTSTART).
      // This is acceptable for search, where we just skip unsearchable items.
    }
  }

  return unexpandedEvents
}
