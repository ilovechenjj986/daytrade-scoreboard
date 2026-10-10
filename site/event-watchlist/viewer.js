(async () => {
  const picker = document.querySelector('#record-date');
  const status = document.querySelector('#status');
  const records = document.querySelector('#records');
  const empty = document.querySelector('#empty');
  const summaryDate = document.querySelector('#summary-date');
  const summaryCount = document.querySelector('#summary-count');
  const summaryEvents = document.querySelector('#summary-events');
  const badgeClass = { '進處置': 'disposal', '法說': 'presentation', '除權息': 'ex' };

  const render = async snapshot => {
    status.textContent = '載入中…';
    const response = await fetch(`${snapshot.file}?v=${encodeURIComponent(snapshot.capturedAt)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('無法載入此日期的事件資料');
    const data = await response.json();
    const stocks = Array.isArray(data.stocks) ? data.stocks : [];
    const eventCounts = data.eventCounts || {};
    summaryDate.textContent = data.date;
    summaryCount.textContent = `${stocks.length} 檔`;
    summaryEvents.textContent = `${Object.values(eventCounts).reduce((sum, count) => sum + Number(count || 0), 0)} 項`;
    records.replaceChildren(...stocks.map(stock => {
      const row = document.createElement('tr');
      const eventCell = document.createElement('td');
      const badges = document.createElement('div');
      badges.className = 'badges';
      for (const event of stock.events || []) {
        const badge = document.createElement('span');
        badge.className = `badge ${badgeClass[event] || ''}`;
        badge.textContent = event;
        badges.append(badge);
      }
      eventCell.append(badges);
      row.append(eventCell);
      for (const value of [stock.code, stock.name]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      return row;
    }));
    empty.hidden = stocks.length > 0;
    status.textContent = `保存時間：${new Date(data.capturedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`;
  };

  try {
    const response = await fetch(`index.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('尚未建立事件型自選標的資料');
    const index = await response.json();
    const snapshots = Array.isArray(index.snapshots) ? index.snapshots : [];
    if (!snapshots.length) throw new Error('尚未建立事件型自選標的資料');
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

  function showError(error) {
    status.textContent = error.message;
    status.className = 'error';
  }
})();

