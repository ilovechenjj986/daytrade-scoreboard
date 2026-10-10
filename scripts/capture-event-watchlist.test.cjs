const assert = require('node:assert/strict');
const { parseDisposalStocks, parseEventsHtml, mergeStocks, slotFor } = require('./capture-event-watchlist.cjs');

const lineHtml = `
  <div>盤前 LINE 轉貼版</div>
  <pre>【處置預測】
1. 華新科(2492)｜2分(第1次)
   條件：略
2. 旭然(4556)｜2分(第2次)
3. 鈺鎧(5228)｜2分(第1次)
【處置出關】</pre>`;
assert.deepEqual(parseDisposalStocks(lineHtml), [
  { code: '2492', name: '華新科', event: '進處置' },
  { code: '5228', name: '鈺鎧', event: '進處置' }
]);

const eventsHtml = `
  <p>財報召開 + 法說會 + 除權 / 除息</p>
  <table><thead><tr><th>預定</th><th>類</th><th>代號</th><th>名稱</th></tr></thead><tbody>
    <tr><td>10/5-10/13</td><td>法</td><td>2308</td><td>台達電</td></tr>
    <tr><td>10/12</td><td>法</td><td>2408</td><td>南亞科</td></tr>
    <tr><td>10/12</td><td>權</td><td>1449</td><td>佳和</td></tr>
    <tr><td>10/12</td><td>息</td><td>2938</td><td>床的世界</td></tr>
    <tr><td>10/12</td><td>權息</td><td>2063</td><td>世鎧精密</td></tr>
    <tr><td>10/13</td><td>法</td><td>1725</td><td>元禎</td></tr>
  </tbody></table>`;
assert.deepEqual(parseEventsHtml(eventsHtml, '2026-10-12'), [
  { code: '2408', name: '南亞科', event: '法說' },
  { code: '1449', name: '佳和', event: '除權息' },
  { code: '2938', name: '床的世界', event: '除權息' },
  { code: '2063', name: '世鎧精密', event: '除權息' }
]);
assert.deepEqual(parseEventsHtml(eventsHtml, '2026-10-05'), [
  { code: '2308', name: '台達電', event: '法說' }
]);
assert.deepEqual(mergeStocks(
  [{ code: '2492', name: '華新科', event: '進處置' }],
  [{ code: '2492', name: '華新科', event: '法說' }]
), [{ code: '2492', name: '華新科', events: ['進處置', '法說'] }]);
assert.equal(slotFor('2026-10-12'), Math.floor(Date.parse('2026-10-12T00:00:00Z') / 86400000) % 30);
assert.throws(() => parseDisposalStocks('<main>no section</main>'), /找不到/);
console.log('Event watchlist parser tests passed');

