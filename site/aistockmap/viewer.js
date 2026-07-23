(async () => {
  const picker = document.querySelector('#snapshot-date');
  const status = document.querySelector('#status');
  const meta = document.querySelector('#meta');
  const screens = document.querySelector('#screens');

  try {
    const response = await fetch(`manifest.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('尚未建立雲端快照');
    const manifest = await response.json();
    const snapshots = Array.isArray(manifest.snapshots) ? manifest.snapshots : [];
    if (!snapshots.length) throw new Error('尚未建立雲端快照');

    snapshots.forEach(snapshot => {
      const option = document.createElement('option');
      option.value = snapshot.date;
      option.textContent = snapshot.date;
      picker.append(option);
    });

    const render = date => {
      const snapshot = snapshots.find(item => item.date === date) || snapshots[0];
      picker.value = snapshot.date;
      status.textContent = '點擊圖片可開啟原尺寸放大';
      meta.textContent = `擷取日期：${snapshot.date}｜擷取時間：${new Date(snapshot.capturedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`;
      screens.replaceChildren(...snapshot.images.map(image => {
        const card = document.createElement('section');
        card.className = 'card';
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
        picture.loading = 'eager';
        link.append(picture);
        card.append(heading, link);
        return card;
      }));
    };

    picker.addEventListener('change', () => render(picker.value));
    render(snapshots[0].date);
  } catch (error) {
    picker.disabled = true;
    status.textContent = error.message;
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = '第一次雲端排程成功後，快照會顯示在這裡。';
    screens.append(empty);
  }
})();
