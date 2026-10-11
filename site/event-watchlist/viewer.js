(async () => {
  const picker = document.querySelector('#record-date');
  const status = document.querySelector('#status');
  const records = document.querySelector('#records');
  const empty = document.querySelector('#empty');
  const summaryDate = document.querySelector('#summary-date');
  const summaryCount = document.querySelector('#summary-count');
  const summaryEvents = document.querySelector('#summary-events');
  const sourceHeadline = document.querySelector('#source-headline');
  const exportButton = document.querySelector('#export-csv');
  let selectedSnapshot = null;
  let selectedData = null;
  const badgeClass = { '進處置': 'disposal', '法說': 'presentation', '除權息': 'ex' };

  const render = async snapshot => {
    exportButton.disabled = true;
    status.textContent = '載入中…';
    const response = await fetch(`${snapshot.file}?v=${encodeURIComponent(snapshot.capturedAt)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('無法載入此日期的事件資料');
    const data = await response.json();
    selectedSnapshot = snapshot;
    selectedData = data;
    exportButton.disabled = false;
    const stocks = Array.isArray(data.stocks) ? data.stocks : [];
    const eventCounts = data.eventCounts || {};
    sourceHeadline.textContent = data.headlineTitle || snapshot.headlineTitle || '來源標題未保存';
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

  exportButton.addEventListener('click', async () => {
    try {
      if (!selectedSnapshot || !selectedData) throw new Error('尚無可匯出的事件資料');
      const headlineDate = getHeadlineDate(selectedSnapshot, selectedData);
      const categories = ['進處置', '自結公告', '除權息', '法會'];
      const aliases = { '法說': '法會', '法會': '法會' };
      const stocks = Array.isArray(selectedData.stocks) ? selectedData.stocks : [];
      const eventRow = stocks.map(stock => {
        const events = new Set((stock.events || []).map(event => aliases[event] || event));
        const unknown = [...events].filter(event => !categories.includes(event));
        if (unknown.length) throw new Error('CSV 不支援的事件類別：' + unknown.join('、'));
        return categories.filter(event => events.has(event)).join('+');
      });
      const csvCell = value => {
        const text = String(value ?? '');
        return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
      };
      const rows = stocks.map((stock, index) => [eventRow[index], stock.code, stock.name]);
      const content = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
      const filename = '特殊事件' + headlineDate + '.csv';
      status.textContent = '正在寫入指定的 D 槽資料夾…';
      const endpoint = new URL('http://127.0.0.1:8787/api/event-watchlist/export');
      endpoint.searchParams.set('filename', filename);
      let response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'text/csv;charset=utf-8' },
          body: content
        });
      } catch (error) {
        throw new Error('無法連線本機匯出服務。請先啟動 D:\\daytrade_tool\\run_daytrade_tool.cmd，再匯出。');
      }
      if (!response.ok) {
        const detail = await response.text();
        throw new Error('CSV 儲存失敗：' + detail);
      }
      status.textContent = '已儲存至 D:\\daytrade_tool\\自選股\\進處置+除權息+自結公告+法會\\' + filename;
      status.className = '';
    } catch (error) {
      showError(error);
    }
  });

  function getHeadlineDate(snapshot, data) {
    const explicitDate = data.headlineDate || snapshot.headlineDate;
    if (explicitDate && /^\d{4}-\d{2}-\d{2}$/.test(explicitDate)) return explicitDate;
    const title = data.headlineTitle || snapshot.headlineTitle || '';
    const match = title.match(/(\d{1,2})\/(\d{1,2})\s*$/);
    if (!match) throw new Error('找不到來源標題日期：' + title);
    const baseDate = data.date || snapshot.date;
    const recordYear = Number(baseDate.slice(0, 4));
    const month = Number(match[1]);
    const day = Number(match[2]);
    const candidates = [recordYear - 1, recordYear, recordYear + 1]
      .map(year => String(year) + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0'))
      .filter(value => {
        const date = new Date(value + 'T00:00:00Z');
        return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
      });
    if (!candidates.length) throw new Error('標題日期無效：' + title);
    const recordTime = Date.parse(baseDate + 'T00:00:00Z');
    return candidates.sort((a, b) => Math.abs(Date.parse(a + 'T00:00:00Z') - recordTime)
      - Math.abs(Date.parse(b + 'T00:00:00Z') - recordTime))[0];
  }

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

