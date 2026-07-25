(async () => {
  const picker = document.querySelector('#snapshot-date');
  const status = document.querySelector('#status');
  const meta = document.querySelector('#meta');
  const screens = document.querySelector('#screens');
  const expectedViews = [
    { id: 'tw-week', title: '台股單週' },
    { id: 'tw-month', title: '台股單月' },
    { id: 'us-day', title: '美股單日' }
  ];

  const renderData = async snapshot => {
    status.textContent = '載入條列資料中…';
    const response = await fetch(`${snapshot.file}?v=${encodeURIComponent(snapshot.capturedAt)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('無法載入 AI Stock Map 條列資料');
    const data = await response.json();
    const views = new Map((data.views || []).map(view => [view.id, view]));
    screens.replaceChildren(...expectedViews.map(expectedView => {
      const view = views.get(expectedView.id);
      const card = document.createElement('section');
      card.className = 'card data-card';
      const heading = document.createElement('div');
      heading.className = 'card-heading';
      const title = document.createElement('h2');
      title.textContent = view?.title || expectedView.title;
      const count = document.createElement('span');
      count.textContent = view ? `${view.industries.length} 個族群` : '等待更新';
      heading.append(title, count);
      if (!view) {
        card.classList.add('pending-card');
        const waiting = document.createElement('div');
        waiting.className = 'pending-message';
        waiting.innerHTML = '<strong>等待來源網站更新</strong><span>更新後會自動補入這個日期，不會建立另一筆紀錄。</span>';
        card.append(heading, waiting);
        return card;
      }
      const tableWrap = document.createElement('div');
      tableWrap.className = 'table-wrap';
      const table = document.createElement('table');
      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>產業</th><th>公司數</th><th>漲跌幅</th></tr>';
      const tbody = document.createElement('tbody');
      for (const industry of view.industries) {
        const row = document.createElement('tr');
        const name = document.createElement('td');
        name.textContent = industry.name;
        const companies = document.createElement('td');
        companies.textContent = `${industry.companies}家`;
        const change = document.createElement('td');
        change.textContent = `${industry.change >= 0 ? '+' : ''}${Number(industry.change).toFixed(2)}%`;
        change.className = industry.change >= 0 ? 'positive' : 'negative';
        row.append(name, companies, change);
        tbody.append(row);
      }
      table.append(thead, tbody);
      tableWrap.append(table);
      const updated = document.createElement('p');
      updated.className = 'source-updated';
      updated.textContent = view.sourceUpdatedAt ? `來源更新：${view.sourceUpdatedAt}` : '';
      card.append(heading, tableWrap, updated);
      return card;
    }));
    const pending = expectedViews.filter(expectedView => !views.has(expectedView.id));
    status.textContent = pending.length
      ? `已更新 ${expectedViews.length - pending.length}/3；等待：${pending.map(item => item.title).join('、')}`
      : '三個檢視皆已更新';
  };

  function showError(error) {
    status.textContent = error.message;
    status.className = 'error';
  }

  try {
    const response = await fetch(`manifest.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('尚未建立雲端紀錄');
    const manifest = await response.json();
    const snapshots = Array.isArray(manifest.snapshots) ? manifest.snapshots.filter(item => item.file) : [];
    if (!snapshots.length) throw new Error('尚未建立雲端紀錄');
    snapshots.forEach(snapshot => {
      const option = document.createElement('option');
      option.value = snapshot.capturedAt;
      const time = new Date(snapshot.capturedAt).toLocaleTimeString('zh-TW', {
        timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit'
      });
      const pendingCount = Array.isArray(snapshot.pendingViewIds) ? snapshot.pendingViewIds.length : 0;
      option.textContent = `${snapshot.date} ${time}${pendingCount ? `（待補 ${pendingCount} 項）` : ''}`;
      picker.append(option);
    });
    const render = async capturedAt => {
      const snapshot = snapshots.find(item => item.capturedAt === capturedAt) || snapshots[0];
      picker.value = snapshot.capturedAt;
      meta.textContent = `紀錄日期：${snapshot.date}｜保存時間：${new Date(snapshot.capturedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`;
      await renderData(snapshot);
    };
    picker.addEventListener('change', () => render(picker.value).catch(showError));
    await render(snapshots[0].capturedAt);
  } catch (error) {
    showError(error);
    picker.disabled = true;
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = '來源內容第一次變更並成功保存後，條列資料會顯示在這裡。';
    screens.append(empty);
  }
})();
