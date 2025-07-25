# n8n-nodes-fints

This is an n8n community node that integrates with the Financial Transaction Services (FinTS) interface used by German banks, allowing you to retrieve real-time account balances within your n8n workflows.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation, or install directly via npm:

```bash
npm install n8n-nodes-fints
```

## Operations

- **Get Account Balance**: Retrieves the current balance and currency information for a specified bank account.

## Credentials

To authenticate with your bank's FinTS server, you need:
- **User ID / Login**: Your customer identification number.
- **PIN**: Your Personal Identification Number.

The Bank Code (BLZ) and FinTS server URL are set via the node parameters or by choosing your bank during credential setup.
The available banks are defined in `nodes/FintsNode/banks.json`. To support additional institutions, add an entry with `value`, `displayName`, `blz`, and `fintsUrl` to this file and rebuild the project.

Once you have these details, create new credentials in n8n under **Settings → API Credentials**, select **FinTS**, and enter the above information.

## Compatibility

- Tested with n8n versions **>= 0.150.0**.
- Compatible with FinTS versions **1.1**, **2.2**, and **3.0**.

## Usage

1. **Add** the **FinTS** node to your workflow.
2. **Select** the FinTS credentials you created.
3. **Choose** the operation: **Get Account Balance**.
4. **Configure** the parameters. The node automatically retrieves all accounts linked to your login.
5. **Optionally**, set **Start Date** and **End Date** to limit the booking range. If left empty, the node fetches statements from the last 14 days up to today.
6. **Execute** the workflow to receive a response object containing `balance`,`currency`, `bank`, `account`, and an array of `transactions`.

```json
[
	{
		"account": "DEXXXXXXXXXX",
		"bank": "23445561",
		"balance": 10001,
		"currency": "EUR",
		"transactions": [
			{
				"amount": 20,
				"text": "Some payment",
				"valueDate": "2025-06-03",
				"currency": "EUR",
				"reference": "XYZ",
				"isCredit": true,
				"isExpense": false
			}
		]
	}
]
```

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
* [FinTS specification overview](https://www.fints.org/)

## Version history
- **0.8.0** (2025-07-25): Externalize the bank configuration to a separate file and add more banks to it.
- **0.7.0** (2025-07-19): Optional FinTS registration number can now be configured.
- **0.6.0** (2025-07-05): Added Sparda and PSD Bank
- **0.5.4** (2025-07-05): Dependency Update
- **0.5.3** (2025-06-05): Modernize eslint
- **0.5.2** (2025-06-05): Improved Error Handling.
- **0.5.1** (2025-06-05): Bugfix for wrong transactions amount.
- **0.5.0** (2025-06-05): Enhance the transactions response.
- **0.4.0** (2025-06-04): Include the Transactions into the response.
- **0.3.0** (2025-06-02): Include the 20 biggest German banks.
- **0.2.0** (2025-05-29): Add a few more banks.
- **0.1.4** (2025-05-29): Initial release with Get Account Balance operation.
