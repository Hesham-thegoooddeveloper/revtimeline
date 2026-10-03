import {
  day,
  iso,
  visibleDate,
  updateEvent,
  canConnect,
  validateTask,
  removeEvent,
  migrate,
  checkData,
  projectTotals,
  termsPercent,
} from './model.mjs';
import { sample } from './sample.mjs';
import {
  openActions,
  nextAction,
  projectStatus,
  dueSoon,
  contractValue,
  historyCounts,
} from './portfolio.mjs';
const $ = (id) => document.getElementById(id),
  key = 'trackflow-prototype-v1';
function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // randomUUID needs a secure context (HTTPS or localhost); getRandomValues does not.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const dateLabel = (s) =>
  s
    ? new Date(s + 'T12:00:00Z').toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '—';
const shortDate = (s) =>
  new Date(s + 'T12:00:00Z').toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  });
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
function readStored(raw) {
  const parsed = migrate(JSON.parse(raw)),
    error = checkData(parsed);
  if (error) throw Error(error);
  return parsed;
}
// Keep a copy of unreadable saved data so later saves never destroy it.
function keepUnreadable(raw) {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith(key + '.unreadable-') && localStorage.getItem(k) === raw) return true;
    }
    localStorage.setItem(`${key}.unreadable-${Date.now()}`, raw);
    return true;
  } catch {
    return false;
  }
}
let data,
  stored = null,
  unreadable = null,
  saveBlocked = false;
try {
  stored = localStorage.getItem(key);
} catch {}
try {
  data = stored ? readStored(stored) : migrate(structuredClone(sample));
} catch {
  unreadable = stored;
  saveBlocked = !keepUnreadable(stored);
  data = migrate(structuredClone(sample));
}
let active = data.projects[0].id,
  editing = null,
  creating = null,
  focusedTask = null,
  lastFocus = null,
  nameMode = 'task',
  drag = null,
  panning = false,
  toastTimer,
  connection = null,
  viewZoom = {},
  undoStack = [],
  redoStack = [],
  pendingImport = null,
  suppressClickUntil = 0,
  view = 'portfolio';
const geometry = new Map(),
  project = () => data.projects.find((p) => p.id === active),
  taskBy = (id) => project().tasks.find((t) => t.id === id);
// Screens are addressed as #/portfolio and #/project/<id> so a reload keeps your place.
function route() {
  const match = location.hash.match(/^#\/project\/([A-Za-z0-9_-]+)$/);
  if (match && data.projects.some((p) => p.id === match[1])) {
    if (active !== match[1]) viewZoom = {};
    active = match[1];
    view = 'project';
  } else view = 'portfolio';
}
function ensureActive() {
  if (data.projects.some((p) => p.id === active)) return;
  active = data.projects[0].id;
  if (view === 'project') {
    view = 'portfolio';
    history.replaceState(null, '', '#/portfolio');
  }
}
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
// True when the first strong character is right-to-left (Arabic or Hebrew).
const isRtl = (s) => /^[^A-Za-z֐-ࣿ]*[֐-ࣿ]/.test(s);
function save() {
  if (saveBlocked) {
    $('saved').textContent = 'Not saved';
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(data));
    $('saved').textContent = 'Saved on this device';
  } catch {
    $('saved').textContent = 'Saving unavailable';
    toast('Your browser could not save these changes.');
  }
}
function toast(s) {
  $('toast').textContent = s;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('toast').hidden = true), 5500);
}
function commit(fn) {
  const snapshot = structuredClone(data);
  let error;
  try {
    error = fn();
  } catch (err) {
    console.error(err);
    error = 'Something went wrong, so this change was not saved.';
  }
  if (error) {
    data = snapshot;
    render();
    if (focusedTask) renderTaskDialog();
    toast(error);
    return false;
  }
  undoStack.push(snapshot);
  if (undoStack.length > 100) undoStack.shift();
  redoStack = [];
  viewZoom = {};
  save();
  render();
  if (focusedTask) renderTaskDialog();
  return true;
}
function restore(kind) {
  const source = kind === 'undo' ? undoStack : redoStack,
    dest = kind === 'undo' ? redoStack : undoStack;
  if (!source.length) return;
  dest.push(structuredClone(data));
  data = source.pop();
  ensureActive();
  if (focusedTask && !taskBy(focusedTask)) closeTask();
  viewZoom = {};
  save();
  render();
  if (focusedTask) renderTaskDialog();
  toast(kind === 'undo' ? 'Last action undone' : 'Action redone');
}
function bounds(t, width, surface) {
  const dates = t.events.map((e) => day(visibleDate(e))),
    start = dates.length ? Math.min(...dates) : day(today()),
    end = dates.length ? Math.max(...dates) : start + 14,
    zoom = viewZoom[surface + ':' + t.id] || 1,
    pad = 78,
    span = Math.max(1, end - start),
    fitScale = Math.max(0.001, (width - pad * 2) / span),
    scale = fitScale * zoom,
    canvasWidth = Math.max(width, pad * 2 + span * scale);
  return {
    start,
    end,
    width: canvasWidth,
    scale,
    pad,
    zoom,
    x: (s) => pad + (day(s) - start) * scale,
  };
}
function icon(name) {
  return { expand: '⛶', fit: '↔', plus: '＋', minus: '−' }[name];
}
function taskMarkup(t, width, surface = 'main') {
  const b = bounds(t, Math.max(240, width), surface),
    lanes = [...new Set(t.events.map((e) => e.lane))].sort((a, b) => a - b),
    nodes = new Map();
  let y = 0;
  for (const lane of lanes) {
    const list = t.events
        .filter((e) => e.lane === lane)
        .sort((a, c) => day(visibleDate(a)) - day(visibleDate(c))),
      last = [];
    for (const e of list) {
      const x = b.x(visibleDate(e)),
        left = x - 70;
      let tier = last.findIndex((r) => r < left - 10);
      if (tier < 0) tier = last.length;
      last[tier] = x + 70;
      nodes.set(e.id, { x, labelY: y + 16 + tier * 52 });
    }
    const nodeY = y + Math.max(1, last.length) * 52 + 38,
      nodeTracks = [];
    for (const e of list) {
      const n = nodes.get(e.id);
      let track = nodeTracks.findIndex((r) => r < n.x - 32);
      if (track < 0) track = nodeTracks.length;
      nodeTracks[track] = n.x + 32;
      n.y = nodeY + track * 46;
    }
    y = nodeY + Math.max(0, nodeTracks.length - 1) * 46 + 52;
  }
  const height = Math.max(172, y + 12);
  geometry.set(surface + ':' + t.id, { ...b, nodes });
  let svg = `<defs><marker id="arrow-${surface}-${t.id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path class="arrow-head" d="M 0 0 L 10 5 L 0 10 z"/></marker></defs>`;
  for (let i = 0; i < t.edges.length; i++) {
    const [a, c, reverse] = t.edges[i],
      n = nodes.get(a),
      m = nodes.get(c);
    if (!n || !m) continue;
    const ax = n.x + 9,
      cx = m.x - 9,
      mid = (ax + cx) / 2,
      path = `M ${ax} ${n.y} C ${mid} ${n.y}, ${mid} ${m.y}, ${cx} ${m.y}`,
      mx = (n.x + m.x) / 2,
      my = (n.y + m.y) / 2;
    svg += `<path class="edge-hit" data-edge="${i}" data-task="${t.id}" d="${path}" fill="none" stroke="transparent" stroke-width="18" tabindex="0" role="button" aria-label="Edit connection direction"/><path class="edge" d="${path}" marker-${reverse ? 'start' : 'end'}="url(#arrow-${surface}-${t.id})" pointer-events="none"/><g class="between-add" data-between="${i}" data-task="${t.id}" tabindex="0" role="button" aria-label="Insert event between connected events"><circle class="hit" cx="${mx}" cy="${my}" r="17"/><circle class="add-ring" cx="${mx}" cy="${my}" r="9"/><text class="add-plus" x="${mx}" y="${my + 4}" text-anchor="middle">+</text></g>`;
  }
  for (const e of t.events) {
    const n = nodes.get(e.id),
      short = e.description.length > 21 ? e.description.slice(0, 20) + '…' : e.description,
      // Arabic labels start at the right edge of their box and run leftward.
      labelAt = isRtl(e.description) ? `direction="rtl" x="${n.x + 62}"` : `x="${n.x - 62}"`;
    svg += `<g class="node" data-event="${e.id}" data-task="${t.id}" tabindex="0" role="button" aria-label="${esc(e.description)}, ${dateLabel(visibleDate(e))}"><rect class="label-box ${e.kind}" x="${n.x - 70}" y="${n.labelY - 4}" width="140" height="43" rx="2"/><text class="event-label" ${labelAt} y="${n.labelY + 12}">${esc(short)}</text><text class="event-kind" x="${n.x - 62}" y="${n.labelY + 29}">${e.kind === 'fact' ? 'Recorded event' : e.done ? 'Completed action' : 'Action needed'}</text><line class="stem" x1="${n.x}" x2="${n.x}" y1="${n.labelY + 39}" y2="${n.y - 12}"/><circle class="hit" cx="${n.x}" cy="${n.y}" r="20"/><circle class="event-circle ${e.kind} ${e.done ? 'done' : 'open'}" cx="${n.x}" cy="${n.y}" r="8"/>${e.done ? `<path class="tick" d="M ${n.x - 3} ${n.y} l 2 2 l 4 -4"/>` : ''}<text class="event-date" x="${n.x}" y="${n.y + 27}" text-anchor="middle">${shortDate(visibleDate(e))}</text></g><g class="port" data-port="${e.id}" data-task="${t.id}" tabindex="0" role="button" aria-label="Add or branch from ${esc(e.description)}"><circle class="hit" cx="${n.x + 25}" cy="${n.y}" r="13"/><circle class="add-ring" cx="${n.x + 25}" cy="${n.y}" r="6"/><text class="add-plus" x="${n.x + 25}" y="${n.y + 3}" text-anchor="middle" style="font-size:11px">+</text></g>`;
  }
  const canvas = t.events.length
    ? `<svg class="task-canvas" data-canvas="${t.id}" data-surface="${surface}" width="${b.width}" height="${height}" role="group" aria-label="${esc(t.name)} timeline">${svg}</svg>`
    : `<div class="empty-task">No events yet. <button class="button" data-first="${t.id}">＋ Add first event</button></div>`;
  return `<div class="task-workspace" data-workspace="${t.id}"><div class="task-scroll ${panning ? 'panning' : ''}" data-scroll="${t.id}" data-surface="${surface}">${canvas}</div><div class="task-bottom"><span class="task-span">${t.events.length ? shortDate(iso(b.start)) + ' – ' + shortDate(iso(b.end)) : ''}</span><div class="task-zoom"><button class="icon-button" data-zoom="out" data-task="${t.id}" data-surface="${surface}" aria-label="Zoom out ${esc(t.name)}">${icon('minus')}</button><span>${Math.round(b.zoom * 100)}%</span><button class="icon-button" data-zoom="in" data-task="${t.id}" data-surface="${surface}" aria-label="Zoom in ${esc(t.name)}">${icon('plus')}</button><button class="icon-button" data-fit="${t.id}" data-surface="${surface}" aria-label="Fit ${esc(t.name)} timeline">${icon('fit')}</button>${surface === 'main' ? `<button class="icon-button" data-expand="${t.id}" aria-label="Open ${esc(t.name)} in a larger window">${icon('expand')}</button>` : ''}</div></div></div>`;
}
const number = (n) => n.toLocaleString('en-GB', { maximumFractionDigits: 2 }),
  money = (n, currency) => (n === null ? '—' : `${currency ? currency + ' ' : ''}${number(n)}`);
const STATUS = {
  overdue: ['c-bad', (s) => `${s.overdue} overdue`],
  'on-track': ['c-good', () => 'On track'],
  idle: ['c-hold', () => 'No open actions'],
};
function statusChip(p) {
  const s = projectStatus(p, today()),
    [cls, text] = STATUS[s.key];
  return `<span class="chip ${cls}">${text(s)}</span>`;
}
function render() {
  hideHover();
  ensureActive();
  renderRail();
  $('portfolio-view').hidden = view !== 'portfolio';
  $('project-view').hidden = view !== 'project';
  if (view === 'portfolio') renderPortfolio();
  else renderProject();
}
function renderRail() {
  const now = today();
  if (view === 'portfolio') $('portfolio-nav').setAttribute('aria-current', 'page');
  else $('portfolio-nav').removeAttribute('aria-current');
  $('portfolio-count').textContent = data.projects.length;
  $('project-nav').innerHTML = data.projects
    .map(
      (p) =>
        `<a class="project-link" href="#/project/${p.id}"${view === 'project' && p.id === active ? ' aria-current="page"' : ''}><i class="${STATUS[projectStatus(p, now).key][0]}"></i><span dir="auto">${esc(p.name)}</span></a>`,
    )
    .join('');
}
function spark({ done, open }) {
  const total = done + open;
  if (!total) return '<span class="muted">No events</span>';
  const n = Math.min(total, 7),
    filled = Math.round((done / total) * n);
  let dots = '';
  for (let i = 0; i < n; i++) {
    const x = 5 + i * 16.5;
    dots +=
      i < filled
        ? `<circle class="sd" cx="${x}" cy="7" r="3.5"/>`
        : `<circle class="so" cx="${x}" cy="7" r="3.2"/>`;
  }
  return `<svg class="spark" viewBox="0 0 110 14" role="img" aria-label="${done} finished, ${open} open"><path class="sl" d="M4 7h102"/>${dots}</svg>`;
}
function kpi(label, value, note, cls = '') {
  return `<div><span class="label">${label}</span><strong class="${cls}">${value}</strong><small>${note}</small></div>`;
}
function renderPortfolio() {
  const now = today(),
    projects = data.projects,
    statuses = projects.map((p) => projectStatus(p, now)),
    open = statuses.reduce((n, s) => n + s.open, 0),
    overdue = statuses.reduce((n, s) => n + s.overdue, 0),
    lateProjects = statuses.filter((s) => s.overdue).length,
    soon = dueSoon(projects, now),
    values = contractValue(projects),
    valued = projects.filter((p) => Number.isFinite(p.details?.value)).length;
  $('today-label').textContent = new Date(now + 'T12:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  $('kpis').innerHTML =
    kpi(
      'Projects',
      projects.length,
      lateProjects ? `${plural(lateProjects, 'project')} with overdue actions` : 'None overdue',
    ) +
    kpi('Open actions', open, `${soon.filter((x) => !x.late).length} due in the next 7 days`) +
    kpi(
      'Overdue actions',
      overdue,
      overdue ? `Across ${plural(lateProjects, 'project')}` : 'Nothing overdue',
      overdue ? 'bad' : '',
    ) +
    kpi(
      'Contract value',
      values.length ? values.map((v) => esc(money(v.total, v.currency))).join('<br>') : '—',
      values.length
        ? `Excl. VAT · ${valued} of ${plural(projects.length, 'project')}`
        : 'Add values in project details',
    );
  $('project-table').innerHTML =
    '<div class="prow head"><span class="label">Project</span><span class="label">Status</span><span class="label">Next action</span><span class="label">History</span><span class="label end">Value excl. VAT</span></div>' +
    projects
      .map((p) => {
        const d = p.details || {},
          next = nextAction(p),
          late = next && day(next.event.scheduled) < day(now);
        return (
          `<a class="prow" href="#/project/${p.id}"><div class="nm"><b dir="auto">${esc(p.name)}</b><span dir="auto">${esc(d.customer || p.description || '')}</span></div>` +
          `<span>${statusChip(p)}</span>` +
          `<div class="nx">${next ? `<b class="${late ? 'late' : ''}" dir="auto">${esc(next.event.description)}</b><span><bdi>${esc(next.task.name)}</bdi> · ${late ? 'was due' : 'due'} ${dateLabel(next.event.scheduled)}</span>` : '<span>No open actions</span>'}</div>` +
          spark(historyCounts(p)) +
          `<div class="val">${Number.isFinite(d.value) ? `${number(d.value)}<small>${esc(d.currency || '')}</small>` : '<small>Not set</small>'}</div></a>`
        );
      })
      .join('');
  $('due-count').textContent = soon.length ? plural(soon.length, 'action') : '';
  $('due-list').innerHTML = soon.length
    ? soon
        .map((x) => {
          const [dd, mon] = shortDate(x.event.scheduled).split(' '),
            lateBy = day(now) - day(x.event.scheduled);
          return `<a class="d${x.late ? ' late' : ''}" href="#/project/${x.project.id}"><span class="dt"><b>${dd}</b>${mon}</span><div><bdi>${esc(x.event.description)}</bdi><span><bdi>${esc(x.project.name)}</bdi> · <bdi>${esc(x.task.name)}</bdi>${x.late ? ` · ${plural(lateBy, 'day')} late` : ''}</span></div></a>`;
        })
        .join('')
    : '<p class="empty">Nothing is due in the next 7 days.</p>';
}
function renderProject() {
  const p = project(),
    d = p.details || {},
    events = p.tasks.flatMap((t) => t.events);
  $('crumb-project').textContent = p.name;
  $('project-title').textContent = p.name;
  $('project-ref').textContent = d.customer || '';
  $('project-status').innerHTML = statusChip(p);
  $('project-description').textContent = p.description || '';
  renderOverview(p);
  renderNext(p);
  $('task-count').textContent =
    `${plural(p.tasks.length, 'task')} · ${plural(events.length, 'event')}`;
  const width = Math.max(240, $('viewport').clientWidth - 36);
  $('timeline-content').innerHTML = p.tasks.length
    ? p.tasks
        .map(
          (t) =>
            `<div class="task-row"><div class="task-label"><span class="task-name" dir="auto">${esc(t.name)}</span><span class="task-meta">${plural(t.events.length, 'event')} · ${new Set(t.events.map((e) => e.lane)).size > 1 ? 'Parallel paths' : 'Main path'}</span></div>${taskMarkup(t, width)}</div>`,
        )
        .join('')
    : '<div class="empty-task">No tasks yet. Add a task to start its timeline.</div>';
  $('undo').disabled = !undoStack.length;
  $('redo').disabled = !redoStack.length;
}
function renderOverview(p) {
  const d = p.details || {},
    totals = projectTotals(d),
    terms = d.paymentTerms || [],
    sum = termsPercent(d);
  if (!d.customer && !d.scope && totals.value === null && !terms.length) {
    $('overview').innerHTML =
      '<div class="tblock-empty"><p>Add the customer, scope, value, VAT rate and payment terms to see the commercial summary here.</p><button class="button small" data-edit-project>Add project details</button></div>';
  } else {
    const cell = (label, value, note, cls = '') =>
      `<div><span class="label">${label}</span><strong class="${cls}" dir="auto">${value}</strong><small>${note}</small></div>`;
    $('overview').innerHTML =
      cell('Customer', esc(d.customer || 'Not set'), '', d.customer ? 'text' : 'unset') +
      cell('Scope', esc(d.scope || 'Not set'), '', d.scope ? 'text' : 'unset') +
      cell(
        'Value excl. VAT',
        esc(money(totals.value, d.currency)),
        d.currency ? esc(d.currency) : 'Currency not set',
        totals.value === null ? 'unset' : '',
      ) +
      cell(
        'VAT',
        totals.rate === null ? 'Rate not set' : esc(money(totals.vat, d.currency)),
        totals.rate === null ? 'Add a rate to calculate' : `${number(totals.rate)}% rate`,
        totals.rate === null ? 'unset' : '',
      ) +
      cell(
        'Total incl. VAT',
        esc(money(totals.total, d.currency)),
        totals.total === null ? 'Needs a value and VAT rate' : 'Calculated automatically',
        totals.total === null ? 'unset' : '',
      );
  }
  $('terms-sum').textContent = terms.length ? `Adds up to ${number(sum)}%` : '';
  $('terms-panel').innerHTML = terms.length
    ? `<div class="bar" aria-hidden="true">${terms.map((t) => `<i style="width:${Math.max(0, t.percent || 0)}%"></i>`).join('')}${sum < 100 ? `<i class="rest" style="width:${100 - sum}%"></i>` : ''}</div>` +
      terms
        .map(
          (t) =>
            `<div class="term"><span class="t" dir="auto">${esc(t.label || 'Payment')}</span><b>${t.percent === null || t.percent === undefined ? '—' : number(t.percent) + '%'}</b><span dir="auto">${esc(t.condition || '')}</span></div>`,
        )
        .join('') +
      (sum !== 100
        ? `<p class="terms-note">Payment terms add up to ${number(sum)}%, not 100%.</p>`
        : '')
    : '<p class="empty">No payment terms yet. <button class="tb-edit" data-edit-project>Add them</button></p>';
}
function renderNext(p) {
  const now = day(today()),
    list = openActions(p).sort((a, b) => day(a.event.scheduled) - day(b.event.scheduled));
  $('next-count').textContent = list.length ? `${list.length} open` : '';
  $('next-actions').innerHTML = list.length
    ? list
        .slice(0, 5)
        .map(({ task, event }) => {
          const late = day(event.scheduled) < now,
            moved = event.planned ? day(event.scheduled) - day(event.planned) : 0;
          return `<button class="x${late ? ' late' : ''}" data-open-task="${task.id}" data-open-event="${event.id}"><i></i><b dir="auto">${esc(event.description)}</b><span class="when">${late ? 'Was due ' : ''}${dateLabel(event.scheduled)}</span><span><bdi>${esc(task.name)}</bdi>${moved ? ` · <span class="shift">moved ${moved > 0 ? '+' : '−'}${plural(Math.abs(moved), 'day')}</span>` : ''}</span></button>`;
        })
        .join('') +
      (list.length > 5 ? `<p class="empty">And ${list.length - 5} more on the timeline.</p>` : '')
    : '<p class="empty">No open actions in this project.</p>';
}
$('next-actions').onclick = (e) => {
  const b = e.target.closest('[data-open-event]');
  if (b) openEditor(b.dataset.openTask, b.dataset.openEvent, null, false, b);
};
function termRow(t = {}) {
  const row = document.createElement('div');
  row.className = 'term-row';
  row.innerHTML =
    '<label>Milestone<input class="term-label" maxlength="80" placeholder="e.g. Advance payment"></label>' +
    '<label>Share (%)<input class="term-percent" type="number" min="0" max="100" step="0.01" inputmode="decimal"></label>' +
    '<label class="term-condition-field">Condition<input class="term-condition" maxlength="160" placeholder="e.g. On order confirmation"></label>' +
    '<button type="button" class="icon-button" data-remove-term aria-label="Remove payment term">×</button>';
  row.querySelector('.term-label').value = t.label || '';
  row.querySelector('.term-percent').value = t.percent ?? '';
  row.querySelector('.term-condition').value = t.condition || '';
  return row;
}
const numberField = (id) => ($(id).value.trim() === '' ? null : Number($(id).value));
function readTerms() {
  return [...$('terms-list').querySelectorAll('.term-row')]
    .map((row) => ({
      label: row.querySelector('.term-label').value.trim(),
      percent:
        row.querySelector('.term-percent').value.trim() === ''
          ? null
          : Number(row.querySelector('.term-percent').value),
      condition: row.querySelector('.term-condition').value.trim(),
    }))
    .filter((t) => t.label || t.condition || t.percent !== null);
}
function syncProjectForm() {
  const currency = $('project-currency').value.trim().toUpperCase(),
    totals = projectTotals({
      value: numberField('project-value'),
      vatRate: numberField('project-vat-rate'),
    }),
    sum = termsPercent({ paymentTerms: readTerms() });
  $('project-vat').textContent =
    totals.rate === null ? 'Enter a VAT rate' : money(totals.vat, currency);
  $('project-total').textContent = totals.total === null ? '—' : money(totals.total, currency);
  $('terms-total').textContent = readTerms().length ? `Total ${number(sum)}%` : '';
  $('terms-total').classList.toggle('over', sum > 100);
}
function openProject() {
  const p = project(),
    d = p.details || {};
  $('project-name').value = p.name;
  $('project-summary-input').value = p.description || '';
  $('project-customer').value = d.customer || '';
  $('project-scope').value = d.scope || '';
  $('project-currency').value = d.currency || '';
  $('project-value').value = d.value ?? '';
  $('project-vat-rate').value = d.vatRate ?? '';
  $('terms-list').replaceChildren(...(d.paymentTerms || []).map(termRow));
  $('project-warning').hidden = true;
  syncProjectForm();
  $('project-dialog').showModal();
  $('project-name').focus();
}
$('edit-project').onclick = openProject;
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-edit-project]')) openProject();
});
$('project-form').oninput = syncProjectForm;
$('add-term').onclick = () => {
  const row = termRow();
  $('terms-list').append(row);
  row.querySelector('.term-label').focus();
  syncProjectForm();
};
$('terms-list').onclick = (e) => {
  if (!e.target.closest('[data-remove-term]')) return;
  e.target.closest('.term-row').remove();
  syncProjectForm();
};
$('close-project').onclick = $('cancel-project').onclick = () => $('project-dialog').close();
$('project-form').onsubmit = (e) => {
  e.preventDefault();
  const name = $('project-name').value.trim(),
    terms = readTerms(),
    sum = termsPercent({ paymentTerms: terms });
  if (!name) return;
  if (sum > 100) {
    $('project-warning').textContent =
      `Payment terms add up to ${number(sum)}%. They cannot exceed 100%.`;
    $('project-warning').hidden = false;
    return;
  }
  const id = active;
  commit(() => {
    const p = data.projects.find((x) => x.id === id);
    p.name = name;
    p.description = $('project-summary-input').value.trim();
    p.details = {
      customer: $('project-customer').value.trim(),
      scope: $('project-scope').value.trim(),
      currency: $('project-currency').value.trim().toUpperCase(),
      value: numberField('project-value'),
      vatRate: numberField('project-vat-rate'),
      paymentTerms: terms,
    };
  });
  $('project-dialog').close();
  toast('Project details saved');
};
function renderTaskDialog() {
  const t = taskBy(focusedTask);
  if (!t) return;
  $('task-dialog-title').textContent = t.name;
  $('task-dialog-content').innerHTML = taskMarkup(
    t,
    Math.max(300, $('task-dialog').clientWidth - 48),
    'modal',
  );
}
function openTask(id) {
  focusedTask = id;
  viewZoom['modal:' + id] = 1;
  $('task-dialog').showModal();
  renderTaskDialog();
  $('task-dialog').append($('editor-backdrop'), $('editor'), $('hover-preview'), $('toast'));
}
function closeTask() {
  closeEditor();
  hideHover();
  document.body.append($('editor-backdrop'), $('editor'), $('hover-preview'), $('toast'));
  focusedTask = null;
  $('task-dialog').close();
}
function openEditor(
  tid,
  eid = null,
  from = null,
  branch = false,
  anchor = null,
  suggested = null,
  to = null,
) {
  hideHover();
  lastFocus = document.activeElement;
  editing = eid ? { tid, eid } : null;
  creating = eid ? null : { tid, from, to, branch };
  const t = taskBy(tid),
    e = eid ? t.events.find((x) => x.id === eid) : null;
  $('editor-title').textContent = e ? 'Edit event' : 'New event';
  $('event-description').value = e?.description || '';
  $('event-kind').value = e?.kind || 'fact';
  $('event-done').checked = e?.done || false;
  $('event-date').value = e ? visibleDate(e) : suggested || today();
  $('event-trigger').value = e?.triggered || suggested || today();
  $('event-due').value = e?.scheduled || suggested || today();
  $('event-plan').value = e?.planned || '';
  $('plan-field').hidden = !e || e.kind === 'fact';
  $('branch-field').hidden = !!e || !from || !!to;
  $('event-branch').checked = branch;
  $('delete-event').hidden = !e;
  $('event-warning').hidden = true;
  syncEditor();
  $('editor').hidden = false;
  $('editor-backdrop').hidden = false;
  const r = anchor?.getBoundingClientRect(),
    w = Math.min(420, innerWidth - 24),
    h = $('editor').offsetHeight;
  const left = r ? Math.min(innerWidth - w - 12, Math.max(12, r.left - 70)) : (innerWidth - w) / 2,
    top = r
      ? Math.min(innerHeight - h - 12, Math.max(12, r.bottom + 10))
      : Math.max(12, (innerHeight - h) / 2);
  $('editor').style.left = left + 'px';
  $('editor').style.top = top + 'px';
  $('event-description').focus();
}
function syncEditor() {
  const action = $('event-kind').value === 'action',
    done = $('event-done').checked;
  $('done-field').hidden = !action;
  $('trigger-field').hidden = !action;
  $('due-field').hidden = !action;
  $('event-trigger').required = action;
  $('event-due').required = action;
  $('date-label').textContent = action ? 'Actual completion date' : 'Occurrence date';
  $('event-date').closest('label').hidden = action && !done;
  $('event-date').required = !action || done;
  $('plan-field').hidden = !action || !editing;
  const original = editing
    ? taskBy(editing.tid).events.find((e) => e.id === editing.eid).planned
    : null;
  $('event-meta').textContent = action
    ? original
      ? 'Original due: ' + dateLabel(original)
      : 'The first due date is kept as the original plan.'
    : 'A recorded event has an occurrence date and no due date.';
}
function closeEditor() {
  if ($('editor').hidden) return;
  $('editor').hidden = true;
  $('editor-backdrop').hidden = true;
  editing = null;
  creating = null;
  lastFocus?.focus();
}
$('event-kind').onchange = syncEditor;
$('event-done').onchange = () => {
  if ($('event-done').checked) $('event-date').value = today();
  syncEditor();
};
$('event-form').onsubmit = (ev) => {
  ev.preventDefault();
  const description = $('event-description').value.trim(),
    kind = $('event-kind').value,
    done = kind === 'fact' || $('event-done').checked,
    occurred = kind === 'fact' ? $('event-date').value : null,
    actual = done ? $('event-date').value : null,
    scheduled = kind === 'action' ? $('event-due').value : occurred,
    triggered = kind === 'action' ? $('event-trigger').value : occurred;
  if (!description || !scheduled || !triggered || (done && !actual)) return;
  const ctx = editing || creating,
    tid = ctx.tid;
  let result,
    error,
    valid = commit(() => {
      const t = taskBy(tid);
      if (editing) {
        const existing = t.events.find((e) => e.id === editing.eid);
        result = updateEvent(t, existing.id, {
          description,
          kind,
          done,
          occurred,
          actual,
          scheduled,
          triggered,
          planned: existing.kind === 'action' ? existing.planned : scheduled,
        });
        return (error = result.error);
      }
      const from = t.events.find((e) => e.id === creating.from),
        to = t.events.find((e) => e.id === creating.to),
        branch = $('event-branch').checked && !to,
        lane = branch ? Math.max(0, ...t.events.map((e) => e.lane)) + 1 : from?.lane || 0,
        id = uid();
      t.events.push({
        id,
        description,
        kind,
        done,
        occurred,
        triggered,
        planned: scheduled,
        scheduled,
        actual,
        lane,
      });
      if (from && to) {
        const index = t.edges.findIndex((e) => e[0] === from.id && e[1] === to.id),
          reverse = t.edges[index]?.[2] || false;
        if (index >= 0) t.edges.splice(index, 1);
        t.edges.push([from.id, id, reverse], [id, to.id, reverse]);
      } else if (from) t.edges.push([from.id, id]);
      return (error = validateTask(t));
    });
  if (!valid) {
    $('event-warning').textContent = error || 'This change was not saved.';
    $('event-warning').hidden = false;
    return;
  }
  closeEditor();
  toast(
    result?.shifted
      ? `Saved · ${result.shifted} upcoming actions shifted by ${Math.abs(result.delta)} days`
      : 'Event saved',
  );
};
$('close-editor').onclick = closeEditor;
$('editor-backdrop').onclick = closeEditor;
$('delete-event').onclick = () => $('delete-dialog').showModal();
$('cancel-delete').onclick = () => $('delete-dialog').close();
$('confirm-delete').onclick = () => {
  const ctx = { ...editing };
  commit(() => {
    removeEvent(taskBy(ctx.tid), ctx.eid);
  });
  $('delete-dialog').close();
  closeEditor();
  toast('Event deleted');
};
function openName(mode) {
  nameMode = mode;
  $('name-title').textContent = mode === 'project' ? 'New project' : 'New task';
  $('description-field').hidden = mode !== 'project';
  $('name-input').value = '';
  $('name-description').value = '';
  $('name-dialog').showModal();
  $('name-input').focus();
}
$('new-project').onclick = () => openName('project');
$('add-task').onclick = () => openName('task');
$('close-name').onclick = () => $('name-dialog').close();
$('name-form').onsubmit = (e) => {
  e.preventDefault();
  const name = $('name-input').value.trim();
  if (!name) return;
  commit(() => {
    if (nameMode === 'project') {
      const p = { id: uid(), name, description: $('name-description').value.trim(), tasks: [] };
      data.projects.push(p);
      active = p.id;
    } else project().tasks.push({ id: uid(), name, events: [], edges: [] });
  });
  $('name-dialog').close();
  if (nameMode === 'project') location.hash = '#/project/' + active;
};
$('new-project-main').onclick = () => openName('project');
window.addEventListener('hashchange', () => {
  if (focusedTask) closeTask();
  closeEditor();
  route();
  render();
  scrollTo(0, 0);
});
function insert(tid, index, anchor) {
  const t = taskBy(tid),
    [a, b] = t.edges[index],
    from = t.events.find((e) => e.id === a),
    to = t.events.find((e) => e.id === b),
    start = day(visibleDate(from)),
    end = day(visibleDate(to));
  if (end - start < 2) {
    toast(
      'There is no free day between these events. Add a parallel branch or adjust the dates first.',
    );
    return;
  }
  openEditor(tid, null, a, false, anchor, iso(Math.floor((start + end) / 2)), b);
}
function openConnection(tid, index) {
  connection = { tid, index };
  const t = taskBy(tid),
    edge = t.edges[index],
    a = t.events.find((e) => e.id === edge[0]),
    b = t.events.find((e) => e.id === edge[1]);
  $('connection-summary').textContent = edge[2]
    ? `${b.description} → ${a.description}`
    : `${a.description} → ${b.description}`;
  $('connection-dialog').showModal();
}
function handleClick(e) {
  const target = e.target.closest(
    '[data-first],[data-zoom],[data-fit],[data-expand],[data-between],[data-edge],[data-event]',
  );
  if (!target || drag) return;
  if (target.dataset.first) openEditor(target.dataset.first);
  else if (target.dataset.zoom) {
    const k = target.dataset.surface + ':' + target.dataset.task;
    viewZoom[k] = Math.min(
      8,
      Math.max(0.35, (viewZoom[k] || 1) * (target.dataset.zoom === 'in' ? 1.3 : 1 / 1.3)),
    );
    target.dataset.surface === 'modal' ? renderTaskDialog() : render();
  } else if (target.dataset.fit) {
    viewZoom[target.dataset.surface + ':' + target.dataset.fit] = 1;
    target.dataset.surface === 'modal' ? renderTaskDialog() : render();
  } else if (target.dataset.expand) openTask(target.dataset.expand);
  else if (target.dataset.between !== undefined)
    insert(target.dataset.task, +target.dataset.between, target);
  else if (target.dataset.edge !== undefined)
    openConnection(target.dataset.task, +target.dataset.edge);
  else if (target.dataset.event)
    openEditor(target.dataset.task, target.dataset.event, null, false, target);
}
for (const container of [$('timeline-content'), $('task-dialog-content')]) {
  container.addEventListener(
    'click',
    (e) => {
      if (performance.now() >= suppressClickUntil) return;
      suppressClickUntil = 0;
      e.stopPropagation();
      e.preventDefault();
    },
    true,
  );
  container.addEventListener('click', handleClick);
  container.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const port = e.target.closest('[data-port]');
    if (port) {
      e.preventDefault();
      const from = taskBy(port.dataset.task).events.find((x) => x.id === port.dataset.port);
      openEditor(port.dataset.task, null, from.id, false, port, iso(day(visibleDate(from)) + 1));
    } else if (e.target.matches('g[role=button],path[role=button]')) {
      e.preventDefault();
      handleClick(e);
    }
  });
  container.addEventListener('pointerover', showHover);
  container.addEventListener('focusin', showHover);
  container.addEventListener('pointerout', (e) => {
    if (!e.relatedTarget?.closest?.('[data-event]')) hideHover();
  });
  container.addEventListener('focusout', hideHover);
  container.addEventListener('pointerdown', beginDrag);
}
$('fit').onclick = () => {
  viewZoom = {};
  render();
  if (focusedTask) renderTaskDialog();
};
$('pan').onclick = () => {
  panning = !panning;
  $('pan').setAttribute('aria-pressed', panning);
  document.querySelectorAll('.task-scroll').forEach((n) => n.classList.toggle('panning', panning));
};
$('undo').onclick = () => restore('undo');
$('redo').onclick = () => restore('redo');
$('close-task').onclick = closeTask;
$('task-dialog').addEventListener('cancel', (e) => {
  e.preventDefault();
  closeTask();
});
$('close-connection').onclick = () => $('connection-dialog').close();
$('reverse-connection').onclick = () => {
  const c = { ...connection };
  commit(() => {
    const edge = taskBy(c.tid).edges[c.index];
    edge[2] = !edge[2];
  });
  $('connection-dialog').close();
  toast('Arrow reversed');
};
function showHover(e) {
  if (drag || !$('editor').hidden) return;
  const node = e.target.closest('[data-event]');
  if (!node) return;
  const t = taskBy(node.dataset.task),
    ev = t.events.find((x) => x.id === node.dataset.event),
    r = node.getBoundingClientRect();
  $('hover-preview').innerHTML =
    `<strong dir="auto">${esc(ev.description)}</strong><span><bdi>${esc(t.name)}</bdi> · ${ev.kind === 'fact' ? 'Recorded event' : ev.done ? 'Completed action' : 'Action needed'}</span>${ev.kind === 'fact' ? `<div>Occurred <b>${dateLabel(ev.occurred)}</b></div>` : `<div>Triggered <b>${dateLabel(ev.triggered)}</b></div><div>Due <b>${dateLabel(ev.scheduled)}</b></div><div>Actual <b>${dateLabel(ev.actual)}</b></div><div>Original due <b>${dateLabel(ev.planned)}</b></div>`}`;
  $('hover-preview').hidden = false;
  const w = $('hover-preview').offsetWidth,
    h = $('hover-preview').offsetHeight;
  $('hover-preview').style.left = Math.min(innerWidth - w - 12, Math.max(12, r.left)) + 'px';
  $('hover-preview').style.top = Math.max(12, r.top - h - 10) + 'px';
}
function hideHover() {
  $('hover-preview').hidden = true;
}
function beginDrag(e) {
  const port = e.target.closest('[data-port]'),
    node = e.target.closest('[data-event]'),
    scroll = e.target.closest('.task-scroll');
  if (!scroll || e.target.closest('[data-between],[data-edge]')) return;
  hideHover();
  if (port) {
    e.preventDefault();
    const svg = port.closest('svg'),
      r = svg.getBoundingClientRect(),
      path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'drag-line');
    path.style.pointerEvents = 'none';
    svg.append(path);
    drag = {
      kind: 'connect',
      tid: port.dataset.task,
      from: port.dataset.port,
      startX: e.clientX,
      startY: e.clientY,
      svg,
      path,
      ox: e.clientX - r.left,
      oy: e.clientY - r.top,
      port,
      moved: false,
      surface: svg.dataset.surface,
    };
  } else if (node && !panning) {
    drag = {
      kind: 'move',
      tid: node.dataset.task,
      eid: node.dataset.event,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      node,
      surface: node.closest('svg').dataset.surface,
    };
  } else if (panning && !e.target.closest('button')) {
    drag = {
      kind: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      left: scroll.scrollLeft,
      top: scroll.scrollTop,
      scroll,
      moved: false,
    };
    e.preventDefault();
  }
}
window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.startX,
    dy = e.clientY - drag.startY;
  if (Math.abs(dx) + Math.abs(dy) > 7) drag.moved = true;
  if (drag.kind === 'pan') {
    drag.scroll.scrollLeft = drag.left - dx;
    drag.scroll.scrollTop = drag.top - dy;
  }
  if (drag.kind === 'connect') {
    const r = drag.svg.getBoundingClientRect(),
      px = e.clientX - r.left,
      py = e.clientY - r.top;
    drag.path.setAttribute(
      'd',
      `M ${drag.ox} ${drag.oy} C ${drag.ox + 40} ${drag.oy}, ${px - 40} ${py}, ${px} ${py}`,
    );
    document.querySelectorAll('.merge-target').forEach((n) => n.classList.remove('merge-target'));
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-event]');
    if (
      target &&
      target.dataset.task === drag.tid &&
      canConnect(taskBy(drag.tid), drag.from, target.dataset.event)
    )
      target.querySelector('.event-circle').classList.add('merge-target');
  }
  if (drag.kind === 'move' && drag.moved) drag.node.setAttribute('transform', `translate(${dx},0)`);
});
window.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const d = drag;
  drag = null;
  document.querySelectorAll('.merge-target').forEach((n) => n.classList.remove('merge-target'));
  if (d.kind === 'connect') {
    d.path.remove();
    const t = taskBy(d.tid),
      from = t.events.find((e) => e.id === d.from),
      target = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-event]');
    if (d.moved && target) {
      if (target.dataset.task !== d.tid) toast('Connect events within the same task.');
      else if (canConnect(t, d.from, target.dataset.event)) {
        commit(() => {
          const trial = taskBy(d.tid);
          trial.edges.push([d.from, target.dataset.event]);
          return validateTask(trial);
        });
      } else toast('That connection already exists or creates a loop.');
    } else {
      const b = geometry.get(d.surface + ':' + d.tid),
        r = d.svg.getBoundingClientRect(),
        date = d.moved
          ? iso(b.start + Math.round((e.clientX - r.left - b.pad) / b.scale))
          : iso(day(visibleDate(from)) + 1),
        branch = d.moved && Math.abs(e.clientY - d.startY) > 40;
      openEditor(d.tid, null, d.from, branch, d.port, date);
    }
  } else if (d.kind === 'move' && d.moved) {
    const t = taskBy(d.tid),
      ev = t.events.find((e) => e.id === d.eid),
      g = geometry.get(d.surface + ':' + d.tid),
      delta = Math.round((e.clientX - d.startX) / g.scale);
    if (delta) {
      const nd = iso(day(visibleDate(ev)) + delta);
      commit(() => {
        const result = updateEvent(
          taskBy(d.tid),
          d.eid,
          ev.kind === 'fact'
            ? { occurred: nd, actual: nd }
            : ev.done
              ? { actual: nd }
              : { scheduled: nd },
        );
        return result.error;
      });
    } else {
      render();
      if (focusedTask) renderTaskDialog();
    }
  } else if (d.kind === 'move') {
    openEditor(d.tid, d.eid, null, false, d.node);
  }
  // Ignore the click the browser fires right after this pointerup. A time window, rather than a
  // one-off listener, cannot swallow a later click when the pointer was released elsewhere.
  if (d.moved || d.kind === 'move') suppressClickUntil = performance.now() + 400;
});
function showCalendar() {
  const date = $('calendar-date').value,
    rows = [];
  for (const p of data.projects)
    for (const t of p.tasks)
      for (const e of t.events) {
        if (e.kind === 'fact' && e.occurred === date) rows.push({ p, t, e, label: 'Recorded' });
        else if (e.kind === 'action' && e.triggered <= date && (!e.done || e.actual >= date))
          rows.push({
            p,
            t,
            e,
            label:
              e.done && e.actual === date
                ? 'Completed'
                : e.scheduled === date
                  ? 'Due today'
                  : !e.done && e.scheduled < date
                    ? 'Overdue action'
                    : 'Active action',
          });
      }
  $('calendar-results').innerHTML = rows.length
    ? rows
        .map(
          ({ p, t, e, label }) =>
            `<div class="calendar-entry"><span><bdi>${esc(p.name)}</bdi> / <bdi>${esc(t.name)}</bdi></span><strong dir="auto">${esc(e.description)}</strong><small>${label}${e.kind === 'action' ? ' · Due ' + dateLabel(e.scheduled) : ''}</small></div>`,
        )
        .join('')
    : '<p>No recorded events or active actions on this day.</p>';
}
$('calendar-nav').onclick = () => {
  $('calendar-date').value = today();
  showCalendar();
  $('calendar-dialog').showModal();
};
$('calendar-date').onchange = showCalendar;
$('close-calendar').onclick = () => $('calendar-dialog').close();
window.addEventListener('keydown', (e) => {
  const typing = e.target.matches('input,textarea,select,[contenteditable]'),
    dialogOpen = document.querySelector('dialog[open]:not(#task-dialog)');
  if (
    (e.ctrlKey || e.metaKey) &&
    !typing &&
    !dialogOpen &&
    (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')
  ) {
    e.preventDefault();
    if (!$('editor').hidden) closeEditor();
    restore(e.key.toLowerCase() === 'y' || e.shiftKey ? 'redo' : 'undo');
  }
  if (e.key === 'Escape') {
    hideHover();
    if (!$('editor').hidden) {
      e.preventDefault();
      closeEditor();
    }
    if (drag) {
      drag.path?.remove();
      drag = null;
      render();
      if (focusedTask) renderTaskDialog();
    }
  }
  if (e.key === 'Tab' && !$('editor').hidden) {
    const items = [...$('editor').querySelectorAll('button,input,textarea,select')].filter(
      (x) => !x.closest('[hidden]'),
    );
    const first = items[0],
      last = items.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});
window.addEventListener('pointercancel', () => {
  if (drag) {
    drag.path?.remove();
    drag = null;
    render();
    if (focusedTask) renderTaskDialog();
  }
});
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    render();
    if (focusedTask) renderTaskDialog();
  }, 120);
});
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('export').onclick = () => {
  download(
    `trackflow-backup-${today()}.json`,
    JSON.stringify({ app: 'TrackFlow', exportedAt: new Date().toISOString(), data }, null, 2),
  );
  toast('Backup downloaded. Keep the file somewhere safe.');
};
$('import').onclick = () => $('import-file').click();
$('import-file').onchange = async () => {
  const file = $('import-file').files[0];
  $('import-file').value = '';
  if (!file) return;
  let incoming, reason;
  try {
    const parsed = JSON.parse(await file.text());
    incoming = migrate(parsed?.app === 'TrackFlow' ? parsed.data : parsed);
    reason = checkData(incoming);
  } catch {
    reason = 'It is not a TrackFlow backup file.';
  }
  if (reason) {
    toast(`This file could not be imported. ${reason}`);
    return;
  }
  pendingImport = incoming;
  const tasks = incoming.projects.flatMap((p) => p.tasks),
    events = tasks.flatMap((t) => t.events).length,
    count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  $('import-summary').textContent =
    `${file.name} contains ${count(incoming.projects.length, 'project')}, ${count(tasks.length, 'task')} and ${count(events, 'event')}. ` +
    'Importing replaces everything currently saved in this browser. You can reverse it with Undo.';
  $('import-dialog').showModal();
};
$('cancel-import').onclick = () => {
  pendingImport = null;
  $('import-dialog').close();
};
$('confirm-import').onclick = () => {
  const incoming = pendingImport;
  pendingImport = null;
  $('import-dialog').close();
  if (!incoming) return;
  if (focusedTask) closeTask();
  closeEditor();
  view = 'portfolio';
  history.replaceState(null, '', '#/portfolio');
  if (
    commit(() => {
      data = incoming;
      active = data.projects[0].id;
    })
  )
    toast('Backup imported');
};
// Another tab saved: load its data so this tab cannot overwrite it with an older copy.
window.addEventListener('storage', (e) => {
  if (e.key !== key || !e.newValue) return;
  let incoming;
  try {
    incoming = readStored(e.newValue);
  } catch {
    return;
  }
  data = incoming;
  undoStack = [];
  redoStack = [];
  ensureActive();
  closeEditor();
  for (const id of ['delete-dialog', 'connection-dialog', 'import-dialog', 'project-dialog'])
    $(id).close();
  if (focusedTask && !taskBy(focusedTask)) closeTask();
  viewZoom = {};
  render();
  if (focusedTask) renderTaskDialog();
  toast('Updated with changes made in another tab.');
});
function showRecovery() {
  $('recovery-text').textContent = saveBlocked
    ? 'Your saved TrackFlow data could not be read, so the sample project is shown instead. ' +
      'This browser had no room to keep a safety copy, so changes will not be saved until you download the unreadable data.'
    : 'Your saved TrackFlow data could not be read, so the sample project is shown instead. ' +
      'A copy of the unreadable data has been kept in this browser and will not be overwritten. Download it and keep it safe; it may be recoverable.';
  $('recovery').hidden = false;
}
$('recovery-download').onclick = () => {
  download(`trackflow-unreadable-${today()}.json`, unreadable);
  if (saveBlocked) {
    saveBlocked = false;
    save();
  }
  toast('Unreadable data downloaded');
};
$('recovery-dismiss').onclick = () => ($('recovery').hidden = true);
// Colour mode: Auto follows the device; Day and Night are remembered on this device.
const MODE_KEY = 'trackflow-mode';
function applyMode(mode) {
  if (mode !== 'day' && mode !== 'night') mode = 'auto';
  if (mode === 'auto') delete document.documentElement.dataset.mode;
  else document.documentElement.dataset.mode = mode;
  document
    .querySelectorAll('.mode-switch button')
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {}
}
document.querySelector('.mode-switch').onclick = (e) => {
  const b = e.target.closest('button[data-mode]');
  if (b) applyMode(b.dataset.mode);
};
try {
  applyMode(localStorage.getItem(MODE_KEY));
} catch {
  applyMode('auto');
}
route();
render();
if (unreadable) {
  showRecovery();
  if (saveBlocked) save();
} else save();
