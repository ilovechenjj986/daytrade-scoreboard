const assert = require('node:assert/strict');
const { captureDate, weekdayForDate } = require('./capture-aistockmap.cjs');

const cases = [
  ['2026-07-24T10:04:59Z', '2026-07-23'],
  ['2026-07-24T10:05:00Z', '2026-07-24'],
  ['2026-07-24T15:59:59Z', '2026-07-24'],
  ['2026-07-24T16:00:00Z', '2026-07-24'],
  ['2026-07-25T10:04:59Z', '2026-07-24'],
  ['2026-07-25T10:05:00Z', '2026-07-25'],
  ['2026-07-26T02:00:00Z', '2026-07-25'],
  ['2026-07-27T02:00:00Z', '2026-07-26']
];

for (const [input, expected] of cases) {
  assert.equal(captureDate(new Date(input)), expected, input);
}

assert.equal(weekdayForDate('2026-07-25'), 'Sat');
assert.equal(weekdayForDate('2026-07-26'), 'Sun');
console.log(`${cases.length} capture-window boundary cases passed`);
