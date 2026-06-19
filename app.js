/* ============================================================
   WHERE NEW YORK CAME FROM — foreign-born New Yorkers by country
   of birth, a bar-chart race across the censuses 1900 -> 2020.

   The "fade": the census can count immigrants (1st generation) by
   country of birth, but NOT their American-born grandchildren — by
   the 3rd generation a group's descendants are simply "American" and
   drop out of the birthplace count. So once a wave stops being
   replenished, its bar both SHRINKS (immigrants age and die) and
   DIMS (we shade it to mark the wave receding into its US-born
   later generations). A bar is full-strength up to its peak decade,
   then fades in proportion to how far it has fallen from that peak.
   ============================================================ */

const DISPLAY = 12;             // bars shown at once (top N by size)
const ROW = 46;                 // px per lane
const MAX_BAR = 82;             // leader bar caps here (% of track)
const SECONDS_PER_DECADE = 2.0;
const HOLD_END = 3.0;
const EASE = 0.16;

const fmt = new Intl.NumberFormat('en-US');
const $ = (s, r = document) => r.querySelector(s);

let DATA, COUNTRIES, YEARS, FIRST, LAST, STEP, SPAN;
let T = 0, playing = true, speed = 1, last = 0, endHold = 0;
const rows = new Map();

// region palette — cool = European waves, warm = Latin America,
// magenta = nonhispanic Caribbean, gold/green = Asia, grey = other
const REGION = {
  europe:    { label: 'Europe',                 hues: [205, 198, 220, 188, 212, 230, 178, 240] },
  latin:     { label: 'Latin America',          hues: [8, 18, 28, 0, 36] },
  caribbean: { label: 'Caribbean (non-Hispanic)', hues: [320, 305, 290, 335] },
  asia:      { label: 'Asia',                    hues: [45, 86, 140, 62, 110, 160] },
  other:     { label: 'Other',                   hues: [0] }
};
const regionCount = {};
function countryColor(c){
  if (c._color) return c._color;
  const r = REGION[c.region] || REGION.other;
  const idx = (regionCount[c.region] = (regionCount[c.region] || 0)) ;
  regionCount[c.region]++;
  const h = r.hues[idx % r.hues.length];
  const sat = c.region === 'other' ? 6 : 58;
  const lig = 46 + ((idx * 7) % 16);
  c._color = `hsl(${h} ${sat}% ${lig}%)`;
  c._hue = h; c._sat = sat; c._lig = lig;
  return c._color;
}

/* ---- fill internal gaps (e.g. 1940-1960) by interpolating between the
   nearest real decades, so a missing mid-series cell declines smoothly rather
   than crashing to zero. Leading nulls (before a wave is first counted) and
   trailing nulls (after its last count) are left alone so bars still enter and
   ebb out. */
function fillInternalGaps(arr){
  let first = arr.findIndex(v => v != null);
  let lastIdx = -1;
  for (let i = arr.length - 1; i >= 0; i--){ if (arr[i] != null){ lastIdx = i; break; } }
  if (first < 0) return arr;
  for (let i = first + 1; i < lastIdx; i++){
    if (arr[i] == null){
      let p = i - 1; while (arr[p] == null) p--;
      let n = i + 1; while (arr[n] == null) n++;
      arr[i] = arr[p] + (arr[n] - arr[p]) * ((i - p) / (n - p));
    }
  }
  return arr;
}

/* ---- interpolation -------------------------------------------------------- */
function lerp(arr, fi){
  const i = Math.floor(fi), frac = fi - i;
  const a = arr[i], b = (i + 1 < arr.length) ? arr[i + 1] : a;
  if (a == null && b == null) return null;
  if (a == null) return b * frac;     // wave enters: grow from 0
  if (b == null) return a * (1 - frac); // wave exits the record: ebb to 0
  return a + (b - a) * frac;
}

// peak value over the whole series, for the fade reference
function peakOf(c){
  if (c._peak != null) return c._peak;
  c._peak = Math.max(...c.counts.filter(v => v != null));
  c._peakIdx = c.counts.indexOf(c._peak);
  return c._peak;
}

// fade factor 0..1: 1 = full strength (at/before peak), lower = faded.
// Past peak, fade tracks how far the wave has fallen from its high-water mark.
function fadeOf(c, fi, v){
  peakOf(c);
  if (fi <= c._peakIdx) return 1;
  const ratio = v / c._peak;          // 1 at peak, →0 as wave recedes
  return Math.max(0.18, ratio);       // floor so a faint bar stays legible
}

/* ---- dom ------------------------------------------------------------------ */
function buildRows(){
  const track = $('#track');
  track.innerHTML = '';
  rows.clear();
  COUNTRIES.forEach((c, idx) => {
    countryColor(c);
    const el = document.createElement('div');
    el.className = 'lane';
    el.style.setProperty('--c', c._color);
    el.innerHTML = `
      <div class="lane-bar"><div class="lane-fill"></div><span class="lane-name">${c.name}</span></div>
      <div class="lane-meta"><span class="lane-val">&mdash;</span></div>`;
    el.style.transform = `translate3d(0, ${idx * ROW}px, 0)`;
    el.style.opacity = '0';
    track.appendChild(el);
    rows.set(c.id, {
      c, el, fill: $('.lane-fill', el), name: $('.lane-name', el),
      val: $('.lane-val', el), y: idx * ROW, vis: false
    });
  });
  track.style.height = (DISPLAY * ROW) + 'px';
}

/* ---- render --------------------------------------------------------------- */
function render(fi, snap){
  const scored = [];
  for (const c of COUNTRIES){
    const v = lerp(c.counts, fi);
    if (v != null && v > 0) scored.push([c, v]);
  }
  scored.sort((p, q) => q[1] - p[1]);
  const top = scored.slice(0, DISPLAY);
  const maxV = top.length ? top[0][1] : 1;

  const visible = new Set();
  top.forEach(([c, v], r) => {
    visible.add(c.id);
    const row = rows.get(c.id);
    const targetY = r * ROW;
    if (snap) row.y = targetY;
    else { row.y += (targetY - row.y) * EASE; if (Math.abs(targetY - row.y) < 0.5) row.y = targetY; }

    const w = Math.max(0.8, (v / maxV) * MAX_BAR);
    const fade = fadeOf(c, fi, v);
    row.el.style.transform = `translate3d(0, ${row.y}px, 0)`;
    row.el.style.setProperty('--w', w + '%');
    row.el.style.opacity = '1';
    row.fill.style.width = w + '%';
    // dim + desaturate a receding wave
    row.fill.style.filter = `saturate(${0.25 + 0.75 * fade}) opacity(${0.4 + 0.6 * fade})`;
    row.el.classList.toggle('faded', fade < 0.92);
    row.val.textContent = fmt.format(Math.round(v));
    row.name.classList.toggle('outside', w < 22);
    row.vis = true;
  });
  for (const [id, row] of rows){
    if (!visible.has(id) && row.vis){ row.el.style.opacity = '0'; row.vis = false; }
  }
}

/* ---- clock ---------------------------------------------------------------- */
const yearEl = $('#year'), eraEl = $('#era'), scrub = $('#scrub'),
      playBtn = $('#play'), restartBtn = $('#restart');

function eraLabel(y){
  if (y < 1924) return 'the open door';
  if (y < 1965) return 'the closed door';
  if (y < 2000) return 'the new wave';
  return 'the global city';
}

function frame(now){
  const dt = last ? (now - last) / 1000 : 0; last = now;
  if (playing){
    if (T < SPAN){ T += (dt / SECONDS_PER_DECADE) * speed; if (T >= SPAN){ T = SPAN; endHold = HOLD_END; } }
    else if (endHold > 0){ endHold -= dt; if (endHold <= 0) T = 0; }
    scrub.value = Math.round((T / SPAN) * 1000);
  }
  paint();
  requestAnimationFrame(frame);
}
function paint(snap){
  const fi = Math.min(T, SPAN);
  const Y = Math.round(FIRST + fi * STEP);
  yearEl.textContent = Y;
  eraEl.textContent = eraLabel(Y);
  render(fi, snap);
}
function setPlaying(p){ playing = p; playBtn.innerHTML = p ? '&#10073;&#10073;' : '&#9654;'; playBtn.classList.toggle('paused', !p); }

async function init(){
  DATA = await (await fetch('data/data.json')).json();
  COUNTRIES = DATA.countries;
  for (const c of COUNTRIES) fillInternalGaps(c.counts);
  YEARS = DATA.years;
  FIRST = DATA.timeline.first; LAST = DATA.timeline.last; STEP = DATA.timeline.step;
  SPAN = (LAST - FIRST) / STEP;

  buildRows();
  buildLegend();

  playBtn.addEventListener('click', () => setPlaying(!playing));
  restartBtn.addEventListener('click', () => { T = 0; endHold = 0; setPlaying(true); });
  scrub.addEventListener('input', () => { T = (scrub.value / 1000) * SPAN; endHold = 0; paint(true); });
  scrub.addEventListener('pointerdown', () => setPlaying(false));
  for (const b of document.querySelectorAll('.speed')){
    b.addEventListener('click', () => { speed = parseFloat(b.dataset.speed);
      document.querySelectorAll('.speed').forEach(x => x.classList.toggle('is-active', x === b)); });
  }
  document.addEventListener('keydown', (e) => { if (e.code === 'Space'){ e.preventDefault(); setPlaying(!playing); } });

  const cautionBullets = DATA.meta.caution || [];
  $('#cautionList').innerHTML = cautionBullets.map(b => `<li>${b}</li>`).join('');
  const pop = $('#caution');
  $('#aiCaution').addEventListener('click', () => pop.hidden = false);
  $('#cautionClose').addEventListener('click', () => pop.hidden = true);
  pop.addEventListener('click', (e) => { if (e.target === pop) pop.hidden = true; });

  requestAnimationFrame(frame);
}

function buildLegend(){
  const used = [...new Set(COUNTRIES.map(c => c.region))];
  const order = ['europe', 'latin', 'caribbean', 'asia', 'other'];
  const el = $('#regionLegend');
  el.innerHTML = order.filter(r => used.includes(r)).map(r => {
    const sample = COUNTRIES.find(c => c.region === r);
    return `<span class="rl-item"><span class="rl-dot" style="background:${sample._color}"></span>${REGION[r].label}</span>`;
  }).join('');
}

init();
