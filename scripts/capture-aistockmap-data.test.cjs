const assert = require('assert');
const {
  parseListText,
  contentHash,
  viewHasMaterialChange,
  isSnapshotComplete
} = require('./capture-aistockmap.cjs');

const text = `
台股產業市場熱力圖
產業
公司數
漲跌幅 ↓
石化與塑膠產業
19家
+15.50%
太陽能產業
15家
+4.99%
電芯製造與電池模組
16家
-0.79%
`;
assert.deepEqual(parseListText(text), [
  { name: '石化與塑膠產業', companies: 19, change: 15.5 },
  { name: '太陽能產業', companies: 15, change: 4.99 },
  { name: '電芯製造與電池模組', companies: 16, change: -0.79 }
]);
assert.deepEqual(parseListText('AI 伺服器 12家 +3.25%\n雲端與 MSP\t6家\t-0.40%'), [
  { name: 'AI 伺服器', companies: 12, change: 3.25 },
  { name: '雲端與 MSP', companies: 6, change: -0.4 }
]);
const views = [{ id: 'tw-week', sourceUpdatedAt: '下午1:00', industries: [
  { name: 'AI 伺服器', companies: 12, change: 3.25 }
] }];
assert.equal(contentHash(views), contentHash([{ ...views[0], sourceUpdatedAt: '下午2:00' }]));
assert.notEqual(contentHash(views), contentHash([{ ...views[0], industries: [
  { name: 'AI 伺服器', companies: 12, change: 3.26 }
] }]));
const baseline = { id: 'tw-week', industries: [
  { name: 'AI 伺服器', companies: 12, change: 3.25 }
] };
assert.equal(viewHasMaterialChange(baseline, { ...baseline, industries: [
  { name: 'AI 伺服器', companies: 12, change: 4.25 }
]}), false, 'exactly 1 percentage point is treated as unchanged');
assert.equal(viewHasMaterialChange(baseline, { ...baseline, industries: [
  { name: 'AI 伺服器', companies: 12, change: 4.26 }
]}), true, 'more than 1 percentage point is a material change');
assert.equal(viewHasMaterialChange(baseline, { ...baseline, industries: [
  { name: 'AI 伺服器', companies: 13, change: 3.25 }
]}), false, 'company count alone does not cross the percentage threshold');
assert.equal(viewHasMaterialChange(baseline, { ...baseline, industries: [
  ...baseline.industries,
  { name: '機器人', companies: 8, change: 2.1 }
]}), true, 'added or removed industries are material');
assert.equal(isSnapshotComplete({ counts: { 'tw-week': 1, 'tw-month': 1, 'us-day': 1 } }), true);
assert.equal(isSnapshotComplete({ complete: false, counts: { 'tw-week': 1, 'tw-month': 1, 'us-day': 1 } }), false);
console.log('AI Stock Map list parser tests passed');
