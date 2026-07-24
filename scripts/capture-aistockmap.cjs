const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'site', 'aistockmap');
const manifestFile = path.join(outputDir, 'manifest.json');
const statusFile = path.join(outputDir, 'status.json');
const authStateFile = process.env.AISTOCKMAP_AUTH_STATE_FILE || path.join(root, 'auth-state.json');
const targetUrl = 'https://aistockmap.com/?topic=niche-memory&activeTab=heatmap';

function taipeiDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
}

function taipeiTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei', hour: 'numeric', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  return {
    hour: Number(parts.find(part => part.type === 'hour').value) % 24,
    minute: Number(parts.find(part => part.type === 'minute').value)
  };
}

function previousDate(dateText) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function captureDate(date = new Date()) {
  const dateText = taipeiDate(date);
  const { hour, minute } = taipeiTime(date);
  return hour * 60 + minute < 18 * 60 + 5 ? previousDate(dateText) : dateText;
}

function weekdayForDate(dateText) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
    new Date(`${dateText}T12:00:00Z`).getUTCDay()
  ];
}

function slotFor(dateText) {
  const days = Math.floor(Date.parse(`${dateText}T00:00:00Z`) / 86_400_000);
  return ((days % 30) + 30) % 30;
}

function parseListText(text) {
  const lines = String(text).split(/\r?\n|\t/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const industries = [];
  const seen = new Set();
  const add = (name, companies, change) => {
    const entry = { name: name.trim(), companies: Number(companies), change: Number(change) };
    if (!entry.name || entry.name === '產業' || seen.has(entry.name)) return;
    if (!Number.isFinite(entry.change) || entry.companies <= 0) return;
    industries.push(entry);
    seen.add(entry.name);
  };
  for (const line of lines) {
    const row = line.match(/^(.+?)\s+(\d+)\s*家\s+([+-]?\d+(?:\.\d+)?)\s*%$/);
    if (row) add(row[1], row[2], row[3]);
  }
  for (let index = 1; index < lines.length - 1; index += 1) {
    const companies = lines[index].match(/^(\d+)\s*家$/);
    const change = lines[index + 1].match(/^([+-]?\d+(?:\.\d+)?)\s*%$/);
    if (!companies || !change) continue;
    add(lines[index - 1], companies[1], change[1]);
  }
  return industries;
}

function readManifest() {
  if (!fs.existsSync(manifestFile)) return { snapshots: [] };
  return JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writeStatus(status, detail) {
  writeJson(statusFile, { status, detail, updatedAt: new Date().toISOString() });
}

async function clickExact(page, label) {
  const locator = page.getByText(label, { exact: true }).filter({ visible: true }).first();
  await locator.waitFor({ state: 'visible', timeout: 20_000 });
  await locator.click();
}

async function scrapeView(page, view) {
  await clickExact(page, view.market);
  await page.waitForTimeout(900);
  await clickExact(page, view.period);
  await page.waitForTimeout(1800);
  const listButton = page.locator('button[title="條列式"]').filter({ visible: true }).first();
  await listButton.waitFor({ state: 'visible', timeout: 20_000 });
  await listButton.click();
  await page.waitForTimeout(1600);

  const bodyText = await page.locator('body').innerText();
  const industries = parseListText(bodyText);
  if (industries.length < 5) {
    throw new Error(`${view.title} 只解析到 ${industries.length} 個族群，拒絕保存不完整資料`);
  }
  const updatedMatch = bodyText.match(/資料更新於\s*([^\r\n]+)/);
  return {
    id: view.id,
    title: view.title,
    market: view.market,
    period: view.period,
    sourceUpdatedAt: updatedMatch ? updatedMatch[1].trim() : null,
    industries
  };
}

async function main() {
  const expectedDate = captureDate();
  if (weekdayForDate(expectedDate) === 'Sun') {
    writeStatus('skipped', '週日不執行擷取');
    console.log('SKIPPED Sunday');
    return;
  }
  if (!fs.existsSync(authStateFile)) throw new Error('找不到 AISTOCKMAP_AUTH_STATE_FILE');

  const manifest = readManifest();
  if (manifest.snapshots.some(item => item.date === expectedDate && item.file) && process.env.FORCE_CAPTURE !== 'true') {
    writeStatus('skipped', `${expectedDate} 已有結構化資料，不重複擷取`);
    console.log(`SKIPPED ${expectedDate}`);
    return;
  }

  writeStatus('running', '正在讀取網站條列資料');
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      storageState: authStateFile,
      viewport: { width: 1920, height: 1080 },
      locale: 'zh-TW',
      timezoneId: 'Asia/Taipei'
    });
    const page = await context.newPage();
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(3500);
    const dismiss = page.getByRole('button', { name: '我知道了！', exact: true });
    if (await dismiss.count()) await dismiss.first().click();
    await page.getByText('台股', { exact: true }).filter({ visible: true }).first()
      .waitFor({ state: 'visible', timeout: 90_000 });
    if (await page.getByText('登入以查看完整市場熱力圖與分析', { exact: true }).count()) {
      throw new Error('AI Stock Map 登入狀態已失效');
    }
    await page.waitForTimeout(2000);

    const definitions = [
      { id: 'tw-week', title: '台股單週', market: '台股', period: '單週' },
      { id: 'tw-month', title: '台股單月', market: '台股', period: '單月' },
      { id: 'us-day', title: '美股單日', market: '美股', period: '單日' }
    ];
    const views = [];
    for (const definition of definitions) views.push(await scrapeView(page, definition));

    const completedAt = new Date();
    const date = captureDate(completedAt);
    if (weekdayForDate(date) === 'Sun') {
      writeStatus('skipped', '歸屬日期為週日，不保存資料');
      console.log('SKIPPED Sunday');
      return;
    }

    const slot = slotFor(date);
    const filename = `data/slot-${String(slot).padStart(2, '0')}.json`;
    writeJson(path.join(outputDir, filename), {
      date,
      capturedAt: completedAt.toISOString(),
      sourceUrl: targetUrl,
      views
    });

    const latestManifest = readManifest();
    const legacy = latestManifest.snapshots.filter(item => Array.isArray(item.images));
    const structured = latestManifest.snapshots.filter(
      item => item.file && item.slot !== slot && item.date !== date
    );
    structured.push({
      date,
      slot,
      capturedAt: completedAt.toISOString(),
      sourceUrl: targetUrl,
      file: filename,
      counts: Object.fromEntries(views.map(view => [view.id, view.industries.length]))
    });
    structured.sort((left, right) => right.date.localeCompare(left.date));
    writeJson(manifestFile, {
      snapshots: [...structured.slice(0, 30), ...legacy]
        .sort((left, right) => Date.parse(right.capturedAt) - Date.parse(left.capturedAt))
    });
    writeStatus('success', `已保存 ${date} 的三組條列資料`);
    console.log(`SUCCESS ${date} ${views.map(view => `${view.id}:${view.industries.length}`).join(' ')}`);
    await context.close();
  } finally {
    await browser.close();
  }
}

module.exports = { captureDate, weekdayForDate, parseListText, slotFor };

if (require.main === module) {
  main().catch(error => {
    writeStatus('failed', error.stack || error.message);
    console.error(error);
    process.exitCode = 1;
  });
}
