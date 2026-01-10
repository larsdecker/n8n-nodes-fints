import type {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IExecuteFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import {
	PinTanClient,
	type PinTanClientConfig,
	type SEPAAccount,
	type Statement,
	type Transaction,
	type StructuredDescription,
} from 'fints-lib/';
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

// Bank code (BLZ) must be exactly 8 digits
const BLZ_PATTERN = /^\d{8}$/;

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

type FintsCredentialData = { userId: string; pin: string };

/**
 * Builds the metadata required for a FinTS request, including client configuration and date range.
 * @param context - The execution context
 * @param itemIndex - The index of the current item being processed
 * @returns Promise resolving to the FinTS request metadata
 */
async function buildFintsRequestMetadata(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<FintsRequestMetadata> {
	const credentials = await context.getCredentials<FintsCredentialData>('fintsApi', itemIndex);
	const { blz, fintsUrl } = resolveBankConfiguration(context, itemIndex);
	const fintsProductId = (
		(context.getNodeParameter('fintsProductId', itemIndex) as string) || ''
	).trim();

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
	context: IExecuteFunctions,
	itemIndex: number,
): BankConfiguration {
	const expertMode = context.getNodeParameter('expertMode', itemIndex) === true;

	if (expertMode) {
		const blz = ((context.getNodeParameter('blz', itemIndex) as string) || '').trim();
		const fintsUrl = ((context.getNodeParameter('fintsUrl', itemIndex) as string) || '').trim();

		if (blz === '' || fintsUrl === '') {
			throw new NodeOperationError(
				context.getNode(),
				'BLZ and FinTS URL are required when expert mode is enabled.',
				{ itemIndex },
			);
		}

		// Validate BLZ format (should be 8 digits)
		if (!BLZ_PATTERN.test(blz)) {
			throw new NodeOperationError(context.getNode(), 'BLZ must be exactly 8 digits.', {
				itemIndex,
			});
		}

		// Validate FinTS URL format - must be a valid URL with protocol
		const urlPattern = /^https?:\/\/.+/i;
		if (!urlPattern.test(fintsUrl)) {
			throw new NodeOperationError(
				context.getNode(),
				'FinTS URL must be a valid URL starting with http:// or https://.',
				{ itemIndex },
			);
		}

		return { blz, fintsUrl };
	}

	const bank = context.getNodeParameter('bank', itemIndex) as string;
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
function resolveDateRange(context: IExecuteFunctions, itemIndex: number) {
	const startDateValue = (context.getNodeParameter('startDate', itemIndex) as string) || '';
	const endDateValue = (context.getNodeParameter('endDate', itemIndex) as string) || '';

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
	context: IExecuteFunctions,
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
 * @param debugLogs - Optional array to collect debug messages
 * @returns Promise resolving to array of account summaries
 */
async function collectAccountSummaries(
	context: IExecuteFunctions,
	client: PinTanClient,
	accounts: SEPAAccount[],
	metadata: FintsRequestMetadata,
	debugLogs?: string[],
): Promise<AccountSummary[]> {
	const summaries: AccountSummary[] = [];

	for (const account of accounts) {
		const accountId = account.iban || account.accountNumber || 'unknown';
		try {
			if (debugLogs) {
				debugLogs.push(`Fetching statements for account ${accountId}...`);
			}
			context.logger.info(`Fetching statements for account ${accountId}`);

			const statements = await client.statements(account, metadata.startDate, metadata.endDate);
			const summary = toAccountSummary(account, statements, metadata.bankCode);
			summaries.push(summary);

			const transactionCount = summary.transactions.length;
			if (debugLogs) {
				debugLogs.push(`Found ${transactionCount} transaction(s) for account ${accountId}`);
			}
			context.logger.info(`Found ${transactionCount} transaction(s) for account ${accountId}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const errorMsg = `Failed to fetch statements for account ${accountId}: ${message}`;
			context.logger.warn(errorMsg);
			if (debugLogs) {
				debugLogs.push(`⚠️ ${errorMsg}`);
			}
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
			{
				displayName: 'Debug Mode',
				name: 'debugMode',
				type: 'boolean',
				default: false,
				description:
					'Whether to include detailed debug logs in the output. When enabled, adds a _debug property to each output item with step-by-step execution information.',
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

	async execute(this: IExecuteFunctions) {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			const debugMode = this.getNodeParameter('debugMode', itemIndex, false) as boolean;
			const debugLogs: string[] = [];

			try {
				if (debugMode) {
					debugLogs.push('Starting FinTS execution...');
				}
				this.logger.info(`Starting FinTS execution for item ${itemIndex}`);

				// Build request metadata
				if (debugMode) {
					debugLogs.push('Building request metadata...');
				}
				const metadata = await buildFintsRequestMetadata(this, itemIndex);
				if (debugMode) {
					debugLogs.push(
						`Configuration: Bank code ${metadata.bankCode}, Date range: ${metadata.startDate.toISOString().split('T')[0]} to ${metadata.endDate.toISOString().split('T')[0]}`,
					);
				}
				this.logger.info(
					`FinTS request metadata: Bank code ${metadata.bankCode}, Date range: ${metadata.startDate.toISOString()} to ${metadata.endDate.toISOString()}`,
				);

				// Authenticate and fetch accounts
				if (debugMode) {
					debugLogs.push('Authenticating with FinTS server...');
				}
				this.logger.info('Authenticating with FinTS server');

				const client = new PinTanClient(metadata.config);

				if (debugMode) {
					debugLogs.push('Fetching accounts...');
				}
				this.logger.info('Fetching accounts from FinTS server');

				const accounts = await client.accounts();

				if (!accounts.length) {
					const errorMsg =
						'No accounts found for the provided credentials. Please verify your User ID, PIN, and bank configuration.';
					if (debugMode) {
						debugLogs.push(`❌ ${errorMsg}`);
					}
					this.logger.error(errorMsg);
					throw new NodeOperationError(this.getNode(), errorMsg, { itemIndex });
				}

				if (debugMode) {
					debugLogs.push(`Found ${accounts.length} account(s)`);
				}
				this.logger.info(`Found ${accounts.length} account(s)`);

				// Collect account summaries
				const summaries = await collectAccountSummaries(
					this,
					client,
					accounts,
					metadata,
					debugMode ? debugLogs : undefined,
				);

				if (summaries.length === 0) {
					const warnMsg = 'No account data could be retrieved. All accounts may have failed.';
					if (debugMode) {
						debugLogs.push(`⚠️ ${warnMsg}`);
					}
					this.logger.warn(warnMsg);
				} else {
					if (debugMode) {
						debugLogs.push(`Successfully retrieved data for ${summaries.length} account(s)`);
					}
					this.logger.info(`Successfully retrieved data for ${summaries.length} account(s)`);
				}

				// Prepare output items
				const outputItems = this.helpers.returnJsonArray(summaries);

				// Attach debug logs if debug mode is enabled
				if (debugMode) {
					debugLogs.push('Execution completed successfully');
					outputItems.forEach((item) => {
						// Create a copy of debug logs for each item to avoid shared references
						item.json._debug = [...debugLogs];
					});
				}

				returnData.push(...outputItems);
			} catch (error) {
				if (error instanceof NodeOperationError) {
					// Already a well-formatted error, just add debug logs if available
					if (debugMode && debugLogs.length > 0) {
						const existingMessage = error.message;
						debugLogs.push(`❌ Error: ${existingMessage}`);
						throw new NodeOperationError(
							this.getNode(),
							`${existingMessage}\n\nDebug logs: ${JSON.stringify(debugLogs, null, 2)}`,
							{ itemIndex },
						);
					}
					throw error;
				}

				// Generic error - provide more context
				const errorMessage = error instanceof Error ? error.message : String(error);
				if (debugMode) {
					debugLogs.push(`❌ Unexpected error: ${errorMessage}`);
				}
				this.logger.error(`Error fetching FinTS data for item ${itemIndex}: ${errorMessage}`);

				const fullErrorMsg = debugMode
					? `Error fetching FinTS data: ${errorMessage}\n\nDebug logs: ${JSON.stringify(debugLogs, null, 2)}`
					: `Error fetching FinTS data: ${errorMessage}`;

				throw new NodeOperationError(this.getNode(), fullErrorMsg, { itemIndex });
			}
		}

		return [returnData];
	}
}
