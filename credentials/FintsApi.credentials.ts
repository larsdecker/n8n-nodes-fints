import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class FintsApi implements ICredentialType {
	name = 'fintsApi';
	displayName = 'FinTS API';
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
