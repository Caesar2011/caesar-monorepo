export class IcsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IcsError'
  }
}

export class TimeZoneDefinitionNotFoundError extends IcsError {
  constructor(tzid: string) {
    super(`Timezone definition for TZID="${tzid}" not found.`)
    this.name = 'TimeZoneDefinitionNotFoundError'
  }
}

export class InvalidObservanceError extends IcsError {
  constructor() {
    super('Time zone data contains no valid observances.')
    this.name = 'InvalidObservanceError'
  }
}

export class CalendarNotFoundError extends IcsError {
  constructor() {
    super('Invalid ICS: No VCALENDAR component found.')
    this.name = 'CalendarNotFoundError'
  }
}

export class InvalidRruleError extends IcsError {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidRruleError'
  }
}
