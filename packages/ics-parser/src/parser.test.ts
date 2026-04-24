import { describe, it, expect } from 'vitest'

import { CalendarNotFoundError } from './errors.js'
import { unfoldLines, parseProperty, buildComponentTree, parseIcs } from './parser.js'

describe('parser.ts', () => {
  describe('unfoldLines', () => {
    it('should unfold a simple multi-line property', () => {
      const lines = ['DESCRIPTION:This is a long description that', '  spans multiple lines.']
      const expected = ['DESCRIPTION:This is a long description that spans multiple lines.']
      expect(unfoldLines(lines)).toEqual(expected)
    })

    it('should handle lines folded with a tab', () => {
      const lines = ['SUMMARY:A summary folded', '\twith a tab.']
      const expected = ['SUMMARY:A summary foldedwith a tab.']
      expect(unfoldLines(lines)).toEqual(expected)
    })

    it('should handle multiple folded lines consecutively', () => {
      const lines = ['DESCRIPTION:Line 1', ' Line 2', ' Line 3']
      const expected = ['DESCRIPTION:Line 1Line 2Line 3']
      expect(unfoldLines(lines)).toEqual(expected)
    })

    it('should not change anything if no lines are folded', () => {
      const lines = ['BEGIN:VEVENT', 'SUMMARY:Simple event', 'END:VEVENT']
      expect(unfoldLines(lines)).toEqual(lines)
    })

    it('should return an empty array for empty input', () => {
      expect(unfoldLines([])).toEqual([])
    })
  })

  describe('parseProperty', () => {
    it('should parse a simple key-value property', () => {
      const line = 'PRODID:-//MyCorp//NONSGML App//EN'
      const expected = { key: 'PRODID', value: '-//MyCorp//NONSGML App//EN', params: {} }
      expect(parseProperty(line)).toEqual(expected)
    })

    it('should parse a property with a single parameter', () => {
      const line = 'DTSTART;TZID=America/New_York:19980119T020000'
      const expected = {
        key: 'DTSTART',
        value: '19980119T020000',
        params: { TZID: 'America/New_York' },
      }
      expect(parseProperty(line)).toEqual(expected)
    })

    it('should parse a property with multiple parameters', () => {
      const line = 'ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;CN=John Doe:mailto:john.doe@example.com'
      const expected = {
        key: 'ATTENDEE',
        value: 'mailto:john.doe@example.com',
        params: {
          ROLE: 'REQ-PARTICIPANT',
          PARTSTAT: 'NEEDS-ACTION',
          CN: 'John Doe',
        },
      }
      expect(parseProperty(line)).toEqual(expected)
    })

    it('should handle colons in the property value', () => {
      const line = 'SUMMARY:This is a summary: with a colon'
      const expected = { key: 'SUMMARY', value: 'This is a summary: with a colon', params: {} }
      expect(parseProperty(line)).toEqual(expected)
    })

    it('should return undefined for a line without a colon', () => {
      const line = 'INVALID-LINE'
      expect(parseProperty(line)).toBeUndefined()
    })

    it('should handle a property with a key but an empty value', () => {
      const line = 'DESCRIPTION:'
      const expected = { key: 'DESCRIPTION', value: '', params: {} }
      expect(parseProperty(line)).toEqual(expected)
    })
  })

  describe('buildComponentTree', () => {
    it('should build a simple, single-level component', () => {
      const lines = ['BEGIN:VEVENT', 'UID:123', 'SUMMARY:Test', 'END:VEVENT']
      const tree = buildComponentTree(lines)
      expect(tree).toHaveLength(1)
      expect(tree[0].type).toBe('VEVENT')
      expect(tree[0].properties).toHaveLength(2)
      expect(tree[0].properties[0].key).toBe('UID')
      expect(tree[0].subComponents).toHaveLength(0)
    })

    it('should build nested components (VTIMEZONE with STANDARD/DAYLIGHT)', () => {
      const lines = [
        'BEGIN:VTIMEZONE',
        'TZID:America/New_York',
        'BEGIN:STANDARD',
        'DTSTART:20071104T020000',
        'END:STANDARD',
        'BEGIN:DAYLIGHT',
        'DTSTART:20070311T020000',
        'END:DAYLIGHT',
        'END:VTIMEZONE',
      ]
      const tree = buildComponentTree(lines)
      expect(tree).toHaveLength(1)
      expect(tree[0].type).toBe('VTIMEZONE')
      expect(tree[0].properties[0].key).toBe('TZID')
      expect(tree[0].subComponents).toHaveLength(2)
      expect(tree[0].subComponents[0].type).toBe('STANDARD')
      expect(tree[0].subComponents[0].properties[0].value).toBe('20071104T020000')
      expect(tree[0].subComponents[1].type).toBe('DAYLIGHT')
    })

    it('should ignore properties outside of any component', () => {
      const lines = ['PRODID:test', 'BEGIN:VEVENT', 'UID:123', 'END:VEVENT', 'VERSION:2.0']
      const tree = buildComponentTree(lines)
      // Only the VEVENT should be parsed; properties outside are ignored by this function.
      expect(tree).toHaveLength(1)
      expect(tree[0].type).toBe('VEVENT')
    })

    it('should handle mismatched BEGIN/END tags by simply popping the stack', () => {
      const lines = ['BEGIN:VEVENT', 'UID:123', 'END:VTODO']
      const tree = buildComponentTree(lines)
      expect(tree).toHaveLength(1)
      expect(tree[0].type).toBe('VEVENT') // The component is created
    })

    it('should handle unterminated components by not adding them to the top level', () => {
      const lines = ['BEGIN:VEVENT', 'UID:123']
      const tree = buildComponentTree(lines)
      expect(tree).toHaveLength(0)
    })

    it('should handle multiple top-level components', () => {
      const lines = ['BEGIN:VEVENT', 'END:VEVENT', 'BEGIN:VTIMEZONE', 'END:VTIMEZONE']
      const tree = buildComponentTree(lines)
      expect(tree).toHaveLength(2)
      expect(tree.map((c) => c.type)).toEqual(['VEVENT', 'VTIMEZONE'])
    })
  })

  describe('parseIcs', () => {
    it('should parse a full, valid ICS string and separate events and timezones', () => {
      const icsString = [
        'BEGIN:VCALENDAR',
        'PRODID:test',
        'VERSION:2.0',
        'BEGIN:VTIMEZONE',
        'TZID:My/Zone',
        'END:VTIMEZONE',
        'BEGIN:VEVENT',
        'UID:event1',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:event2',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n')

      const parsed = parseIcs(icsString)
      expect(parsed.events).toHaveLength(2)
      expect(parsed.timezones).toHaveLength(1)
      expect(parsed.events[0].properties[0].value).toBe('event1')
      expect(parsed.timezones[0].properties[0].value).toBe('My/Zone')
    })

    it('should throw CalendarNotFoundError if VCALENDAR is missing', () => {
      const icsString = 'BEGIN:VEVENT\r\nEND:VEVENT'
      expect(() => parseIcs(icsString)).toThrow(CalendarNotFoundError)
    })

    it('should correctly handle an empty VCALENDAR', () => {
      const icsString = 'BEGIN:VCALENDAR\r\nEND:VCALENDAR'
      const parsed = parseIcs(icsString)
      expect(parsed.events).toEqual([])
      expect(parsed.timezones).toEqual([])
    })

    it('should handle different line endings (\\n)', () => {
      const icsString = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:event1', 'END:VEVENT', 'END:VCALENDAR'].join('\n')
      const parsed = parseIcs(icsString)
      expect(parsed.events).toHaveLength(1)
      expect(parsed.events[0].properties[0].value).toBe('event1')
    })

    it('should correctly filter out non-event/timezone components', () => {
      const icsString = [
        'BEGIN:VCALENDAR',
        'BEGIN:VFREEBUSY',
        'END:VFREEBUSY',
        'BEGIN:VEVENT',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n')
      const parsed = parseIcs(icsString)
      expect(parsed.events).toHaveLength(1)
      expect(parsed.timezones).toHaveLength(0)
    })
  })
})
