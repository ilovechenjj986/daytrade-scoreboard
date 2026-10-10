const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'site', 'event-watchlist');
const dataDir = path.join(outputDir, 'data');
const indexFile = path.join(outputDir, 'index.json');
const statusFile = path.join(outputDir, 'status.json');
const lineUrl = process.env.EVENT_LINE_SOURCE_URL || 'https://chengwaye.com/';
const eventsUrl = process.env.EVENTS_SOURCE_URL || 'https://chengwaye.com/realtime-events';

function decodeHtml(value) {
  return String(value)
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([\da-f]+);/gi, (_, number) => String.fromCodePoint(parseInt(number, 16)))
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function htmlText(html) {
  return decodeHtml(String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|section|article|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[\t\u00a0 ]+/g, ' ')
    .replace(/\n\s+/g, '\n');
}

function parseDisposalStocks(html) {
  const text = htmlText(html);
  const heading = /[【〖]\s*處置預測\s*[】〗]/.exec(text);
  if (!heading) throw new Error('找不到盤前 LINE 轉貼版的「處置預測」區塊');
  const followingHeading = /\n\s*[【〖][^】〗\n]+[】〗]/g;
  followingHeading.lastIndex = heading.index + heading[0].length;
  const next = followingHeading.exec(text);
  const section = text.slice(heading.index + heading[0].length, next ? next.index : undefined);
  const stocks = [];
  for (const line of section.split(/\r?\n/)) {
    const match = line.match(/^\s*\d+[.、]\s*(.+?)\s*\(\s*(\d{4,6})\s*\)\s*[｜|].*?\(第\s*1\s*次\)/);
    if (match) stocks.push({ code: match[2], name: match[1].trim(), event: '進處置' });
  }
  if (!stocks.length && !/第\s*1\s*次/.test(section)) {
    throw new Error('處置預測區塊格式不符，無法確認第 1 次標的');
  }
  return stocks;
}

function stripCell(cellHtml) {
  return htmlText(cellHtml).replace(/\s+/g, ' ').trim();
}

function eventLabel(type) {
  if (type.includes('法')) return '法說';
  if (type.includes('權') || type.includes('息')) return '除權息';
  return null;
}

function parseEventsHtml(html, date) {
  const headers = [...String(html).matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(match => stripCell(match[1]));
  const pageText = htmlText(html);
  if (!headers.some(value => value.includes('預定')) || !headers.some(value => value.includes('代號'))
      || !pageText.includes('法說') && !pageText.includes('除權')) {
    throw new Error('事件頁資料表格式不符');
  }

  const target = date.slice(5);
  const stocks = [];
  const rows = String(html).match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(match => stripCell(match[1]));
    if (cells.length < 4) continue;
    const dateText = cells[0].replace(/\s+/g, '');
    const firstDate = dateText.match(/(?:\d{4}[/-])?(\d{1,2})\/(\d{1,2})/);
    if (!firstDate) continue;
    const rowDate = `${String(Number(firstDate[1])).padStart(2, '0')}-${String(Number(firstDate[2])).padStart(2, '0')}`;
    if (rowDate !== target) continue;

    const event = eventLabel(cells[1]);
    const code = cells[2];
    const name = cells[3];
    if (!event) continue;
    if (!/^\d{4,6}$/.test(code) || !name) throw new Error(`事件資料欄位不完整：${JSON.stringify(cells.slice(0, 4))}`);
    stocks.push({ code, name, event });
  }
  return stocks;
}

function mergeStocks(disposalStocks, eventStocks) {
  const byCode = new Map();
  for (const stock of [...disposalStocks, ...eventStocks]) {
    const current = byCode.get(stock.code) || { code: stock.code, name: stock.name, events: [] };
    if (!current.name && stock.name) current.name = stock.name;
    if (!current.events.includes(stock.event)) current.events.push(stock.event);
    byCode.set(stock.code, current);
  }
  const eventOrder = ['進處置', '法說', '除權息'];
  return [...byCode.values()].sort((left, right) => Number(left.code) - Number(right.code))
    .map(stock => ({ ...stock, events: stock.events.sort((a, b) => eventOrder.indexOf(a) - eventOrder.indexOf(b)) }));
}

function taipeiDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
}

function slotFor(dateText) {
  const days = Math.floor(Date.parse(`${dateText}T00:00:00Z`) / 86_400_000);
  return ((days % 30) + 30) % 30;
}

function readIndex() {
  if (!fs.existsSync(indexFile)) return { snapshots: [] };
  return JSON.parse(fs.readFileSync(indexFile, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function fetchHtml(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'daytrade-scoreboard/1.0 (+daily event watchlist)' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 1500));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function main() {
  const date = process.env.EVENT_CAPTURE_DATE || taipeiDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`日期格式錯誤：${date}`);
  const [lineHtml, eventHtml] = await Promise.all([fetchHtml(lineUrl), fetchHtml(eventsUrl)]);
  const disposalStocks = parseDisposalStocks(lineHtml);
  const eventStocks = parseEventsHtml(eventHtml, date);
  const stocks = mergeStocks(disposalStocks, eventStocks);
  const current = readIndex();
  const force = process.env.FORCE_CAPTURE === 'true';
  if (current.snapshots.some(snapshot => snapshot.date === date) && !force) {
    console.log(`SKIPPED ${date}`);
    return;
  }

  const capturedAt = new Date().toISOString();
  const slot = slotFor(date);
  const filename = `slot-${String(slot).padStart(2, '0')}.json`;
  const eventCounts = { '進處置': 0, '法說': 0, '除權息': 0 };
  for (const stock of stocks) for (const event of stock.events) eventCounts[event] += 1;
  writeJson(path.join(dataDir, filename), {
    date, capturedAt, sources: { line: lineUrl, events: eventsUrl }, eventCounts, stocks
  });
  const snapshot = { date, slot, capturedAt, count: stocks.length, file: `data/${filename}` };
  const snapshots = current.snapshots.filter(item => item.slot !== slot && item.date !== date);
  snapshots.push(snapshot);
  snapshots.sort((left, right) => right.date.localeCompare(left.date));
  writeJson(indexFile, { snapshots: snapshots.slice(0, 30) });
  writeJson(statusFile, {
    status: 'success',
    detail: `已保存 ${date} 的 ${stocks.length} 檔標的`,
    updatedAt: capturedAt
  });
  console.log(`SUCCESS ${date} ${stocks.length} disposal=${eventCounts['進處置']} presentation=${eventCounts['法說']} ex=${eventCounts['除權息']}`);
}

module.exports = { parseDisposalStocks, parseEventsHtml, mergeStocks, slotFor, htmlText };

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

