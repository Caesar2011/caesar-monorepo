import { DateTime, FixedOffsetZone } from 'luxon'
import { findIana } from 'windows-iana'

import { InvalidObservanceError, TimeZoneDefinitionNotFoundError } from './errors.js'
import { parseDateTimeList, parseOffset, parseRruleString } from './property-parsers.js'
import { expandRrule } from './rrule-expander.js'
import {
  type TimeZoneData,
  type TimeZoneObservance,
  type TimeZoneResolver,
  type TimeZoneTransition,
  type VComponent,
} from './types.js'
import { findProperty, findProperties } from './utils.js'

/**
 * Defines the possible outcomes of resolving a timezone identifier.
 * This allows us to cache the *method* of resolution, not just the data.
 */
type ResolutionStrategy = { type: 'tzData'; data: TimeZoneData } | { type: 'intl'; zone: string } | { type: 'notFound' }

/**
 * Processes a single VTIMEZONE component into a structured TimeZoneData object.
 * This function collects the raw observance rules but does not expand them.
 * @param tzComponent - The VTIMEZONE component to process.
 * @returns A structured TimeZoneData object or undefined if the component is invalid.
 */
export function processVTimeZone(tzComponent: VComponent): { tzid: string; data: TimeZoneData } | undefined {
  const tzidProp = findProperty(tzComponent, 'TZID')
  if (!tzidProp) return undefined
  const tzid = tzidProp.value

  const observances: TimeZoneObservance[] = []
  const url = findProperty(tzComponent, 'TZURL')?.value

  for (const sub of tzComponent.subComponents) {
    if (sub.type !== 'STANDARD' && sub.type !== 'DAYLIGHT') continue

    const dtstartProp = findProperty(sub, 'DTSTART')
    const offsetToProp = findProperty(sub, 'TZOFFSETTO')
    const offsetFromProp = findProperty(sub, 'TZOFFSETFROM')

    // DTSTART, TZOFFSETTO, and TZOFFSETFROM are required for each observance rule.
    if (!dtstartProp || !offsetToProp || !offsetFromProp) continue

    observances.push({
      dtstart: dtstartProp.value,
      offsetTo: parseOffset(offsetToProp.value),
      offsetFrom: parseOffset(offsetFromProp.value),
      rrule: findProperty(sub, 'RRULE')?.value,
      rdates: findProperties(sub, 'RDATE'),
    })
  }

  // Per RFC 5545, a VTIMEZONE MUST have at least one STANDARD or DAYLIGHT sub-component.
  if (observances.length === 0) {
    return undefined
  }

  return { tzid, data: { observances, url } }
}

/**
 * Creates a map of all timezone definitions from VTIMEZONE components.
 * @param timezones - An array of VTIMEZONE components.
 * @returns A map from TZID to structured TimeZoneData.
 */
export function buildTimeZoneData(timezones: VComponent[]): Map<string, TimeZoneData> {
  const tzData = new Map<string, TimeZoneData>()
  for (const tz of timezones) {
    const processed = processVTimeZone(tz)
    if (processed) {
      // NOTE: For full TZURL support, one would fetch and parse the URL here
      // if the initial `processed.data.observances` is empty or outdated.
      tzData.set(processed.tzid, processed.data)
    }
  }
  return tzData
}

/**
 * Expands a single TimeZoneObservance into a list of its transitions.
 * @param observance - The observance to expand.
 * @param rangeEnd - The end of the expansion range.
 * @returns A list of transitions.
 */
export function expandObservanceTransitions(observance: TimeZoneObservance, rangeEnd: DateTime): TimeZoneTransition[] {
  const transitions: TimeZoneTransition[] = []
  const localTransitionStart = DateTime.fromFormat(observance.dtstart, "yyyyMMdd'T'HHmmss", { zone: 'local' })

  const utcTransitionStart = localTransitionStart
    .setZone(FixedOffsetZone.instance(observance.offsetFrom), { keepLocalTime: true })
    .toUTC()

  // If the first transition is after our range, there are no occurrences to add.
  if (utcTransitionStart > rangeEnd) {
    return []
  }

  // Add transitions from RRULE properties
  if (observance.rrule) {
    const rule = parseRruleString(observance.rrule)
    const occurrences = expandRrule({
      dtstart: utcTransitionStart,
      rule,
      rangeEnd,
    })
    for (const occ of occurrences) {
      transitions.push({ transitionTime: occ, offsetTo: observance.offsetTo })
    }
  } else {
    // Add the primary DTSTART transition
    transitions.push({ transitionTime: utcTransitionStart, offsetTo: observance.offsetTo })
  }

  // Add transitions from RDATE properties
  for (const rdateProp of observance.rdates) {
    for (const localRDateTime of parseDateTimeList(rdateProp)) {
      // RDATE must be interpreted relative to the TZOFFSETFROM.
      const utcRDateTime = localRDateTime
        .setZone(FixedOffsetZone.instance(observance.offsetFrom), { keepLocalTime: true })
        .toUTC()
      if (utcRDateTime <= rangeEnd) {
        transitions.push({ transitionTime: utcRDateTime, offsetTo: observance.offsetTo })
      }
    }
  }

  return transitions
}

/**
 * The core logic for finding an offset, assuming transitions have been pre-calculated.
 * @private
 */
function findOffsetWithTransitions(
  localTime: DateTime,
  tzInfo: TimeZoneData,
  transitions: TimeZoneTransition[],
  initialOffset: number,
): number {
  // Determine potential UTC times for the given local time using all unique offsets.
  const allOffsets = [
    ...new Set(transitions.map((t) => t.offsetTo).concat(tzInfo.observances.map((o) => o.offsetFrom))),
  ]
  const potentialUTCTimes = allOffsets.map((offset) => ({
    offset,
    utcTime: localTime.setZone(FixedOffsetZone.instance(offset), { keepLocalTime: true }),
  }))

  const validInterpretations = potentialUTCTimes
    .map(({ offset, utcTime }) => {
      const lastTransition = transitions.filter((t) => t.transitionTime <= utcTime).pop()
      const effectiveOffset = lastTransition ? lastTransition.offsetTo : initialOffset

      // A valid interpretation is when the assumed offset matches the effective offset after the transition.
      if (effectiveOffset === offset) {
        return { utcTime, offset }
      }
      return undefined
    })
    .filter((v) => v !== undefined)
    .sort((a, b) => a.utcTime.toMillis() - b.utcTime.toMillis())

  if (validInterpretations.length === 1) {
    return validInterpretations[0].offset // Unambiguous time
  }
  if (validInterpretations.length > 1) {
    return validInterpretations[0].offset // Ambiguous time (fall back), use first occurrence
  }

  // No valid interpretations means the time is in a "gap" (spring forward).
  // Per RFC 5545, we should use the offset from before the gap.
  // We can find this by identifying the transition that would have just occurred.
  // The 'correct' UTC time would be just after this transition.
  // The earliest potential UTC time is the one calculated with the largest offset (e.g., -0400 vs -0500).
  const earliestPotentialUTC = DateTime.max(...potentialUTCTimes.map((p) => p.utcTime))
  const transitionBeforeGap =
    earliestPotentialUTC !== undefined
      ? transitions.filter((t) => t.transitionTime <= earliestPotentialUTC).pop()
      : undefined

  if (transitionBeforeGap) {
    // We need the offset *before* this transition. We find the observance that created it.
    for (const obs of tzInfo.observances) {
      if (obs.offsetTo === transitionBeforeGap.offsetTo) {
        // This is a candidate. To be more certain, we could check if transitionBeforeGap
        // is one of the expanded dates of this observance, but that is slow.
        // A simple heuristic is that the `offsetFrom` of this observance is the one we want.
        return obs.offsetFrom
      }
    }
  }

  return initialOffset // Fallback
}

const transitionCache = new Map<string, TimeZoneTransition[]>()

/**
 * Finds the correct UTC offset for a given local time within a pre-processed timezone definition.
 * This function dynamically expands recurrence rules to find the correct transition.
 * @param localTime - The local DateTime for which to find the offset.
 * @param tzInfo - The pre-processed timezone data.
 * @returns The applicable UTC offset in minutes.
 */
export function findOffset(localTime: DateTime, tzInfo: TimeZoneData): number {
  if (tzInfo.observances.length === 0) {
    throw new InvalidObservanceError()
  }

  const cacheKey = JSON.stringify(tzInfo.observances)
  if (!transitionCache.has(cacheKey)) {
    // We need a reasonable, very large range to pre-calculate all transitions we might need.
    // Events far in the future might need this. Let's say 100 years from now.
    const expansionRangeEnd = DateTime.now().plus({ years: 10 })

    transitionCache.set(
      cacheKey,
      tzInfo.observances
        .flatMap((obs) => expandObservanceTransitions(obs, expansionRangeEnd))
        .sort((a, b) => a.transitionTime.toMillis() - b.transitionTime.toMillis()),
    )
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const transitions = transitionCache.get(cacheKey)!

  // Determine the offset for any time before the very first transition.
  const getInitialOffset = (): number => {
    // Find the earliest rule and use its `offsetFrom`.
    const firstObservance = tzInfo.observances.reduce((earliest, current) => {
      return current.dtstart < earliest.dtstart ? current : earliest
    })
    return firstObservance.offsetFrom
  }

  const initialOffset = getInitialOffset()

  if (transitions.length === 0 || localTime < transitions[0].transitionTime) {
    return initialOffset
  }

  return findOffsetWithTransitions(localTime, tzInfo, transitions, initialOffset)
}

/**
 * Creates a resolver function that can determine the UTC offset for any given local time and TZID.
 * @param tzData - The pre-built map of all timezone definitions.
 * @returns A TimeZoneResolver function.
 */
export function createTimeZoneResolver(tzData: Map<string, TimeZoneData>): TimeZoneResolver {
  const resolutionCache = new Map<string, ResolutionStrategy>()
  const supportedIntlZones = new Set(Intl.supportedValuesOf('timeZone'))

  const resolveAndCacheTzid = (tzid: string): ResolutionStrategy => {
    const ianaZones = [tzid, ...findIana(tzid)]

    for (const zone of ianaZones) {
      // Priority 1: Check our pre-built `tzData`.
      const tzInfo = tzData.get(zone)
      if (tzInfo) {
        const strategy: ResolutionStrategy = { type: 'tzData', data: tzInfo }
        resolutionCache.set(tzid, strategy)
        return strategy
      }
    }

    for (const zone of ianaZones) {
      // Priority 2: Check for native `Intl` support as a fallback.
      if (supportedIntlZones.has(zone)) {
        const strategy: ResolutionStrategy = { type: 'intl', zone }
        resolutionCache.set(tzid, strategy)
        return strategy
      }
    }

    const strategy: ResolutionStrategy = { type: 'notFound' }
    resolutionCache.set(tzid, strategy)
    return strategy
  }

  return (localTime: DateTime, tzid: string): number => {
    if (!localTime.isValid) {
      throw new Error('Invalid input DateTime')
    }

    const strategy = resolutionCache.get(tzid) ?? resolveAndCacheTzid(tzid)
    switch (strategy.type) {
      case 'tzData':
        return findOffset(localTime, strategy.data)

      case 'intl':
        return localTime.setZone(strategy.zone, { keepLocalTime: true }).offset

      case 'notFound':
        throw new TimeZoneDefinitionNotFoundError(tzid)
    }
  }
}
