const fs = require("node:fs");
const path = require("node:path");

const SOURCE_BASE = "https://chengwaye.com/nextday-performance";
const TAIPEI_TIME_ZONE = "Asia/Taipei";

function taipeiDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TAIPEI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);

  return {
    year: parts.find((part) => part.type === "year").value,
    month: parts.find((part) => part.type === "month").value,
    day: parts.find((part) => part.type === "day").value,
    weekday: parts.find((part) => part.type === "weekday").value,
  };
}

function formatYyyyMmDd(date) {
  const parts = taipeiDateParts(date);
  return `${parts.year}${parts.month}${parts.day}`;
}

function formatDisplayDate(yyyymmdd) {
  return `${yyyymmdd.slice(0, 4)}/${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(6, 8)}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function htmlEscape(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function extractPageMeta(html) {
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";
  const description = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)?.[1] || "";
  return { title, description };
}

async function pageExists(url) {
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) return null;
  const html = await response.text();
  if (!/Chengwaye|漲停隔日表現|nextday/i.test(html)) return null;
  return html;
}

async function findLatestSourcePage() {
  if (process.env.TARGET_DATE) {
    const date = process.env.TARGET_DATE.replace(/\D/g, "");
    if (!/^\d{8}$/.test(date)) {
      throw new Error("TARGET_DATE must be YYYYMMDD, for example 20260706.");
    }
    const url = `${SOURCE_BASE}-${date}`;
    const html = await pageExists(url);
    if (!html) throw new Error(`Target source page is unavailable: ${url}`);
    return { date, url, html };
  }

  for (let offset = 0; offset >= -14; offset -= 1) {
    const date = formatYyyyMmDd(addDays(new Date(), offset));
    const url = `${SOURCE_BASE}-${date}`;
    const html = await pageExists(url);
    if (html) return { date, url, html };
  }

  throw new Error("No available Chengwaye nextday-performance page found in the last 14 days.");
}

function buildIndexHtml(latest) {
  const sourceUrl = htmlEscape(latest.url);
  const displayDate = htmlEscape(formatDisplayDate(latest.date));
  const updatedAt = htmlEscape(latest.updatedAt);
  const sourceTitle = htmlEscape(latest.title || `Chengwaye 漲停隔日表現 ${displayDate}`);
  const sourceDescription = htmlEscape(latest.description || "每日自動同步最新 Chengwaye 漲停隔日表現頁面。");

  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="${sourceDescription}">
<title>族群隔日表現記分板</title>
<style>
:root{color-scheme:dark;--bg:#090d16;--panel:#121827;--line:#26314a;--text:#e8edf7;--muted:#929db2;--accent:#818cf8}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);font:15px/1.5 system-ui,-apple-system,"Segoe UI","Noto Sans TC",sans-serif;color:var(--text)}
header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 18px;border-bottom:1px solid var(--line);background:#0d1321;position:sticky;top:0;z-index:2}
h1{font-size:20px;margin:0}
.meta{color:var(--muted);font-size:13px}
a{color:#a5b4fc}
.actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.button{display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:8px;background:#171e30;color:var(--text);padding:7px 10px;text-decoration:none;font-weight:700}
main{height:calc(100vh - 66px)}
iframe{width:100%;height:100%;border:0;background:white}
@media(max-width:760px){header{align-items:flex-start;flex-direction:column}.actions{width:100%}.button{flex:1}main{height:calc(100vh - 122px)}}
</style>
</head>
<body>
<header>
  <div>
    <h1>族群隔日表現記分板</h1>
    <div class="meta">${sourceTitle} · 同步於 ${updatedAt}</div>
  </div>
  <div class="actions">
    <a class="button" href="${sourceUrl}" target="_blank" rel="noopener">開啟來源</a>
    <a class="button" href="data/latest.json">latest.json</a>
  </div>
</header>
<main>
  <iframe src="${sourceUrl}" title="Chengwaye 漲停隔日表現 ${displayDate}"></iframe>
</main>
</body>
</html>
`;
}

async function main() {
  const source = await findLatestSourcePage();
  const meta = extractPageMeta(source.html);
  const latest = {
    date: source.date,
    displayDate: formatDisplayDate(source.date),
    url: source.url,
    title: meta.title,
    description: meta.description,
    updatedAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.join("data"), { recursive: true });
  fs.writeFileSync(path.join("data", "latest.json"), `${JSON.stringify(latest, null, 2)}\n`, "utf8");
  fs.writeFileSync("index.html", buildIndexHtml(latest), "utf8");

  console.log(`Updated index.html with ${source.url}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
