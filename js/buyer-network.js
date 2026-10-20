/* ============================================
   CUBB BUYER NETWORK — Shared Store & Logic
   --------------------------------------------
   Internal "Indicative Buyer Offer" tool (MVP).
   NOT a public auction, no real bidders, no payments.

   Storage: browser localStorage (MVP). Sessions live in the
   browser/device that created them. For multi-device use a
   real backend would be required — intentionally out of scope.
   ============================================ */

'use strict';

window.CUBBNet = (function () {

  const STORE_KEY = 'cubb_buyer_network_sessions_v1';

  /* ---------- Session code generation ---------- */
  // Unambiguous alphabet (no 0/O/1/I) to avoid guessing & misreads.
  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function randomChars(len) {
    let out = '';
    const cryptoObj = window.crypto || window.msCrypto;
    if (cryptoObj && cryptoObj.getRandomValues) {
      const buf = new Uint32Array(len);
      cryptoObj.getRandomValues(buf);
      for (let i = 0; i < len; i++) {
        out += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
      }
    } else {
      for (let i = 0; i < len; i++) {
        out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
    }
    return out;
  }

  function generateCode() {
    // e.g. CUBB-7K29XQ  (6 random chars => ~1 billion combos)
    let code;
    do {
      code = 'CUBB-' + randomChars(6);
    } while (getByCode(code)); // ensure uniqueness
    return code;
  }

  /* ---------- Low-level persistence ---------- */
  function readAll() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function writeAll(list) {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  }

  /* ---------- Queries ---------- */
  function getAll() {
    // newest first
    return readAll().slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  function getByCode(code) {
    if (!code) return null;
    const upper = String(code).toUpperCase();
    return readAll().find(s => (s.code || '').toUpperCase() === upper) || null;
  }

  /* ---------- Seeded PRNG (deterministic, refresh-safe) ---------- */
  // Small, fast, deterministic generator. Same seed => same sequence,
  // so the progression is identical on every refresh and every device.
  function hashSeed(str) {
    let h = 2166136261 >>> 0;
    const s = String(str || 'CUBB');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Phase boundaries as fraction of total duration (from spec).
  // Early:  first 50% of time   -> cap 75% of max (floor 50%)
  // Mid:    50%..80% of time    -> cap 90% of max
  // Final:  last 20% of time    -> cap 100% of max (ends exactly at max)
  const PHASES = {
    early: { tStart: 0.00, tEnd: 0.50, pFloor: 0.50, pCap: 0.75 },
    mid:   { tStart: 0.50, tEnd: 0.80, pFloor: 0.75, pCap: 0.90 },
    final: { tStart: 0.80, tEnd: 1.00, pFloor: 0.90, pCap: 1.00 }
  };

  // Returns phase key for an elapsed fraction (0..1).
  function phaseForFraction(frac) {
    if (frac < PHASES.early.tEnd) return 'early';
    if (frac < PHASES.mid.tEnd) return 'mid';
    return 'final';
  }

  // Phase label as shown on the presentation screen, from remaining seconds.
  function phaseLabel(session, nowMs) {
    const total = (Number(session.durationMin) || 10) * 60;
    const elapsed = Math.min(total, elapsedSec(session, nowMs));
    const frac = total ? elapsed / total : 0;
    const key = phaseForFraction(frac);
    return key === 'early' ? 'EARLY PHASE' : key === 'mid' ? 'MID PHASE' : 'FINAL PHASE';
  }

  function roundTo(value, step) {
    const s = step || 1;
    return Math.round(value / s) * s;
  }

  /* --------------------------------------------------------------
     Generate a controlled indicative progression.
     Deterministic from session.seed (+ code fallback). Produces a
     list of { label, buyerIndex, amount, revealAtSec } that:
       - never exceeds maxIndicative
       - stays <=75% of max during the first half
       - climbs through mid toward ~90%
       - reaches exactly maxIndicative at the end
       - is monotonic non-decreasing, non-negative
     NOTE: This is a SIMULATION / INDICATIVE presentation aid.
     -------------------------------------------------------------- */
  // Deterministic Fisher-Yates shuffle using a seeded RNG.
  function seededShuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Minimum / maximum participants randomly selected for a demo session.
  const DEMO_SUBSET_MIN = 9;
  const DEMO_SUBSET_MAX = 15;

  /* The participants for a session ARE the buyers stored on it.
     The random subset is chosen once (in seedDemo / admin) and saved to
     session.buyers, so the Admin form and Presentation Mode use exactly
     the same set. Each participant yields at most one indicative offer. */
  function selectParticipants(session) {
    return (session.buyers || []).filter(b => b && (b.name || b.label));
  }

  /* Pick a random subset of `min`..`max` items from a pool (no duplicates),
     in randomized order. Uses crypto randomness so each call differs. */
  function pickRandomSubset(pool, min, max) {
    const items = (pool || []).slice();
    const rng = mulberry32((Math.random() * 0xffffffff) >>> 0);
    const shuffled = seededShuffle(items, rng);
    const lo = Math.min(min, items.length);
    const hi = Math.min(max, items.length);
    const span = Math.max(0, hi - lo);
    const count = lo + Math.floor(rng() * (span + 1));
    return shuffled.slice(0, count);
  }

  function generateProgression(session) {
    const max = Number(session.maxIndicative) || 0;
    const totalSec = (Number(session.durationMin) || 10) * 60;
    if (max <= 0 || totalSec <= 0) return [];

    // Randomized subset of participants — one indicative offer each.
    const participants = selectParticipants(session);
    if (!participants.length) return [];
    const updates = participants.length;

    const rng = mulberry32(hashSeed(session.seed || session.code || session.id));
    const step = 100000; // round indicative amounts to nearest Rp100k

    // Build strictly increasing reveal times across the window,
    // with randomized (non-fixed) gaps so offers don't land at even intervals.
    const times = [];
    let acc = 6 + rng() * 10; // first offer after ~6-16s
    for (let i = 0; i < updates; i++) {
      times.push(acc);
      const remainingUpdates = updates - i;
      const avgGap = (totalSec - acc - 8) / Math.max(1, remainingUpdates);
      acc += Math.max(8, avgGap * (0.6 + rng() * 0.8)); // jittered gap
    }
    // normalize times into [start .. totalSec-3]
    const first = times[0];
    const last = times[times.length - 1];
    const spanTarget = totalSec - 3 - first;
    const spanActual = Math.max(1, last - first);
    const norm = times.map(t => first + (t - first) / spanActual * spanTarget);

    const offers = [];
    let prevAmount = 0;

    for (let i = 0; i < updates; i++) {
      const tSec = norm[i];
      const frac = tSec / totalSec;
      const ph = PHASES[phaseForFraction(frac)];

      // Progress within the phase (0..1)
      const phaseSpan = ph.tEnd - ph.tStart;
      const within = phaseSpan > 0 ? Math.min(1, Math.max(0, (frac - ph.tStart) / phaseSpan)) : 1;

      // Target percentage ramps from phase floor to phase cap,
      // with a little deterministic jitter that never breaks the cap.
      const base = ph.pFloor + (ph.pCap - ph.pFloor) * within;
      const jitter = (rng() - 0.5) * 0.04; // +/-2%
      let pct = base + jitter;
      if (pct > ph.pCap) pct = ph.pCap;
      if (pct < ph.pFloor) pct = ph.pFloor;

      let amount = roundTo(max * pct, step);

      // Monotonic non-decreasing, non-negative, never over max.
      if (amount < prevAmount) amount = prevAmount + step;
      if (amount < 0) amount = 0;
      if (amount > max) amount = max;
      prevAmount = amount;

      // One offer per selected participant, in the shuffled order.
      const buyer = participants[i];

      offers.push({
        label: buyer.name || buyer.label || ('Buyer ' + (i + 1)),
        company: buyer.company || '',
        buyerIndex: i,
        amount: amount,
        revealAtSec: Math.round(tSec)
      });
    }

    // Guarantee the final offer equals the configured maximum.
    // Ensure the climax lands near the end.
    const lastOffer = offers[offers.length - 1];
    if (lastOffer) {
      lastOffer.amount = max;
      if (lastOffer.revealAtSec > totalSec - 2) lastOffer.revealAtSec = totalSec - 3;
    }

    return offers;
  }

  // Resolve the effective offer list: manual override if provided,
  // otherwise the generated progression.
  function effectiveOffers(session) {
    if (session && session.progressionMode === 'MANUAL' &&
        Array.isArray(session.offers) && session.offers.length) {
      return clampList(session.offers, session.maxIndicative);
    }
    return generateProgression(session);
  }

  /* ---------- Offer rules ---------- */
  function clampList(offers, max) {
    const cap = Number(max) || 0;
    return (offers || []).map(o => Object.assign({}, o, {
      amount: Math.min(Number(o.amount) || 0, cap)
    }));
  }
  // Enforce: no displayed offer may exceed maxIndicative.
  function clampOffers(session) {
    const max = Number(session.maxIndicative) || 0;
    (session.offers || []).forEach(o => {
      o.amount = Math.min(Number(o.amount) || 0, max);
    });
    return session;
  }

  // Highest among the offers currently VISIBLE (so the customer's
  // "highest" climbs with the progression), clamped to max.
  function highestOffer(session, nowMs) {
    const visible = visibleOffers(session, nowMs);
    const max = Number(session.maxIndicative) || 0;
    if (!visible.length) return 0;
    const top = visible.reduce((m, o) => Math.max(m, Number(o.amount) || 0), 0);
    return Math.min(top, max); // never exceed configured max
  }

  // Offers that should be visible given elapsed seconds since start.
  // Uses the effective progression (generated or manual override).
  function visibleOffers(session, nowMs) {
    if (!session) return [];
    const offers = effectiveOffers(session).slice()
      .sort((a, b) => (a.revealAtSec || 0) - (b.revealAtSec || 0));
    if (session.status !== 'ACTIVE' && session.status !== 'CLOSED') return [];
    if (session.status === 'CLOSED') return offers; // all revealed once closed
    const elapsed = elapsedSec(session, nowMs);
    return offers.filter(o => (Number(o.revealAtSec) || 0) <= elapsed);
  }

  /* ---------- Countdown math (timestamp based) ---------- */
  function elapsedSec(session, nowMs) {
    if (!session || !session.startAt) return 0;
    const now = nowMs || Date.now();
    return Math.max(0, Math.floor((now - session.startAt) / 1000));
  }

  function remainingSec(session, nowMs) {
    if (!session || !session.endAt) return 0;
    const now = nowMs || Date.now();
    return Math.max(0, Math.round((session.endAt - now) / 1000));
  }

  function formatMMSS(totalSec) {
    const s = Math.max(0, Math.floor(totalSec));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return mm + ':' + ss;
  }

  /* ---------- Currency ---------- */
  function formatRupiah(value) {
    const n = Number(value) || 0;
    return 'Rp' + n.toLocaleString('id-ID');
  }

  /* ---------- Status resolution ---------- */
  // Returns the effective status, auto-closing if time elapsed.
  function resolveStatus(session, nowMs) {
    if (!session) return 'DRAFT';
    if (session.status === 'ACTIVE' && remainingSec(session, nowMs) <= 0) {
      return 'CLOSED';
    }
    return session.status || 'DRAFT';
  }

  // Persist auto-close transition so it survives refreshes.
  function syncStatus(session, nowMs) {
    const effective = resolveStatus(session, nowMs);
    if (effective !== session.status) {
      session.status = effective;
      if (effective === 'CLOSED' && !session.closedAt) {
        session.closedAt = session.endAt || (nowMs || Date.now());
      }
      update(session.id, { status: effective, closedAt: session.closedAt });
    }
    return session;
  }

  /* ---------- CRUD ---------- */
  function create(data) {
    const list = readAll();
    const now = Date.now();
    const session = {
      id: 'sess_' + now + '_' + randomChars(4),
      code: null,                 // assigned on first START (or now for link preview)
      status: 'DRAFT',
      createdAt: now,
      // product
      brand: data.brand || '',
      model: data.model || '',
      reference: data.reference || '',
      year: data.year || '',
      condition: data.condition || '',
      fullset: data.fullset || '',
      photos: Array.isArray(data.photos) ? data.photos : [],
      // pricing
      estMin: Number(data.estMin) || 0,
      estMax: Number(data.estMax) || 0,
      maxIndicative: Number(data.maxIndicative) || 0,
      durationMin: Number(data.durationMin) || 10,
      // progression
      progressionMode: data.progressionMode === 'MANUAL' ? 'MANUAL' : 'AUTOMATIC',
      mode: 'INDICATIVE SIMULATION',   // internal labeling of simulated activity
      buyers: Array.isArray(data.buyers) ? data.buyers : [],
      // manual override offers (only used when progressionMode === 'MANUAL')
      offers: Array.isArray(data.offers) ? data.offers : [],
      // deterministic seed so the auto progression is identical everywhere
      seed: data.seed || ('seed_' + randomChars(8)),
      // timing
      startAt: null,
      endAt: null,
      closedAt: null
    };
    // Assign a code immediately so admin can preview/copy the link even as DRAFT.
    session.code = generateCode();
    clampOffers(session);
    list.push(session);
    writeAll(list);
    return session;
  }

  function update(id, patch) {
    const list = readAll();
    const idx = list.findIndex(s => s.id === id);
    if (idx === -1) return null;
    list[idx] = Object.assign({}, list[idx], patch);
    clampOffers(list[idx]);
    writeAll(list);
    return list[idx];
  }

  function start(id, nowMs) {
    const list = readAll();
    const s = list.find(x => x.id === id);
    if (!s) return null;
    const now = nowMs || Date.now();
    if (!s.code) s.code = generateCode();
    s.startAt = now;
    s.endAt = now + (Number(s.durationMin) || 10) * 60 * 1000;
    s.closedAt = null;
    s.status = 'ACTIVE';
    // Re-seed per run so each started session varies, but stays fixed
    // (and identical across devices/refresh) for the duration of THIS run.
    s.seed = 'run_' + now + '_' + randomChars(6);
    writeAll(list);
    return s;
  }

  function close(id, nowMs) {
    const now = nowMs || Date.now();
    return update(id, { status: 'CLOSED', closedAt: now });
  }

  function remove(id) {
    writeAll(readAll().filter(s => s.id !== id));
  }

  /* ---------- Demo seed ----------
     Creates one ready-to-present demo session as a DRAFT.
     Participant names are clearly fictional / for demo only. */
  function seedDemo() {
    return create({
      brand: 'Rolex',
      model: 'Datejust 126234',
      reference: '126234',
      year: '2021',
      condition: 'Excellent',
      fullset: 'Yes — box & papers',
      photos: [],
      estMin: 10000000,
      estMax: 15000000,
      maxIndicative: 12000000,
      durationMin: 10,
      progressionMode: 'AUTOMATIC',
      // Fictional / demo participants only — a randomly selected subset
      // (9..15) of the luxury-industry buyer network for THIS session.
      // The full 35-participant database remains in DEMO_PARTICIPANTS.
      // These are NOT real people, companies, or buyers, and imply no
      // real market offers.
      buyers: pickRandomSubset(DEMO_PARTICIPANTS, DEMO_SUBSET_MIN, DEMO_SUBSET_MAX)
    });
  }

  // Full fictional/demo participant database (35). Exposed for the admin.
  function demoDatabase() { return DEMO_PARTICIPANTS.slice(); }

  // Fictional luxury-industry buyer network for demo/simulation only.
  // (Not real people, companies, or buyers.)
  const DEMO_PARTICIPANTS = [
    { name: 'Eksan LUXE' },
    { name: 'Arden Luxury' },
    { name: 'Aurelia Jewellery' },
    { name: 'Monarch Luxury' },
    { name: 'Veloura Luxe' },
    { name: 'Crown Jewellery' },
    { name: 'Prestige Luxury' },
    { name: 'Maison Luxe' },
    { name: 'Royal Gem Jewellery' },
    { name: 'Imperial Luxury' },
    { name: 'Élan Luxe' },
    { name: 'Noble Jewellery' },
    { name: 'Vellum Luxury' },
    { name: 'The Luxe Gallery' },
    { name: 'Aurum Jewellery' },
    { name: 'Regent Luxury' },
    { name: 'Opulence Luxe' },
    { name: 'Monaco Jewellery' },
    { name: 'Elysian Luxury' },
    { name: 'Crown & Luxe' },
    { name: 'Aureum Jewellery' },
    { name: 'Maison Prestige' },
    { name: 'Luxe Avenue' },
    { name: 'Grand Jewellery' },
    { name: 'Velvet Luxury' },
    { name: 'Legacy Luxe' },
    { name: 'Royalist Jewellery' },
    { name: 'Sovereign Luxury' },
    { name: 'Lumière Luxe' },
    { name: 'Prestige Jewellery' },
    { name: 'Elite Luxury House' },
    { name: 'Aurum Luxe' },
    { name: 'Imperial Jewellery' },
    { name: 'Noble Luxe' },
    { name: 'Crown Luxury House' }
  ];

  /* ---------- URL helper ---------- */
  // Static hosting can't do /offer/CODE path rewrites, so we use a
  // clean, hard-to-guess query param instead: offer.html?s=CUBB-XXXXXX
  function customerUrl(code) {
    const base = window.location.origin +
      window.location.pathname.replace(/[^/]*$/, '');
    return base + 'offer.html?s=' + encodeURIComponent(code);
  }

  function getSessionCodeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('s') || params.get('code') || '';
  }

  return {
    STORE_KEY,
    generateCode,
    getAll, getByCode,
    create, update, start, close, remove, seedDemo, demoDatabase, pickRandomSubset,
    highestOffer, visibleOffers, clampOffers,
    generateProgression, effectiveOffers, selectParticipants, phaseLabel, phaseForFraction, PHASES,
    elapsedSec, remainingSec, resolveStatus, syncStatus,
    formatMMSS, formatRupiah,
    customerUrl, getSessionCodeFromUrl
  };
})();
