const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'site', 'limit-up');
const dataDir = path.join(outputDir, 'data');
const indexFile = path.join(outputDir, 'index.json');
const statusFile = path.join(outputDir, 'status.json');
const sourceUrl = process.env.LIMIT_UP_SOURCE_URL || 'https://chengwaye.com/daily';

function decodeHtml(value) {
  return String(value)
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([\da-f]+);/gi, (_, number) => String.fromCodePoint(parseInt(number, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match ? decodeHtml(match[2]) : '';
}

function parseDailyHtml(html) {
  const title = html.match(/<title>\s*Chengwaye\s+漲停當日\s+(\d{4})\/(\d{2})\/(\d{2})\s*<\/title>/i);
  if (!title) throw new Error('找不到 Chengwaye 交易日期');
  const date = `${title[1]}-${title[2]}-${title[3]}`;

  const countMatch = html.match(/id=["']stocks-section["'][^>]*>[\s\S]*?漲停（\s*(\d+)\s*檔）/i);
  if (!countMatch) throw new Error('找不到漲停區塊');
  const expectedCount = Number(countMatch[1]);

  const rowTags = html.match(/<tr\b[^>]*class=["'][^"']*\bstock-row-clickable\b[^"']*["'][^>]*>/gi) || [];
  const stocks = rowTags.map(tag => ({
    code: attribute(tag, 'data-code'),
    name: attribute(tag, 'data-name'),
    group: attribute(tag, 'data-concept')
  }));

  for (const stock of stocks) {
    if (!/^\d{4,6}$/.test(stock.code) || !stock.name || !stock.group) {
      throw new Error(`漲停資料欄位不完整：${JSON.stringify(stock)}`);
    }
  }
  if (stocks.length !== expectedCount) {
    throw new Error(`漲停筆數不一致：標題 ${expectedCount}，解析 ${stocks.length}`);
  }
  if (new Set(stocks.map(stock => stock.code)).size !== stocks.length) {
    throw new Error('漲停資料包含重複代號');
  }

  return { date, stocks };
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

async function fetchHtml() {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(sourceUrl, {
        headers: { 'user-agent': 'daytrade-scoreboard/1.0 (+daily public archive)' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
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
  const { date, stocks } = parseDailyHtml(await fetchHtml());
  const current = readIndex();
  const force = process.env.FORCE_CAPTURE === 'true';
  if (current.snapshots.some(snapshot => snapshot.date === date) && !force) {
    console.log(`SKIPPED ${date}`);
    return;
  }

  const capturedAt = new Date().toISOString();
  const slot = slotFor(date);
  const filename = `slot-${String(slot).padStart(2, '0')}.json`;
  writeJson(path.join(dataDir, filename), {
    date,
    capturedAt,
    sourceUrl,
    stocks
  });

  const snapshot = {
    date,
    slot,
    capturedAt,
    count: stocks.length,
    file: `data/${filename}`
  };
  const snapshots = current.snapshots.filter(item => item.slot !== slot && item.date !== date);
  snapshots.push(snapshot);
  snapshots.sort((left, right) => right.date.localeCompare(left.date));
  writeJson(indexFile, { snapshots: snapshots.slice(0, 30) });
  writeJson(statusFile, {
    status: 'success',
    detail: `已保存 ${date} 的 ${stocks.length} 檔漲停資料`,
    updatedAt: capturedAt
  });
  console.log(`SUCCESS ${date} ${stocks.length}`);
}

module.exports = { parseDailyHtml, slotFor };

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
