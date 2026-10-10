const endpoint = 'https://api.line.me/v2/bot/message/push';
const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const recipient = process.env.LINE_USER_ID;

const pages = [
  ['LINE_SCOREBOARD_CHANGED', '族群記分板', 'https://ilovechenjj986.github.io/daytrade-scoreboard/'],
  ['LINE_AISTOCKMAP_CHANGED', 'AI Stock Map', 'https://ilovechenjj986.github.io/daytrade-scoreboard/aistockmap/'],
  ['LINE_LIMIT_UP_CHANGED', '漲停紀錄', 'https://ilovechenjj986.github.io/daytrade-scoreboard/limit-up/'],
  ['LINE_ROTATION_FOCUS_CHANGED', '族群輪動焦點', 'https://ilovechenjj986.github.io/daytrade-scoreboard/rotation-focus/'],
  ['LINE_EVENT_WATCHLIST_CHANGED', '事件觀察清單', 'https://ilovechenjj986.github.io/daytrade-scoreboard/event-watchlist/']
].filter(([flag]) => process.env[flag] === 'true');

if (!pages.length) {
  console.log('LINE notification skipped: no page data changed.');
  process.exit(0);
}

if (!token || !recipient) {
  console.warn('LINE notification skipped: set LINE_CHANNEL_ACCESS_TOKEN and LINE_USER_ID in GitHub Actions secrets.');
  process.exit(0);
}

async function main() {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      to: recipient,
      messages: pages.map(([, title, url]) => ({
        type: 'text',
        text: `${title}資料已更新並部署完成。\n${url}`
      }))
    }),
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LINE Messaging API returned HTTP ${response.status}: ${detail}`);
  }
  console.log(`LINE notification sent for: ${pages.map(([, title]) => title).join('、')}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
