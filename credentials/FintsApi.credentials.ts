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
	];
}
