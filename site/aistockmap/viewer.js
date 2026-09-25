(async () => {
  const picker = document.querySelector('#snapshot-date');
  const status = document.querySelector('#status');
  const meta = document.querySelector('#meta');
  const screens = document.querySelector('#screens');
  const expectedViews = [
    { id: 'tw-day', title: '台股單日' },
    { id: 'tw-week', title: '台股單週' },
    { id: 'tw-month', title: '台股單月' },
    { id: 'us-day', title: '美股單日' }
  ];

  const formatChange = value => `${value >= 0 ? '+' : ''}${Number(value).toFixed(2)}%`;

  const buildChangeMaps = views => Object.fromEntries(
    ['tw-day', 'tw-week', 'tw-month'].map(id => [
      id,
      new Map((views.get(id)?.industries || []).map(industry => [industry.name, Number(industry.change)]))
    ])
  );

  const starDetailsFor = (viewId, industryName, changes) => {
    const daily = changes['tw-day'].get(industryName);
    const weekly = changes['tw-week'].get(industryName);
    const monthly = changes['tw-month'].get(industryName);
    if (viewId === 'tw-day' && daily < 0) {
      return [
        weekly > 0 && {
          title: `台股單週上漲 ${formatChange(weekly)}`,
          label: '台股單週上漲',
          period: 'week'
        },
        monthly > 0 && {
          title: `台股單月上漲 ${formatChange(monthly)}`,
          label: '台股單月上漲',
          period: 'month'
        }
      ].filter(Boolean);
    }
    if (viewId === 'tw-week' && daily > 0 && weekly < 0) {
      return [{
        title: `台股單日上漲 ${formatChange(daily)}；台股單週下跌 ${formatChange(weekly)}`,
        label: '台股單日上漲、單週下跌',
        period: 'week'
      }];
    }
    if (viewId === 'tw-month' && daily > 0 && monthly < 0) {
      return [{
        title: `台股單日上漲 ${formatChange(daily)}；台股單月下跌 ${formatChange(monthly)}`,
        label: '台股單日上漲、單月下跌',
        period: 'month'
      }];
    }
    return [];
  };

  const renderData = async snapshot => {
    status.textContent = '載入條列資料中…';
    const response = await fetch(`${snapshot.file}?v=${encodeURIComponent(snapshot.capturedAt)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('無法載入 AI Stock Map 條列資料');
    const data = await response.json();
    const views = new Map((data.views || []).map(view => [view.id, view]));
    if (!views.has('tw-day') && data.signalSourceView?.id === 'tw-day') {
      views.set('tw-day', data.signalSourceView);
    }
    const changes = buildChangeMaps(views);
    let dailyStarCount = 0;
    let dailyStarredIndustryCount = 0;
    const periodStarredIndustryNames = new Set();
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
        const isPending = snapshot.pendingViewIds?.includes(expectedView.id);
        waiting.innerHTML = isPending
          ? '<strong>等待來源網站更新</strong><span>更新後會自動補入這個日期，不會建立另一筆紀錄。</span>'
          : '<strong>此日期未保存這項資料</strong><span>台股單日列表從新功能上線後開始保存。</span>';
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
        const starDetails = starDetailsFor(view.id, industry.name, changes);
        if (starDetails.length) {
          row.classList.add('starred-industry');
          if (view.id === 'tw-day') {
            dailyStarCount += starDetails.length;
            dailyStarredIndustryCount += 1;
          } else {
            periodStarredIndustryNames.add(industry.name);
          }
          for (const detail of starDetails) {
            const star = document.createElement('span');
            star.className = `signal-star signal-star-${detail.period}`;
            star.textContent = '★';
            star.title = detail.title;
            star.setAttribute('aria-label', detail.label);
            name.append(star);
          }
          name.append(document.createTextNode(` ${industry.name}`));
        } else {
          name.textContent = industry.name;
        }
        const companies = document.createElement('td');
        companies.textContent = `${industry.companies}家`;
        const change = document.createElement('td');
        change.textContent = formatChange(industry.change);
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
    const signalSummary = [
      periodStarredIndustryNames.size ? `★ 週月表 ${periodStarredIndustryNames.size} 個` : '',
      dailyStarredIndustryCount ? `★ 單日表 ${dailyStarredIndustryCount} 個族群／${dailyStarCount} 顆` : ''
    ].filter(Boolean).join('；');
    status.textContent = pending.length
      ? `已保存 ${expectedViews.length - pending.length}/4；未保存：${pending.map(item => item.title).join('、')}`
      : `四個檢視皆已更新${signalSummary ? `；${signalSummary}` : ''}`;
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
