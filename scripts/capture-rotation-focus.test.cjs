const assert = require('assert');
const { parseStatsHtml, slotFor, fullDate } = require('./capture-rotation-focus.cjs');

const html = `
<script>
const heatData = [
  {"name":"甲族群","d":{"7/22":{"c":1,"r":4},"7/23":{"c":3,"r":null}}},
  {"name":"乙族群","d":{"7/22":{"c":2,"r":2},"7/23":{"c":1,"r":null}}}
];
const dates=['7/22','7/23'];
const recentDays=2;
const rankDate='7/22';
const maxFocusRows=18;
</script>`;
const parsed = parseStatsHtml(html, new Date('2026-07-24T01:00:00Z'));
assert.equal(parsed.date, '2026-07-23');
assert.equal(parsed.focus.length, 2);
assert.equal(parsed.focus[0].name, '甲族群');
assert.equal(parsed.focus[0].recentCount, 4);
assert.equal(parsed.focus[0].activeDays, 2);
assert.equal(parsed.focus[0].avgReturn, 4);
assert.equal(parsed.focus[0].cells[1].count, 3);
assert.equal(parsed.latestTotal, 4);
assert.deepEqual(parsed.latestGroups.map(item => item.name), ['甲族群', '乙族群']);
assert.equal(fullDate('12/31', new Date('2026-01-02T00:00:00Z')), '2025-12-31');
assert.equal(slotFor('2026-07-23'), slotFor('2026-07-23'));
console.log('Rotation focus parser tests passed');
