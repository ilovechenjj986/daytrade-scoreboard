const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'site', 'aistockmap');
const manifestFile = path.join(outputDir, 'manifest.json');
const statusFile = path.join(outputDir, 'status.json');
const authStateFile = process.env.AISTOCKMAP_AUTH_STATE_FILE || path.join(root, 'auth-state.json');
const targetUrl = 'https://aistockmap.com/?activeTab=heatmap';
const changeThreshold = 1;
const displayDefinitions = [
  { id: 'tw-day', title: '台股單日', market: '台股', period: '單日' },
  { id: 'tw-week', title: '台股單週', market: '台股', period: '單週' },
  { id: 'tw-month', title: '台股單月', market: '台股', period: '單月' },
  { id: 'us-day', title: '美股單日', market: '美股', period: '單日' }
];
const signalDefinition = displayDefinitions[0];
const scrapeDefinitions = displayDefinitions;

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

function contentHash(views) {
  const comparable = views.map(view => ({
    id: view.id,
    industries: view.industries.map(industry => ({
      name: industry.name,
      companies: industry.companies,
      change: industry.change
    }))
  }));
  return crypto.createHash('sha256').update(JSON.stringify(comparable)).digest('hex');
}

function viewHasMaterialChange(previousView, nextView, threshold = changeThreshold) {
  if (!previousView || !nextView) return true;
  const previous = new Map(previousView.industries.map(industry => [industry.name, industry]));
  const next = new Map(nextView.industries.map(industry => [industry.name, industry]));
  if (previous.size !== next.size) return true;
  for (const [name, industry] of next) {
    const oldIndustry = previous.get(name);
    if (!oldIndustry) return true;
    if (Math.abs(Number(oldIndustry.change) - Number(industry.change)) + Number.EPSILON >= threshold) {
      return true;
    }
  }
  return false;
}

function findDailyUpPeriodDown(views) {
  const byId = new Map(views.map(view => [view.id, view]));
  const daily = byId.get('tw-day');
  const weekly = byId.get('tw-week');
  const monthly = byId.get('tw-month');
  if (!daily || !weekly || !monthly) return { 'tw-week': [], 'tw-month': [] };
  const dailyUp = new Set(
    daily.industries.filter(industry => industry.change > 0).map(industry => industry.name)
  );
  const downNames = view => view.industries
    .filter(industry => industry.change < 0 && dailyUp.has(industry.name))
    .map(industry => industry.name)
    .sort((left, right) => left.localeCompare(right, 'zh-Hant'));
  return {
    'tw-week': downNames(weekly),
    'tw-month': downNames(monthly)
  };
}

function findDailyDownPeriodUp(views) {
  const byId = new Map(views.map(view => [view.id, view]));
  const daily = byId.get('tw-day');
  const weekly = byId.get('tw-week');
  const monthly = byId.get('tw-month');
  if (!daily || !weekly || !monthly) return [];
  const weeklyByName = new Map(weekly.industries.map(industry => [industry.name, industry]));
  const monthlyByName = new Map(monthly.industries.map(industry => [industry.name, industry]));
  return daily.industries
    .filter(industry => {
      const week = weeklyByName.get(industry.name);
      const month = monthlyByName.get(industry.name);
      return industry.change < 0 && (week?.change > 0 || month?.change > 0);
    })
    .map(industry => industry.name)
    .sort((left, right) => left.localeCompare(right, 'zh-Hant'));
}

function sameNames(left = [], right = []) {
  return left.length === right.length && left.every((name, index) => name === right[index]);
}

function sameSignalGroups(left, right) {
  return sameNames(left?.['tw-week'], right?.['tw-week'])
    && sameNames(left?.['tw-month'], right?.['tw-month']);
}

function isSnapshotComplete(snapshot) {
  if (!snapshot) return false;
  if (snapshot.complete === false) return false;
  const viewsComplete = displayDefinitions.every(
    definition => Number.isFinite(Number(snapshot.counts?.[definition.id]))
  );
  const signalComplete = Number.isFinite(Number(snapshot.starredIndustryCount));
  return viewsComplete && signalComplete;
}

function readSnapshot(snapshot) {
  if (!snapshot?.file) return null;
  const file = path.join(outputDir, snapshot.file);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function newestSnapshotBefore(manifest, date) {
  return manifest.snapshots
    .filter(snapshot => snapshot.file && snapshot.date < date)
    .sort((left, right) => right.date.localeCompare(left.date))[0] || null;
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
  const initialManifest = readManifest();
  const initialTarget = initialManifest.snapshots.find(item => item.file && item.date === expectedDate);
  if (isSnapshotComplete(initialTarget) && process.env.FORCE_CAPTURE !== 'true') {
    console.log(`SKIPPED COMPLETE ${expectedDate}`);
    return;
  }
  if (!fs.existsSync(authStateFile)) throw new Error('找不到 AISTOCKMAP_AUTH_STATE_FILE');

  const { chromium } = require('playwright');
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

    const scrapedViews = [];
    for (const definition of scrapeDefinitions) scrapedViews.push(await scrapeView(page, definition));
    const currentViews = new Map(scrapedViews.map(view => [view.id, view]));
    const views = displayDefinitions.map(definition => currentViews.get(definition.id));
    const signalSourceView = currentViews.get(signalDefinition.id);
    const signalGroups = findDailyUpPeriodDown(scrapedViews);
    const signalIndustryNames = [...new Set([
      ...signalGroups['tw-week'],
      ...signalGroups['tw-month']
    ])].sort((left, right) => left.localeCompare(right, 'zh-Hant'));
    const dailyDownPeriodUpNames = findDailyDownPeriodUp(scrapedViews);

    const completedAt = new Date();
    const date = captureDate(completedAt);
    if (weekdayForDate(date) === 'Sun') {
      writeStatus('skipped', '歸屬日期為週日，不保存資料');
      console.log('SKIPPED Sunday');
      return;
    }

    const latestManifest = readManifest();
    const targetSnapshot = latestManifest.snapshots.find(item => item.file && item.date === date) || null;
    const targetData = readSnapshot(targetSnapshot);
    const baselineSnapshot = newestSnapshotBefore(latestManifest, date);
    const baselineData = readSnapshot(baselineSnapshot);
    const targetViews = new Map((targetData?.views || []).map(view => [view.id, view]));
    const baselineViews = new Map((baselineData?.views || []).map(view => [view.id, view]));
    const acceptedViewIds = [];
    const previousSignal = targetData?.signals || baselineData?.signals || {};
    const legacySignalNames = previousSignal.twDayUpWeekMonthDown?.industryNames || [];
    const previousSignalGroups = previousSignal.twDayUpPeriodDown?.byView || {
      'tw-week': legacySignalNames,
      'tw-month': legacySignalNames
    };
    const previousDailyDownPeriodUpNames = previousSignal.twDayDownPeriodUp?.industryNames || [];
    const previousSignalSource = targetData?.signalSourceView || baselineData?.signalSourceView || null;
    const signalNamesChanged = !sameSignalGroups(previousSignalGroups, signalGroups)
      || !sameNames(previousDailyDownPeriodUpNames, dailyDownPeriodUpNames);
    const signalSourceChanged = !previousSignalSource
      || viewHasMaterialChange(previousSignalSource, signalSourceView);

    for (const view of views) {
      const savedView = targetViews.get(view.id);
      const comparisonView = savedView || baselineViews.get(view.id);
      if (!comparisonView || viewHasMaterialChange(comparisonView, view)) {
        targetViews.set(view.id, view);
        acceptedViewIds.push(view.id);
      }
    }

    if (signalNamesChanged || signalSourceChanged) {
      for (const id of ['tw-week', 'tw-month']) {
        targetViews.set(id, currentViews.get(id));
        if (!acceptedViewIds.includes(id)) acceptedViewIds.push(id);
      }
    }

    if (!acceptedViewIds.length && !signalNamesChanged && !signalSourceChanged) {
      console.log(`SKIPPED UNCHANGED ${baselineSnapshot?.date || 'no-baseline'}`);
      return;
    }

    const mergedViews = displayDefinitions
      .map(definition => targetViews.get(definition.id))
      .filter(Boolean);
    const availableViewIds = mergedViews.map(view => view.id);
    const pendingViewIds = displayDefinitions
      .map(definition => definition.id)
      .filter(id => !targetViews.has(id));
    const complete = pendingViewIds.length === 0;
    const hash = contentHash([...mergedViews, signalSourceView]);

    const slot = slotFor(date);
    const filename = `data/slot-${String(slot).padStart(2, '0')}.json`;
    writeJson(path.join(outputDir, filename), {
      date,
      capturedAt: completedAt.toISOString(),
      sourceUrl: targetUrl,
      contentHash: hash,
      changeThreshold,
      complete,
      availableViewIds,
      pendingViewIds,
      signals: {
        twDayUpPeriodDown: {
          byView: signalGroups,
          industryNames: signalIndustryNames,
          rule: 'tw-day > 0 && selected period < 0'
        },
        twDayDownPeriodUp: {
          industryNames: dailyDownPeriodUpNames,
          rule: 'tw-day < 0 && (tw-week > 0 || tw-month > 0)'
        }
      },
      signalSourceView,
      views: mergedViews
    });

    const structured = latestManifest.snapshots.filter(
      item => item.file && item.slot !== slot && item.date !== date
    );
    structured.push({
      date,
      slot,
      capturedAt: completedAt.toISOString(),
      sourceUrl: targetUrl,
      file: filename,
      contentHash: hash,
      changeThreshold,
      complete,
      availableViewIds,
      pendingViewIds,
      starredIndustryCount: signalIndustryNames.length,
      dailyStarredIndustryCount: dailyDownPeriodUpNames.length,
      counts: Object.fromEntries(mergedViews.map(view => [view.id, view.industries.length]))
    });
    structured.sort((left, right) => right.date.localeCompare(left.date));
    writeJson(manifestFile, {
      snapshots: structured.slice(0, 30)
        .sort((left, right) => Date.parse(right.capturedAt) - Date.parse(left.capturedAt))
    });
    const pendingTitles = displayDefinitions
      .filter(definition => pendingViewIds.includes(definition.id))
      .map(definition => definition.title);
    writeStatus(
      'success',
      complete
        ? `已保存 ${date}，四個檢視皆已更新`
        : `已保存 ${date} 的部分更新；等待：${pendingTitles.join('、')}`
    );
    console.log(
      `SUCCESS ${date} accepted=${acceptedViewIds.join(',')} pending=${pendingViewIds.join(',') || 'none'}`
    );
    await context.close();
  } finally {
    await browser.close();
  }
}

module.exports = {
  captureDate,
  weekdayForDate,
  parseListText,
  slotFor,
  contentHash,
  viewHasMaterialChange,
  findDailyUpPeriodDown,
  findDailyDownPeriodUp,
  sameNames,
  sameSignalGroups,
  isSnapshotComplete
};

if (require.main === module) {
  main().catch(error => {
    writeStatus('failed', error.stack || error.message);
    console.error(error);
    process.exitCode = 1;
  });
}
