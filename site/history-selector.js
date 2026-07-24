(() => {
  const root = location.pathname.includes('/history/') ? '../' : './';
  const main = document.querySelector('main');
  if (main) {
    const switcher = document.createElement('nav');
    switcher.className = 'app-switcher';
    switcher.setAttribute('aria-label', '功能切換');
    switcher.innerHTML = '<a class="active" href="' + root + '">族群記分板</a><a href="' + root + 'aistockmap/">AI Stock Map 原頁快照</a><a href="' + root + 'limit-up/">每日漲停紀錄</a>';
    main.prepend(switcher);
    const switcherStyle = document.createElement('style');
    switcherStyle.textContent = '.app-switcher{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}.app-switcher a{color:#c7d2fe;text-decoration:none;border:1px solid var(--line);background:#171e30;border-radius:10px;padding:8px 12px}.app-switcher a.active{background:#4f46e5;color:white}';
    document.head.append(switcherStyle);
  }
  const selectedDate = location.pathname.match(/\/(\d{4}-\d{2}-\d{2})\.html$/)?.[1] || '';
  const host = document.createElement('section');
  host.className = 'history-picker';
  host.innerHTML = [
    '<label for="scoreboard-date">查詢歷史記分板</label>',
    '<div class="history-picker-controls">',
    '<input id="scoreboard-date" type="date" required>',
    '<button type="button" id="scoreboard-date-submit">查詢</button>',
    '</div>',
    '<p class="history-picker-status" role="status" aria-live="polite"></p>'
  ].join('');

  const summary = document.querySelector('.summary');
  if (!summary) return;
  summary.insertAdjacentElement('afterend', host);

  const input = host.querySelector('#scoreboard-date');
  const button = host.querySelector('#scoreboard-date-submit');
  const status = host.querySelector('.history-picker-status');
  const style = document.createElement('style');
  style.textContent = '.history-picker{margin:16px 0 22px;padding:14px 16px;border:1px solid var(--line);background:#121827}.history-picker label{display:block;font-weight:700;margin-bottom:8px}.history-picker-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.history-picker input,.history-picker button{min-height:38px;border:1px solid var(--line);background:#171e30;color:var(--text);font:inherit;padding:6px 10px}.history-picker button{cursor:pointer}.history-picker button:hover{background:#26314a}.history-picker-status{min-height:1.5em;margin:8px 0 0;color:var(--muted)}.history-picker-status.error{color:#fb7185}@media(max-width:600px){.history-picker input{width:100%}.history-picker button{flex:1}}';
  document.head.append(style);

  fetch(root + 'history/index.json', { cache: 'no-store' })
    .then(response => response.ok ? response.json() : Promise.reject(new Error('找不到歷史資料')))
    .then(history => {
      const dates = Array.isArray(history.dates) ? history.dates : [];
      if (!dates.length) throw new Error('目前尚無可查詢的歷史記分板。');
      const available = new Set(dates);
      input.min = history.oldestDate;
      input.max = history.latestDate;
      input.value = selectedDate || history.latestDate;
      status.textContent = '可查詢範圍：' + history.oldestDate + ' 至 ' + history.latestDate;

      const submit = () => {
        const date = input.value;
        if (!date || date < history.oldestDate || date > history.latestDate) {
          status.textContent = '輸入日期超出保存範圍，請重新輸入。';
          status.className = 'history-picker-status error';
          input.focus();
          return;
        }
        if (!available.has(date)) {
          status.textContent = '此日期沒有記分板資料，請重新輸入。';
          status.className = 'history-picker-status error';
          input.focus();
          return;
        }
        location.href = root + 'history/' + date + '.html';
      };
      button.addEventListener('click', submit);
      input.addEventListener('keydown', event => { if (event.key === 'Enter') submit(); });
    })
    .catch(error => {
      status.textContent = error.message;
      status.className = 'history-picker-status error';
      input.disabled = true;
      button.disabled = true;
    });
})();
