const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const manifestFile = path.join(root, 'site', 'aistockmap', 'manifest.json');
const expectedViewIds = ['tw-week', 'tw-month', 'us-day'];

function taipeiDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function taipeiMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const hour = Number(parts.find(part => part.type === 'hour').value) % 24;
  const minute = Number(parts.find(part => part.type === 'minute').value);
  return hour * 60 + minute;
}

function previousDate(dateText) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function captureDate(date = new Date()) {
  const dateText = taipeiDate(date);
  return taipeiMinutes(date) < 18 * 60 + 5 ? previousDate(dateText) : dateText;
}

function isComplete(snapshot) {
  if (!snapshot) return false;
  if (snapshot.complete === true) return true;
  if (snapshot.complete === false) return false;
  return expectedViewIds.every(id => Number.isFinite(Number(snapshot.counts?.[id])));
}

const date = captureDate();
const manifest = fs.existsSync(manifestFile)
  ? JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  : { snapshots: [] };
const snapshot = manifest.snapshots.find(item => item.file && item.date === date);
const shouldRun = process.env.FORCE_CAPTURE === 'true' || !isComplete(snapshot);

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `run=${shouldRun}\ndate=${date}\n`);
}
console.log(
  shouldRun
    ? `CAPTURE REQUIRED ${date}`
    : `CAPTURE SKIPPED ${date}: all three views already saved`
);

module.exports = { captureDate, isComplete };
