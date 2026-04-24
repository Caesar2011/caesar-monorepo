import { describe, it, expect } from 'vitest'

import { findProperty, findProperties } from './utils.js'

import type { VComponent, IcsProperty } from './types.js'

// Mock data to be used across tests
const mockPropertySummary: IcsProperty = { key: 'SUMMARY', value: 'Test Event', params: {} }
const mockPropertyDtstart: IcsProperty = { key: 'DTSTART', value: '20240101T100000Z', params: { TZID: 'UTC' } }
const mockPropertyAttendee1: IcsProperty = { key: 'ATTENDEE', value: 'mailto:one@example.com', params: {} }
const mockPropertyAttendee2: IcsProperty = { key: 'ATTENDEE', value: 'mailto:two@example.com', params: {} }

const mockComponent: VComponent = {
  type: 'VEVENT',
  properties: [mockPropertySummary, mockPropertyDtstart, mockPropertyAttendee1, mockPropertyAttendee2],
  subComponents: [],
}

const emptyComponent: VComponent = {
  type: 'VEVENT',
  properties: [],
  subComponents: [],
}

describe('utils', () => {
  describe('findProperty', () => {
    it('should find and return a property that exists once', () => {
      const result = findProperty(mockComponent, 'SUMMARY')
      expect(result).toEqual(mockPropertySummary)
    })

    it('should return only the first property when multiple matches exist', () => {
      const result = findProperty(mockComponent, 'ATTENDEE')
      // It should return the first ATTENDEE property
      expect(result).toEqual(mockPropertyAttendee1)
    })

    it('should return undefined if the property key does not exist', () => {
      const result = findProperty(mockComponent, 'LOCATION')
      expect(result).toBeUndefined()
    })

    it('should return undefined when searching in a component with no properties', () => {
      const result = findProperty(emptyComponent, 'SUMMARY')
      expect(result).toBeUndefined()
    })
  })

  describe('findProperties', () => {
    it('should find and return an array of all properties matching the key', () => {
      const result = findProperties(mockComponent, 'ATTENDEE')
      expect(result).toHaveLength(2)
      expect(result).toEqual([mockPropertyAttendee1, mockPropertyAttendee2])
    })

    it('should return an array with a single element if only one property matches', () => {
      const result = findProperties(mockComponent, 'DTSTART')
      expect(result).toHaveLength(1)
      expect(result).toEqual([mockPropertyDtstart])
    })

    it('should return an empty array if no properties match the key', () => {
      const result = findProperties(mockComponent, 'LOCATION')
      expect(result).toHaveLength(0)
      expect(result).toEqual([])
    })

    it('should return an empty array when searching in a component with no properties', () => {
      const result = findProperties(emptyComponent, 'SUMMARY')
      expect(result).toHaveLength(0)
      expect(result).toEqual([])
    })
  })
})
