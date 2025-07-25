#!/usr/bin/env node
import fs from 'fs';

const [, , csvFile, delimiter = ';'] = process.argv;

if (!csvFile) {
	console.error('Usage: node scripts/update-banks.js <banks.csv> [delimiter]');
	process.exit(1);
}

const raw = fs.readFileSync(csvFile, 'utf8');
const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);

const banks = lines.map((line) => {
	const [displayName, fintsUrl, blz] = line.split(delimiter).map((p) => p.trim());
	const value = displayName.replace(/\s+/g, '');
	return { value, displayName, blz, fintsUrl };
});

fs.writeFileSync('nodes/FintsNode/banks.json', JSON.stringify(banks, null, 2) + '\n');
console.log(`Updated banks.json with ${banks.length} entries`);
