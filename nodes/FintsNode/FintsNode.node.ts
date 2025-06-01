import { IExecuteFunctions, NodeConnectionType } from 'n8n-workflow';
import {
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

// Use the 'fints' package (npm install fints)
import { PinTanClient } from 'fints';

export class FintsNode implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'FinTS Account Balance',
		name: 'fintsNode',
		group: ['transform'],
		version: 1,
		description: 'Retrieves the account balance for all accounts via FinTS/HBCI',
		defaults: {
			name: 'FinTS Account Balance',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'fintsApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Select Bank',
				name: 'bank',
				type: 'options',
                                options: [
                                        { name: 'Comdirect', value: 'Comdirect' },
                                        { name: 'Commerzbank', value: 'Commerzbank' },
                                        { name: 'DKB', value: 'DKB' },
                                        { name: 'ING', value: 'ING' },
                                        { name: 'Volksbanken', value: 'Volksbanken' },
                                        { name: 'Deutsche Bank', value: 'Deutsche Bank' },
                                        { name: 'DZ Bank', value: 'DZ Bank' },
                                        { name: 'KfW', value: 'KfW' },
                                        { name: 'HypoVereinsbank', value: 'HypoVereinsbank' },
                                        { name: 'LBBW', value: 'LBBW' },
                                        { name: 'BayernLB', value: 'BayernLB' },
                                        { name: 'Helaba', value: 'Helaba' },
                                        { name: 'NordLB', value: 'NordLB' },
                                        { name: 'Landesbank Berlin', value: 'Landesbank Berlin' },
                                        { name: 'NRW Bank', value: 'NRW Bank' },
                                        { name: 'Deutsche Apotheker- und Ärztebank', value: 'Apobank' },
                                        { name: 'Postbank', value: 'Postbank' },
                                        { name: 'Santander', value: 'Santander' },
                                        { name: 'Targobank', value: 'Targobank' },
                                        { name: 'Consorsbank', value: 'Consorsbank' },
                                ],
				default: 'ING',
				description: 'Select your bank. BLZ and FinTS URL will be set automatically.',
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
		],
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
			switch (bank) {
                                case 'ING':
                                        blz = '50010517';
                                        fintsUrl = 'https://fints.ing.de/fints';
                                        break;
                                case 'DKB':
                                        blz = '12030000';
                                        fintsUrl = 'https://banking-dkb.s-fints-pt-dkb.de/fints30';
                                        break;
                                case 'Commerzbank':
                                        blz = '10040000';
                                        fintsUrl = 'https://fints.commerzbank.de/fints';
                                        break;
                                case 'Comdirect':
                                        blz = '20041155';
                                        fintsUrl = 'https://fints.comdirect.de/fints';
                                        break;
                                case 'Volksbanken':
                                        blz = '76090000';
                                        fintsUrl = 'https://fints.vr.de/fints';
                                        break;
                                case 'Deutsche Bank':
                                        blz = '50070010';
                                        fintsUrl = 'https://fints.deutsche-bank.de/fints';
                                        break;
                                case 'DZ Bank':
                                        blz = '50060400';
                                        fintsUrl = 'https://fints.dzbank.de/fints';
                                        break;
                                case 'KfW':
                                        blz = '50020400';
                                        fintsUrl = 'https://fints.kfw.de/fints';
                                        break;
                                case 'HypoVereinsbank':
                                        blz = '70020270';
                                        fintsUrl = 'https://fints.hypovereinsbank.de/fints';
                                        break;
                                case 'LBBW':
                                        blz = '60050101';
                                        fintsUrl = 'https://fints.lbbw.de/fints';
                                        break;
                                case 'BayernLB':
                                        blz = '70050000';
                                        fintsUrl = 'https://fints.bayernlb.de/fints';
                                        break;
                                case 'Helaba':
                                        blz = '50050200';
                                        fintsUrl = 'https://fints.helaba.de/fints';
                                        break;
                                case 'NordLB':
                                        blz = '25050000';
                                        fintsUrl = 'https://fints.nordlb.de/fints';
                                        break;
                                case 'Landesbank Berlin':
                                        blz = '10050000';
                                        fintsUrl = 'https://fints.lbb.de/fints';
                                        break;
                                case 'NRW Bank':
                                        blz = '37050000';
                                        fintsUrl = 'https://fints.nrwbank.de/fints';
                                        break;
                                case 'Apobank':
                                        blz = '30060601';
                                        fintsUrl = 'https://fints.apobank.de/fints';
                                        break;
                                case 'Postbank':
                                        blz = '10010010';
                                        fintsUrl = 'https://fints.postbank.de/fints';
                                        break;
                                case 'Santander':
                                        blz = '50033300';
                                        fintsUrl = 'https://fints.santander.de/fints';
                                        break;
                                case 'Targobank':
                                        blz = '30020900';
                                        fintsUrl = 'https://fints.targobank.de/fints';
                                        break;
                                case 'Consorsbank':
                                        blz = '76030080';
                                        fintsUrl = 'https://fints.consorsbank.de/fints';
                                        break;
                               default:
                                       throw new NodeOperationError(this.getNode(), `Unknown bank: ${bank}`);
                       }
		}

		const userId = credentials.userId as string;
		const pin = credentials.pin as string;

		const client = new PinTanClient({
			url: fintsUrl,
			name: userId,
			pin,
			blz,
		});

		const accounts = await client.accounts();
		if (!accounts || accounts.length === 0) {
			throw new NodeOperationError(this.getNode(), 'No Accounts found');
		}

		const results = [];
		for (const account of accounts) {
			try {
				const statements = await client.statements(
					account,
					new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // Last 14 days
				);

				let balance = null;
				let currency = null;

				if (statements && statements.length > 0) {
					const latest = statements[0];
					balance = (latest.closingBalance && latest.closingBalance.value) || null;

					currency = (latest.closingBalance && latest.closingBalance.currency) || null;
				}

				results.push({
					account: account.iban || account.accountNumber || null,
					bank: blz,
					balance,
					currency,
				});
			} catch (e) {
				// We can not get the balance for this account.
				// This is not an error, but we can not do anything about it.
				// We just ignore it and continue with the next account.
			}
		}

		return [this.helpers.returnJsonArray(results)];
	}
}
