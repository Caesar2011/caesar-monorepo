import {
  type IDataObject,
  type IExecuteFunctions,
  type INodeExecutionData,
  type INodeType,
  type INodeTypeDescription,
  NodeOperationError,
  NodeConnectionTypes,
  type GenericValue,
} from 'n8n-workflow'

// ==========================================================
// JSON → TOON
// ==========================================================

function stringify(value: unknown): string {
  // eslint-disable-next-line no-restricted-syntax
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  if (typeof value === 'number') return String(value)
  return String(value)
}

function cellStringify(value: unknown): string {
  if (value && typeof value === 'object') return JSON.stringify(value)
  return stringify(value)
}

function jsonToToon(data: unknown, indent = 0): string {
  const pad = '  '.repeat(indent)

  if (Array.isArray(data)) {
    if (data.length === 0) return pad + '[]'

    if (data.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
      const keys: string[] = []
      for (const item of data as IDataObject[]) {
        for (const k of Object.keys(item)) {
          if (!keys.includes(k)) keys.push(k)
        }
      }
      const header = pad + keys.join(' | ')
      const rows = (data as IDataObject[]).map(
        (item) => pad + keys.map((k) => cellStringify(item[k] ?? '')).join(' | '),
      )
      return [header, ...rows].join('\n')
    }

    return pad + data.map(cellStringify).join(', ')
  }

  if (data && typeof data === 'object') {
    const lines: string[] = []
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object') {
        lines.push(`${pad}${key}:\n${jsonToToon(value, indent + 1)}`)
      } else {
        lines.push(`${pad}${key}: ${stringify(value)}`)
      }
    }
    return lines.join('\n')
  }

  return pad + stringify(data)
}

// ==========================================================
// TOON → JSON
// ==========================================================

const FLOAT_RE = /^-?\d+\.\d+$/
const INT_RE = /^-?\d+$/

function parseValue(v: string): IDataObject | IDataObject[] | GenericValue | GenericValue[] {
  v = v.trim()

  if (v === '[]') return []
  if (v === '{}') return {}
  // eslint-disable-next-line no-restricted-syntax
  if (v === 'null') return null as unknown as GenericValue

  if ((v.startsWith('{') && v.endsWith('}')) || (v.startsWith('[') && v.endsWith(']'))) {
    try {
      return JSON.parse(v)
    } catch {
      /* fall through */
    }
  }

  if (v.toLowerCase() === 'true') return true
  if (v.toLowerCase() === 'false') return false
  if (FLOAT_RE.test(v)) return parseFloat(v)
  if (INT_RE.test(v)) return parseInt(v, 10)

  return v
}

function parseTableBlock(lines: string[], i: number): [IDataObject[], number] {
  const headerLine = lines[i]
  const headerIndent = headerLine.length - headerLine.trimStart().length
  const header = headerLine
    .trim()
    .split('|')
    .map((h) => h.trim())
  i++

  const rows: IDataObject[] = []
  while (i < lines.length) {
    const line = lines[i]
    const indent = line.length - line.trimStart().length
    if (indent < headerIndent || !line.includes('|')) break
    const cells = line
      .trim()
      .split('|')
      .map((c) => c.trim())
    const row: IDataObject = {}
    header.forEach((key, idx) => {
      row[key] = parseValue(cells[idx] ?? '')
    })
    rows.push(row)
    i++
  }

  return [rows, i]
}

function parseListBlock(lines: string[], start: number, baseIndent: number): [unknown[], number] {
  const items: unknown[] = []
  let i = start
  while (i < lines.length) {
    const line = lines[i]
    const indent = line.length - line.trimStart().length
    if (indent < baseIndent) break
    const stripped = line.trim()
    if (stripped.includes(':')) break
    stripped
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .forEach((p) => items.push(parseValue(p)))
    i++
  }
  return [items, i]
}

function parseBlock(lines: string[], start: number, baseIndent: number): [IDataObject, number] {
  const obj: IDataObject = {}
  let i = start

  while (i < lines.length) {
    const line = lines[i]
    const indent = line.length - line.trimStart().length
    if (indent < baseIndent) break

    const stripped = line.trim()
    if (!stripped.includes(':') || stripped.startsWith('|')) break

    const colonIdx = stripped.indexOf(':')
    const key = stripped.slice(0, colonIdx).trim()
    const valueStr = stripped.slice(colonIdx + 1).trim()

    if (valueStr === '') {
      const j = i + 1
      if (j >= lines.length) {
        obj[key] = {}
        i = j
        continue
      }

      const nextLine = lines[j]
      const nextIndent = nextLine.length - nextLine.trimStart().length

      if (nextIndent < indent + 2) {
        obj[key] = {}
        i = j
        continue
      }

      const nextStripped = nextLine.trim()

      if (nextStripped.includes(' | ') && !nextStripped.includes(':')) {
        const [table, newI] = parseTableBlock(lines, j)
        obj[key] = table
        i = newI
        continue
      }

      if (nextStripped.includes(':')) {
        const [subObj, newI] = parseBlock(lines, j, indent + 2)
        obj[key] = subObj
        i = newI
        continue
      }

      const [arr, newI] = parseListBlock(lines, j, indent + 2)
      obj[key] = arr
      i = newI
      continue
    }

    // Inline table header after colon
    if (valueStr.includes(' | ') && !valueStr.includes(':')) {
      const header = valueStr.split('|').map((h) => h.trim())
      const rows: IDataObject[] = []
      let j = i + 1
      while (j < lines.length) {
        const rowLine = lines[j]
        const rowIndent = rowLine.length - rowLine.trimStart().length
        if (rowIndent <= indent || !rowLine.includes('|')) break
        const cells = rowLine
          .trim()
          .split('|')
          .map((c) => c.trim())
        const row: IDataObject = {}
        header.forEach((h, idx) => {
          row[h] = parseValue(cells[idx] ?? '')
        })
        rows.push(row)
        j++
      }
      obj[key] = rows
      i = j
      continue
    }

    obj[key] = parseValue(valueStr)
    i++
  }

  return [obj, i]
}

function toonToJson(toonText: string): unknown {
  const lines = toonText
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() && !l.trim().startsWith('#'))

  const [parsed] = parseBlock(lines, 0, 0)
  return parsed
}

// ==========================================================
// Node
// ==========================================================

export class Toon implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'TOON Converter',
    name: 'toon',
    icon: 'file:toon.svg',
    group: ['transform'],
    version: 1,
    description: 'Convert between JSON and TOON (Token-Oriented Object Notation).',
    defaults: { name: 'TOON Converter' },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    properties: [
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'JSON to TOON',
            value: 'jsonToToon',
            description: 'Convert a JSON field to TOON text',
            action: 'Convert JSON to TOON',
          },
          {
            name: 'TOON to JSON',
            value: 'toonToJson',
            description: 'Parse a TOON text field into JSON',
            action: 'Convert TOON to JSON',
          },
        ],
        default: 'jsonToToon',
      },
      {
        displayName: 'Input Field',
        name: 'inputField',
        type: 'string',
        default: 'data',
        required: true,
        description: 'Name of the input item field to read from',
      },
      {
        displayName: 'Output Field',
        name: 'outputField',
        type: 'string',
        default: 'toon',
        required: true,
        description: 'Name of the output item field to write the result to',
      },
    ],
  }

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData()
    const returnData: INodeExecutionData[] = []

    for (let i = 0; i < items.length; i++) {
      try {
        const operation = this.getNodeParameter('operation', i) as string
        const inputField = this.getNodeParameter('inputField', i) as string
        const outputField = this.getNodeParameter('outputField', i) as string
        const inputValue = items[i].json[inputField]

        let result: unknown

        if (operation === 'jsonToToon') {
          if (inputValue === undefined) {
            throw new NodeOperationError(this.getNode(), `Field '${inputField}' not found on input item`, {
              itemIndex: i,
            })
          }
          result = jsonToToon(inputValue)
        } else {
          if (typeof inputValue !== 'string') {
            throw new NodeOperationError(
              this.getNode(),
              `Field '${inputField}' must be a string containing TOON text`,
              { itemIndex: i },
            )
          }
          result = toonToJson(inputValue)
        }

        const executionData = this.helpers.constructExecutionMetaData(
          this.helpers.returnJsonArray([{ ...items[i].json, [outputField]: result } as IDataObject]),
          { itemData: { item: i } },
        )
        returnData.push(...executionData)
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } })
          continue
        }
        throw error
      }
    }

    return [returnData]
  }
}
