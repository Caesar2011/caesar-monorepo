import { CalendarNotFoundError } from './errors.js'
import { type VComponent, type IcsProperty, type ParsedIcs } from './types.js'

/**
 * Unfolds multi-line properties in an ICS file.
 * @param rawLines - An array of lines from the ICS file.
 * @returns An array of unfolded lines.
 */
export function unfoldLines(rawLines: string[]): string[] {
  const unfolded: string[] = []
  let currentLine = ''
  for (const line of rawLines) {
    if (line.startsWith(' ') || line.startsWith('\t')) {
      currentLine += line.substring(1)
    } else {
      if (currentLine) {
        unfolded.push(currentLine)
      }
      currentLine = line
    }
  }
  if (currentLine) {
    unfolded.push(currentLine)
  }
  return unfolded
}

/**
 * Parses a single line into a property with a key, value, and parameters.
 * @param line - An unfolded line from the ICS file.
 * @returns An IcsProperty object or undefined if the line is invalid.
 */
export function parseProperty(line: string): IcsProperty | undefined {
  const separatorIndex = line.indexOf(':')
  if (separatorIndex === -1) {
    return undefined
  }

  const keyPart = line.substring(0, separatorIndex)
  const value = line.substring(separatorIndex + 1)

  const keySegments = keyPart.split(';')
  const key = keySegments[0]
  const params: Record<string, string> = {}

  for (let i = 1; i < keySegments.length; i++) {
    const [paramKey, paramValue] = keySegments[i].split('=')
    if (paramKey && paramValue) {
      params[paramKey] = paramValue
    }
  }

  return { key, value, params }
}

/**
 * Parses an array of lines into a tree of VComponents.
 * @param lines - An array of unfolded ICS lines.
 * @returns An array of top-level VComponents.
 */
export function buildComponentTree(lines: string[]): VComponent[] {
  const componentStack: VComponent[] = []
  const topLevelComponents: VComponent[] = []

  for (const line of lines) {
    if (line.startsWith('BEGIN:')) {
      const type = line.substring(6).trim() as VComponent['type']
      const newComponent: VComponent = { type, properties: [], subComponents: [] }
      if (componentStack.length > 0) {
        componentStack[componentStack.length - 1].subComponents.push(newComponent)
      }
      componentStack.push(newComponent)
    } else if (line.startsWith('END:')) {
      const endedComponent = componentStack.pop()
      if (endedComponent && componentStack.length === 0) {
        topLevelComponents.push(endedComponent)
      }
    } else if (componentStack.length > 0) {
      const prop = parseProperty(line)
      if (prop) {
        componentStack[componentStack.length - 1].properties.push(prop)
      }
    }
  }
  return topLevelComponents
}

/**
 * Parses a raw ICS string into a structured object containing events and timezones.
 * @param icsString - The full content of the .ics file.
 * @returns A ParsedIcs object.
 */
export function parseIcs(icsString: string): ParsedIcs {
  const rawLines = icsString.replace(/\r\n/g, '\n').split('\n')
  const unfolded = unfoldLines(rawLines)
  const allComponents = buildComponentTree(unfolded)

  const calendar = allComponents.find((c) => c.type === 'VCALENDAR')
  if (!calendar) {
    throw new CalendarNotFoundError()
  }

  return {
    events: calendar.subComponents.filter((c) => c.type === 'VEVENT'),
    timezones: calendar.subComponents.filter((c) => c.type === 'VTIMEZONE'),
  }
}
