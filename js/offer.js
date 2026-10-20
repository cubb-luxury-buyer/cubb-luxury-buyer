/* ============================================
   CUBB BUYER NETWORK — Customer Offer Page
   ============================================ */

'use strict';

(function () {
  const N = window.CUBBNet;
  if (!N) return;

  /* ---------- Elements ---------- */
  const el = {
    missing: document.getElementById('missingState'),
    draft: document.getElementById('draftState'),
    offer: document.getElementById('offerState'),
    statusChip: document.getElementById('statusChip'),
    countdown: document.getElementById('countdown'),
    countdownLabel: document.getElementById('countdownLabel'),
    phaseChip: document.getElementById('phaseChip'),
    productName: document.getElementById('productName'),
    gallery: document.getElementById('gallery'),
    specs: document.getElementById('specs'),
    rangeValue: document.getElementById('rangeValue'),
    highestAmount: document.getElementById('highestAmount'),
    highestSub: document.getElementById('highestSub'),
    offersUl: document.getElementById('offersUl'),
    waitingNote: document.getElementById('waitingNote'),
    activityUl: document.getElementById('activityUl'),
    closedNote: document.getElementById('closedNote')
  };

  const code = N.getSessionCodeFromUrl();
  let session = N.getByCode(code);

  if (!session) {
    show(el.missing);
    return;
  }

  // Track which offers already animated in, so re-render doesn't flash.
  const revealedKeys = new Set();
  let staticRendered = false;
  let lastStatus = null;
  let tickTimer = null;

  function show(node) {
    [el.missing, el.draft, el.offer].forEach(n => { if (n) n.hidden = true; });
    if (node) node.hidden = false;
  }

  function offerKey(o, i) {
    return (o.label || '') + '|' + (o.amount || 0) + '|' + (o.revealAtSec || 0) + '|' + i;
  }

  /* ---------- Static (product) render ---------- */
  function renderStatic() {
    if (staticRendered) return;
    const name = (session.brand + ' ' + session.model).trim().toUpperCase();
    el.productName.textContent = name || 'PRODUCT';

    // Gallery
    if (session.photos && session.photos.length) {
      el.gallery.hidden = false;
      el.gallery.innerHTML = '';
      session.photos.slice(0, 6).forEach(src => {
        const img = document.createElement('img');
        img.src = src;
        img.alt = name;
        img.loading = 'lazy';
        el.gallery.appendChild(img);
      });
    }

    // Specs
    const specs = [];
    if (session.reference) specs.push(['Reference', session.reference]);
    if (session.year) specs.push(['Year', session.year]);
    if (session.condition) specs.push(['Condition', session.condition]);
    if (session.fullset) specs.push(['Fullset', session.fullset]);
    el.specs.innerHTML = specs.map(([k, v]) =>
      '<div class="bn-spec"><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>'
    ).join('');

    el.rangeValue.textContent =
      N.formatRupiah(session.estMin) + ' – ' + N.formatRupiah(session.estMax);

    staticRendered = true;
  }

  /* ---------- Offers + activity ---------- */
  function renderOffers() {
    const visible = N.visibleOffers(session);
    // Sort by amount desc for the ranked list
    const ranked = visible.slice().sort((a, b) => (b.amount || 0) - (a.amount || 0));

    el.offersUl.innerHTML = '';
    ranked.forEach((o, i) => {
      const li = document.createElement('li');
      li.className = 'bn-offer-item' + (i === 0 ? ' is-top' : '');
      li.innerHTML =
        '<span class="bn-offer-buyer">' + esc(o.label || 'Buyer') + '</span>' +
        '<span class="bn-offer-amount">' + N.formatRupiah(Math.min(o.amount, session.maxIndicative)) + '</span>';
      // animate newly revealed
      const key = offerKey(o, i);
      if (!revealedKeys.has(o.label + '|' + o.amount)) {
        li.classList.add('bn-reveal');
        revealedKeys.add(o.label + '|' + o.amount);
      }
      el.offersUl.appendChild(li);
    });

    // Highest indicative offer (based on currently visible offers)
    const highest = N.highestOffer(session);
    el.highestAmount.textContent = highest ? N.formatRupiah(highest) : '—';

    // Waiting note (only while active and more offers to come)
    const total = N.effectiveOffers(session).length;
    if (session.status === 'ACTIVE' && visible.length < total) {
      el.waitingNote.hidden = false;
    } else {
      el.waitingNote.hidden = true;
    }

    // Activity timeline (chronological by reveal time)
    renderActivity(visible);
  }

  function renderActivity(visible) {
    const items = [];
    // Session start marker — countdown value at t=0 is the full duration.
    items.push({
      t: N.formatMMSS((Number(session.durationMin) || 10) * 60),
      text: 'Session starts',
      marker: true
    });

    visible.slice()
      .sort((a, b) => (a.revealAtSec || 0) - (b.revealAtSec || 0))
      .forEach(o => {
        // Show the countdown value AT reveal moment = duration - revealAt
        const remainAtReveal = (session.durationMin * 60) - (o.revealAtSec || 0);
        items.push({
          t: N.formatMMSS(Math.max(0, remainAtReveal)),
          text: (o.label || 'Buyer') + ' — ' + N.formatRupiah(Math.min(o.amount, session.maxIndicative)),
          marker: false
        });
      });

    el.activityUl.innerHTML = items.map(it =>
      '<li class="bn-activity-item' + (it.marker ? ' is-marker' : '') + '">' +
        '<span class="bn-activity-time">' + it.t + '</span>' +
        '<span class="bn-activity-text">' + esc(it.text) + '</span>' +
      '</li>'
    ).join('');
  }

  /* ---------- Status / countdown ---------- */
  function applyStatus() {
    N.syncStatus(session);                 // persist auto-close
    session = N.getByCode(code) || session; // re-read latest

    const status = session.status;

    if (status === 'DRAFT' || !session.startAt) {
      show(el.draft);
      return;
    }

    show(el.offer);
    renderStatic();

    if (status === 'ACTIVE') {
      const rem = N.remainingSec(session);
      el.countdown.textContent = N.formatMMSS(rem);
      // Phase chip (EARLY / MID / FINAL) — reflects progression phase.
      const label = N.phaseLabel(session);
      el.phaseChip.hidden = false;
      el.phaseChip.textContent = label.replace('PHASE', 'Phase');
      el.phaseChip.className = 'bn-phase-chip is-' +
        (label.indexOf('EARLY') === 0 ? 'early' : label.indexOf('MID') === 0 ? 'mid' : 'final');
      if (lastStatus !== 'ACTIVE') {
        el.statusChip.textContent = 'Offer Window Active';
        el.statusChip.className = 'bn-status-chip is-active';
        el.countdownLabel.textContent = 'Sisa waktu offer window';
        el.closedNote.hidden = true;
        el.offer.classList.remove('is-closed');
      }
    } else if (status === 'CLOSED') {
      el.countdown.textContent = '00:00';
      el.statusChip.textContent = 'Offer Window Closed';
      el.statusChip.className = 'bn-status-chip is-closed';
      el.countdownLabel.textContent = 'Offer window telah ditutup';
      el.phaseChip.hidden = true;
      el.closedNote.hidden = false;
      el.offer.classList.add('is-closed');
      el.highestSub.textContent = 'Penawaran indikatif tertinggi pada sesi ini';
    }

    lastStatus = status;
    renderOffers();
  }

  /* ---------- Tick ---------- */
  function tick() {
    // Re-read in case admin (same browser) changed it
    const fresh = N.getByCode(code);
    if (fresh) session = fresh;
    applyStatus();
    if (session.status === 'CLOSED') {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // initial paint + 1s ticker
  applyStatus();
  tickTimer = setInterval(tick, 1000);

  // Sync across tabs (admin starting/closing in another tab)
  window.addEventListener('storage', e => {
    if (e.key === N.STORE_KEY) {
      const fresh = N.getByCode(code);
      if (fresh) {
        session = fresh;
        if (!tickTimer && session.status === 'ACTIVE') tickTimer = setInterval(tick, 1000);
        applyStatus();
      }
    }
  });
})();
