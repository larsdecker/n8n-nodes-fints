import type {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IExecuteFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import {
	FinTS4Client,
	PinTanClient,
	type FinTS4ClientConfig,
	type PinTanClientConfig,
	type SEPAAccount,
	type Statement,
	type Transaction,
	type StructuredDescription,
	TanRequiredError,
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

interface FireflyFields extends IDataObject {
	transactionId?: string;
	transactionType?: string;
	description?: string;
	date?: string | Date;
	sendingAccount?: string;
	targetAccount?: string;
	notes?: string;
	endToEndRef?: string;
}

interface TransactionSummary extends IDataObject {
	currency: string | null;
	amount: number;
	valueDate: string | Date;
	text?: string;
	reference?: string;
	isCredit: boolean;
	isExpense: boolean;
	firefly?: FireflyFields;
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
	protocolMode: '3.0' | '4.x';
	preferredHbciVersion: '4.1' | '4.0';
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
	const selectedProtocolMode = context.getNodeParameter('fintsProtocolMode', itemIndex, '3.0') as
		| '3.0'
		| '4.x';
	const selectedPreferredHbciVersion = context.getNodeParameter(
		'preferredHbciVersion',
		itemIndex,
		'4.1',
	) as '4.1' | '4.0';
	const protocolMode = selectedProtocolMode === '4.x' ? '4.x' : '3.0';
	const preferredHbciVersion = selectedPreferredHbciVersion === '4.0' ? '4.0' : '4.1';

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
		protocolMode,
		preferredHbciVersion,
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
 * Executes a FinTS operation and transparently handles decoupled TAN (push TAN / AppTAN)
 * authentication challenges that require polling for user approval on a separate device.
 *
 * When a bank uses decoupled TAN (tanProcess="2" per FinTS 3.0 PINTAN), the server sends
 * a push notification to the user's device. The client must poll the server until the user
 * approves the request. Once approved, the original operation is retried using the existing
 * authenticated dialog.
 *
 * @param operation - The FinTS operation to execute (e.g. `() => client.accounts()`)
 * @param retryWithDialog - Callback that retries the operation with the confirmed dialog
 * @param client - The FinTS client instance used to handle the TAN challenge
 * @param logCallback - Optional callback to emit log messages during polling
 * @returns Promise resolving to the operation result
 * @throws {DecoupledTanError} if the polling times out or is rejected
 * @throws {TanRequiredError} for non-decoupled TAN challenges (manual TAN entry required)
 */
async function executeWithDecoupledTan<T>(
	operation: () => Promise<T>,
	retryWithDialog: (dialog: import('fints-lib/').Dialog) => Promise<T>,
	client: PinTanClient,
	logCallback?: (message: string) => void,
): Promise<T> {
	try {
		return await operation();
	} catch (error) {
		if (error instanceof TanRequiredError && error.isDecoupledTan()) {
			const dialog = error.dialog;
			logCallback?.(
				`Decoupled TAN challenge received: "${error.challengeText}". Polling for user approval...`,
			);
			try {
				await client.handleDecoupledTanChallenge(error, (status) => {
					logCallback?.(
						`Decoupled TAN status: ${status.state} (attempt ${status.statusRequestCount})`,
					);
				});
				logCallback?.('Decoupled TAN confirmed. Retrying original request...');
				return await retryWithDialog(dialog);
			} finally {
				if (dialog) {
					try {
						await dialog.end();
					} catch (endError) {
						logCallback?.(
							`Failed to end FinTS dialog after decoupled TAN flow: ${String(endError)}`,
						);
					}
				}
			}
		}
		throw error;
	}
}

/**
 * Collects account summaries for all provided accounts by fetching their statements.
 * Errors for individual accounts are logged but don't stop processing of other accounts.
 * @param context - The execution context
 * @param client - The FinTS client instance
 * @param accounts - Array of SEPA accounts to process
 * @param metadata - FinTS request metadata including date range
 * @param includeFireflyFields - Whether to include Firefly III compatible fields
 * @param debugLogs - Optional array to collect debug messages
 * @returns Promise resolving to array of account summaries
 */
async function collectAccountSummaries(
	context: IExecuteFunctions,
	client: PinTanClient | FinTS4Client,
	accounts: SEPAAccount[],
	metadata: FintsRequestMetadata,
	includeFireflyFields: boolean,
	debugLogs?: string[],
): Promise<AccountSummary[]> {
	const summaries: AccountSummary[] = [];

	// Helper function to add debug logs only when debugLogs array is provided
	const addDebugLog = (message: string): void => {
		if (debugLogs) {
			debugLogs.push(message);
		}
	};

	for (const account of accounts) {
		const accountId = account.iban || account.accountNumber || 'unknown';
		const { startDate, endDate } = metadata;
		try {
			addDebugLog(`Fetching statements for account ${accountId}...`);
			context.logger.info(`Fetching statements for account ${accountId}`);

			const statements =
				metadata.protocolMode === '4.x'
					? await client.statements(account, startDate, endDate)
					: await executeWithDecoupledTan(
							() => (client as PinTanClient).statements(account, startDate, endDate),
							(dialog) => (client as PinTanClient).statements(account, startDate, endDate, dialog),
							client as PinTanClient,
							(msg) => {
								addDebugLog(msg);
								context.logger.info(msg);
							},
						);
			const summary = toAccountSummary(
				account,
				statements,
				metadata.bankCode,
				includeFireflyFields,
			);
			summaries.push(summary);

			const transactionCount = summary.transactions.length;
			addDebugLog(`Found ${transactionCount} transaction(s) for account ${accountId}`);
			context.logger.info(`Found ${transactionCount} transaction(s) for account ${accountId}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const errorMsg = `Failed to fetch statements for account ${accountId}: ${message}`;
			context.logger.warn(errorMsg);
			addDebugLog(`⚠️ ${errorMsg}`);
		}
	}

	return summaries;
}

/**
 * Converts a SEPA account and its statements into a standardized account summary.
 * @param account - The SEPA account information
 * @param statements - Array of account statements
 * @param bankCode - The bank code (BLZ)
 * @param includeFireflyFields - Whether to include Firefly III compatible fields
 * @returns Standardized account summary with balance and transactions
 */
function toAccountSummary(
	account: SEPAAccount,
	statements: Statement[],
	bankCode: string,
	includeFireflyFields: boolean,
): AccountSummary {
	// Use the most recent statement for balance information
	const latest = statements[0];
	const balance = latest?.closingBalance?.value ?? null;
	const currency = latest?.closingBalance?.currency ?? null;
	const accountIdentifier = account.iban || account.accountNumber || null;
	const transactions = latest
		? mapTransactions(latest.transactions, accountIdentifier, includeFireflyFields)
		: [];

	return {
		account: accountIdentifier,
		bank: bankCode,
		balance,
		currency,
		transactions,
	};
}

/**
 * Maps FinTS transaction objects to standardized transaction summaries with optional Firefly III compatible fields.
 * Credits are positive, debits are negative in the amount field.
 * @param transactions - Array of FinTS transactions
 * @param accountIdentifier - The IBAN or account number of the current account
 * @param includeFireflyFields - Whether to include Firefly III compatible fields in a nested object
 * @returns Array of standardized transaction summaries
 */
function mapTransactions(
	transactions: Transaction[],
	accountIdentifier: string | null,
	includeFireflyFields: boolean,
): TransactionSummary[] {
	return transactions.map((transaction) => {
		const text = resolveTransactionText(transaction.descriptionStructured);
		const structured = transaction.descriptionStructured;

		const result: TransactionSummary = {
			currency: transaction.currency ?? null,
			amount: transaction.isCredit ? transaction.amount : -transaction.amount,
			valueDate: transaction.valueDate,
			text,
			reference: transaction.bankReference,
			isCredit: transaction.isCredit,
			isExpense: transaction.isExpense,
		};

		// Only include Firefly III fields if requested
		if (includeFireflyFields) {
			const isWithdrawal = !transaction.isCredit;

			// Determine transaction type for Firefly III
			const transactionType = transaction.isCredit ? 'deposit' : 'withdrawal';

			// Extract sender and target accounts based on transaction direction
			const counterpartyIban = structured?.iban;
			const sendingAccount = isWithdrawal ? accountIdentifier : counterpartyIban;
			const targetAccount = isWithdrawal ? counterpartyIban : accountIdentifier;

			// Extract end-to-end reference (SEPA CT ID)
			const endToEndRef = structured?.reference?.endToEndRef;

			// Build notes from available reference information
			const noteParts: string[] = [];
			if (structured?.reference?.customerRef) {
				noteParts.push(`Customer Ref: ${structured.reference.customerRef}`);
			}
			if (structured?.reference?.mandateRef) {
				noteParts.push(`Mandate Ref: ${structured.reference.mandateRef}`);
			}
			if (structured?.reference?.creditorId) {
				noteParts.push(`Creditor ID: ${structured.reference.creditorId}`);
			}
			if (structured?.primaNota) {
				noteParts.push(`Prima Nota: ${structured.primaNota}`);
			}
			const notes = noteParts.length > 0 ? noteParts.join(', ') : undefined;

			result.firefly = {
				transactionId: transaction.id,
				transactionType,
				description: text,
				date: transaction.valueDate,
				sendingAccount: sendingAccount || undefined,
				targetAccount: targetAccount || undefined,
				notes,
				endToEndRef,
			};
		}

		return result;
	});
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
				displayName: 'FinTS Protocol',
				name: 'fintsProtocolMode',
				type: 'options',
				default: '3.0',
				description:
					'Select the FinTS protocol mode. FinTS 3.0 is stable. FinTS 4.x is experimental and uses the XML-based client.',
				options: [
					{
						name: 'FinTS 3.0 (Stable)',
						value: '3.0',
					},
					{
						name: 'FinTS 4.x (Experimental)',
						value: '4.x',
					},
				],
				displayOptions: {
					show: {
						resource: ['account'],
						operation: ['getStatements'],
					},
				},
			},
			{
				displayName: 'Preferred FinTS 4 HBCI Version',
				name: 'preferredHbciVersion',
				type: 'options',
				default: '4.1',
				description:
					'Choose the preferred FinTS 4.x HBCI version. Set to 4.0 if your bank requires it.',
				options: [
					{
						name: '4.1',
						value: '4.1',
					},
					{
						name: '4.0',
						value: '4.0',
					},
				],
				displayOptions: {
					show: {
						resource: ['account'],
						operation: ['getStatements'],
						fintsProtocolMode: ['4.x'],
					},
				},
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
					'Some banks require an official FinTS Product Registration ID to access their FinTS interface. This node does not provide one by default, so leave the field empty first and only set your own registered ID if your bank requires it, for example after error 9050. You can request a Product ID at https://www.fints.org/de/hersteller/produktregistrierung.',
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
				displayName: 'Include Firefly III Fields',
				name: 'includeFireflyFields',
				type: 'boolean',
				default: false,
				description:
					'Whether to include additional fields in a nested "firefly" object for direct integration with Firefly III personal finance software',
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
			{
				displayName: 'Exclude IBANs/Account Numbers',
				name: 'excludeAccounts',
				type: 'string',
				default: '',
				description: 'Comma-separated list of IBANs or account numbers to exclude from the results',
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

			// Helper function to add debug logs only when debug mode is enabled
			const addDebugLog = (message: string): void => {
				if (debugMode) {
					debugLogs.push(message);
				}
			};

			try {
				addDebugLog('Starting FinTS execution...');
				this.logger.info(`Starting FinTS execution for item ${itemIndex}`);

				// Build request metadata
				addDebugLog('Building request metadata...');
				const metadata = await buildFintsRequestMetadata(this, itemIndex);
				const includeFireflyFields =
					(this.getNodeParameter('includeFireflyFields', itemIndex) as boolean) || false;
				addDebugLog(
					`Configuration: Protocol ${metadata.protocolMode}, Bank code ${metadata.bankCode}, Date range: ${metadata.startDate.toISOString().split('T')[0]} to ${metadata.endDate.toISOString().split('T')[0]}`,
				);
				this.logger.info(
					`FinTS request metadata: Protocol ${metadata.protocolMode}, Bank code ${metadata.bankCode}, Date range: ${metadata.startDate.toISOString()} to ${metadata.endDate.toISOString()}`,
				);

				// Authenticate and fetch accounts
				addDebugLog('Authenticating with FinTS server...');
				this.logger.info('Authenticating with FinTS server');

				const client =
					metadata.protocolMode === '4.x'
						? new FinTS4Client({
								...(metadata.config as FinTS4ClientConfig),
								preferredHbciVersion: metadata.preferredHbciVersion,
							})
						: new PinTanClient(metadata.config);

				addDebugLog('Fetching accounts...');
				this.logger.info('Fetching accounts from FinTS server');

				const accounts =
					metadata.protocolMode === '4.x'
						? await client.accounts()
						: await executeWithDecoupledTan(
								() => (client as PinTanClient).accounts(),
								(dialog) => (client as PinTanClient).accounts(dialog),
								client as PinTanClient,
								(msg) => {
									addDebugLog(msg);
									this.logger.info(msg);
								},
							);

				if (!accounts.length) {
					const errorMsg =
						'No accounts found for the provided credentials. Please verify your User ID, PIN, and bank configuration.';
					addDebugLog(`❌ ${errorMsg}`);
					this.logger.error(errorMsg);
					throw new NodeOperationError(this.getNode(), errorMsg, { itemIndex });
				}

				addDebugLog(`Found ${accounts.length} account(s)`);
				this.logger.info(`Found ${accounts.length} account(s)`);

				// Filter accounts based on excludeAccounts parameter
				const excludeAccountsRaw =
					(this.getNodeParameter('excludeAccounts', itemIndex) as string) || '';
				const excludeList = excludeAccountsRaw
					.split(',')
					.map((s) => s.trim().toUpperCase())
					.filter((s) => s !== '');

				let filteredAccounts = accounts;
				if (excludeList.length > 0) {
					filteredAccounts = accounts.filter((account) => {
						const iban = (account.iban || '').toUpperCase();
						const accNo = (account.accountNumber || '').toUpperCase();
						return !excludeList.includes(iban) && !excludeList.includes(accNo);
					});
					addDebugLog(`Filtered to ${filteredAccounts.length} account(s) after exclusions`);
					this.logger.info(`Filtered to ${filteredAccounts.length} account(s) after exclusions`);
				}

				// If all accounts were filtered out by the exclusion list, provide a clear error
				if (excludeList.length > 0 && accounts.length > 0 && filteredAccounts.length === 0) {
					const msg =
						'All available accounts were excluded by the "Exclude Accounts" filter. ' +
						'Please adjust the "Exclude Accounts" parameter so that at least one account remains.';
					addDebugLog(`⚠️ ${msg}`);
					this.logger.warn(msg);
					throw new NodeOperationError(this.getNode(), msg, { itemIndex });
				}
				// Collect account summaries
				const summaries = await collectAccountSummaries(
					this,
					client,
					filteredAccounts,
					metadata,
					includeFireflyFields,
					debugMode ? debugLogs : undefined,
				);

				if (summaries.length === 0) {
					const warnMsg = 'No account data could be retrieved. All accounts may have failed.';
					addDebugLog(`⚠️ ${warnMsg}`);
					this.logger.warn(warnMsg);
				} else {
					addDebugLog(`Successfully retrieved data for ${summaries.length} account(s)`);
					this.logger.info(`Successfully retrieved data for ${summaries.length} account(s)`);
				}

				// Prepare output items
				const outputItems = this.helpers.returnJsonArray(summaries);

				// Attach debug logs if debug mode is enabled
				if (debugMode) {
					addDebugLog('Execution completed successfully');
					outputItems.forEach((item: INodeExecutionData) => {
						// Create a copy of debug logs for each item to avoid shared references
						(item.json as IDataObject & { _debug?: string[] })._debug = [...debugLogs];
					});
				}

				returnData.push(...outputItems);
			} catch (error) {
				if (error instanceof NodeOperationError) {
					// Already a well-formatted error, just add debug logs if available
					if (debugMode && debugLogs.length > 0) {
						const existingMessage = error.message;
						addDebugLog(`❌ Error: ${existingMessage}`);
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
				addDebugLog(`❌ Unexpected error: ${errorMessage}`);
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
