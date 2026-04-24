import { type DateTime } from 'luxon'

export interface IcsProperty {
  key: string
  value: string
  params: Record<string, string>
}

export interface VComponent {
  type: string
  properties: IcsProperty[]
  subComponents: VComponent[]
}

export interface ParsedIcs {
  events: VComponent[]
  timezones: VComponent[]
}

export type Freq = 'YEARLY' | 'MONTHLY' | 'WEEKLY' | 'DAILY' | 'HOURLY' | 'MINUTELY' | 'SECONDLY'
export type Weekday = 'SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA'

export interface WeekdayRule {
  weekday: Weekday
  n?: number
}

export interface RecurrenceRule {
  freq: Freq
  interval?: number
  count?: number
  until?: DateTime
  wkst?: Weekday
  byday?: WeekdayRule[]
  bymonth?: number[]
  bymonthday?: number[]
  byyearday?: number[]
  byweekno?: number[]
  byhour?: number[]
  byminute?: number[]
  bysecond?: number[]
  bysetpos?: number[]
}

export interface RRuleOptions {
  dtstart: DateTime
  rule: RecurrenceRule
  rangeStart?: DateTime
  rangeEnd: DateTime
}

export interface TimeZoneObservance {
  dtstart: string
  offsetTo: number
  offsetFrom: number
  rrule?: string
  rdates: IcsProperty[]
}

export interface TimeZoneTransition {
  transitionTime: DateTime
  offsetTo: number
}

export interface TimeZoneData {
  observances: TimeZoneObservance[]
  url?: string
}

export type TimeZoneResolver = (localTime: DateTime, tzid: string) => number

/**
 * Represents a calendar address for properties like ORGANIZER or ATTENDEE.
 */
export interface CalAddress {
  email: string
  commonName?: string
  partstat?: string
  role?: string
}

/**
 * Represents a geographic position.
 */
export interface Geo {
  lat: number
  lon: number
}

/**
 * Represents a fully expanded, concrete event occurrence.
 * All date-time fields are in UTC ISO 8601 format.
 */
export interface ExpandedEvent {
  uid: string
  summary: string
  /** ISO 8601 format with Z */
  start: string
  /** ISO 8601 format with Z */
  end?: string
  allDay: boolean
  description?: string
  location?: string
  status?: 'TENTATIVE' | 'CONFIRMED' | 'CANCELLED'
  class?: 'PUBLIC' | 'PRIVATE' | 'CONFIDENTIAL'
  created?: string
  lastModified?: string
  sequence?: number
  organizer?: CalAddress
  attendees?: CalAddress[]
  categories?: string[]
  priority?: number // 0-9
  transp?: 'OPAQUE' | 'TRANSPARENT'
  url?: string
  geo?: Geo
  /**
   * The recurrence ID for this specific instance, if it's an override.
   */
  recurrenceId?: string
  /**
   * Holds any non-standard (X-) or IANA-registered properties.
   */
  customProperties?: Record<string, IcsProperty>
}

/**
 * Represents a parsed but not expanded event, including its recurrence rules.
 */
export interface UnexpandedEvent extends ExpandedEvent {
  rrule?: RecurrenceRule
  rdates?: string[]
  exdates?: string[]
}
