const assert = require('assert');
const {
  parseListText,
  contentHash,
  viewHasMaterialChange,
  findDailyUpWeeklyMonthlyDown,
  sameNames,
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
  { name: 'AI 伺服器', companies: 12, change: 4.24 }
]}), false, 'less than 1 percentage point is treated as unchanged');
assert.equal(viewHasMaterialChange(baseline, { ...baseline, industries: [
  { name: 'AI 伺服器', companies: 12, change: 4.25 }
]}), true, 'exactly 1 percentage point is a material change');
assert.equal(viewHasMaterialChange(baseline, { ...baseline, industries: [
  { name: 'AI 伺服器', companies: 13, change: 3.25 }
]}), false, 'company count alone does not cross the percentage threshold');
assert.equal(viewHasMaterialChange(baseline, { ...baseline, industries: [
  ...baseline.industries,
  { name: '機器人', companies: 8, change: 2.1 }
]}), true, 'added or removed industries are material');
assert.equal(isSnapshotComplete({
  counts: { 'tw-week': 1, 'tw-month': 1, 'us-day': 1 },
  starredIndustryCount: 0
}), true);
assert.equal(isSnapshotComplete({ counts: { 'tw-week': 1, 'tw-month': 1, 'us-day': 1 } }), false);
assert.equal(isSnapshotComplete({ complete: false, counts: { 'tw-week': 1, 'tw-month': 1, 'us-day': 1 } }), false);
const signalViews = [
  { id: 'tw-day', industries: [
    { name: '先進封裝', companies: 5, change: 1.2 },
    { name: 'AI 伺服器', companies: 8, change: -0.1 },
    { name: '散熱', companies: 6, change: 0 }
  ] },
  { id: 'tw-week', industries: [
    { name: '先進封裝', companies: 5, change: -2.1 },
    { name: 'AI 伺服器', companies: 8, change: -3.2 },
    { name: '散熱', companies: 6, change: -1.3 }
  ] },
  { id: 'tw-month', industries: [
    { name: '先進封裝', companies: 5, change: -4.1 },
    { name: 'AI 伺服器', companies: 8, change: -5.2 },
    { name: '散熱', companies: 6, change: -2.3 }
  ] }
];
assert.deepEqual(findDailyUpWeeklyMonthlyDown(signalViews), ['先進封裝']);
assert.equal(sameNames(['先進封裝'], ['先進封裝']), true);
assert.equal(sameNames(['先進封裝'], ['散熱']), false);
console.log('AI Stock Map list parser tests passed');
