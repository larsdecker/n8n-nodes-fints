import type {
	IDataObject,
	IExecutePaginationFunctions,
	IExecuteSingleFunctions,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IN8nRequestOperations,
	PostReceiveAction,
	PreSendAction,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

// Use the 'fints' package (npm install fints)
import { PinTanClient } from 'fints';
import type {
	PinTanClientConfig,
	SEPAAccount,
	Statement,
	StructuredDescription,
	Transaction,
} from 'fints';
import banks from './banks.json';

// Build dropdown options from banks.json for the UI
const bankOptions = banks.map((b) => ({ name: b.displayName, value: b.value }));

// Create a lookup map for quick access to bank configuration by bank identifier
const bankMap: Record<string, { blz: string; fintsUrl: string }> = banks.reduce(
	(acc, b) => {
		acc[b.value] = { blz: b.blz, fintsUrl: b.fintsUrl };
		return acc;
	},
	{} as Record<string, { blz: string; fintsUrl: string }>,
);

// Default period for fetching statements when no date range is specified
const DEFAULT_LOOKBACK_DAYS = 14;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

type BankConfiguration = { blz: string; fintsUrl: string };

interface TransactionSummary extends IDataObject {
	currency: string | null;
	amount: number;
	valueDate: string | Date;
	text?: string;
	reference?: string;
	isCredit: boolean;
	isExpense: boolean;
}

interface AccountSummary extends IDataObject {
	account: string | null;
	bank: string;
	balance: number | null;
	currency: string | null;
	transactions: TransactionSummary[];
}

interface FintsRequestMetadata {
	config: PinTanClientConfig;
	bankCode: string;
	startDate: Date;
	endDate: Date;
}

type FintsHttpRequestOptions = IHttpRequestOptions & { fints?: FintsRequestMetadata };

type FintsCredentialData = { userId: string; pin: string };

const prepareFintsRequest: PreSendAction = async function (
	this: IExecuteSingleFunctions,
	requestOptions,
) {
	const itemIndex = this.getItemIndex();
	const extendedOptions = requestOptions as FintsHttpRequestOptions;
	extendedOptions.fints = await buildFintsRequestMetadata(this, itemIndex);
	return extendedOptions;
};

const attachPairedItem: PostReceiveAction = async function (this: IExecuteSingleFunctions, items) {
	const itemIndex = this.getItemIndex();
	return items.map((item) => ({
		...item,
		pairedItem: { item: itemIndex },
	}));
};

const runAccountStatementRequest: NonNullable<IN8nRequestOperations['pagination']> =
	async function (
		this: IExecutePaginationFunctions,
		requestOptions,
	): Promise<INodeExecutionData[]> {
		const itemIndex = this.getItemIndex();
		const options = requestOptions.options as FintsHttpRequestOptions | undefined;
		const metadata = options?.fints ?? (await buildFintsRequestMetadata(this, itemIndex));
		const client = new PinTanClient(metadata.config);
		const accounts = await client.accounts();

		if (!accounts.length) {
			throw new NodeOperationError(
				this.getNode(),
				'No accounts found for the provided credentials. Please verify your User ID, PIN, and bank configuration.',
				{ itemIndex },
			);
		}

		const summaries = await collectAccountSummaries(this, client, accounts, metadata);

		if (options?.fints) {
			delete options.fints;
		}

		return summaries.map((summary) => ({ json: summary }));
	};

/**
 * Builds the metadata required for a FinTS request, including client configuration and date range.
 * @param context - The execution context
 * @param itemIndex - The index of the current item being processed
 * @returns Promise resolving to the FinTS request metadata
 */
async function buildFintsRequestMetadata(
	context: IExecuteSingleFunctions,
	itemIndex: number,
): Promise<FintsRequestMetadata> {
	const credentials = await context.getCredentials<FintsCredentialData>('fintsApi', itemIndex);
	const { blz, fintsUrl } = resolveBankConfiguration(context, itemIndex);
	const fintsProductId = (context.getNodeParameter('fintsProductId', '') as string).trim();

	const config: PinTanClientConfig = {
		url: fintsUrl,
		name: credentials.userId,
		pin: credentials.pin,
		blz,
	};

	if (fintsProductId !== '') {
		config.productId = fintsProductId;
	}

	const { startDate, endDate } = resolveDateRange(context, itemIndex);

	return {
		config,
		bankCode: blz,
		startDate,
		endDate,
	};
}

/**
 * Resolves the bank configuration (BLZ and FinTS URL) from node parameters.
 * In expert mode, uses manually entered values. Otherwise, uses predefined bank settings.
 * @param context - The execution context
 * @param itemIndex - The index of the current item being processed
 * @returns Bank configuration with BLZ and FinTS URL
 * @throws NodeOperationError if configuration is invalid or bank is not found
 */
function resolveBankConfiguration(
	context: IExecuteSingleFunctions,
	itemIndex: number,
): BankConfiguration {
	const expertMode = context.getNodeParameter('expertMode', false) as boolean;

	if (expertMode) {
		const blz = (context.getNodeParameter('blz', '') as string).trim();
		const fintsUrl = (context.getNodeParameter('fintsUrl', '') as string).trim();

		if (blz === '' || fintsUrl === '') {
			throw new NodeOperationError(
				context.getNode(),
				'BLZ and FinTS URL are required when expert mode is enabled.',
				{ itemIndex },
			);
		}

		// Validate BLZ format (should be 8 digits)
		if (!/^\d{8}$/.test(blz)) {
			throw new NodeOperationError(context.getNode(), 'BLZ must be exactly 8 digits.', {
				itemIndex,
			});
		}

		// Validate FinTS URL format
		if (!fintsUrl.startsWith('https://') && !fintsUrl.startsWith('http://')) {
			throw new NodeOperationError(
				context.getNode(),
				'FinTS URL must start with http:// or https://.',
				{ itemIndex },
			);
		}

		return { blz, fintsUrl };
	}

	const bank = context.getNodeParameter('bank') as string;
	const configuration = bankMap[bank];

	if (!configuration) {
		throw new NodeOperationError(
			context.getNode(),
			`Unknown bank: ${bank}. Please select a valid bank from the list or use expert mode.`,
			{ itemIndex },
		);
	}

	return configuration;
}

/**
 * Resolves and validates the date range for fetching account statements.
 * If not specified, defaults to 14 days lookback period ending today.
 * @param context - The execution context
 * @param itemIndex - The index of the current item being processed
 * @returns Object containing validated start and end dates
 * @throws NodeOperationError if start date is after end date
 */
function resolveDateRange(context: IExecuteSingleFunctions, itemIndex: number) {
	const startDateValue = context.getNodeParameter('startDate', '') as string;
	const endDateValue = context.getNodeParameter('endDate', '') as string;

	const endDate =
		endDateValue !== ''
			? parseDateParameter(context, endDateValue, 'End Date', itemIndex)
			: new Date();

	const startDate =
		startDateValue !== ''
			? parseDateParameter(context, startDateValue, 'Start Date', itemIndex)
			: new Date(endDate.getTime() - DEFAULT_LOOKBACK_DAYS * MILLISECONDS_PER_DAY);

	if (startDate > endDate) {
		throw new NodeOperationError(
			context.getNode(),
			'Start Date must be before or equal to End Date.',
			{ itemIndex },
		);
	}

	return { startDate, endDate };
}

/**
 * Parses a date parameter string into a Date object with validation.
 * @param context - The execution context
 * @param value - The date string to parse
 * @param parameterName - Name of the parameter (for error messages)
 * @param itemIndex - The index of the current item being processed
 * @returns Parsed Date object
 * @throws NodeOperationError if the date string is invalid
 */
function parseDateParameter(
	context: IExecuteSingleFunctions,
	value: string,
	parameterName: string,
	itemIndex: number,
): Date {
	const date = new Date(value);

	if (Number.isNaN(date.getTime())) {
		throw new NodeOperationError(context.getNode(), `${parameterName} must be a valid date.`, {
			itemIndex,
		});
	}

	return date;
}

/**
 * Collects account summaries for all provided accounts by fetching their statements.
 * Errors for individual accounts are logged but don't stop processing of other accounts.
 * @param context - The execution context
 * @param client - The FinTS client instance
 * @param accounts - Array of SEPA accounts to process
 * @param metadata - FinTS request metadata including date range
 * @returns Promise resolving to array of account summaries
 */
async function collectAccountSummaries(
	context: IExecuteSingleFunctions,
	client: PinTanClient,
	accounts: SEPAAccount[],
	metadata: FintsRequestMetadata,
): Promise<AccountSummary[]> {
	const summaries: AccountSummary[] = [];

	for (const account of accounts) {
		try {
			const statements = await client.statements(account, metadata.startDate, metadata.endDate);
			summaries.push(toAccountSummary(account, statements, metadata.bankCode));
		} catch (error) {
			const accountId = account.iban || account.accountNumber || 'unknown';
			const message = error instanceof Error ? error.message : String(error);
			context.logger.warn(`Failed to fetch statements for account ${accountId}: ${message}`);
		}
	}

	return summaries;
}

/**
 * Converts a SEPA account and its statements into a standardized account summary.
 * @param account - The SEPA account information
 * @param statements - Array of account statements
 * @param bankCode - The bank code (BLZ)
 * @returns Standardized account summary with balance and transactions
 */
function toAccountSummary(
	account: SEPAAccount,
	statements: Statement[],
	bankCode: string,
): AccountSummary {
	// Use the most recent statement for balance information
	const latest = statements[0];
	const balance = latest?.closingBalance?.value ?? null;
	const currency = latest?.closingBalance?.currency ?? null;
	const transactions = latest ? mapTransactions(latest.transactions) : [];

	return {
		account: account.iban || account.accountNumber || null,
		bank: bankCode,
		balance,
		currency,
		transactions,
	};
}

/**
 * Maps FinTS transaction objects to standardized transaction summaries.
 * Credits are positive, debits are negative in the amount field.
 * @param transactions - Array of FinTS transactions
 * @returns Array of standardized transaction summaries
 */
function mapTransactions(transactions: Transaction[]): TransactionSummary[] {
	return transactions.map((transaction) => ({
		currency: transaction.currency ?? null,
		amount: transaction.isCredit ? transaction.amount : -transaction.amount,
		valueDate: transaction.valueDate,
		text: resolveTransactionText(transaction.descriptionStructured),
		reference: transaction.bankReference,
		isCredit: transaction.isCredit,
		isExpense: transaction.isExpense,
	}));
}

/**
 * Extracts readable text from a structured transaction description.
 * Prefers the name field if available, otherwise falls back to text field.
 * @param description - Structured description from FinTS transaction
 * @returns Descriptive text or undefined if no description available
 */
function resolveTransactionText(description?: StructuredDescription): string | undefined {
	if (!description) {
		return undefined;
	}

	const name = description.name?.trim();

	if (name && name !== '') {
		return name;
	}

	return description.text;
}

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
		inputs: [NodeConnectionTypes.Main],
		name: 'fintsNode',
		outputs: [NodeConnectionTypes.Main],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				default: 'account',
				noDataExpression: true,
				options: [
					{
						name: 'Account',
						value: 'account',
					},
				],
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				default: 'getStatements',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['account'],
					},
				},
				options: [
					{
						name: 'Get Statements',
						value: 'getStatements',
						action: 'Get statements',
						description:
							'Retrieve balances and recent transactions for the connected FinTS accounts',
						routing: {
							send: {
								preSend: [prepareFintsRequest],
							},
							operations: {
								pagination: runAccountStatementRequest,
							},
							output: {
								postReceive: [attachPairedItem],
							},
						},
					},
				],
			},
			{
				displayName: 'Select Bank',
				name: 'bank',
				type: 'options',
				default: 'ING',
				description: 'Select your bank. BLZ and FinTS URL will be set automatically.',
				options: bankOptions,
				displayOptions: {
					show: {
						resource: ['account'],
						operation: ['getStatements'],
						expertMode: [false],
					},
				},
			},
			{
				displayName: 'Expert Mode: Enter BLZ and FinTS URL Manually',
				name: 'expertMode',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['account'],
						operation: ['getStatements'],
					},
				},
			},
			{
				displayName: 'Bank Code (BLZ)',
				name: 'blz',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['account'],
						operation: ['getStatements'],
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
						resource: ['account'],
						operation: ['getStatements'],
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
				displayOptions: {
					show: {
						resource: ['account'],
						operation: ['getStatements'],
					},
				},
			},
			{
				displayName: 'Start Date',
				name: 'startDate',
				type: 'dateTime',
				default: '',
				description: 'Fetch statements starting from this date. Defaults to 14 days ago.',
				displayOptions: {
					show: {
						resource: ['account'],
						operation: ['getStatements'],
					},
				},
			},
			{
				displayName: 'End Date',
				name: 'endDate',
				type: 'dateTime',
				default: '',
				description: 'Fetch statements up to this date. Defaults to today.',
				displayOptions: {
					show: {
						resource: ['account'],
						operation: ['getStatements'],
					},
				},
			},
		],
		version: 1,
	};
}
