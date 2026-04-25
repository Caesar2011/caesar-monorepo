This node converts between JSON and TOON (Token-Oriented Object Notation), a lightweight, human-readable, LLM-friendly format for structured data.

## What is TOON?

TOON represents JSON in a compact, indentation-based text format:

- **Objects** become `key: value` lines
- **Arrays of objects** become pipe-separated tables
- **Primitive arrays** become comma-separated lists
- **Nested structures** are indented with 2 spaces

**Example — JSON:**

```json
{
  "name": "Alice",
  "scores": [10, 20, 30],
  "address": {
    "city": "Berlin",
    "zip": "10115"
  }
}
```

**Same data as TOON:**

```
name: Alice
scores:
  10, 20, 30
address:
  city: Berlin
  zip: 10115
```

**Array of objects becomes a table:**

```
name | age | city
Alice | 30 | Berlin
Bob | 25 | Hamburg
```

## Parameters

| Parameter    | Type   | Description                                              |
| ------------ | ------ | -------------------------------------------------------- |
| Operation    | Option | `JSON to TOON` or `TOON to JSON`.                        |
| Input Field  | String | Name of the field on the input item to read from.        |
| Output Field | String | Name of the field on the output item to write result to. |

## Usage

### JSON to TOON

Reads the value of **Input Field** from the input item, serialises it to TOON text, and writes the result to **Output Field**.

Useful for reducing token count when passing structured data to an AI/LLM node.

### TOON to JSON

Reads the TOON string from **Input Field**, parses it back into a JSON object, and writes the result to **Output Field**.

Useful for deserialising LLM output back into structured data for downstream nodes.

## Example Workflow

```
HTTP Request (fetch JSON data)
  → TOON Converter (JSON to TOON)
  → AI Agent / LLM node
  → TOON Converter (TOON to JSON)
  → Further processing
```
