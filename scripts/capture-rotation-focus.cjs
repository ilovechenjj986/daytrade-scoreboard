const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'site', 'rotation-focus');
const dataDir = path.join(outputDir, 'data');
const indexFile = path.join(outputDir, 'index.json');
const statusFile = path.join(outputDir, 'status.json');
const sourceUrl = process.env.ROTATION_SOURCE_URL || 'https://chengwaye.com/stats';

function extractAssignedJson(html, variableName) {
  const marker = new RegExp(`\\bconst\\s+${variableName}\\s*=\\s*`).exec(html);
  if (!marker) throw new Error(`找不到 ${variableName}`);
  const start = marker.index + marker[0].length;
  const opener = html[start];
  const closer = opener === '[' ? ']' : opener === '{' ? '}' : '';
  if (!closer) throw new Error(`${variableName} 不是 JSON 陣列或物件`);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === opener) depth += 1;
    if (char === closer) {
      depth -= 1;
      if (depth === 0) return JSON.parse(html.slice(start, index + 1).replace(/'/g, '"'));
    }
  }
  throw new Error(`${variableName} 資料不完整`);
}

function extractNumber(html, variableName) {
  const match = html.match(new RegExp(`\\bconst\\s+${variableName}\\s*=\\s*(\\d+)\\s*;`));
  if (!match) throw new Error(`找不到 ${variableName}`);
  return Number(match[1]);
}

function extractString(html, variableName) {
  const match = html.match(new RegExp(`\\bconst\\s+${variableName}\\s*=\\s*['"]([^'"]+)['"]\\s*;`));
  if (!match) throw new Error(`找不到 ${variableName}`);
  return match[1];
}

function fullDate(shortDate, now = new Date()) {
  const [month, day] = shortDate.split('/').map(Number);
  if (!month || !day) throw new Error(`日期格式錯誤：${shortDate}`);
  const taipei = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  let year = taipei.getFullYear();
  const candidate = new Date(year, month - 1, day);
  if (candidate.getTime() > taipei.getTime() + 7 * 86_400_000) year -= 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function summarize(row, slice) {
  let count = 0;
  let activeDays = 0;
  let returnSum = 0;
  let returnWeight = 0;
  for (const date of slice) {
    const cell = row.d[date] || { c: 0, r: null };
    if (cell.c > 0) {
      count += cell.c;
      activeDays += 1;
      if (cell.r !== null) {
        returnSum += cell.r * cell.c;
        returnWeight += cell.c;
      }
    }
  }
  return { count, activeDays, avgReturn: returnWeight ? returnSum / returnWeight : null };
}

function parseStatsHtml(html, now = new Date()) {
  const heatData = extractAssignedJson(html, 'heatData');
  const dates = extractAssignedJson(html, 'dates');
  const recentDays = extractNumber(html, 'recentDays');
  const rankDate = extractString(html, 'rankDate');
  const maxFocusRows = extractNumber(html, 'maxFocusRows');
  if (!Array.isArray(heatData) || !heatData.length || !Array.isArray(dates) || !dates.length) {
    throw new Error('族群輪動資料為空');
  }
  const slice = dates.slice(-recentDays);
  const latest = dates.at(-1);
  const latestGroups = heatData.map(row => ({
    name: row.name,
    count: (row.d[latest] || { c: 0 }).c || 0
  })).filter(item => item.count > 0)
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'zh-TW'));
  const focus = heatData.map(row => {
    const summary = summarize(row, slice);
    const latestCell = row.d[latest] || { c: 0, r: null };
    const rankCell = row.d[rankDate] || { c: 0, r: null };
    const score = latestCell.c * 5 + summary.count + summary.activeDays * 2;
    return { row, summary, latestCell, rankCell, score };
  }).filter(item => item.summary.count > 0)
    .sort((left, right) => {
      const leftActive = left.rankCell.c > 0;
      const rightActive = right.rankCell.c > 0;
      if (leftActive !== rightActive) return Number(rightActive) - Number(leftActive);
      const leftReturn = left.rankCell.r;
      const rightReturn = right.rankCell.r;
      if (leftReturn !== null && rightReturn !== null && leftReturn !== rightReturn) return rightReturn - leftReturn;
      if (leftReturn !== null && rightReturn === null) return -1;
      if (leftReturn === null && rightReturn !== null) return 1;
      return (right.rankCell.c - left.rankCell.c)
        || (right.score - left.score)
        || (right.summary.count - left.summary.count)
        || (right.summary.activeDays - left.summary.activeDays)
        || left.row.name.localeCompare(right.row.name, 'zh-TW');
    }).slice(0, maxFocusRows)
    .map(item => ({
      name: item.row.name,
      today: item.latestCell.c || 0,
      rankReturn: item.rankCell.c > 0 ? item.rankCell.r : null,
      recentCount: item.summary.count,
      activeDays: item.summary.activeDays,
      avgReturn: item.summary.avgReturn,
      cells: slice.map(date => {
        const cell = item.row.d[date] || { c: 0, r: null };
        return { date, count: cell.c || 0, return: cell.r };
      })
    }));
  if (!focus.length || new Set(focus.map(item => item.name)).size !== focus.length) {
    throw new Error('焦點族群資料驗證失敗');
  }
  return {
    date: fullDate(latest, now),
    latestDate: latest,
    rankDate,
    recentDays,
    latestTotal: latestGroups.reduce((sum, item) => sum + item.count, 0),
    latestGroups: latestGroups.slice(0, 12),
    focus
  };
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
        headers: { 'user-agent': 'daytrade-scoreboard/1.0 (+public rotation archive)' },
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
  const parsed = parseStatsHtml(await fetchHtml());
  const current = readIndex();
  const force = process.env.FORCE_CAPTURE === 'true';
  if (current.snapshots.some(snapshot => snapshot.date === parsed.date) && !force) {
    console.log(`SKIPPED ${parsed.date}`);
    return;
  }
  const capturedAt = new Date().toISOString();
  const slot = slotFor(parsed.date);
  const filename = `slot-${String(slot).padStart(2, '0')}.json`;
  writeJson(path.join(dataDir, filename), { ...parsed, capturedAt, sourceUrl });
  const snapshot = {
    date: parsed.date,
    slot,
    capturedAt,
    count: parsed.focus.length,
    file: `data/${filename}`
  };
  const snapshots = current.snapshots.filter(item => item.slot !== slot && item.date !== parsed.date);
  snapshots.push(snapshot);
  snapshots.sort((left, right) => right.date.localeCompare(left.date));
  writeJson(indexFile, { snapshots: snapshots.slice(0, 30) });
  writeJson(statusFile, {
    status: 'success',
    detail: `已保存 ${parsed.date} 共 ${parsed.focus.length} 個焦點族群`,
    updatedAt: capturedAt
  });
  console.log(`SUCCESS ${parsed.date} ${parsed.focus.length}`);
}

module.exports = { parseStatsHtml, slotFor, summarize, fullDate };

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
