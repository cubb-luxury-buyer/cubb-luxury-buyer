/* ============================================
   CUBB BUYER NETWORK — Admin Dashboard Logic
   ============================================ */

'use strict';

(function () {
  const N = window.CUBBNet;
  if (!N) return;

  /* ---------- Elements ---------- */
  const sessionsBody = document.getElementById('sessionsBody');
  const emptyState   = document.getElementById('emptyState');
  const storeNote    = document.getElementById('storeNote');

  const modal      = document.getElementById('sessionModal');
  const modalTitle = document.getElementById('modalTitle');
  const form       = document.getElementById('sessionForm');
  const formError  = document.getElementById('formError');
  const offersList = document.getElementById('offersList');
  const buyersList = document.getElementById('buyersList');
  const manualWrap = document.getElementById('manualWrap');
  const bnPreview  = document.getElementById('bnPreview');
  const toast      = document.getElementById('toast');

  // Confirmation modal
  const confirmModal = document.getElementById('confirmModal');
  const CF = {
    product: document.getElementById('cf_product'),
    range: document.getElementById('cf_range'),
    max: document.getElementById('cf_max'),
    duration: document.getElementById('cf_duration'),
    mode: document.getElementById('cf_mode'),
    buyers: document.getElementById('cf_buyers'),
    buyersRow: document.getElementById('cf_buyers_row'),
    startBtn: document.getElementById('btnConfirmStart')
  };
  let pendingStartId = null;

  const F = {
    id: document.getElementById('f_id'),
    brand: document.getElementById('f_brand'),
    model: document.getElementById('f_model'),
    reference: document.getElementById('f_reference'),
    year: document.getElementById('f_year'),
    condition: document.getElementById('f_condition'),
    fullset: document.getElementById('f_fullset'),
    photos: document.getElementById('f_photos'),
    estMin: document.getElementById('f_estMin'),
    estMax: document.getElementById('f_estMax'),
    maxInd: document.getElementById('f_maxInd'),
    duration: document.getElementById('f_duration')
  };

  let photoData = [];   // data URLs for current form
  let tickTimer = null;

  storeNote.textContent = 'Data tersimpan di browser ini (MVP · localStorage).';

  /* ---------- Toast ---------- */
  let toastTimer = null;
  function showToast(msg) {
    toast.textContent = msg;
    toast.hidden = false;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => { toast.hidden = true; }, 300);
    }, 2200);
  }

  /* ---------- Offer rows ---------- */
  function addOfferRow(offer) {
    offer = offer || { label: '', amount: '', revealAtSec: '' };
    const row = document.createElement('div');
    row.className = 'bn-offer-row';
    row.innerHTML =
      '<input type="text" class="o-label" placeholder="Buyer A" />' +
      '<input type="number" class="o-amount" placeholder="11000000" min="0" step="100000" />' +
      '<input type="text" class="o-reveal" placeholder="01:15" />' +
      '<button type="button" class="bn-row-del" aria-label="Hapus baris">&times;</button>';
    row.querySelector('.o-label').value  = offer.label || '';
    row.querySelector('.o-amount').value = offer.amount != null && offer.amount !== '' ? offer.amount : '';
    row.querySelector('.o-reveal').value = secToMMSS(offer.revealAtSec);
    row.querySelector('.bn-row-del').addEventListener('click', () => row.remove());
    offersList.appendChild(row);
  }

  function secToMMSS(sec) {
    if (sec === '' || sec == null) return '';
    const s = Number(sec) || 0;
    return N.formatMMSS(s);
  }
  function mmssToSec(str) {
    if (!str) return 0;
    const t = String(str).trim();
    if (t.indexOf(':') === -1) return Number(t) || 0;
    const parts = t.split(':');
    const mm = Number(parts[0]) || 0;
    const ss = Number(parts[1]) || 0;
    return mm * 60 + ss;
  }

  function readOfferRows() {
    const rows = Array.prototype.slice.call(offersList.querySelectorAll('.bn-offer-row'));
    return rows.map(r => ({
      label: r.querySelector('.o-label').value.trim(),
      amount: Number(r.querySelector('.o-amount').value) || 0,
      revealAtSec: mmssToSec(r.querySelector('.o-reveal').value)
    })).filter(o => o.label || o.amount);
  }

  /* ---------- Buyer rows ---------- */
  function addBuyerRow(buyer) {
    buyer = buyer || { name: '', company: '' };
    const row = document.createElement('div');
    row.className = 'bn-buyer-row';
    row.innerHTML =
      '<input type="text" class="b-name" placeholder="Nama peserta" />' +
      '<input type="text" class="b-company" placeholder="Perusahaan (opsional)" />' +
      '<button type="button" class="bn-row-del" aria-label="Hapus peserta">&times;</button>';
    row.querySelector('.b-name').value = buyer.name || '';
    row.querySelector('.b-company').value = buyer.company || '';
    row.querySelector('.bn-row-del').addEventListener('click', () => row.remove());
    buyersList.appendChild(row);
  }

  function readBuyerRows() {
    const rows = Array.prototype.slice.call(buyersList.querySelectorAll('.bn-buyer-row'));
    return rows.map(r => ({
      name: r.querySelector('.b-name').value.trim(),
      company: r.querySelector('.b-company').value.trim()
    })).filter(b => b.name);
  }

  // New blank sessions start with one empty buyer row.
  // (Demo sessions are auto-populated with a random 9–15 subset via Load Demo.)
  function seedDefaultBuyers() {
    addBuyerRow({ name: '', company: '' });
  }

  /* ---------- Progression mode ---------- */
  function getProgMode() {
    const checked = form.querySelector('input[name="progMode"]:checked');
    return checked ? checked.value : 'AUTOMATIC';
  }
  function applyProgModeUI() {
    manualWrap.hidden = getProgMode() !== 'MANUAL';
  }
  form.querySelectorAll('input[name="progMode"]').forEach(r => {
    r.addEventListener('change', applyProgModeUI);
  });

  /* ---------- Photo preview ---------- */
  F.photos.addEventListener('change', () => {
    photoData = [];
    bnPreview.innerHTML = '';
    const files = Array.from(F.photos.files).slice(0, 8);
    files.forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = e => {
        photoData.push(e.target.result);
        const img = document.createElement('img');
        img.src = e.target.result;
        img.alt = file.name;
        bnPreview.appendChild(img);
      };
      reader.readAsDataURL(file);
    });
  });

  /* ---------- Modal ---------- */
  function setProgMode(mode) {
    const val = mode === 'MANUAL' ? 'MANUAL' : 'AUTOMATIC';
    form.querySelectorAll('input[name="progMode"]').forEach(r => {
      r.checked = (r.value === val);
    });
    applyProgModeUI();
  }

  function openModal(editSession) {
    formError.hidden = true;
    offersList.innerHTML = '';
    buyersList.innerHTML = '';
    bnPreview.innerHTML = '';
    photoData = [];

    if (editSession) {
      modalTitle.textContent = 'Edit Offer Session';
      F.id.value = editSession.id;
      F.brand.value = editSession.brand || '';
      F.model.value = editSession.model || '';
      F.reference.value = editSession.reference || '';
      F.year.value = editSession.year || '';
      F.condition.value = editSession.condition || '';
      F.fullset.value = editSession.fullset || '';
      F.estMin.value = editSession.estMin || '';
      F.estMax.value = editSession.estMax || '';
      F.maxInd.value = editSession.maxIndicative || '';
      F.duration.value = editSession.durationMin || 10;
      photoData = (editSession.photos || []).slice();
      photoData.forEach(src => {
        const img = document.createElement('img');
        img.src = src; img.alt = 'Foto produk';
        bnPreview.appendChild(img);
      });
      // Migrate the legacy three-buyer demo session once, then persist its
      // randomized subset so Admin and Presentation Mode share the same list.
      const legacyNames = new Set(['andi wijaya', 'jaya watch', 'budi santoso']);
      const savedBuyers = Array.isArray(editSession.buyers) ? editSession.buyers : [];
      const hasLegacyDefaults = savedBuyers.length <= 3 && savedBuyers.some(b =>
        b && legacyNames.has(String(b.name || '').trim().toLowerCase())
      );
      if (hasLegacyDefaults) {
        editSession = N.update(editSession.id, {
          buyers: N.pickRandomSubset(N.demoDatabase(), 9, 15)
        }) || editSession;
      }
      if (editSession.buyers && editSession.buyers.length) {
        editSession.buyers.forEach(addBuyerRow);
      } else {
        seedDefaultBuyers();
      }
      // progression mode + manual offers
      setProgMode(editSession.progressionMode || 'AUTOMATIC');
      (editSession.offers || []).forEach(addOfferRow);
      if (!editSession.offers || !editSession.offers.length) seedDefaultOffers();
    } else {
      modalTitle.textContent = 'Create Offer Session';
      form.reset();
      F.id.value = '';
      F.duration.value = 10;
      seedDefaultBuyers();
      setProgMode('AUTOMATIC');
      seedDefaultOffers();
    }

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  // Manual-mode seed offers (only visible when Manual override chosen).
  function seedDefaultOffers() {
    addOfferRow({ label: 'Buyer A', amount: '', revealAtSec: 75 });
    addOfferRow({ label: 'Buyer B', amount: '', revealAtSec: 150 });
    addOfferRow({ label: 'Buyer C', amount: '', revealAtSec: 285 });
    addOfferRow({ label: 'Buyer D', amount: '', revealAtSec: 440 });
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
  }

  modal.addEventListener('click', e => {
    if (e.target.hasAttribute('data-close')) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
    if (e.key === 'Escape' && !confirmModal.hidden) closeConfirm();
  });

  /* ---------- Start confirmation ---------- */
  function openConfirm(session) {
    pendingStartId = session.id;
    const product = (session.brand + ' ' + session.model).trim() || '—';
    CF.product.textContent = product;
    CF.range.textContent = N.formatRupiah(session.estMin) + ' – ' + N.formatRupiah(session.estMax);
    CF.max.textContent = N.formatRupiah(session.maxIndicative);
    CF.duration.textContent = (session.durationMin || 10) + ' MINUTES';
    CF.mode.textContent = 'Indicative Simulation';
    const names = (session.buyers || []).map(b => b.name).filter(Boolean);
    if (names.length) {
      // A randomized 5–9 subset is selected at start; the full set stays in the DB.
      if (names.length > 9) {
        CF.buyers.textContent = names.length + ' peserta tersedia · 5–9 dipilih acak per sesi';
      } else {
        CF.buyers.textContent = names.join(', ');
      }
      CF.buyersRow.hidden = false;
    } else {
      CF.buyersRow.hidden = true;
    }
    confirmModal.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeConfirm() {
    confirmModal.hidden = true;
    pendingStartId = null;
    document.body.style.overflow = '';
  }
  confirmModal.addEventListener('click', e => {
    if (e.target.hasAttribute('data-confirm-close')) closeConfirm();
  });
  CF.startBtn.addEventListener('click', () => {
    if (!pendingStartId) return;
    N.start(pendingStartId);
    const id = pendingStartId;
    closeConfirm();
    showToast('Offer window dimulai · presentation mode aktif.');
    render();
    // auto-open the customer presentation page for the admin to present
    const s = N.getAll().find(x => x.id === id);
    if (s) window.open(N.customerUrl(s.code), '_blank', 'noopener');
  });

  document.getElementById('btnNewSession').addEventListener('click', () => openModal(null));
  document.getElementById('btnAddOffer').addEventListener('click', () => addOfferRow());
  document.getElementById('btnAddBuyer').addEventListener('click', () => addBuyerRow());
  document.getElementById('btnLoadDemo').addEventListener('click', () => {
    // 1. Create the demo session (random 9–15 subset from the 35-DB).
    let s = N.seedDemo();

    // 2. Hard guarantee: the session must carry a 9–15 participant subset.
    //    If anything upstream produced an empty/short list, regenerate and
    //    persist it so Admin + Presentation Mode share the same participants.
    let buyers = Array.isArray(s.buyers) ? s.buyers.filter(b => b && b.name) : [];
    if (buyers.length < 9) {
      buyers = N.pickRandomSubset(N.demoDatabase(), 9, 15);
      s = N.update(s.id, { buyers: buyers }) || s;
    }

    render();

    // 3. Open the modal and render the selected participants DIRECTLY,
    //    bypassing any default/empty-row fallback.
    openModal(s);
    renderBuyerRows(s.buyers);

    showToast('Demo session · ' + s.code + ' · ' + s.buyers.length + ' peserta terpilih acak.');
  });

  // Replace all buyer rows in the form with the given participant list.
  function renderBuyerRows(list) {
    buyersList.innerHTML = '';
    (list || []).forEach(b => addBuyerRow({ name: b.name || '', company: b.company || '' }));
  }

  /* ---------- Save ---------- */
  form.addEventListener('submit', e => {
    e.preventDefault();
    formError.hidden = true;

    const estMin = Number(F.estMin.value) || 0;
    const estMax = Number(F.estMax.value) || 0;
    const maxInd = Number(F.maxInd.value) || 0;
    const progMode = getProgMode();

    const errors = [];
    if (!F.brand.value.trim()) errors.push('Brand wajib diisi.');
    if (!F.model.value.trim()) errors.push('Model wajib diisi.');
    if (estMin <= 0 || estMax <= 0) errors.push('Estimated range harus diisi.');
    if (estMax < estMin) errors.push('Estimated Maximum tidak boleh lebih kecil dari Minimum.');
    if (maxInd <= 0) errors.push('Maximum Indicative Offer harus diisi.');

    const buyers = readBuyerRows();
    if (!buyers.length) errors.push('Minimal satu buyer/participant harus ditambahkan.');

    const offers = progMode === 'MANUAL' ? readOfferRows() : [];
    if (progMode === 'MANUAL') {
      const overMax = offers.filter(o => o.amount > maxInd);
      if (overMax.length) {
        errors.push('Ada indicative offer melebihi Maximum Indicative Offer. Akan otomatis dibatasi ke ' + N.formatRupiah(maxInd) + '.');
      }
    }

    if (errors.length) {
      formError.innerHTML = errors.map(x => '• ' + x).join('<br>');
      formError.hidden = false;
      // allow continue if only the clamp warning (non-blocking), block on hard errors
      const hardErrors = errors.filter(x => x.indexOf('otomatis dibatasi') === -1);
      if (hardErrors.length) return;
    }

    const payload = {
      brand: F.brand.value.trim(),
      model: F.model.value.trim(),
      reference: F.reference.value.trim(),
      year: F.year.value.trim(),
      condition: F.condition.value.trim(),
      fullset: F.fullset.value.trim(),
      photos: photoData.slice(),
      estMin: estMin,
      estMax: estMax,
      maxIndicative: maxInd,
      durationMin: Number(F.duration.value) || 10,
      progressionMode: progMode,
      buyers: buyers,
      offers: offers
    };

    const editId = F.id.value;
    if (editId) {
      N.update(editId, payload);
      showToast('Session diperbarui.');
    } else {
      const s = N.create(payload);
      showToast('Session dibuat · ' + s.code);
    }
    closeModal();
    render();
  });

  /* ---------- Row actions ---------- */
  function onAction(action, id) {
    const s = N.getByCode ? null : null; // placeholder to keep lints calm
    const session = N.getAll().find(x => x.id === id);
    if (!session) return;

    if (action === 'start') {
      if (session.status === 'ACTIVE') { showToast('Session sudah aktif.'); return; }
      openConfirm(session);
    } else if (action === 'edit') {
      if (session.status === 'ACTIVE') {
        if (!confirm('Session sedang ACTIVE. Edit tetap dilakukan?')) return;
      }
      openModal(session);
    } else if (action === 'close') {
      if (session.status === 'CLOSED') return;
      if (!confirm('Tutup offer window sekarang?')) return;
      N.close(id);
      showToast('Offer window ditutup.');
      render();
    } else if (action === 'view') {
      window.open(N.customerUrl(session.code), '_blank', 'noopener');
    } else if (action === 'copy') {
      copyLink(N.customerUrl(session.code));
    } else if (action === 'delete') {
      if (!confirm('Hapus session ini permanen?')) return;
      N.remove(id);
      showToast('Session dihapus.');
      render();
    }
  }

  function copyLink(url) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
        .then(() => showToast('Customer link disalin.'))
        .catch(() => fallbackCopy(url));
    } else {
      fallbackCopy(url);
    }
  }
  function fallbackCopy(url) {
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast('Customer link disalin.'); }
    catch (e) { showToast('Salin manual: ' + url); }
    document.body.removeChild(ta);
  }

  /* ---------- Render table ---------- */
  function statusBadge(status) {
    const cls = 'bn-badge bn-badge--' + status.toLowerCase();
    return '<span class="' + cls + '">' + status + '</span>';
  }

  function render() {
    const sessions = N.getAll();
    sessionsBody.innerHTML = '';

    if (!sessions.length) {
      emptyState.style.display = 'block';
      return;
    }
    emptyState.style.display = 'none';

    sessions.forEach(session => {
      N.syncStatus(session); // auto-close if expired
      const status = session.status;
      const highest = N.highestOffer(session);
      const remaining = status === 'ACTIVE' ? N.formatMMSS(N.remainingSec(session)) : '—';
      const product = (session.brand + ' ' + session.model).trim() || '—';
      const range = N.formatRupiah(session.estMin) + ' – ' + N.formatRupiah(session.estMax);

      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="bn-mono">' + session.code + '</td>' +
        '<td>' + escapeHtml(product) + '</td>' +
        '<td class="bn-nowrap-sm">' + range + '</td>' +
        '<td>' + N.formatRupiah(session.maxIndicative) + '</td>' +
        '<td class="bn-highest">' + (highest ? N.formatRupiah(highest) : '—') + '</td>' +
        '<td class="bn-remaining" data-id="' + session.id + '">' + remaining + '</td>' +
        '<td>' + statusBadge(status) + '</td>' +
        '<td class="bn-col-actions"></td>';

      const actionsCell = tr.querySelector('.bn-col-actions');
      actionsCell.appendChild(makeActions(session));
      sessionsBody.appendChild(tr);
    });
  }

  function makeActions(session) {
    const wrap = document.createElement('div');
    wrap.className = 'bn-actions';

    const defs = [];
    if (session.status === 'DRAFT') {
      defs.push(['start', 'Start', 'bn-act--primary']);
    }
    if (session.status === 'ACTIVE') {
      defs.push(['close', 'Close', 'bn-act--danger']);
    }
    defs.push(['view', 'View', '']);
    defs.push(['copy', 'Copy Link', '']);
    defs.push(['edit', 'Edit', '']);
    defs.push(['delete', 'Delete', 'bn-act--muted']);

    defs.forEach(([action, label, cls]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bn-act ' + cls;
      b.textContent = label;
      b.addEventListener('click', () => onAction(action, session.id));
      wrap.appendChild(b);
    });
    return wrap;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  /* ---------- Live tick (updates remaining + auto-close) ---------- */
  function tick() {
    const rows = document.querySelectorAll('.bn-remaining');
    let needsRerender = false;
    rows.forEach(cell => {
      const id = cell.dataset.id;
      const session = N.getAll().find(x => x.id === id);
      if (!session) return;
      if (session.status === 'ACTIVE') {
        const rem = N.remainingSec(session);
        if (rem <= 0) { needsRerender = true; }
        else { cell.textContent = N.formatMMSS(rem); }
      }
    });
    if (needsRerender) render();
  }

  render();
  tickTimer = setInterval(tick, 1000);

  // Re-render if another tab changed the store
  window.addEventListener('storage', e => {
    if (e.key === N.STORE_KEY) render();
  });
})();
