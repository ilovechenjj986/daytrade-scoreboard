const assert = require('node:assert/strict');
const { parseDailyHtml, slotFor } = require('./capture-limit-up.cjs');

const html = `
  <title>Chengwaye 漲停當日 2026/07/23</title>
  <div id="stocks-section">🔴 漲停（3 檔）</div>
  <table id="stock-table"><tbody>
    <tr class="stock-row-clickable" data-code="1435" data-name="中福" data-concept="造紙">
    <tr class="stock-row-clickable featured" data-code="1591" data-name="駿吉-KY" data-concept="汽車">
    <tr class="stock-row-clickable" data-code="6969" data-name="成信實業*-創" data-concept="消費內需">
  </tbody></table>
`;

const parsed = parseDailyHtml(html);
assert.equal(parsed.date, '2026-07-23');
assert.deepEqual(parsed.stocks, [
  { code: '1435', name: '中福', group: '造紙' },
  { code: '1591', name: '駿吉-KY', group: '汽車' },
  { code: '6969', name: '成信實業*-創', group: '消費內需' }
]);
assert.equal(slotFor('2026-07-23'), 17);
assert.throws(() => parseDailyHtml(html.replace('3 檔', '4 檔')), /筆數不一致/);
console.log('Limit-up parser tests passed');
