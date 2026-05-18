/* Add Claim form — generates an Excel-pastable row and JSON entry. */

const ET_SLOTS = 5, TT_SLOTS = 3, WT_SLOTS = 5;
let REF = {};

const $ = sel => document.querySelector(sel);

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function flash(message, type = 'error') {
  const el = $('#form-flash');
  el.textContent = message;
  el.className = `flash ${type}`;
  if (type !== 'error') setTimeout(() => { el.className = 'flash'; }, 4000);
}

function buildSlotSelect(list, name, idx) {
  const opts = ['<option value=""></option>', ...list.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`)].join('');
  return `<select class="multi-select" data-name="${name}" data-idx="${idx}">${opts}</select>`;
}

function buildMultiSlots(containerId, slots, list, name) {
  const c = $('#' + containerId);
  c.innerHTML = '';
  for (let i = 0; i < slots; i++) {
    c.insertAdjacentHTML('beforeend', `<div class="multi-slot" style="margin-bottom: 6px;">${buildSlotSelect(list, name, i)}</div>`);
  }
}

async function loadReference() {
  try {
    const res = await fetch('data/reference.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    REF = await res.json();
  } catch (e) {
    flash(`Cannot load reference.json: ${e.message}. If running locally, serve over HTTP (python3 -m http.server). Falling back to minimal lists.`, 'error');
    REF = {
      Actors: ['ISWAP','ISCAP','ISGS','ISKP','ISPP','IS-Moz','Daesh-Syria','Daesh-Iraq'],
      'Event Types': ['Abduction','Ambush','Arson','Assassination','Execution','Explosion','Military Assault or Raid'],
      'Target Types': ['Civilians','Government','Military','NSAG','Police/Security'],
      'Weapon Types': ['SALW','LMG','IED','Explosives','Knife','Mortar'],
      Countries: ['Iraq','Mali','Mozambique','Niger','Nigeria','Pakistan','Syria'],
    };
  }
}

function fillDropdowns() {
  const actorSel = $('#actor');
  actorSel.innerHTML = '<option value=""></option>' +
    (REF['Actors'] || []).map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  const countrySel = $('#country');
  countrySel.innerHTML = '<option value=""></option>' +
    (REF['Countries'] || []).map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  buildMultiSlots('event-types-slots', ET_SLOTS, REF['Event Types'] || [], 'event_type');
  buildMultiSlots('target-types-slots', TT_SLOTS, REF['Target Types'] || [], 'target_type');
  buildMultiSlots('weapon-types-slots', WT_SLOTS, REF['Weapon Types'] || [], 'weapon_type');
}

function getMultiValues(name) {
  return [...document.querySelectorAll(`select.multi-select[data-name="${name}"]`)]
    .map(s => s.value).filter(v => v);
}

function checkRetro() {
  const e = $('#event_date').value;
  const c = $('#claim_date').value;
  const hint = $('#retro-hint');
  if (e && c) {
    const eMonth = e.slice(0, 7), cMonth = c.slice(0, 7);
    if (eMonth !== cMonth) {
      hint.textContent = '⚠ Different month — will be flagged as Retroactive';
      hint.style.color = 'var(--danger)';
    } else {
      hint.textContent = '';
    }
  } else {
    hint.textContent = '';
  }
}

function buildRow(data) {
  // Excel column order from the Claims Log:
  // A=No.(auto), B=Event Date, C=Claim Date, D=Retroactive(auto),
  // E=Actor, F=Country, G=Location Details,
  // H-L=Event Type 1-5, M-O=Target Type 1-3, P-T=Weapon Type 1-5,
  // U=Fatalities, V=Event Summary, W=Other
  //
  // User pastes starting from column B, so we omit column A.
  // Retroactive (col D) is also a formula — but we need a placeholder column for paste alignment.
  // The simplest fix: emit cells from B to W, leaving D blank (the formula in the sheet stays put
  // because paste fills B,C,E,F... in order). Actually when pasting tab-separated with an empty
  // value at position D, Excel WILL overwrite D's formula with an empty cell. So we need to handle this.
  //
  // Approach: emit two ranges separately, but easiest UX is one tab string from B onwards
  // and tell the user to paste at B, accepting that D's formula gets overwritten — but column D's
  // formula relies on B and C in the same row, so after paste we can re-enter the formula or just
  // re-trigger by clicking the cell. Better: include the formula text in the tab string.
  //
  // We'll include the actual formula as the D-column value:
  // =IF(AND(ISNUMBER(B{r}),ISNUMBER(C{r})),IF(TEXT(B{r},"yyyy-mm")<>TEXT(C{r},"yyyy-mm"),"Y","N"),"")
  // But the row number is unknown. We can use INDIRECT or relative refs without absolute row.
  // Simplest: use the formula with relative refs based on the current row reference syntax that
  // works when pasted. Excel pastes formulas with adjusted references. So the formula text
  // referring to B2/C2 will adjust when pasted at row N — assuming Excel parses it as a formula.
  //
  // Tab-separated paste does parse formula strings starting with = as formulas in most builds.

  const fields = [];
  // B = Event Date (yyyy-mm-dd format works in Excel)
  fields.push(data.event_date);
  // C = Claim Date
  fields.push(data.claim_date);
  // D = Retroactive — use a formula that uses row-relative references. Excel parses formulas
  // pasted from tab text. Reference syntax: B<row>/C<row>. Since we don't know the row, use
  // a formula that references the cells to the left in the same row. We can't use R1C1 in
  // typical pasted formulas, but we CAN use a formula that hardcodes 2 — Excel WILL adjust
  // when pasted because formula references in paste are relative.
  // Actually no — Excel only adjusts on copy/paste from within Excel. Pasting from text uses
  // the literal text. So B2 stays B2 regardless of where it's pasted.
  //
  // Workaround: emit "Y" or "N" directly based on the form data (we already know).
  // The user can clear D if they want the formula to take over, but a direct value is simpler.
  const retro = (data.event_date.slice(0, 7) !== data.claim_date.slice(0, 7)) ? 'Y' : 'N';
  fields.push(retro);
  // E = Actor
  fields.push(data.actor);
  // F = Country
  fields.push(data.country);
  // G = Location Details
  fields.push(data.location);
  // H-L = Event Types 1-5
  for (let i = 0; i < ET_SLOTS; i++) fields.push(data.event_types[i] || '');
  // M-O = Target Types 1-3
  for (let i = 0; i < TT_SLOTS; i++) fields.push(data.target_types[i] || '');
  // P-T = Weapon Types 1-5
  for (let i = 0; i < WT_SLOTS; i++) fields.push(data.weapon_types[i] || '');
  // U = Fatalities
  fields.push(data.fatalities);
  // V = Event Summary
  fields.push(data.summary.replace(/\t/g, ' ').replace(/\n/g, ' '));
  // W = Other
  fields.push(data.other || '');

  return fields.join('\t');
}

function buildJson(data) {
  return {
    event_date: data.event_date,
    claim_date: data.claim_date,
    claim_month: data.claim_date.slice(0, 7),
    event_month: data.event_date.slice(0, 7),
    retroactive: data.event_date.slice(0, 7) !== data.claim_date.slice(0, 7),
    actor: data.actor,
    country: data.country,
    location: data.location,
    event_types: data.event_types,
    target_types: data.target_types,
    weapon_types: data.weapon_types,
    fatalities: Number(data.fatalities) || 0,
    summary: data.summary,
    other: data.other || null,
  };
}

function handleSubmit(ev) {
  ev.preventDefault();
  const data = {
    event_date: $('#event_date').value,
    claim_date: $('#claim_date').value,
    actor: $('#actor').value.trim(),
    country: $('#country').value.trim(),
    location: $('#location').value.trim(),
    event_types: getMultiValues('event_type'),
    target_types: getMultiValues('target_type'),
    weapon_types: getMultiValues('weapon_type'),
    fatalities: $('#fatalities').value || '0',
    summary: $('#summary').value.trim(),
    other: $('#other').value.trim(),
  };

  // Validate
  const errs = [];
  if (!data.event_date) errs.push('Event date');
  if (!data.claim_date) errs.push('Claim date');
  if (!data.actor) errs.push('Actor');
  if (!data.country) errs.push('Country');
  if (!data.location) errs.push('Location');
  if (data.event_types.length === 0) errs.push('At least one event type');
  if (data.target_types.length === 0) errs.push('At least one target type');
  if (data.weapon_types.length === 0) errs.push('At least one weapon type');
  if (!data.summary) errs.push('Summary');
  if (errs.length) { flash('Missing: ' + errs.join(', '), 'error'); return; }
  if (data.event_date > data.claim_date) {
    flash('Event date is later than claim date — please double-check.', 'error');
    return;
  }

  const row = buildRow(data);
  const json = JSON.stringify(buildJson(data), null, 2);

  $('#output-row').textContent = row;
  $('#output-json').textContent = json;
  $('#output').classList.add('show');
  $('#output').scrollIntoView({ behavior: 'smooth', block: 'start' });
  flash('Row generated. Copy and paste into the Excel.', 'info');
}

function copyToClipboard(elId, btn) {
  const text = $('#' + elId).textContent;
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.textContent;
    btn.textContent = '✓ Copied';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = original; btn.classList.remove('copied'); }, 2000);
  }).catch(() => {
    flash('Clipboard not available — manually select and copy the text above.', 'error');
  });
}

(async function () {
  await loadReference();
  fillDropdowns();
  $('#event_date').addEventListener('change', checkRetro);
  $('#claim_date').addEventListener('change', checkRetro);
  $('#claim-form').addEventListener('submit', handleSubmit);
  $('#form-reset').addEventListener('click', () => {
    setTimeout(() => {
      $('#output').classList.remove('show');
      $('#retro-hint').textContent = '';
      $('#form-flash').className = 'flash';
    }, 0);
  });
  $('#copy-row').addEventListener('click', e => copyToClipboard('output-row', e.target));
  $('#copy-json').addEventListener('click', e => copyToClipboard('output-json', e.target));
})();
