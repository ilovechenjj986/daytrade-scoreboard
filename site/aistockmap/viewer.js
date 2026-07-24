(async () => {
  const picker = document.querySelector('#snapshot-date');
  const status = document.querySelector('#status');
  const meta = document.querySelector('#meta');
  const screens = document.querySelector('#screens');

  const renderLegacy = snapshot => {
    status.textContent = '舊版圖片快照；點擊圖片可開啟原尺寸';
    screens.replaceChildren(...snapshot.images.map(image => {
      const card = document.createElement('section');
      card.className = 'card legacy-card';
      const heading = document.createElement('h2');
      heading.textContent = `${image.title}｜${image.width} × ${image.height}`;
      const link = document.createElement('a');
      const versionedImage = `${image.file}?v=${encodeURIComponent(snapshot.capturedAt)}`;
      link.href = versionedImage;
      link.target = '_blank';
      link.rel = 'noopener';
      const picture = document.createElement('img');
      picture.src = versionedImage;
      picture.alt = `${snapshot.date} ${image.title} 完整頁面快照`;
      picture.loading = 'lazy';
      link.append(picture);
      card.append(heading, link);
      return card;
    }));
  };

  const renderData = async snapshot => {
    status.textContent = '載入條列資料中…';
    const response = await fetch(`${snapshot.file}?v=${encodeURIComponent(snapshot.capturedAt)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('無法載入 AI Stock Map 條列資料');
    const data = await response.json();
    screens.replaceChildren(...data.views.map(view => {
      const card = document.createElement('section');
      card.className = 'card data-card';
      const heading = document.createElement('div');
      heading.className = 'card-heading';
      const title = document.createElement('h2');
      title.textContent = view.title;
      const count = document.createElement('span');
      count.textContent = `${view.industries.length} 個族群`;
      heading.append(title, count);
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
    status.textContent = '已改用條列資料保存，不再新增圖片';
  };

  function showError(error) {
    status.textContent = error.message;
    status.className = 'error';
  }

  try {
    const response = await fetch(`manifest.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('尚未建立雲端紀錄');
    const manifest = await response.json();
    const snapshots = Array.isArray(manifest.snapshots) ? manifest.snapshots : [];
    if (!snapshots.length) throw new Error('尚未建立雲端紀錄');
    snapshots.forEach(snapshot => {
      const option = document.createElement('option');
      option.value = snapshot.capturedAt;
      const time = new Date(snapshot.capturedAt).toLocaleTimeString('zh-TW', {
        timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit'
      });
      option.textContent = snapshot.label || `${snapshot.date} ${time}${snapshot.images ? '（舊圖片）' : ''}`;
      picker.append(option);
    });
    const render = async capturedAt => {
      const snapshot = snapshots.find(item => item.capturedAt === capturedAt) || snapshots[0];
      picker.value = snapshot.capturedAt;
      meta.textContent = `紀錄日期：${snapshot.date}｜保存時間：${new Date(snapshot.capturedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`;
      if (Array.isArray(snapshot.images)) renderLegacy(snapshot);
      else await renderData(snapshot);
    };
    picker.addEventListener('change', () => render(picker.value).catch(showError));
    await render(snapshots[0].capturedAt);
  } catch (error) {
    showError(error);
    picker.disabled = true;
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = '第一次雲端排程成功後，條列資料會顯示在這裡。';
    screens.append(empty);
  }
})();
