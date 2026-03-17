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
6. **Optionally**, enable **Include Firefly III Fields** to add a nested `firefly` object with fields compatible with Firefly III personal finance software.
7. **Optionally**, use **Exclude IBANs/Account Numbers** to filter out specific accounts from the results by providing a comma-separated list of IBANs or account numbers to exclude.
8. **Execute** the workflow to receive a response object containing `balance`,`currency`, `bank`, `account`, and an array of `transactions`.

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

### Firefly III Integration

When you enable the **Include Firefly III Fields** option, each transaction will include an additional nested `firefly` object with fields specifically mapped for [Firefly III](https://www.firefly-iii.org/) compatibility:

```json
{
	"amount": 20,
	"text": "Some payment",
	"valueDate": "2025-06-03",
	"currency": "EUR",
	"reference": "XYZ",
	"isCredit": true,
	"isExpense": false,
	"firefly": {
		"transactionId": "20250603-001",
		"transactionType": "deposit",
		"description": "Some payment",
		"date": "2025-06-03",
		"sendingAccount": "DE98370400440532013000",
		"targetAccount": "DEXXXXXXXXXX",
		"notes": "Customer Ref: ABC123",
		"endToEndRef": "NOTPROVIDED"
	}
}
```

**Firefly III Field Descriptions:**

- **transactionId**: Unique transaction identifier from FinTS
- **transactionType**: `deposit` for incoming payments, `withdrawal` for outgoing payments
- **description**: Payment description text
- **date**: Transaction value date
- **sendingAccount**: IBAN of the sending account
- **targetAccount**: IBAN of the receiving account
- **notes**: Additional reference information (customer reference, mandate reference, creditor ID, prima nota)
- **endToEndRef**: SEPA end-to-end reference (EREF+ tag), equivalent to `sepa_ct_id` in Firefly III

### Filtering Accounts

The **Exclude IBANs/Account Numbers** parameter allows you to filter out specific accounts from the results. This is useful when you have multiple accounts linked to your FinTS login but only want to process a subset of them.

**How to use:**
- Enter a comma-separated list of IBANs or account numbers you want to exclude
- Matching is case-insensitive
- Whitespace around entries is automatically trimmed
- Both full IBANs (e.g., `DE89370400440532013000`) and account numbers (e.g., `12345678`) are supported

**Example:**
```
DE89370400440532013000, 87654321
```

This will exclude the account with IBAN `DE89370400440532013000` and the account with account number `87654321` from the results.

### Using a Shared productRegistrationId

Some banks require a FinTS product registration ID (also called a *productId*) to access their FinTS interface. The node supports several ways to supply this ID, evaluated in the following priority order:

1. **Node parameter** – Set `FinTS Registration Number` directly in the node properties *(highest priority, for per-workflow overrides)*.
2. **Credential field** – Set `FinTS Product Registration ID` in the FinTS credentials *(per-credential override)*.
3. **Environment variable** `FINTS_PRODUCT_ID` – Useful for self-hosted installations where every workflow should use the same ID.
4. **Central ID service** – When `Use Shared Product ID` is enabled (or an `Installation API Key` is present in credentials), the node fetches the product ID from a remote service. The result is cached locally in n8n's workflow static data for 7 days.

#### Setting up the shared product ID service

1. Obtain an **Installation API Key** from the plugin author or your organisation's ID service.
2. Open your FinTS credentials in n8n.
3. Enable **Use Shared Product ID**.
4. Paste the key into **Installation API Key**.
5. Optionally set **Product ID Service URL** if the service URL is not supplied via the `FINTS_PRODUCT_ID_SERVICE_URL` environment variable.
6. If the service uses HMAC-SHA256 response signing, enter the shared secret in **Product ID Service HMAC Secret** (or set `FINTS_PRODUCT_ID_SERVICE_HMAC_SECRET`).

#### Environment variable reference

| Variable | Description |
|---|---|
| `FINTS_PRODUCT_ID` | Static product registration ID (fallback before calling the service) |
| `FINTS_PRODUCT_ID_SERVICE_URL` | Base URL of the central ID service (e.g. `https://id.example.com`) |
| `FINTS_PRODUCT_ID_SERVICE_HMAC_SECRET` | HMAC-SHA256 secret for verifying service responses |

#### Docker Compose example

```yaml
services:
  n8n:
    image: n8nio/n8n
    environment:
      - FINTS_PRODUCT_ID_SERVICE_URL=https://id.example.com
      - FINTS_PRODUCT_ID_SERVICE_HMAC_SECRET_FILE=/run/secrets/fints_hmac
    secrets:
      - fints_hmac
secrets:
  fints_hmac:
    file: ./secrets/fints_hmac.txt
```

#### Privacy & liability notice

When using the shared product ID service, the plugin author's identity is visible to your bank as the registrant of the product ID. Bank login credentials (User ID, PIN) are **never** sent to the ID service – only the installation API key is used for authentication with that service. You can revoke your installation API key at any time to stop using the shared ID.

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
* [German Article - About how to monitor the Bank Account with n8n](https://lars-decker.eu/blog/konto-monitoring) 
* [FinTS specification overview](https://www.fints.org/)

## Automated releases

Publishing from CI requires an npm automation token stored as the `NPM_TOKEN` repository secret. Generate the token in the npm account settings, ensure it has automation scope, and add it under **Settings → Secrets and variables → Actions** before pushing release commits or tags. The GitHub Actions workflow validates that the secret is present and aborts with a descriptive error if it is missing.

## Version history
- **0.14.0** (2026-03-17): Add optional shared productRegistrationId support via a configurable central ID service; new credential fields (installationApiKey, useSharedProductId, productRegistrationId, productIdServiceUrl, productIdServiceHmacSecret); TTL-based cache in workflow static data; HMAC signature verification; ENV variable fallbacks (FINTS_PRODUCT_ID, FINTS_PRODUCT_ID_SERVICE_URL, FINTS_PRODUCT_ID_SERVICE_HMAC_SECRET); unit tests for service fetch logic, caching, error cases; README documentation.
- **0.13.0** (2026-01-17): Add `Exclude IBANs/Account Numbers` filter to exclude specific accounts from results; add optional Firefly III field mapping nested under a `firefly` object; introduce debug mode with server-side logging and improved error handling; update tests and documentation; bump dependencies and fix CI/build issues.
- **0.12.0** (2025-12-27): Update of Dependencies and Security Patches
- **0.11.0** (2025-12-23): Change the fints dependency to fints-lib, which is a fork and more maintained
- **0.10.0** (2025-12-18): Upgrade the n8n-workflow Package to the version 2.x and address breaking changes
- **0.9.1** (2025-12-17): Fixes for a bug with invalid url in some cases.
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
