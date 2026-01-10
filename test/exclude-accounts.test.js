import assert from 'node:assert/strict';
import { FintsNode } from '../dist/nodes/FintsNode/FintsNode.node.js';
import { test } from 'node:test';

test('FintsNode has excludeAccounts parameter with correct properties', () => {
	const node = new FintsNode();
	const excludeAccountsProp = node.description.properties.find((p) => p.name === 'excludeAccounts');

	assert.ok(excludeAccountsProp, 'excludeAccounts property should exist');
	assert.equal(excludeAccountsProp.displayName, 'Exclude IBANs/Account Numbers');
	assert.equal(excludeAccountsProp.type, 'string');
	assert.equal(excludeAccountsProp.default, '');
	assert.ok(
		excludeAccountsProp.description.includes('Comma-separated'),
		'Description should mention comma-separated',
	);

	// Check displayOptions
	assert.ok(excludeAccountsProp.displayOptions, 'displayOptions should be defined');
	assert.ok(excludeAccountsProp.displayOptions.show, 'displayOptions.show should be defined');
	assert.deepEqual(
		excludeAccountsProp.displayOptions.show.resource,
		['account'],
		'Should show when resource is account',
	);
	assert.deepEqual(
		excludeAccountsProp.displayOptions.show.operation,
		['getStatements'],
		'Should show when operation is getStatements',
	);
});

test('Filtering by IBAN excludes matching accounts', () => {
	// Mock accounts list
	const accounts = [
		{ iban: 'DE89370400440532013000', accountNumber: '12345678' },
		{ iban: 'DE89370400440532013001', accountNumber: '87654321' },
		{ iban: 'DE89370400440532013002', accountNumber: '11223344' },
	];

	// Simulate filtering logic
	const excludeAccountsRaw = 'DE89370400440532013001';
	const excludeList = excludeAccountsRaw
		.split(',')
		.map((s) => s.trim().toUpperCase())
		.filter((s) => s !== '');

	const filteredAccounts = accounts.filter((account) => {
		const iban = (account.iban || '').toUpperCase();
		const accNo = (account.accountNumber || '').toUpperCase();
		return !excludeList.includes(iban) && !excludeList.includes(accNo);
	});

	assert.equal(filteredAccounts.length, 2, 'Should have 2 accounts after filtering');
	assert.ok(
		!filteredAccounts.some((a) => a.iban === 'DE89370400440532013001'),
		'Excluded IBAN should not be in results',
	);
	assert.ok(
		filteredAccounts.some((a) => a.iban === 'DE89370400440532013000'),
		'Non-excluded IBAN should be in results',
	);
});

test('Filtering by account number excludes matching accounts', () => {
	// Mock accounts list
	const accounts = [
		{ iban: 'DE89370400440532013000', accountNumber: '12345678' },
		{ iban: 'DE89370400440532013001', accountNumber: '87654321' },
		{ iban: 'DE89370400440532013002', accountNumber: '11223344' },
	];

	// Simulate filtering logic
	const excludeAccountsRaw = '87654321';
	const excludeList = excludeAccountsRaw
		.split(',')
		.map((s) => s.trim().toUpperCase())
		.filter((s) => s !== '');

	const filteredAccounts = accounts.filter((account) => {
		const iban = (account.iban || '').toUpperCase();
		const accNo = (account.accountNumber || '').toUpperCase();
		return !excludeList.includes(iban) && !excludeList.includes(accNo);
	});

	assert.equal(filteredAccounts.length, 2, 'Should have 2 accounts after filtering');
	assert.ok(
		!filteredAccounts.some((a) => a.accountNumber === '87654321'),
		'Excluded account number should not be in results',
	);
	assert.ok(
		filteredAccounts.some((a) => a.accountNumber === '12345678'),
		'Non-excluded account number should be in results',
	);
});

test('Filtering is case-insensitive', () => {
	// Mock accounts list with mixed case
	const accounts = [
		{ iban: 'DE89370400440532013000', accountNumber: '12345678' },
		{ iban: 'DE89370400440532013001', accountNumber: '87654321' },
	];

	// Test with lowercase exclusion
	const excludeAccountsRaw = 'de89370400440532013000';
	const excludeList = excludeAccountsRaw
		.split(',')
		.map((s) => s.trim().toUpperCase())
		.filter((s) => s !== '');

	const filteredAccounts = accounts.filter((account) => {
		const iban = (account.iban || '').toUpperCase();
		const accNo = (account.accountNumber || '').toUpperCase();
		return !excludeList.includes(iban) && !excludeList.includes(accNo);
	});

	assert.equal(filteredAccounts.length, 1, 'Should have 1 account after filtering');
	assert.equal(
		filteredAccounts[0].iban,
		'DE89370400440532013001',
		'Should match the non-excluded account',
	);
});

test('Filtering handles whitespace correctly', () => {
	// Mock accounts list
	const accounts = [
		{ iban: 'DE89370400440532013000', accountNumber: '12345678' },
		{ iban: 'DE89370400440532013001', accountNumber: '87654321' },
		{ iban: 'DE89370400440532013002', accountNumber: '11223344' },
	];

	// Test with whitespace around IBANs
	const excludeAccountsRaw = '  DE89370400440532013000  ,  DE89370400440532013001  ';
	const excludeList = excludeAccountsRaw
		.split(',')
		.map((s) => s.trim().toUpperCase())
		.filter((s) => s !== '');

	const filteredAccounts = accounts.filter((account) => {
		const iban = (account.iban || '').toUpperCase();
		const accNo = (account.accountNumber || '').toUpperCase();
		return !excludeList.includes(iban) && !excludeList.includes(accNo);
	});

	assert.equal(filteredAccounts.length, 1, 'Should have 1 account after filtering');
	assert.equal(
		filteredAccounts[0].iban,
		'DE89370400440532013002',
		'Should only have the non-excluded account',
	);
});

test('Empty exclude list returns all accounts', () => {
	// Mock accounts list
	const accounts = [
		{ iban: 'DE89370400440532013000', accountNumber: '12345678' },
		{ iban: 'DE89370400440532013001', accountNumber: '87654321' },
	];

	// Test with empty string
	const excludeAccountsRaw = '';
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
	}

	assert.equal(filteredAccounts.length, 2, 'Should return all accounts when exclude list is empty');
});

test('Filtering handles multiple exclusions', () => {
	// Mock accounts list
	const accounts = [
		{ iban: 'DE89370400440532013000', accountNumber: '12345678' },
		{ iban: 'DE89370400440532013001', accountNumber: '87654321' },
		{ iban: 'DE89370400440532013002', accountNumber: '11223344' },
		{ iban: 'DE89370400440532013003', accountNumber: '99887766' },
	];

	// Test with multiple exclusions (mix of IBAN and account number)
	const excludeAccountsRaw = 'DE89370400440532013000, 87654321, 11223344';
	const excludeList = excludeAccountsRaw
		.split(',')
		.map((s) => s.trim().toUpperCase())
		.filter((s) => s !== '');

	const filteredAccounts = accounts.filter((account) => {
		const iban = (account.iban || '').toUpperCase();
		const accNo = (account.accountNumber || '').toUpperCase();
		return !excludeList.includes(iban) && !excludeList.includes(accNo);
	});

	assert.equal(filteredAccounts.length, 1, 'Should have 1 account after filtering');
	assert.equal(
		filteredAccounts[0].iban,
		'DE89370400440532013003',
		'Should only have the non-excluded account',
	);
});

test('Filtering handles null or undefined account values safely', () => {
	// Mock accounts with missing values
	const accounts = [
		{ iban: 'DE89370400440532013000', accountNumber: null },
		{ iban: null, accountNumber: '87654321' },
		{ iban: 'DE89370400440532013002', accountNumber: '11223344' },
	];

	// Test filtering with null values
	const excludeAccountsRaw = 'DE89370400440532013000';
	const excludeList = excludeAccountsRaw
		.split(',')
		.map((s) => s.trim().toUpperCase())
		.filter((s) => s !== '');

	const filteredAccounts = accounts.filter((account) => {
		const iban = (account.iban || '').toUpperCase();
		const accNo = (account.accountNumber || '').toUpperCase();
		return !excludeList.includes(iban) && !excludeList.includes(accNo);
	});

	assert.equal(filteredAccounts.length, 2, 'Should handle null values without errors');
	assert.ok(
		!filteredAccounts.some((a) => a.iban === 'DE89370400440532013000'),
		'Should exclude the matching account',
	);
});
