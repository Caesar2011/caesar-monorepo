This node integrates [`@sebse-tools/ics-parser`](https://www.npmjs.com/package/@sebse-tools/ics-parser) into n8n workflows, enabling parsing and querying of iCalendar (`.ics`) data directly inside your automations.

## Parameters

| Parameter             | Type     | Description                                                                         |
| --------------------- | -------- | ----------------------------------------------------------------------------------- |
| Input Type            | Options  | `Binary File` or `ICS String`.                                                      |
| Input Data Field Name | String   | Binary only. Name of the binary field on the input item containing the `.ics` file. |
| ICS String            | String   | String only. Raw ICS calendar content.                                              |
| Start Date            | DateTime | Start of the date range, inclusive.                                                 |
| End Date              | DateTime | End of the date range, inclusive.                                                   |

**Output.** One item per event occurrence found in the range.

## Usage

### Typical workflow: Fetch and Query

```
HTTP Request  →  ICS Parser
```

1. **HTTP Request node.** `GET` your calendar URL, e.g. a CalDAV public share or a `.ics` file URL. Set **Response Format** to `File` to receive binary output, or `Text` to pass the raw string.

2. **ICS Parser.**

- Binary file input: set **Input Type** to `Binary File` and **Input Data Field Name** to `data`.
- Text input: set **Input Type** to `ICS String` and map the response body to **ICS String** via an expression, e.g. `{{ $json.body }}`.
- Set **Start Date** and **End Date** using expressions or fixed values, e.g. `{{ $now }}` and `{{ $now.plus(7, 'days') }}`.

### Example. Weekly agenda digest

```
Schedule Trigger (every Monday)
  → HTTP Request (fetch calendar .ics)
  → ICS Parser
      Input Type:  Binary File, field "data"
      Start Date:  {{ $now.startOf('week') }}
      End Date:    {{ $now.endOf('week') }}
  → Send Email, Slack, etc.
```
