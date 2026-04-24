import { prepare, getEventsBetween } from '@sebse-tools/ics-parser'
import {
  type IBinaryKeyData,
  type IDataObject,
  type IExecuteFunctions,
  type INodeExecutionData,
  type INodeType,
  type INodeTypeDescription,
  NodeOperationError,
  NodeConnectionTypes,
} from 'n8n-workflow'

export class IcsParser implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'ICS Parser',
    name: 'icsParser',
    icon: 'file:ics-parser.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: 'Parse ICS calendar files and query events by date range.',
    defaults: {
      name: 'ICS Parser',
    },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    properties: [
      // --- Operation selector ---
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Prepare ICS',
            value: 'prepare',
            description: 'Parse a raw ICS file or string into a prepared JSON object',
            action: 'Prepare ICS',
          },
          {
            name: 'Get Events Between Dates',
            value: 'getEvents',
            description: 'Return all events within a date range from a prepared ICS object',
            action: 'Get events between dates',
          },
        ],
        default: 'prepare',
      },

      // --- Prepare ICS: Input Type ---
      {
        displayName: 'Input Type',
        name: 'inputType',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: { operation: ['prepare'] },
        },
        options: [
          {
            name: 'Binary File',
            value: 'binary',
            description: 'Read ICS data from a binary field on the input item',
          },
          {
            name: 'ICS String',
            value: 'string',
            description: 'Provide the ICS content as a plain text string',
          },
        ],
        default: 'binary',
      },

      // --- Prepare ICS: Binary field name (shown only when inputType = binary) ---
      {
        displayName: 'Input Data Field Name',
        name: 'binaryPropertyName',
        type: 'string',
        default: 'data',
        required: true,
        displayOptions: {
          show: {
            operation: ['prepare'],
            inputType: ['binary'],
          },
        },
        description: 'Name of the binary field on the input item that contains the .ics file',
        hint: 'The field name set by the node that provided the file, e.g. "data"',
      },

      // --- Prepare ICS: Raw ICS string (shown only when inputType = string) ---
      {
        displayName: 'ICS String',
        name: 'icsString',
        type: 'string',
        default: '',
        required: true,
        typeOptions: { rows: 6 },
        displayOptions: {
          show: {
            operation: ['prepare'],
            inputType: ['string'],
          },
        },
        description: 'The raw ICS calendar content',
      },

      // --- Get Events: Prepared ICS JSON ---
      {
        displayName: 'Prepared ICS',
        name: 'preparedIcs',
        type: 'json',
        default: '{}',
        required: true,
        displayOptions: {
          show: { operation: ['getEvents'] },
        },
        description: 'The prepared ICS object produced by the "Prepare ICS" operation',
        hint: 'Map this from the output of a preceding ICS Parser (Prepare ICS) node',
      },

      // --- Get Events: Start Date ---
      {
        displayName: 'Start Date',
        name: 'startDate',
        type: 'dateTime',
        default: '',
        required: true,
        displayOptions: {
          show: { operation: ['getEvents'] },
        },
        description: 'Start of the date range (inclusive)',
      },

      // --- Get Events: End Date ---
      {
        displayName: 'End Date',
        name: 'endDate',
        type: 'dateTime',
        default: '',
        required: true,
        displayOptions: {
          show: { operation: ['getEvents'] },
        },
        description: 'End of the date range (inclusive)',
      },
    ],
  }

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData()
    const operation = this.getNodeParameter('operation', 0) as string
    const returnData: INodeExecutionData[] = []

    for (let i = 0; i < items.length; i++) {
      try {
        if (operation === 'prepare') {
          const inputType = this.getNodeParameter('inputType', i) as string
          let icsContent: string

          if (inputType === 'binary') {
            const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string
            const binaryData = (items[i].binary as IBinaryKeyData)?.[binaryPropertyName]

            if (!binaryData) {
              throw new NodeOperationError(
                this.getNode(),
                `Binary field '${binaryPropertyName}' not found on input item`,
                { itemIndex: i },
              )
            }

            const buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName)
            icsContent = buffer.toString('utf8')
          } else {
            icsContent = this.getNodeParameter('icsString', i) as string

            if (!icsContent.trim()) {
              throw new NodeOperationError(this.getNode(), 'ICS String must not be empty', { itemIndex: i })
            }
          }

          const preparedIcs = prepare(icsContent)
          const executionData = this.helpers.constructExecutionMetaData(
            this.helpers.returnJsonArray(preparedIcs as unknown as IDataObject),
            { itemData: { item: i } },
          )
          returnData.push(...executionData)
        } else if (operation === 'getEvents') {
          const rawPrepared = this.getNodeParameter('preparedIcs', i)
          // n8n may return the JSON field as a string or already-parsed object
          const preparedIcs = typeof rawPrepared === 'string' ? JSON.parse(rawPrepared) : rawPrepared

          const startRaw = this.getNodeParameter('startDate', i) as string
          const endRaw = this.getNodeParameter('endDate', i) as string

          // n8n dateTime parameters return ISO strings; slice to YYYY-MM-DD
          const startDate = new Date(startRaw).toISOString().slice(0, 10)
          const endDate = new Date(endRaw).toISOString().slice(0, 10)

          const events = getEventsBetween(preparedIcs, startDate, endDate)
          const executionData = this.helpers.constructExecutionMetaData(
            this.helpers.returnJsonArray(events as unknown as IDataObject[]),
            { itemData: { item: i } },
          )
          returnData.push(...executionData)
        }
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: { error: (error as Error).message },
            pairedItem: { item: i },
          })
          continue
        }
        throw error
      }
    }

    return [returnData]
  }
}
