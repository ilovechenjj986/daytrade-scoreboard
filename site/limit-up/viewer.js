(async () => {
  const picker = document.querySelector('#record-date');
  const status = document.querySelector('#status');
  const records = document.querySelector('#records');
  const groupList = document.querySelector('#group-list');
  const summaryDate = document.querySelector('#summary-date');
  const summaryCount = document.querySelector('#summary-count');
  const summaryGroups = document.querySelector('#summary-groups');

  const render = async snapshot => {
    status.textContent = '載入中…';
    const response = await fetch(`${snapshot.file}?v=${encodeURIComponent(snapshot.capturedAt)}`, {
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('無法載入此日期的漲停資料');
    const data = await response.json();
    const stocks = Array.isArray(data.stocks) ? data.stocks : [];
    const groups = new Map();
    for (const stock of stocks) groups.set(stock.group, (groups.get(stock.group) || 0) + 1);

    summaryDate.textContent = data.date;
    summaryCount.textContent = `${stocks.length} 檔`;
    summaryGroups.textContent = `${groups.size} 個`;
    records.replaceChildren(...stocks.map(stock => {
      const row = document.createElement('tr');
      for (const value of [stock.code, stock.name, stock.group]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      return row;
    }));
    groupList.replaceChildren(...[...groups.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-Hant'))
      .map(([group, count]) => {
        const chip = document.createElement('span');
        chip.textContent = `${group} ${count}`;
        return chip;
      }));
    status.textContent = `保存時間：${new Date(data.capturedAt).toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei'
    })}`;
  };

  try {
    const response = await fetch(`index.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('尚未建立漲停紀錄');
    const index = await response.json();
    const snapshots = Array.isArray(index.snapshots) ? index.snapshots : [];
    if (!snapshots.length) throw new Error('尚未建立漲停紀錄');

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
