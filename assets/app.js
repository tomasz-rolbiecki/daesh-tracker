/* Daesh Claims Tracker — dashboard logic */

const PALETTE = ['#f5a524','#6cc1d8','#e26d6d','#b6c454','#c592d8','#f0d28a','#8eb8a1','#d89c6c','#9ba6d4','#d8b06c','#7fbf7f','#d4a4d4'];
const COLORS = {
  text: '#f4f3ee', muted: '#8a8881', textSoft: '#c8c6bf',
  border: '#2a2a30', grid: 'rgba(255,255,255,0.045)',
  accent: '#f5a524', danger: '#e26d6d',
};

// ---------- Chart.js defaults ----------
Chart.defaults.font.family = '"IBM Plex Sans", system-ui, sans-serif';
Chart.defaults.font.size = 11;
Chart.defaults.color = COLORS.textSoft;
Chart.defaults.borderColor = COLORS.grid;
Chart.defaults.plugins.legend.labels.color = COLORS.textSoft;
Chart.defaults.plugins.legend.labels.boxWidth = 10;
Chart.defaults.plugins.legend.labels.boxHeight = 10;
Chart.defaults.plugins.tooltip.backgroundColor = '#1c1c21';
Chart.defaults.plugins.tooltip.titleColor = COLORS.text;
Chart.defaults.plugins.tooltip.bodyColor = COLORS.textSoft;
Chart.defaults.plugins.tooltip.borderColor = COLORS.border;
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 2;
Chart.defaults.plugins.tooltip.boxPadding = 4;
Chart.defaults.plugins.tooltip.titleFont = { weight: 600, size: 12 };

// ---------- State ----------
const STATE = {
  raw: [],
  ref: {},
  filtered: [],
  filters: {
    monthFrom: null, monthTo: null,
    actors: new Set(), countries: new Set(),
    retro: 'all',
    search: '',
  },
  sort: { key: 'claim_date', dir: 'desc' },
  page: 0,
  pageSize: 25,
  charts: {},
};

// ---------- Utilities ----------
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

function fmtMonth(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  const dt = new Date(parseInt(y), parseInt(m) - 1, 1);
  return dt.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}
function fmtDate(iso) {
  if (!iso) return '';
  const dt = new Date(iso);
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}
function fmtNum(n) { return n == null ? '0' : Number(n).toLocaleString('en-GB'); }
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// ---------- Load ----------
async function loadData() {
  try {
    const [claimsRes, refRes] = await Promise.all([
      fetch('data/claims.json'),
      fetch('data/reference.json'),
    ]);
    if (!claimsRes.ok) throw new Error(`claims.json HTTP ${claimsRes.status}`);
    if (!refRes.ok) throw new Error(`reference.json HTTP ${refRes.status}`);
    STATE.raw = await claimsRes.json();
    STATE.ref = await refRes.json();
  } catch (e) {
    document.body.innerHTML = `<div style="padding:60px; text-align:center; color:var(--danger); font-family:var(--font-mono);">
      Failed to load data: ${escapeHtml(e.message)}<br><br>
      <span style="color:var(--muted); font-size:13px;">If running locally, serve over HTTP (e.g. <code>python3 -m http.server</code>) — fetch() won't work from file://</span></div>`;
    throw e;
  }
}

// ---------- Init ----------
function initFilters() {
  const months = [...new Set(STATE.raw.map(c => c.claim_month).filter(Boolean))].sort();
  const actors = [...new Set(STATE.raw.map(c => c.actor).filter(Boolean))].sort();
  const countries = [...new Set(STATE.raw.map(c => c.country).filter(Boolean))].sort();

  const mFrom = $('#f-month-from'), mTo = $('#f-month-to');
  months.forEach(m => {
    mFrom.insertAdjacentHTML('beforeend', `<option value="${m}">${fmtMonth(m)}</option>`);
    mTo.insertAdjacentHTML('beforeend', `<option value="${m}">${fmtMonth(m)}</option>`);
  });
  mFrom.value = months[0];
  mTo.value = months[months.length - 1];
  STATE.filters.monthFrom = months[0];
  STATE.filters.monthTo = months[months.length - 1];

  const fActor = $('#f-actor');
  actors.forEach(a => fActor.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`));
  const fCountry = $('#f-country');
  countries.forEach(c => fCountry.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`));

  // Set listeners
  mFrom.addEventListener('change', e => { STATE.filters.monthFrom = e.target.value; applyAndRender(); });
  mTo.addEventListener('change', e => { STATE.filters.monthTo = e.target.value; applyAndRender(); });
  fActor.addEventListener('change', () => {
    STATE.filters.actors = new Set([...fActor.selectedOptions].map(o => o.value));
    applyAndRender();
  });
  fCountry.addEventListener('change', () => {
    STATE.filters.countries = new Set([...fCountry.selectedOptions].map(o => o.value));
    applyAndRender();
  });
  $('#f-retro').addEventListener('change', e => { STATE.filters.retro = e.target.value; applyAndRender(); });
  $('#f-reset').addEventListener('click', resetFilters);
  $('#table-search').addEventListener('input', e => {
    STATE.filters.search = e.target.value.toLowerCase();
    STATE.page = 0;
    renderTable();
  });

  // Table sort
  $$('thead th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (STATE.sort.key === key) {
        STATE.sort.dir = STATE.sort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        STATE.sort.key = key;
        STATE.sort.dir = 'desc';
      }
      renderTable();
    });
  });

  $('#pg-prev').addEventListener('click', () => { if (STATE.page > 0) { STATE.page--; renderTable(); } });
  $('#pg-next').addEventListener('click', () => { STATE.page++; renderTable(); });
}

function resetFilters() {
  const months = [...new Set(STATE.raw.map(c => c.claim_month).filter(Boolean))].sort();
  STATE.filters = {
    monthFrom: months[0], monthTo: months[months.length - 1],
    actors: new Set(), countries: new Set(), retro: 'all', search: '',
  };
  $('#f-month-from').value = STATE.filters.monthFrom;
  $('#f-month-to').value = STATE.filters.monthTo;
  $('#f-retro').value = 'all';
  $('#f-actor').selectedIndex = -1;
  [...$('#f-actor').options].forEach(o => o.selected = false);
  [...$('#f-country').options].forEach(o => o.selected = false);
  $('#table-search').value = '';
  applyAndRender();
}

// ---------- Filtering ----------
function applyFilters() {
  const f = STATE.filters;
  STATE.filtered = STATE.raw.filter(c => {
    if (c.claim_month) {
      if (f.monthFrom && c.claim_month < f.monthFrom) return false;
      if (f.monthTo && c.claim_month > f.monthTo) return false;
    }
    if (f.actors.size && !f.actors.has(c.actor)) return false;
    if (f.countries.size && !f.countries.has(c.country)) return false;
    if (f.retro === 'retro' && !c.retroactive) return false;
    if (f.retro === 'current' && c.retroactive) return false;
    return true;
  });
}

// ---------- Render KPIs ----------
function renderKPIs() {
  const data = STATE.filtered;
  const retro = data.filter(c => c.retroactive).length;
  const fat = data.reduce((s, c) => s + (c.fatalities || 0), 0);
  const countries = new Set(data.map(c => c.country).filter(Boolean)).size;
  const actors = new Set(data.map(c => c.actor).filter(Boolean)).size;

  // Peak month
  const byMonth = {};
  data.forEach(c => { if (c.claim_month) byMonth[c.claim_month] = (byMonth[c.claim_month] || 0) + 1; });
  let peakMonth = null, peakCount = 0;
  for (const m in byMonth) if (byMonth[m] > peakCount) { peakMonth = m; peakCount = byMonth[m]; }

  $('#kpi-total').textContent = fmtNum(data.length);
  $('#kpi-total-sub').textContent = STATE.raw.length === data.length ? 'all months' : `of ${fmtNum(STATE.raw.length)} total`;
  $('#kpi-retro').textContent = fmtNum(retro);
  const retroPct = data.length ? (retro / data.length * 100).toFixed(1) : '0.0';
  $('#kpi-retro-sub').textContent = `${retroPct}% of view`;
  $('#kpi-fatalities').textContent = fmtNum(fat);
  $('#kpi-fatalities-sub').textContent = data.length ? `${(fat / data.length).toFixed(1)} per claim` : '—';
  $('#kpi-countries').textContent = countries;
  $('#kpi-actors').textContent = actors;
  $('#kpi-peak').textContent = peakMonth ? fmtMonth(peakMonth) : '—';
  $('#kpi-peak-sub').textContent = peakMonth ? `${peakCount} claims` : '—';

  // Filter status line
  const f = STATE.filters;
  const parts = [];
  if (f.monthFrom !== STATE.raw[0]?.claim_month || f.monthTo !== STATE.raw.at(-1)?.claim_month) {
    parts.push(`${fmtMonth(f.monthFrom)}–${fmtMonth(f.monthTo)}`);
  }
  if (f.actors.size) parts.push(`Actor: ${[...f.actors].join(', ')}`);
  if (f.countries.size) parts.push(`Country: ${[...f.countries].join(', ')}`);
  if (f.retro !== 'all') parts.push(f.retro === 'retro' ? 'Retroactive only' : 'Current-month only');
  $('#filter-status').textContent = parts.length ? parts.join(' · ') : `${fmtNum(data.length)} claims shown`;
}

// ---------- Charts ----------
function tally(arr, accessor) {
  const out = {};
  arr.forEach(item => {
    const vals = accessor(item);
    (Array.isArray(vals) ? vals : [vals]).forEach(v => {
      if (v == null || v === '') return;
      out[v] = (out[v] || 0) + 1;
    });
  });
  return out;
}

function destroyChart(key) {
  if (STATE.charts[key]) { STATE.charts[key].destroy(); STATE.charts[key] = null; }
}

function renderMonthChart() {
  destroyChart('month');
  const data = STATE.filtered;
  const months = [...new Set(data.map(c => c.claim_month).filter(Boolean))].sort();
  const actors = [...new Set(data.map(c => c.actor).filter(Boolean))].sort();
  // Order actors by total descending for visual sense
  const actorTotals = tally(data, c => c.actor);
  actors.sort((a, b) => (actorTotals[b] || 0) - (actorTotals[a] || 0));

  const datasets = actors.map((actor, i) => ({
    label: actor,
    data: months.map(m => data.filter(c => c.claim_month === m && c.actor === actor).length),
    backgroundColor: PALETTE[i % PALETTE.length],
    borderWidth: 0,
    stack: 's1',
  }));

  STATE.charts.month = new Chart($('#chart-month'), {
    type: 'bar',
    data: { labels: months.map(fmtMonth), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { color: COLORS.muted } },
        y: { stacked: true, beginAtZero: true,
             grid: { color: COLORS.grid }, ticks: { color: COLORS.muted, precision: 0 } },
      },
      plugins: {
        legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            footer: items => {
              const total = items.reduce((s, i) => s + i.parsed.y, 0);
              return `Total: ${total}`;
            },
          },
        },
      },
    },
  });
}

function renderBarChart(canvasId, key, accessor, labelKey, opts = {}) {
  destroyChart(key);
  const counts = tally(STATE.filtered, accessor);
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, opts.limit || 15);
  STATE.charts[key] = new Chart($(canvasId), {
    type: 'bar',
    data: {
      labels: sorted.map(x => x[0]),
      datasets: [{
        data: sorted.map(x => x[1]),
        backgroundColor: opts.color || COLORS.accent,
        borderWidth: 0,
        borderRadius: 0,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      indexAxis: 'y',
      scales: {
        x: { beginAtZero: true, grid: { color: COLORS.grid }, ticks: { color: COLORS.muted, precision: 0 } },
        y: { grid: { display: false }, ticks: { color: COLORS.textSoft, font: { size: 11 } } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { displayColors: false },
      },
    },
  });
}

function renderFatalitiesChart() {
  destroyChart('fatalities');
  const data = STATE.filtered;
  const months = [...new Set(data.map(c => c.claim_month).filter(Boolean))].sort();
  const fatByMonth = months.map(m => data.filter(c => c.claim_month === m).reduce((s, c) => s + (c.fatalities || 0), 0));
  STATE.charts.fatalities = new Chart($('#chart-fatalities'), {
    type: 'line',
    data: {
      labels: months.map(fmtMonth),
      datasets: [{
        label: 'Reported fatalities',
        data: fatByMonth,
        borderColor: COLORS.danger,
        backgroundColor: 'rgba(226, 109, 109, 0.12)',
        borderWidth: 2,
        fill: true,
        tension: 0.25,
        pointRadius: 4,
        pointBackgroundColor: COLORS.danger,
        pointBorderWidth: 0,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { color: COLORS.muted } },
        y: { beginAtZero: true, grid: { color: COLORS.grid }, ticks: { color: COLORS.muted, precision: 0 } },
      },
      plugins: { legend: { display: false } },
    },
  });
}

function renderCharts() {
  renderMonthChart();
  renderBarChart('#chart-actor', 'actor', c => c.actor, 'actor', { color: COLORS.accent });
  renderBarChart('#chart-country', 'country', c => c.country, 'country', { color: '#6cc1d8' });
  renderBarChart('#chart-event', 'event', c => c.event_types, 'event_types', { color: '#b6c454', limit: 12 });
  renderBarChart('#chart-target', 'target', c => c.target_types, 'target_types', { color: '#c592d8', limit: 12 });
  renderBarChart('#chart-weapon', 'weapon', c => c.weapon_types, 'weapon_types', { color: '#d89c6c', limit: 12 });
  renderFatalitiesChart();
}

// ---------- Table ----------
function renderTable() {
  const search = STATE.filters.search;
  let rows = STATE.filtered;
  if (search) {
    rows = rows.filter(c =>
      (c.country || '').toLowerCase().includes(search) ||
      (c.location || '').toLowerCase().includes(search) ||
      (c.summary || '').toLowerCase().includes(search) ||
      (c.actor || '').toLowerCase().includes(search)
    );
  }
  // Sort
  const { key, dir } = STATE.sort;
  rows = [...rows].sort((a, b) => {
    let av = a[key], bv = b[key];
    if (av == null) av = ''; if (bv == null) bv = '';
    if (typeof av === 'number' || typeof bv === 'number') {
      av = Number(av) || 0; bv = Number(bv) || 0;
      return dir === 'asc' ? av - bv : bv - av;
    }
    return dir === 'asc' ? String(av).localeCompare(bv) : String(bv).localeCompare(av);
  });

  // Pagination
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / STATE.pageSize));
  if (STATE.page >= totalPages) STATE.page = totalPages - 1;
  if (STATE.page < 0) STATE.page = 0;
  const start = STATE.page * STATE.pageSize;
  const pageRows = rows.slice(start, start + STATE.pageSize);

  // Header sort indicators
  $$('thead th[data-sort]').forEach(th => {
    th.classList.remove('sorted-asc', 'sorted-desc');
    if (th.dataset.sort === key) th.classList.add(dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
  });

  // Body
  const tbody = $('#claims-tbody');
  tbody.innerHTML = pageRows.map(c => `
    <tr>
      <td class="mono-cell">${fmtDate(c.claim_date)}</td>
      <td class="mono-cell">${fmtDate(c.event_date)}</td>
      <td>${c.retroactive ? '<span class="retro-tag">RETRO</span>' : ''}</td>
      <td><span class="actor-tag">${escapeHtml(c.actor || '')}</span></td>
      <td><span class="country-tag">${escapeHtml(c.country || '')}</span></td>
      <td>${escapeHtml(c.location || '')}</td>
      <td><div class="chip-list">${(c.event_types || []).map(t => `<span class="chip">${escapeHtml(t)}</span>`).join('')}</div></td>
      <td><div class="chip-list">${(c.target_types || []).map(t => `<span class="chip">${escapeHtml(t)}</span>`).join('')}</div></td>
      <td><div class="chip-list">${(c.weapon_types || []).map(t => `<span class="chip">${escapeHtml(t)}</span>`).join('')}</div></td>
      <td class="right">${fmtNum(c.fatalities)}</td>
      <td class="summary-cell">${escapeHtml(c.summary || '')}</td>
    </tr>
  `).join('');

  $('#table-count').textContent = `${fmtNum(total)} match${total === 1 ? '' : 'es'}`;
  $('#pg-info').textContent = `Page ${STATE.page + 1} / ${totalPages}`;
  $('#pg-prev').disabled = STATE.page === 0;
  $('#pg-next').disabled = STATE.page >= totalPages - 1;
}

// ---------- Master render ----------
function applyAndRender() {
  applyFilters();
  STATE.page = 0;
  renderKPIs();
  renderCharts();
  renderTable();
}

function renderMeta() {
  // Latest claim date as "last update"
  const latest = STATE.raw.reduce((m, c) => {
    if (!c.claim_date) return m;
    return !m || c.claim_date > m ? c.claim_date : m;
  }, null);
  const earliest = STATE.raw.reduce((m, c) => {
    if (!c.claim_date) return m;
    return !m || c.claim_date < m ? c.claim_date : m;
  }, null);
  $('#meta-updated').textContent = latest ? fmtDate(latest) : '—';
  $('#meta-total').textContent = fmtNum(STATE.raw.length);
  $('#meta-range').textContent = earliest && latest ? `${fmtMonth(earliest.slice(0,7))} – ${fmtMonth(latest.slice(0,7))}` : '—';
  $('#foot-build').textContent = `Built ${new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}`;
}

// ---------- Boot ----------
(async function () {
  await loadData();
  renderMeta();
  initFilters();
  applyAndRender();
})();
