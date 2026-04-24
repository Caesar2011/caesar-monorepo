This package is a complete TypeScript implementation of [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545) for parsing, preparing, and querying iCalendar (`.ics`) data. It exposes a low-level, composable API that can be consumed by any application needing structured calendar event data.

### Key Features

- **Two-Phase Processing**: `prepare()` parses raw ICS strings into a structured `PreparedIcs` object (VEVENT components + timezone map). `getEventsBetween()` then expands that data for a given UTC time range — enabling efficient caching between the two steps.
- **Serialize / Deserialize**: `serialize()` and `deserialize()` convert `PreparedIcs` to/from JSON, allowing prepared data to be stored and reloaded without re-parsing.
- **Full RFC 5545 RRULE Expansion**: Recurring events are expanded via a generator-based engine with complete support for `FREQ`, `INTERVAL`, `COUNT`, `UNTIL`, `BYDAY`, `BYMONTHDAY`, `BYMONTH`, `BYWEEKNO`, `BYYEARDAY`, `BYSETPOS`, `WKST`, `RDATE`, and `EXDATE`.
- **DST-Aware Timezone Resolution**: VTIMEZONE components are processed into transition tables. UTC offsets are resolved correctly across DST boundaries, including ambiguous (fall-back) and non-existent (spring-forward) local times.
- **Windows Timezone Support**: Non-IANA timezone identifiers (e.g., `Eastern Standard Time`) are resolved to IANA equivalents via `windows-iana`.
- **Unexpanded Event Access**: `getUnexpandedEvents()` returns parsed but non-expanded events — useful for search without generating all recurrence instances.
- **RFC 5545 Exception Handling**: Recurring event overrides (`RECURRENCE-ID`) and exclusions (`EXDATE`) are correctly applied per UID group during full calendar expansion.
