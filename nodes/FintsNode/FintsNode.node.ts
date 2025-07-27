import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionType,
	NodeOperationError,
} from 'n8n-workflow';

// Use the 'fints' package (npm install fints)
import { PinTanClient, PinTanClientConfig } from 'fints';
import banks from './banks.json';

const bankOptions = banks.map((b) => ({ name: b.displayName, value: b.value }));
const bankMap: Record<string, { blz: string; fintsUrl: string }> = banks.reduce(
	(acc, b) => {
		acc[b.value] = { blz: b.blz, fintsUrl: b.fintsUrl };
		return acc;
	},
	{} as Record<string, { blz: string; fintsUrl: string }>,
);

export class FintsNode implements INodeType {
	description: INodeTypeDescription = {
		credentials: [
			{
				name: 'fintsApi',
				required: true,
			},
		],
		defaults: {
			name: 'FinTS Account Balance',
		},
		description: 'Retrieves the account balance for all accounts via FinTS/HBCI',
		displayName: 'FinTS Account Balance',
		icon: 'file:fintsNodeLogo.svg',
		group: ['transform'],
		inputs: [NodeConnectionType.Main],
		name: 'fintsNode',
		outputs: [NodeConnectionType.Main],
		properties: [
			{
				displayName: 'Select Bank',
				default: 'ING',
				description: 'Select your bank. BLZ and FinTS URL will be set automatically.',
				name: 'bank',
				options: bankOptions,
				type: 'options',
			},
			{
				displayName: 'Expert Mode: Enter BLZ and FinTS URL Manually',
				name: 'expertMode',
				type: 'boolean',
				default: false,
			},
			{
				displayName: 'Bank Code (BLZ)',
				name: 'blz',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						expertMode: [true],
					},
				},
			},
			{
				displayName: 'FinTS Server URL',
				name: 'fintsUrl',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						expertMode: [true],
					},
				},
			},
			{
				displayName: 'FinTS Registration Number',
				name: 'fintsProductId',
				type: 'string',
				default: '',
				description:
					'The FinTS Product ID to use. Whether this field is required depends on the bank. Please try leaving it empty at first. If you receive an error with code 9050, the bank requires registration for usage.',
			},
			{
				displayName: 'Start Date',
				name: 'startDate',
				type: 'dateTime',
				default: '',
				description: 'Fetch statements starting from this date. Defaults to 14 days ago.',
			},
			{
				displayName: 'End Date',
				name: 'endDate',
				type: 'dateTime',
				default: '',
				description: 'Fetch statements up to this date. Defaults to today.',
			},
		],
		version: 1,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const credentials = await this.getCredentials('fintsApi');

		let blz: string;
		let fintsUrl: string;

		const expertMode = this.getNodeParameter('expertMode', 0) as boolean;

		if (expertMode) {
			blz = this.getNodeParameter('blz', 0) as string;
			fintsUrl = this.getNodeParameter('fintsUrl', 0) as string;
		} else {
			const bank = this.getNodeParameter('bank', 0) as string;
			const entry = bankMap[bank];
			if (!entry) {
				throw new NodeOperationError(this.getNode(), `Unknown bank: ${bank}`);
			}
			blz = entry.blz;
			fintsUrl = entry.fintsUrl;
		}

		const startDateStr = this.getNodeParameter('startDate', 0, '') as string;
		const endDateStr = this.getNodeParameter('endDate', 0, '') as string;

		let fintsProductId = this.getNodeParameter('fintsProductId', 0) as string;

		const startDate = startDateStr
			? new Date(startDateStr)
			: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
		const endDate = endDateStr ? new Date(endDateStr) : new Date();

		const userId = credentials.userId as string;
		const pin = credentials.pin as string;

		const configPinTanClient: PinTanClientConfig = {
			url: fintsUrl,
			name: userId,
			pin,
			blz,
		};

		if (fintsProductId.length > 0) {
			configPinTanClient.productId = fintsProductId;
		}

		const client = new PinTanClient(configPinTanClient);

		const accounts = await client.accounts();
		if (!accounts || accounts.length === 0) {
			throw new NodeOperationError(this.getNode(), 'No Accounts found');
		}

		const results = [] as Array<{
			account: string | null;
			bank: string;
			balance: number | null;
			currency: string | null;
			transactions: Array<any>;
		}>;
		for (const account of accounts) {
			try {
				const statements = await client.statements(account, startDate, endDate);

				let balance = null;
				let currency = null;
				let transactions: Array<any> = [];

				if (statements && statements.length > 0) {
					const latest = statements[0];
					balance = (latest.closingBalance && latest.closingBalance.value) || null;

					currency = (latest.closingBalance && latest.closingBalance.currency) || null;
					transactions = latest.transactions.flatMap((t) => {
						const text =
							t.descriptionStructured?.name !== ' '
								? t.descriptionStructured?.name
								: t.descriptionStructured?.text;

						return {
							currency: t.currency,
							amount: t.isCredit ? t.amount : -t.amount,
							valueDate: t.valueDate,
							text,
							reference: t.bankReference,
							isCredit: t.isCredit,
							isExpense: t.isExpense,
						};
					});
				}

				results.push({
					account: account.iban || account.accountNumber || null,
					bank: blz,
					balance,
					currency,
					transactions,
				});
			} catch (e) {
				// Could not get the balance for this account.
				// This is normal for some account types (e.g. securities/stock depots),
				// since those accounts do not provide a balance via FinTS.
				// Continue processing the remaining accounts.
				if (this.logger) {
					this.logger.warn((e as Error).message);
				}
			}
		}

		return [this.helpers.returnJsonArray(results)];
	}
}
