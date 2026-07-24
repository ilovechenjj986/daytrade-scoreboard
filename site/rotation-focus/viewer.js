(async () => {
  const picker = document.querySelector('#record-date');
  const status = document.querySelector('#status');
  const lead = document.querySelector('#lead');
  const latestList = document.querySelector('#latest-list');
  const board = document.querySelector('#focus-board');
  const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);

  const pct = value => value === null || value === undefined
    ? '當日無漲停'
    : `${value >= 0 ? '+' : ''}${Number(value).toFixed(2)}%`;
  const color = cell => {
    if (!cell.count) return '#151923';
    if (cell.return === null) return 'rgba(88,166,255,.30)';
    if (cell.return >= 8) return '#991b1b';
    if (cell.return >= 4) return '#dc2626';
    if (cell.return >= 1) return 'rgba(248,113,113,.45)';
    if (cell.return >= -1) return '#374151';
    if (cell.return >= -4) return 'rgba(74,222,128,.35)';
    return '#15803d';
  };
  const trendClass = value => value === null || value === undefined ? '' : value >= 0 ? 'pos' : 'neg';

  async function render(snapshot) {
    status.textContent = '載入中…';
    const response = await fetch(`${snapshot.file}?v=${encodeURIComponent(snapshot.capturedAt)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('無法載入族群輪動紀錄');
    const data = await response.json();
    const focus = Array.isArray(data.focus) ? data.focus : [];
    const latestGroups = Array.isArray(data.latestGroups) ? data.latestGroups : [];
    const hottest = latestGroups[0];
    lead.innerHTML = `最新 <strong>${escapeHtml(data.latestDate)}</strong> 共 <strong>${Number(data.latestTotal)} 檔</strong>${hottest ? `，最熱 <strong>${escapeHtml(hottest.name)} ${Number(hottest.count)} 檔</strong>` : ''}；焦點依 <strong>${escapeHtml(data.rankDate)} 隔日收盤</strong>由強到弱顯示 ${focus.length} 個族群。`;
    latestList.replaceChildren(...latestGroups.map(({ name, count }) => {
        const chip = document.createElement('span');
        chip.append(name);
        const badge = document.createElement('b');
        badge.textContent = count;
        chip.append(badge);
        return chip;
      }));
    board.replaceChildren(...focus.map(item => {
      const card = document.createElement('article');
      card.className = 'card';
      const top = document.createElement('div');
      top.className = 'card-top';
      const name = document.createElement('strong');
      name.textContent = item.name;
      name.title = item.name;
      const today = document.createElement('span');
      today.className = 'today';
      today.textContent = `今日 ${item.today}`;
      top.append(name, today);
      const strip = document.createElement('div');
      strip.className = 'strip';
      for (const cell of item.cells) {
        const box = document.createElement('span');
        box.className = `cell${cell.count ? '' : ' empty'}`;
        box.style.setProperty('--cell', color(cell));
        box.textContent = cell.count || '';
        box.title = `${item.name} ${cell.date}：${cell.count ? `漲停 ${cell.count} 檔，隔日收盤 ${pct(cell.return)}` : '沒有漲停股'}`;
        strip.append(box);
      }
      const rank = document.createElement('div');
      rank.className = 'meta';
      rank.innerHTML = `<span>${escapeHtml(data.rankDate)} 收盤</span><b class="${trendClass(item.rankReturn)}">${escapeHtml(pct(item.rankReturn))}</b>`;
      const recent = document.createElement('div');
      recent.className = 'meta';
      recent.innerHTML = `<span>近 ${Number(data.recentDays)} 日 ${Number(item.recentCount)} 檔 / ${Number(item.activeDays)} 天</span><b class="${trendClass(item.avgReturn)}">${escapeHtml(pct(item.avgReturn))}</b>`;
      card.append(top, strip, rank, recent);
      return card;
    }));
    status.textContent = `保存時間：${new Date(data.capturedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`;
  }

  function showError(error) {
    status.textContent = error.message;
    status.className = 'error';
  }

  try {
    const response = await fetch(`index.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('目前沒有族群輪動紀錄');
    const index = await response.json();
    const snapshots = Array.isArray(index.snapshots) ? index.snapshots : [];
    if (!snapshots.length) throw new Error('目前沒有族群輪動紀錄');
    for (const snapshot of snapshots) {
      const option = document.createElement('option');
      option.value = snapshot.date;
      option.textContent = snapshot.date;
      picker.append(option);
    }
    picker.addEventListener('change', () => {
      const snapshot = snapshots.find(item => item.date === picker.value);
      if (snapshot) render(snapshot).catch(showError);
    });
    await render(snapshots[0]);
  } catch (error) {
    showError(error);
    picker.disabled = true;
  }
})();
