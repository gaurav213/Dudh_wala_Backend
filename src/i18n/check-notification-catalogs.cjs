#!/usr/bin/env node
/** Runnable check: catalog key parity + interpolate. */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'notifications');
const en = JSON.parse(fs.readFileSync(path.join(dir, 'en.json'), 'utf8'));
const hi = JSON.parse(fs.readFileSync(path.join(dir, 'hi.json'), 'utf8'));
const mr = JSON.parse(fs.readFileSync(path.join(dir, 'mr.json'), 'utf8'));

const enKeys = Object.keys(en).sort();
const hiKeys = Object.keys(hi).sort();
const mrKeys = Object.keys(mr).sort();
if (JSON.stringify(enKeys) !== JSON.stringify(hiKeys)) {
  throw new Error('HI keys != EN keys');
}
if (JSON.stringify(enKeys) !== JSON.stringify(mrKeys)) {
  throw new Error('MR keys != EN keys');
}

function interpolate(template, params) {
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    params[key] == null ? '' : String(params[key]),
  );
}

const sample = interpolate(hi.notifCustomerNoMilk.body, {
  name: 'A',
  date: '2026-01-01',
});
if (!sample.includes('A') || !sample.includes('2026-01-01')) {
  throw new Error('interpolate failed');
}

console.log(`notification catalogs ok (${enKeys.length} keys)`);
