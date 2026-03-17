import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class FintsApi implements ICredentialType {
	name = 'fintsApi';
	displayName = 'FinTS API';
	documentationUrl = 'https://github.com/larsdecker/n8n-nodes-fints/blob/master/README.md';
	properties: INodeProperties[] = [
		{
			displayName: 'User ID (Login name)',
			name: 'userId',
			type: 'string',
			default: '',
		},
		{
			displayName: 'PIN',
			name: 'pin',
			type: 'string',
			typeOptions: { password: true },
			default: '',
		},
		{
			displayName: 'FinTS Product Registration ID',
			name: 'productRegistrationId',
			type: 'string',
			default: '',
			description:
				'Optional: Manual FinTS product registration ID. ' +
				'Takes precedence over all other methods (environment variable and shared ID service). ' +
				'Leave empty to use the environment variable FINTS_PRODUCT_ID or the shared ID service.',
		},
		{
			displayName: 'Use Shared Product ID',
			name: 'useSharedProductId',
			type: 'boolean',
			default: false,
			description:
				'Whether to fetch the FinTS product registration ID from a central ID service ' +
				'using the Installation API Key below. ' +
				'Note: the plugin author will be visible as the registrant of the product ID to your bank.',
		},
		{
			displayName: 'Installation API Key',
			name: 'installationApiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'Per-installation API key for the central product ID service. ' +
				'Required when "Use Shared Product ID" is enabled. ' +
				'This key is unique to your installation and can be revoked independently.',
		},
		{
			displayName: 'Product ID Service URL',
			name: 'productIdServiceUrl',
			type: 'string',
			default: '',
			description:
				'URL of the central product ID service (e.g. https://your-id-service.example.com). ' +
				'Falls back to the FINTS_PRODUCT_ID_SERVICE_URL environment variable when left empty.',
		},
		{
			displayName: 'Product ID Service HMAC Secret',
			name: 'productIdServiceHmacSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'Optional HMAC-SHA256 secret for verifying the signature of the product ID service response. ' +
				'Falls back to the FINTS_PRODUCT_ID_SERVICE_HMAC_SECRET environment variable when left empty.',
		},
	];
}
