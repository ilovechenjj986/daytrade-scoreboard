const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'site', 'aistockmap');
const imageDir = path.join(outputDir, 'screenshots');
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

async function captureView(page, temporaryTag, view) {
  await clickExact(page, view.market);
  await page.waitForTimeout(900);
  await clickExact(page, view.period);
  await page.waitForTimeout(1800);
  const listButton = page.locator('button[title="條列式"]').filter({ visible: true }).first();
  await listButton.waitFor({ state: 'visible', timeout: 20_000 });
  await listButton.click();
  await page.waitForTimeout(1500);

  await page.evaluate(async () => {
    const step = Math.max(500, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(500);

  const png = await page.screenshot({ fullPage: true, type: 'png', animations: 'disabled' });
  const filename = `.pending-${temporaryTag}-${view.id}.webp`;
  const output = path.join(imageDir, filename);
  await sharp(png).webp({ lossless: true, effort: 4 }).toFile(output);
  const metadata = await sharp(output).metadata();
  return {
    id: view.id,
    title: view.title,
    temporaryFile: output,
    width: metadata.width,
    height: metadata.height,
    bytes: fs.statSync(output).size
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
  if (manifest.snapshots.some(item => item.date === expectedDate) && process.env.FORCE_CAPTURE !== 'true') {
    writeStatus('skipped', `${expectedDate} 已有完整頁面快照，不重複擷取`);
    console.log(`SKIPPED ${expectedDate}`);
    return;
  }

  fs.mkdirSync(imageDir, { recursive: true });
  writeStatus('running', '正在擷取網站原始完整頁面');
  const launchOptions = { headless: true };
  if (process.env.CHROME_EXECUTABLE_PATH) launchOptions.executablePath = process.env.CHROME_EXECUTABLE_PATH;
  const browser = await chromium.launch(launchOptions);
  let pendingImages = [];
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

    const marketButton = page.getByText('台股', { exact: true }).filter({ visible: true }).first();
    await marketButton.waitFor({ state: 'visible', timeout: 90_000 });
    if (await page.getByText('登入以查看完整市場熱力圖與分析', { exact: true }).count()) {
      throw new Error('AI Stock Map 登入狀態已失效');
    }
    await page.waitForTimeout(2000);

    const views = [
      { id: 'tw-week', title: '台股單週', market: '台股', period: '單週' },
      { id: 'tw-month', title: '台股單月', market: '台股', period: '單月' },
      { id: 'us-day', title: '美股單日', market: '美股', period: '單日' }
    ];
    const temporaryTag = `${Date.now()}-${process.pid}`;
    for (const view of views) pendingImages.push(await captureView(page, temporaryTag, view));

    const completedAt = new Date();
    const date = captureDate(completedAt);
    const completedManifest = readManifest();
    if (weekdayForDate(date) === 'Sun') {
      writeStatus('skipped', '歸屬日期為週日，不保存擷取');
      console.log('SKIPPED Sunday');
      return;
    }
    if (completedManifest.snapshots.some(item => item.date === date) && process.env.FORCE_CAPTURE !== 'true') {
      writeStatus('skipped', `${date} 已有完整頁面快照，不重複擷取`);
      console.log(`SKIPPED ${date}`);
      return;
    }

    const slot = slotFor(date);
    const images = pendingImages.map(image => {
      const filename = `slot-${String(slot).padStart(2, '0')}-${image.id}.webp`;
      fs.renameSync(image.temporaryFile, path.join(imageDir, filename));
      return {
        id: image.id,
        title: image.title,
        file: `screenshots/${filename}`,
        width: image.width,
        height: image.height,
        bytes: image.bytes
      };
    });
    pendingImages = [];
    const entry = {
      date,
      slot,
      capturedAt: completedAt.toISOString(),
      sourceUrl: targetUrl,
      images
    };
    const snapshots = completedManifest.snapshots.filter(item => item.slot !== slot && item.date !== date);
    snapshots.push(entry);
    snapshots.sort((left, right) => right.date.localeCompare(left.date));
    writeJson(manifestFile, { snapshots });
    writeStatus('success', `已保存 ${date} 的 3 張網站完整頁面快照`);
    console.log(`SUCCESS ${date}`);
    await context.close();
  } finally {
    await browser.close();
    for (const image of pendingImages) {
      if (fs.existsSync(image.temporaryFile)) fs.rmSync(image.temporaryFile);
    }
  }
}

module.exports = { captureDate, weekdayForDate };

if (require.main === module) {
  main().catch(error => {
    writeStatus('failed', error.stack || error.message);
    console.error(error);
    process.exitCode = 1;
  });
}
