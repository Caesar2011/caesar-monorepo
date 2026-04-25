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
    description: 'Parse an ICS calendar and return all events within a date range.',
    defaults: {
      name: 'ICS Parser',
    },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    properties: [
      {
        displayName: 'Input Type',
        name: 'inputType',
        type: 'options',
        noDataExpression: true,
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

      {
        displayName: 'Input Data Field Name',
        name: 'binaryPropertyName',
        type: 'string',
        default: 'data',
        required: true,
        displayOptions: {
          show: { inputType: ['binary'] },
        },
        description: 'Name of the binary field on the input item that contains the .ics file',
        hint: 'The field name set by the node that provided the file, e.g. "data"',
      },

      {
        displayName: 'ICS String',
        name: 'icsString',
        type: 'string',
        default: '',
        required: true,
        typeOptions: { rows: 6 },
        displayOptions: {
          show: { inputType: ['string'] },
        },
        description: 'The raw ICS calendar content',
      },

      {
        displayName: 'Start Date',
        name: 'startDate',
        type: 'dateTime',
        default: '1970-01-01T00:00:00.000Z',
        description: 'Start of the date range, inclusive. Defaults to 1970-01-01.',
      },

      {
        displayName: 'End Date',
        name: 'endDate',
        type: 'dateTime',
        default: '3000-12-31T23:59:59.000Z',
        description: 'End of the date range, inclusive. Defaults to 3000-12-31.',
      },
    ],
  }

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData()
    const returnData: INodeExecutionData[] = []

    for (let i = 0; i < items.length; i++) {
      try {
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

        const startRaw = (this.getNodeParameter('startDate', i) as string) || '1970-01-01T00:00:00.000Z'
        const endRaw = (this.getNodeParameter('endDate', i) as string) || '3000-12-31T23:59:59.000Z'

        // n8n dateTime parameters return ISO strings; slice to YYYY-MM-DD
        const startDate = new Date(startRaw).toISOString().slice(0, 10)
        const endDate = new Date(endRaw).toISOString().slice(0, 10)

        const preparedIcs = prepare(icsContent)
        const events = getEventsBetween(preparedIcs, startDate, endDate)

        const executionData = this.helpers.constructExecutionMetaData(
          this.helpers.returnJsonArray(events as unknown as IDataObject[]),
          { itemData: { item: i } },
        )
        returnData.push(...executionData)
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
