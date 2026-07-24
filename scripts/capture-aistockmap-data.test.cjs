const assert = require('assert');
const { parseListText } = require('./capture-aistockmap.cjs');

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
console.log('AI Stock Map list parser tests passed');
