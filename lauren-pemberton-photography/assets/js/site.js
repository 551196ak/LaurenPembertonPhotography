(() => {
  const box = document.querySelector('.lightbox');
  if (!box) return;

  const boxImg = box.querySelector('img');
  const images = [...document.querySelectorAll('.photo-tile img')];
  let currentIndex = -1;

  // Build the controls in JavaScript too, so an older cached HTML page still gets them.
  let toolbar = box.querySelector('.lightbox-toolbar');
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.className = 'lightbox-toolbar';
    toolbar.innerHTML = `
      <button class="lightbox-nav prev-photo" type="button" aria-label="Previous photo">‹ <span>Previous</span></button>
      <button class="download-photo" type="button">Download</button>
      <button class="lightbox-nav next-photo" type="button" aria-label="Next photo"><span>Next</span> ›</button>`;
    box.appendChild(toolbar);
  }

  // Remove any old standalone download button so there is only one visible control.
  [...box.querySelectorAll(':scope > .download-photo')].forEach(el => el.remove());

  let closeBtn = box.querySelector('.close');
  if (closeBtn) {
    closeBtn.setAttribute('role', 'button');
    closeBtn.setAttribute('aria-label', 'Close photo');
    closeBtn.setAttribute('tabindex', '0');
  }

  const downloadBtn = toolbar.querySelector('.download-photo');
  const prevBtn = toolbar.querySelector('.prev-photo');
  const nextBtn = toolbar.querySelector('.next-photo');

  function show(index) {
    if (!images.length) return;
    currentIndex = (index + images.length) % images.length;
    const img = images[currentIndex];
    boxImg.src = img.currentSrc || img.src;
    boxImg.alt = img.alt || 'Expanded photograph';
    box.classList.add('open');
    document.body.classList.add('lightbox-open');
    downloadBtn.focus({ preventScroll: true });
  }

  function close() {
    box.classList.remove('open');
    document.body.classList.remove('lightbox-open');
  }

  images.forEach((img, index) => img.addEventListener('click', () => show(index)));
  prevBtn.addEventListener('click', e => { e.stopPropagation(); show(currentIndex - 1); });
  nextBtn.addEventListener('click', e => { e.stopPropagation(); show(currentIndex + 1); });

  box.addEventListener('click', e => { if (e.target === box) close(); });
  if (closeBtn) {
    closeBtn.addEventListener('click', close);
    closeBtn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') close(); });
  }

  document.addEventListener('keydown', e => {
    if (!box.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(currentIndex - 1);
    if (e.key === 'ArrowRight') show(currentIndex + 1);
  });

  downloadBtn.addEventListener('click', async e => {
    e.stopPropagation();
    if (currentIndex < 0) return;
    const gallery = document.body.dataset.gallery;
    const source = images[currentIndex].getAttribute('src') || '';
    const file = source.split('/').pop().split('?')[0];
    const password = prompt('Enter the gallery download password:');
    if (password === null) return;

    const oldText = downloadBtn.textContent;
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Checking…';
    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gallery, file, password })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Download could not be authorized.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (err) {
      alert('Download could not be completed. Please try again.');
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.textContent = oldText;
    }
  });
})();
