import {
  day,
  iso,
  visibleDate,
  updateEvent,
  canConnect,
  connectBefore,
  connectBatch,
  validateTask,
  removeEvent,
  migrate,
  checkData,
  projectTotals,
  termsPercent,
} from './model.mjs?v=2026-10-10-flexible-dates';
import { sample } from './sample.mjs';
import {
  openActions,
  nextAction,
  projectStatus,
  contractValue,
  historyCounts,
} from './portfolio.mjs?v=2026-10-10-flexible-dates';
import { createAccount } from './account.mjs';
import { createSync } from './sync.mjs';
import { createExcelFile } from './excel.mjs?v=2026-10-10-flexible-dates';
import { siteMarkup, friendlyError } from './site.mjs';
import { timelineLayout, fitTimelineZoom } from './timeline-layout.mjs?v=2026-10-10-flexible-dates';
import { enhanceDateInput } from './date-picker.mjs?v=2026-10-10-flexible-dates';
const $ = (id) => document.getElementById(id),
  // Storage keys keep the original TrackFlow names so existing saved data is still found.
  key = 'trackflow-prototype-v1',
  GUEST_KEY = 'trackflow-guest',
  // Backups exported before the rename are labelled TrackFlow.
  BACKUP_APPS = ['RevTimeline', 'TrackFlow'];
[$('event-date'), $('event-trigger'), $('event-due'), $('calendar-date')].forEach(enhanceDateInput);
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
  editingTaskId = null,
  drag = null,
  panning = false,
  toastTimer,
  connection = null,
  viewZoom = {},
  quickProjectRoute = null,
  infoOpen = false,
  undoStack = [],
  redoStack = [],
  pendingImport = null,
  suppressClickUntil = 0,
  view = 'portfolio',
  // Signed-in state. user is null in guest mode, where projects stay in this browser only.
  screen = 'landing',
  account = null,
  user = null,
  sync = null,
  unwatch = null,
  providers = {},
  conflictMine = null,
  siteState = { email: '', note: '', error: '' };
// Projects saved in this browser without an account, or null when there are none.
function readGuest() {
  try {
    const raw = localStorage.getItem(key);
    return raw ? readStored(raw) : null;
  } catch {
    return null;
  }
}
const guestAllowed = () => {
  try {
    return localStorage.getItem(GUEST_KEY) === '1' || localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
};
const accountKey = () => `${key}.account-${user.id}`;
const conflictKey = () => `${accountKey()}.conflict`;
function writeAccountCache(dirty) {
  try {
    localStorage.setItem(accountKey(), JSON.stringify({ version: sync.version, dirty, data }));
  } catch {}
}
function readAccountCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(accountKey()));
    return cached && !checkData(migrate(cached.data)) ? cached : null;
  } catch {
    return null;
  }
}
function readAccountConflict() {
  try {
    const raw = localStorage.getItem(conflictKey());
    if (!raw) return null;
    const saved = migrate(JSON.parse(raw));
    return checkData(saved) ? null : saved;
  } catch {
    return null;
  }
}
const geometry = new Map(),
  project = () => data.projects.find((p) => p.id === active),
  taskBy = (id) => project().tasks.find((t) => t.id === id);
// Every screen has an address so a reload keeps your place: #/ (landing), #/sign-in,
// #/sign-up, #/check-email, #/forgot, #/new-password, #/portfolio and #/project/<id>.
const SITE_ROUTES = {
  '#/sign-in': 'sign-in',
  '#/sign-up': 'sign-up',
  '#/check-email': 'check-email',
  '#/forgot': 'forgot',
};
function route() {
  const hash = location.hash;
  if (hash === '#/new-password') {
    screen = user ? 'new-password' : 'sign-in';
    return;
  }
  const inApp = hash.startsWith('#/portfolio') || hash.startsWith('#/project/');
  if (!user && !inApp) {
    screen = SITE_ROUTES[hash] || 'landing';
    return;
  }
  if (!user && !guestAllowed()) {
    screen = 'sign-in';
    history.replaceState(null, '', '#/sign-in');
    return;
  }
  if (user && !inApp) history.replaceState(null, '', '#/portfolio');
  screen = 'app';
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
  if (user) {
    // Keep a copy here first, so nothing is lost if the page closes before the upload finishes.
    writeAccountCache(true);
    sync.queue(structuredClone(data));
    return;
  }
  if (saveBlocked) {
    $('saved').textContent = 'Not saved';
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(data));
    $('saved').textContent = 'Saved in this browser';
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
function bounds(t, width, surface, fixedZoom = null) {
  return timelineLayout(t, width, fixedZoom ?? viewZoom[surface + ':' + t.id] ?? 1);
}
function placeAfterSource(t, source, event, surface) {
  if (visibleDate(source) === visibleDate(event)) return;
  const width =
      surface === 'modal'
        ? Math.max(300, $('task-dialog').clientWidth - 48)
        : Math.max(240, $('viewport').clientWidth - 36),
    b = bounds(t, width, surface, 1),
    sourceX = b.nodes.get(source.id).x,
    naturalX = b.nodes.get(event.id).x;
  // A newly connected event gets a readable gap without changing either date.
  event.layout = {
    dx: Math.round(Math.max(-5000, Math.min(5000, sourceX + 180 - naturalX))),
    dy: 0,
  };
}
function revealNewEvent(tid, eid, surface) {
  const scroll = document.querySelector(
      `.task-scroll[data-scroll="${tid}"][data-surface="${surface}"]`,
    ),
    node = geometry.get(surface + ':' + tid)?.nodes.get(eid);
  if (!scroll || !node) return;
  scroll.scrollLeft = Math.max(0, node.x - scroll.clientWidth + 180);
  if (surface === 'modal') {
    scroll.scrollTop = Math.max(0, node.y - scroll.clientHeight + 110);
  } else {
    const y = scroll.getBoundingClientRect().top + node.y;
    if (y > innerHeight - 110) window.scrollBy({ top: y - innerHeight + 110, behavior: 'smooth' });
    else if (y < 110) window.scrollBy({ top: y - 110, behavior: 'smooth' });
  }
}
function icon(name) {
  return { expand: '⛶', fit: '↔', plus: '＋', minus: '−' }[name];
}
function edgeGeometry(n, m) {
  if (Math.abs(m.x - n.x) < 36) {
    const outerX = Math.max(n.x, m.x) + 94;
    return {
      path: `M ${n.x + 9} ${n.y} C ${outerX} ${n.y}, ${outerX} ${m.y}, ${m.x + 9} ${m.y}`,
      mx: outerX,
      my: (n.y + m.y) / 2,
    };
  }
  const ax = n.x + 9,
    cx = m.x - 9,
    mid = (ax + cx) / 2;
  return {
    path: `M ${ax} ${n.y} C ${mid} ${n.y}, ${mid} ${m.y}, ${cx} ${m.y}`,
    mx: (n.x + m.x) / 2,
    my: (n.y + m.y) / 2,
  };
}
function taskMarkup(t, width, surface = 'main') {
  const b = bounds(t, Math.max(240, width), surface),
    terms = searchTerms(),
    nodes = b.nodes;
  geometry.set(surface + ':' + t.id, b);
  let svg = `<defs><marker id="arrow-${surface}-${t.id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path class="arrow-head" d="M 0 0 L 10 5 L 0 10 z"/></marker></defs>`;
  for (let i = 0; i < t.edges.length; i++) {
    const [a, c, reverse] = t.edges[i],
      n = nodes.get(a),
      m = nodes.get(c);
    if (!n || !m) continue;
    const { path, mx, my } = edgeGeometry(n, m),
      from = t.events.find((e) => e.id === a),
      to = t.events.find((e) => e.id === c),
      interval = Math.abs(day(visibleDate(to)) - day(visibleDate(from)));
    svg += `<path class="edge-hit" data-edge="${i}" data-task="${t.id}" d="${path}" fill="none" stroke="transparent" stroke-width="18" tabindex="0" role="button" aria-label="${plural(interval, 'day')} between ${esc(from.description)} and ${esc(to.description)}. Edit connection direction"/><path class="edge" data-edge-line="${i}" d="${path}" marker-${reverse ? 'start' : 'end'}="url(#arrow-${surface}-${t.id})" pointer-events="none"/><g class="between-add" data-between="${i}" data-task="${t.id}" tabindex="0" role="button" aria-label="Insert event between connected events"><circle class="hit" cx="${mx}" cy="${my}" r="17"/><circle class="add-ring" cx="${mx}" cy="${my}" r="9"/><text class="add-plus" x="${mx}" y="${my + 4}" text-anchor="middle">+</text></g>`;
  }
  for (const e of t.events) {
    const n = nodes.get(e.id),
      short = e.description.length > 21 ? e.description.slice(0, 20) + '…' : e.description,
      // Arabic labels start at the right edge of their box and run leftward.
      labelAt = isRtl(e.description) ? `direction="rtl" x="${n.x + 62}"` : `x="${n.x - 62}"`,
      matched = terms.length && eventMatches(e, terms);
    svg += `<g class="node${matched ? ' search-match' : ''}" data-event="${e.id}" data-task="${t.id}" tabindex="0" role="button" aria-label="${esc(e.description)}, ${dateLabel(visibleDate(e))}"><rect class="label-box ${e.kind}" x="${n.x - 70}" y="${n.labelY - 4}" width="140" height="43" rx="8"/><text class="event-label" ${labelAt} y="${n.labelY + 12}">${esc(short)}</text><text class="event-kind" x="${n.x - 62}" y="${n.labelY + 29}">${e.kind === 'fact' ? 'Recorded event' : e.done ? 'Completed action' : e.scheduled ? 'Action needed' : 'Action · no target'}</text><line class="stem" x1="${n.x}" x2="${n.x}" y1="${n.labelY + 39}" y2="${n.y - 12}"/><circle class="hit" cx="${n.x}" cy="${n.y}" r="20"/><circle class="event-circle ${e.kind} ${e.done ? 'done' : 'open'}" cx="${n.x}" cy="${n.y}" r="8"/>${e.done ? `<path class="tick" d="M ${n.x - 3} ${n.y} l 2 2 l 4 -4"/>` : ''}<text class="event-date" x="${n.x}" y="${n.y + 27}" text-anchor="middle">${shortDate(visibleDate(e))}</text></g><g class="before-port" data-before="${e.id}" data-task="${t.id}" tabindex="0" role="button" aria-label="Add before ${esc(e.description)}" title="Add before"><circle class="hit" cx="${n.x - 26}" cy="${n.y}" r="13"/><circle class="add-ring" cx="${n.x - 26}" cy="${n.y}" r="7"/><text class="add-plus" x="${n.x - 26}" y="${n.y + 3.5}" text-anchor="middle" style="font-size:11px">+</text></g><g class="port" data-port="${e.id}" data-task="${t.id}" tabindex="0" role="button" aria-label="Add after or branch from ${esc(e.description)}" title="Add after"><circle class="hit" cx="${n.x + 25}" cy="${n.y}" r="13"/><circle class="add-ring" cx="${n.x + 25}" cy="${n.y}" r="6"/><text class="add-plus" x="${n.x + 25}" y="${n.y + 3}" text-anchor="middle" style="font-size:11px">+</text></g>`;
  }
  const canvas = t.events.length
    ? `<svg class="task-canvas${b.zoom < 0.75 ? ' compact' : ''}" data-canvas="${t.id}" data-surface="${surface}" width="${b.width}" height="${b.height}" role="group" aria-label="${esc(t.name)} timeline">${svg}</svg>`
    : `<div class="empty-task">No events yet. <button class="button" data-first="${t.id}">＋ Add first event</button></div>`;
  return `<div class="task-workspace" data-workspace="${t.id}"><div class="task-scroll ${panning ? 'panning' : ''}" data-scroll="${t.id}" data-surface="${surface}">${canvas}</div><div class="task-bottom"><span class="task-span">${t.events.length ? shortDate(iso(b.start)) + ' – ' + shortDate(iso(b.end)) : ''}</span><div class="task-zoom"><button class="button small" data-tidy="${t.id}" aria-label="Reset ${esc(t.name)} point layout">Tidy layout</button><button class="icon-button" data-zoom="out" data-task="${t.id}" data-surface="${surface}" aria-label="Zoom out ${esc(t.name)}">${icon('minus')}</button><span>${Math.round(b.zoom * 100)}%</span><button class="icon-button" data-zoom="in" data-task="${t.id}" data-surface="${surface}" aria-label="Zoom in ${esc(t.name)}">${icon('plus')}</button><button class="icon-button" data-fit="${t.id}" data-surface="${surface}" aria-label="Fit and align ${esc(t.name)} timeline" title="Fit and align points by date">${icon('fit')}</button>${surface === 'main' ? `<button class="icon-button" data-expand="${t.id}" aria-label="Open ${esc(t.name)} in a larger window">${icon('expand')}</button>` : ''}</div></div></div>`;
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
const SITE_TITLES = {
  'sign-in': 'Sign in',
  'sign-up': 'Create your account',
  'check-email': 'Check your inbox',
  forgot: 'Reset your password',
  'new-password': 'Choose a new password',
};
function renderSite() {
  const providerNames = [
    providers.google && 'Google',
    providers.linkedin_oidc && 'LinkedIn',
  ].filter(Boolean);
  $('site').dataset.screen = screen;
  $('site-main').innerHTML = siteMarkup(screen, {
    ...siteState,
    providers,
    providerNames,
    guestData: !!readGuest(),
  });
  document.title = screen === 'landing' ? 'RevTimeline' : `${SITE_TITLES[screen]} · RevTimeline`;
}
// Shows a public screen with an optional message, e.g. go('#/sign-in', { note: '…' }).
function go(hash, state = {}) {
  siteState = { email: siteState.email, note: '', error: '', ...state };
  if (location.hash === hash) {
    route();
    render();
  } else {
    keepSiteState = true;
    location.hash = hash;
  }
}
const initials = (name) =>
  name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || 'PM';
function render() {
  hideHover();
  $('booting').hidden = true;
  const inApp = screen === 'app';
  $('site').hidden = inApp;
  $('app-shell').hidden = !inApp;
  if (!inApp) {
    renderSite();
    return;
  }
  document.title = 'RevTimeline';
  ensureActive();
  $('workspace-tabs').innerHTML =
    `<a href="#/portfolio" class="workspace-tab" ${view === 'portfolio' ? 'aria-current="page"' : ''}>All tasks <span>${data.projects.reduce((n, p) => n + p.tasks.length, 0)}</span></a>` +
    data.projects
      .map(
        (p) =>
          `<a href="#/project/${p.id}" class="workspace-tab" ${view === 'project' && active === p.id ? 'aria-current="page"' : ''} dir="auto">${esc(p.name)}</a>`,
      )
      .join('') +
    `<button class="workspace-tab add-tab" id="new-project-tab" aria-label="New project">＋</button>`;
  $('new-project-tab').onclick = () => openName('project');
  $('workspace-search').placeholder =
    view === 'portfolio' ? 'Search all tasks and activities' : 'Search this project';
  const chosenProject = $('quick-task-project').value,
    quickRoute = view === 'project' ? active : 'all';
  $('quick-task-project').innerHTML = data.projects
    .map((p) => `<option value="${p.id}">${esc(p.name)}</option>`)
    .join('');
  $('quick-task-project').value =
    quickRoute === quickProjectRoute && data.projects.some((p) => p.id === chosenProject)
      ? chosenProject
      : active;
  quickProjectRoute = quickRoute;
  const name = user ? user.user_metadata?.name || user.email : 'Your workspace';
  $('account-name').textContent = name;
  $('avatar').textContent = user ? initials(name) : 'PM';
  $('account-action').textContent = user ? 'Sign out' : 'Sign in to sync';
  $('portfolio-view').hidden = view !== 'portfolio';
  $('project-view').hidden = view !== 'project';
  if (view === 'portfolio') renderPortfolio();
  else renderProject();
  syncContextInfo();
}
const searchTerms = () =>
  $('workspace-search').value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
const containsTerms = (values, terms) => {
  const text = values
    .filter((value) => value !== null && value !== undefined)
    .join(' ')
    .toLocaleLowerCase();
  return terms.every((term) => text.includes(term));
};
const eventMatches = (event, terms) =>
  containsTerms(
    [
      event.description,
      event.kind,
      event.done ? 'completed' : 'open',
      visibleDate(event),
      event.triggered,
      event.planned,
      event.scheduled,
      event.actual,
    ],
    terms,
  );
const taskMatches = (project, task, terms) =>
  !terms.length ||
  containsTerms(
    [
      project.name,
      project.description,
      project.details?.projectNumber,
      project.details?.customer,
      project.details?.contractor,
      project.details?.scope,
      task.name,
      task.description,
      ...task.events.flatMap((event) => [
        event.description,
        event.kind,
        event.done ? 'completed' : 'open',
        visibleDate(event),
        event.triggered,
        event.planned,
        event.scheduled,
        event.actual,
      ]),
    ],
    terms,
  );
function searchStatus(count, terms) {
  $('search-status').hidden = !terms.length;
  $('search-status').textContent = terms.length ? `${plural(count, 'matching task')}` : '';
}
function syncContextInfo() {
  const docked = matchMedia('(min-width: 1500px)').matches;
  if (docked) infoOpen = false;
  for (const kind of ['portfolio', 'project']) {
    const current = view === kind && screen === 'app',
      open = current && infoOpen && !docked,
      visible = current && (docked || open),
      panel = $(`${kind}-info`);
    panel.classList.toggle('open', open);
    panel.inert = !visible;
    panel.setAttribute('aria-hidden', String(!visible));
    panel.setAttribute('role', open ? 'dialog' : 'complementary');
    if (open) panel.setAttribute('aria-modal', 'true');
    else panel.removeAttribute('aria-modal');
    $(`${kind}-info-scrim`).hidden = !open;
    $(`${kind}-info-toggle`).setAttribute('aria-expanded', String(open));
  }
}
function closeContextInfo() {
  infoOpen = false;
  syncContextInfo();
  $(`${view}-info-toggle`).focus();
}
for (const kind of ['portfolio', 'project']) {
  $(`${kind}-info-toggle`).onclick = () => {
    infoOpen = true;
    syncContextInfo();
    $(`${kind}-info-close`).focus();
  };
  $(`${kind}-info-close`).onclick = closeContextInfo;
  $(`${kind}-info-scrim`).onclick = closeContextInfo;
}
$('workspace-search').oninput = () => {
  if (screen !== 'app') return;
  if (view === 'portfolio') renderPortfolio();
  else renderProject();
};
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
function renderPortfolio() {
  const now = today(),
    projects = data.projects,
    terms = searchTerms(),
    matchingTasks = projects.flatMap((p) =>
      p.tasks.filter((t) => taskMatches(p, t, terms)).map((t) => ({ p, t })),
    ),
    actions = projects
      .flatMap((p) => openActions(p).map(({ task, event }) => ({ p, task, event })))
      .sort(
        (a, b) =>
          (a.event.scheduled ? day(a.event.scheduled) : Infinity) -
          (b.event.scheduled ? day(b.event.scheduled) : Infinity),
      ),
    overdue = actions.filter(
      ({ event }) => event.scheduled && day(event.scheduled) < day(now),
    ).length,
    values = contractValue(projects),
    valued = projects.filter((p) => Number.isFinite(p.details?.value)).length;
  searchStatus(matchingTasks.length, terms);
  $('all-tasks').innerHTML =
    matchingTasks
      .map(({ p, t }) => {
        const events = [...t.events].sort((a, b) => day(visibleDate(a)) - day(visibleDate(b))),
          directMatch = containsTerms(
            [
              p.name,
              p.description,
              p.details?.projectNumber,
              p.details?.customer,
              p.details?.contractor,
              p.details?.scope,
              t.name,
              t.description,
            ],
            terms,
          ),
          matchingEvents = terms.length
            ? events.filter((e) =>
                containsTerms(
                  [
                    p.name,
                    p.description,
                    p.details?.projectNumber,
                    p.details?.customer,
                    p.details?.contractor,
                    p.details?.scope,
                    t.name,
                    t.description,
                    e.description,
                    e.kind,
                    e.done ? 'completed' : 'open',
                    visibleDate(e),
                    e.triggered,
                    e.planned,
                    e.scheduled,
                    e.actual,
                  ],
                  terms,
                ),
              )
            : [],
          shown = (
            terms.length && !directMatch && matchingEvents.length ? matchingEvents : events
          ).slice(0, 8);
        return `<a class="all-task-card" href="#/project/${p.id}"><div class="all-task-head"><strong dir="auto">${esc(t.name)}</strong><span dir="auto">${esc(p.name)}</span></div>${t.description ? `<p class="all-task-description" dir="auto">${esc(t.description)}</p>` : ''}<div class="all-task-track">${shown.length ? shown.map((e) => `<div class="all-task-point"><i class="${e.kind === 'fact' ? 'fact' : e.done ? 'done' : 'open'}"></i><span dir="auto">${esc(e.description)}</span><small>${shortDate(visibleDate(e))}</small></div>`).join('') : '<span class="muted">No activity yet</span>'}</div></a>`;
      })
      .join('') ||
    (terms.length
      ? '<p class="empty">No tasks match this search.</p>'
      : '<p class="empty">No tasks yet. Create a project to get started.</p>');
  $('today-label').textContent = new Date(now + 'T12:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  $('portfolio-summary').innerHTML =
    `<div><span class="label">Total projects</span><strong>${projects.length}</strong><small>${plural(
      projects.reduce((count, p) => count + p.tasks.length, 0),
      'task',
    )} across the workspace</small></div>` +
    `<div><span class="label">Total project value · excl. VAT</span>${values.length ? values.map((v) => `<div class="value-line"><strong>${number(v.total)}</strong><span>${esc(v.currency || 'Currency not set')}</span></div>`).join('') : '<strong class="unset">—</strong>'}<small>${valued} of ${plural(projects.length, 'project')} have a value</small></div>` +
    `<div class="portfolio-status"><div><span class="label">Open actions</span><strong>${actions.length}</strong></div><div><span class="label">Overdue</span><strong class="${overdue ? 'bad' : ''}">${overdue}</strong></div></div>`;
  $('portfolio-next-count').textContent = actions.length ? `${actions.length} open` : '';
  $('portfolio-next-actions').innerHTML = actions.length
    ? actions
        .slice(0, 6)
        .map(({ p, task, event }) => {
          const late = event.scheduled && day(event.scheduled) < day(now);
          return `<a href="#/project/${p.id}"><strong dir="auto">${esc(event.description)}</strong><span class="${late ? 'late' : ''}">${event.scheduled ? `${late ? 'Was due ' : 'Target '}${dateLabel(event.scheduled)}` : 'No target date'}</span><span><bdi>${esc(p.name)}</bdi> · <bdi>${esc(task.name)}</bdi></span></a>`;
        })
        .join('') +
      (actions.length > 6 ? `<p class="empty">${actions.length - 6} more open actions.</p>` : '')
    : '<p class="empty">No open actions across these projects.</p>';
  $('project-table').innerHTML =
    '<div class="prow head"><span class="label">Project</span><span class="label">Status</span><span class="label">Next action</span><span class="label">History</span><span class="label end">Value excl. VAT</span></div>' +
    projects
      .map((p) => {
        const d = p.details || {},
          next = nextAction(p),
          late = next?.event.scheduled && day(next.event.scheduled) < day(now);
        return (
          `<a class="prow" href="#/project/${p.id}"><div class="nm"><b dir="auto">${esc(p.name)}</b><span dir="auto">${esc(d.customer || p.description || '')}</span></div>` +
          `<span>${statusChip(p)}</span>` +
          `<div class="nx">${next ? `<b class="${late ? 'late' : ''}" dir="auto">${esc(next.event.description)}</b><span><bdi>${esc(next.task.name)}</bdi> · ${next.event.scheduled ? `${late ? 'was due' : 'target'} ${dateLabel(next.event.scheduled)}` : 'no target date'}</span>` : '<span>No open actions</span>'}</div>` +
          spark(historyCounts(p)) +
          `<div class="val">${Number.isFinite(d.value) ? `${number(d.value)}<small>${esc(d.currency || '')}</small>` : '<small>Not set</small>'}</div></a>`
        );
      })
      .join('');
}
function renderProject() {
  const p = project(),
    d = p.details || {},
    events = p.tasks.flatMap((t) => t.events),
    terms = searchTerms(),
    matchingTasks = p.tasks.filter((t) => taskMatches(p, t, terms));
  searchStatus(matchingTasks.length, terms);
  $('crumb-project').textContent = p.name;
  $('project-title').textContent = p.name;
  $('project-ref').textContent = d.projectNumber ? `Project ${d.projectNumber}` : d.customer || '';
  $('project-status').innerHTML = statusChip(p);
  $('project-description').textContent = p.description || '';
  renderOverview(p);
  renderNext(p);
  $('task-count').textContent =
    `${plural(p.tasks.length, 'task')} · ${plural(events.length, 'event')}`;
  const width = Math.max(240, $('viewport').clientWidth - 36);
  const scrollPositions = new Map(
    [...$('timeline-content').querySelectorAll('.task-scroll')].map((el) => [
      el.dataset.scroll,
      el.scrollLeft,
    ]),
  );
  $('timeline-content').innerHTML = matchingTasks.length
    ? matchingTasks
        .map(
          (t) =>
            `<div class="task-row" data-task-row="${t.id}"><div class="task-label"><button class="task-handle" draggable="true" data-drag-task="${t.id}" aria-label="Drag to reorder ${esc(t.name)}" title="Drag to reorder">⠿</button><div class="task-heading"><span class="task-name" dir="auto">${esc(t.name)}</span>${t.description ? `<span class="task-description" dir="auto">${esc(t.description)}</span>` : ''}</div><span class="task-meta">${plural(t.events.length, 'event')} · ${new Set(t.events.map((e) => e.lane)).size > 1 ? 'Parallel paths' : 'Main path'}</span><span class="task-order"><button class="button small" data-add-sequence="${t.id}">Add several</button><button class="button small" data-edit-task="${t.id}">Edit task</button><button class="icon-button" data-move-task="${t.id}" data-direction="-1" aria-label="Move ${esc(t.name)} up">↑</button><button class="icon-button" data-move-task="${t.id}" data-direction="1" aria-label="Move ${esc(t.name)} down">↓</button></span></div>${taskMarkup(t, width)}</div>`,
        )
        .join('')
    : `<div class="empty-task">${terms.length ? 'No tasks match this search.' : 'No tasks yet. Add a task to start its timeline.'}</div>`;
  for (const el of $('timeline-content').querySelectorAll('.task-scroll'))
    el.scrollLeft = scrollPositions.get(el.dataset.scroll) || 0;
  if (terms.length)
    for (const t of matchingTasks) {
      const first = t.events.find((event) => eventMatches(event, terms)),
        node = first && geometry.get('main:' + t.id)?.nodes.get(first.id),
        scroll = [...$('timeline-content').querySelectorAll('.task-scroll')].find(
          (el) => el.dataset.scroll === t.id,
        );
      if (node && scroll) scroll.scrollLeft = Math.max(0, node.x - scroll.clientWidth * 0.45);
    }
  $('undo').disabled = !undoStack.length;
  $('redo').disabled = !redoStack.length;
}
function renderOverview(p) {
  const d = p.details || {},
    totals = projectTotals(d),
    terms = d.paymentTerms || [],
    sum = termsPercent(d);
  const cell = (label, value, note = '', cls = '', row = '') =>
    `<div class="${row}"><span class="label">${label}</span><strong class="${cls}" dir="auto">${value}</strong>${note ? `<small>${note}</small>` : ''}</div>`;
  $('overview').innerHTML =
    cell(
      'Project value · excl. VAT',
      esc(money(totals.value, d.currency)),
      totals.value === null ? 'Add the project value in Edit details' : 'Contract value before VAT',
      totals.value === null ? 'unset' : '',
      'value-primary',
    ) +
    cell(
      'Project number',
      esc(d.projectNumber || 'Not set'),
      '',
      d.projectNumber ? 'text' : 'unset',
    ) +
    cell('Customer', esc(d.customer || 'Not set'), '', d.customer ? 'text' : 'unset') +
    cell('Contractor', esc(d.contractor || 'Not set'), '', d.contractor ? 'text' : 'unset') +
    cell('Scope', esc(d.scope || 'Not set'), '', d.scope ? 'text' : 'unset', 'scope-row') +
    cell(
      'Total incl. VAT',
      esc(money(totals.total, d.currency)),
      totals.total === null
        ? totals.value === null
          ? 'Enter the project value and VAT rate to calculate'
          : 'Add a VAT rate to calculate'
        : '',
      totals.total === null ? 'unset' : '',
    ) +
    cell(
      'VAT',
      totals.rate === null ? 'Rate not set' : esc(money(totals.vat, d.currency)),
      totals.rate === null ? '' : `${number(totals.rate)}% rate`,
      totals.rate === null ? 'unset' : '',
    );
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
    list = openActions(p).sort(
      (a, b) =>
        (a.event.scheduled ? day(a.event.scheduled) : Infinity) -
        (b.event.scheduled ? day(b.event.scheduled) : Infinity),
    );
  $('next-count').textContent = list.length ? `${list.length} open` : '';
  $('next-actions').innerHTML = list.length
    ? list
        .slice(0, 5)
        .map(({ task, event }) => {
          const late = event.scheduled && day(event.scheduled) < now,
            moved =
              event.scheduled && event.planned ? day(event.scheduled) - day(event.planned) : 0;
          return `<button class="x${late ? ' late' : ''}" data-open-task="${task.id}" data-open-event="${event.id}"><i></i><b dir="auto">${esc(event.description)}</b><span class="when">${event.scheduled ? `${late ? 'Was due ' : 'Target '}${dateLabel(event.scheduled)}` : 'No target date'}</span><span><bdi>${esc(task.name)}</bdi>${moved ? ` · <span class="shift">moved ${moved > 0 ? '+' : '−'}${plural(Math.abs(moved), 'day')}</span>` : ''}</span></button>`;
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
  $('project-number').value = d.projectNumber || '';
  $('project-customer').value = d.customer || '';
  $('project-contractor').value = d.contractor || '';
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
      projectNumber: $('project-number').value.trim(),
      customer: $('project-customer').value.trim(),
      contractor: $('project-contractor').value.trim(),
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
  const opening = $('editor').hidden;
  if (opening) lastFocus = document.activeElement;
  editing = eid ? { tid, eid } : null;
  creating = eid ? null : { tid, from, to, branch };
  const t = taskBy(tid),
    e = eid ? t.events.find((x) => x.id === eid) : null;
  $('editor-task').textContent = `${project().name} / ${t.name}`;
  $('editor-title').textContent = e ? 'Edit event' : 'New event';
  $('event-description').value = e?.description || '';
  document.querySelector(`input[name="event-kind"][value="${e?.kind || 'fact'}"]`).checked = true;
  $('event-done').checked = e?.done || false;
  $('event-date').value = e ? visibleDate(e) : suggested || today();
  $('event-trigger').value = e?.triggered || suggested || today();
  $('event-due').value = e?.scheduled || suggested || today();
  for (const id of ['event-date', 'event-trigger', 'event-due'])
    $(id).dispatchEvent(new Event('input', { bubbles: true }));
  $('event-has-target').checked = !!e?.scheduled;
  $('event-plan').value = e?.planned || '';
  $('plan-field').hidden = !e || e.kind === 'fact';
  $('branch-field').hidden = !!e || !from || !!to;
  $('event-branch').checked = branch;
  $('delete-event').hidden = !e;
  $('add-before-event').hidden = !e;
  $('add-sequence-from-event').hidden = !e;
  $('event-position').hidden = !to || !!e;
  if (to && !e) {
    const target = t.events.find((item) => item.id === to);
    $('event-position').textContent = from
      ? 'Inserting between connected activities. Choose any date; the other activities keep their dates.'
      : `Adding before “${target.description}” (${dateLabel(visibleDate(target))}). Choose any date; the existing activity keeps its date, and incoming connections pass through the new activity.`;
  }
  $('event-warning').hidden = true;
  syncEditor();
  $('editor').hidden = false;
  $('editor-backdrop').hidden = false;
  if (opening) {
    const w = Math.min(440, innerWidth - 24);
    $('editor').style.left =
      (innerWidth > 900 ? innerWidth - w - 24 : Math.max(12, (innerWidth - w) / 2)) + 'px';
    $('editor').style.top =
      Math.max(12, Math.min(28, innerHeight - $('editor').offsetHeight - 12)) + 'px';
  }
  $('event-description').focus();
}
const selectedEventKind = () => document.querySelector('input[name="event-kind"]:checked').value;
function syncEditor() {
  const action = selectedEventKind() === 'action',
    done = $('event-done').checked,
    hasTarget = action && $('event-has-target').checked;
  $('done-field').hidden = !action;
  $('trigger-field').hidden = !action;
  $('target-toggle').hidden = !action;
  $('due-field').hidden = !hasTarget;
  $('event-trigger').required = action;
  $('event-due').required = hasTarget;
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
      : hasTarget
        ? 'The first target date is kept as the original plan.'
        : 'No target date. This action appears on its trigger date.'
    : 'A recorded event has an occurrence date and no due date.';
}
function closeEditor() {
  if ($('editor').hidden) return;
  $('editor').hidden = true;
  $('editor-backdrop').hidden = true;
  movingEditor = null;
  $('editor').classList.remove('moving');
  editing = null;
  creating = null;
  lastFocus?.focus();
}
$('event-kind').onchange = syncEditor;
$('event-has-target').onchange = syncEditor;
$('event-done').onchange = () => {
  if ($('event-done').checked) {
    $('event-date').value = today();
    $('event-date').dispatchEvent(new Event('input', { bubbles: true }));
  }
  syncEditor();
};
$('event-form').onsubmit = (ev) => {
  ev.preventDefault();
  const description = $('event-description').value.trim(),
    kind = selectedEventKind(),
    done = kind === 'fact' || $('event-done').checked,
    occurred = kind === 'fact' ? $('event-date').value : null,
    actual = done ? $('event-date').value : null,
    scheduled =
      kind === 'action' ? ($('event-has-target').checked ? $('event-due').value : null) : occurred,
    triggered = kind === 'action' ? $('event-trigger').value : occurred;
  if (
    !description ||
    (kind === 'action' && $('event-has-target').checked && !scheduled) ||
    !triggered ||
    (done && !actual)
  )
    return;
  const ctx = editing || creating,
    tid = ctx.tid;
  const surface = focusedTask === tid ? 'modal' : 'main';
  let createdId,
    error,
    valid = commit(() => {
      const t = taskBy(tid);
      if (editing) {
        const existing = t.events.find((e) => e.id === editing.eid);
        const result = updateEvent(t, existing.id, {
          description,
          kind,
          done,
          occurred,
          actual,
          scheduled,
          triggered,
          planned: existing.kind === 'action' ? existing.planned || scheduled : scheduled,
        });
        return (error = result.error);
      }
      const from = t.events.find((e) => e.id === creating.from),
        to = t.events.find((e) => e.id === creating.to),
        branch = $('event-branch').checked && !to,
        lane = branch
          ? Math.max(0, ...t.events.map((e) => e.lane)) + 1
          : (from?.lane ?? to?.lane ?? 0),
        id = uid();
      const event = {
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
      };
      t.events.push(event);
      if (from && !to) placeAfterSource(t, from, event, surface);
      if (from && to) {
        const index = t.edges.findIndex((e) => e[0] === from.id && e[1] === to.id),
          reverse = t.edges[index]?.[2] || false;
        if (index >= 0) t.edges.splice(index, 1);
        t.edges.push([from.id, id, reverse], [id, to.id, reverse]);
      } else if (from) t.edges.push([from.id, id]);
      else if (to) connectBefore(t, id, to.id);
      error = validateTask(t);
      if (!error) createdId = id;
      return error;
    });
  if (!valid) {
    $('event-warning').textContent = error || 'This change was not saved.';
    $('event-warning').hidden = false;
    return;
  }
  closeEditor();
  if (createdId) revealNewEvent(tid, createdId, surface);
  toast('Event saved');
};
$('close-editor').onclick = closeEditor;
$('editor-backdrop').onclick = closeEditor;
$('add-before-event').onclick = () => {
  const { tid, eid } = editing;
  openBefore(tid, eid, $('add-before-event'));
};
function openBefore(tid, eid, anchor) {
  const target = taskBy(tid).events.find((event) => event.id === eid);
  openEditor(tid, null, null, false, anchor, iso(day(visibleDate(target)) - 1), eid);
}
let batchTaskId = null;
function syncBatchRow(row) {
  const action = row.querySelector('.batch-type').value === 'action',
    target = row.querySelector('.batch-has-target').checked,
    done = row.querySelector('.batch-done').checked;
  row.querySelector('.batch-target-toggle').hidden = !action;
  row.querySelector('.batch-target-field').hidden = !action || !target;
  row.querySelector('.batch-target').required = action && target;
  row.querySelector('.batch-done-toggle').hidden = !action;
  row.querySelector('.batch-actual-field').hidden = !action || !done;
  row.querySelector('.batch-actual').required = action && done;
  row.querySelector('.batch-date-label').textContent = action ? 'Trigger date' : 'Occurrence date';
}
function appendBatchRow(date) {
  const row = document.createElement('fieldset');
  row.className = 'batch-row';
  row.innerHTML = `<legend>Activity <span class="batch-number"></span></legend><button class="icon-button batch-remove" type="button" aria-label="Remove activity">×</button><label>Description<input class="batch-description" required maxlength="220" dir="auto" placeholder="Describe the activity" /></label><div class="batch-fields"><label>Type<select class="batch-type"><option value="fact">● Recorded event</option><option value="action">○ Action needed</option></select></label><label><span class="batch-date-label">Occurrence date</span><input class="batch-date" type="date" required value="${date}" /></label></div><label class="check-label batch-target-toggle" hidden><input class="batch-has-target" type="checkbox" /> Set a target date</label><label class="batch-target-field" hidden>Target date<input class="batch-target" type="date" value="${date}" /></label><label class="check-label batch-done-toggle" hidden><input class="batch-done" type="checkbox" /> Completed</label><label class="batch-actual-field" hidden>Actual completion date<input class="batch-actual" type="date" value="${date}" /></label>`;
  row.querySelector('.batch-type').onchange = () => syncBatchRow(row);
  row.querySelector('.batch-has-target').onchange = () => syncBatchRow(row);
  row.querySelector('.batch-done').onchange = () => syncBatchRow(row);
  row.querySelector('.batch-remove').onclick = () => {
    if ($('batch-rows').children.length === 1) return;
    row.remove();
    [...$('batch-rows').children].forEach(
      (item, index) => (item.querySelector('.batch-number').textContent = index + 1),
    );
  };
  $('batch-rows').append(row);
  row.querySelectorAll('input[type="date"]').forEach(enhanceDateInput);
  row.querySelector('.batch-number').textContent = $('batch-rows').children.length;
  syncBatchRow(row);
  return row;
}
function openBatch(tid, afterId = null) {
  if (!$('editor').hidden) closeEditor();
  batchTaskId = tid;
  const task = taskBy(tid),
    latest = [...task.events].sort((a, b) => day(visibleDate(b)) - day(visibleDate(a)))[0];
  $('batch-task').textContent = `${project().name} / ${task.name}`;
  $('batch-source').innerHTML =
    `<option value="">Start an independent path</option>` +
    task.events
      .map(
        (event) =>
          `<option value="${event.id}">${esc(event.description)} · ${dateLabel(visibleDate(event))}</option>`,
      )
      .join('');
  $('batch-source').value = afterId || latest?.id || '';
  $('batch-order').value = 'date';
  syncBatchGuide();
  $('batch-rows').replaceChildren();
  $('batch-warning').hidden = true;
  const source = task.events.find((event) => event.id === $('batch-source').value);
  appendBatchRow(source ? iso(day(visibleDate(source)) + 1) : today());
  $('batch-dialog').showModal();
  $('batch-rows').querySelector('.batch-description').focus();
}
function syncBatchGuide() {
  const source = taskBy(batchTaskId)?.events.find((event) => event.id === $('batch-source').value);
  $('batch-guide').textContent =
    $('batch-order').value === 'date'
      ? source
        ? `Dates before ${dateLabel(visibleDate(source))} connect before “${source.description}”; dates on or after it connect after. The activities are connected by date without changing any dates.`
        : 'The activities will form a new path in date order. Their entered dates stay unchanged.'
      : source
        ? `The first activity connects after “${source.description}”, then each following row connects after the previous one. Dates may be in any order.`
        : 'The activities will form a new path in the order shown. Dates may be in any order.';
}
$('batch-source').onchange = syncBatchGuide;
$('batch-order').onchange = syncBatchGuide;
$('add-sequence-from-event').onclick = () => {
  const { tid, eid } = editing;
  openBatch(tid, eid);
};
$('batch-add-row').onclick = () => {
  const previous = $('batch-rows').lastElementChild.querySelector('.batch-date').value || today();
  appendBatchRow(iso(day(previous) + 1))
    .querySelector('.batch-description')
    .focus();
};
$('close-batch').onclick = $('cancel-batch').onclick = () => $('batch-dialog').close();
$('batch-form').onsubmit = (event) => {
  event.preventDefault();
  const rows = [...$('batch-rows').children],
    sourceId = $('batch-source').value,
    tid = batchTaskId;
  let lastId, error;
  const valid = commit(() => {
    const task = taskBy(tid),
      source = task.events.find((item) => item.id === sourceId),
      lane = source
        ? source.lane
        : task.events.length
          ? Math.max(...task.events.map((item) => item.lane)) + 1
          : 0;
    const newIds = [];
    for (const row of rows) {
      const kind = row.querySelector('.batch-type').value,
        date = row.querySelector('.batch-date').value,
        hasTarget = kind === 'action' && row.querySelector('.batch-has-target').checked,
        scheduled =
          kind === 'fact' ? date : hasTarget ? row.querySelector('.batch-target').value : null,
        done = kind === 'fact' || row.querySelector('.batch-done').checked,
        id = uid();
      task.events.push({
        id,
        description: row.querySelector('.batch-description').value.trim(),
        kind,
        done,
        occurred: kind === 'fact' ? date : null,
        triggered: date,
        scheduled,
        planned: scheduled,
        actual: kind === 'fact' ? date : done ? row.querySelector('.batch-actual').value : null,
        lane,
      });
      newIds.push(id);
      lastId = id;
    }
    connectBatch(task, source?.id || null, newIds, $('batch-order').value);
    error = validateTask(task);
    return error;
  });
  if (!valid) {
    $('batch-warning').textContent = error || 'The activities were not saved.';
    $('batch-warning').hidden = false;
    return;
  }
  $('batch-dialog').close();
  revealNewEvent(tid, lastId, focusedTask === tid ? 'modal' : 'main');
  toast(`${rows.length} ${rows.length === 1 ? 'activity' : 'activities'} saved`);
};
let movingEditor = null;
$('editor')
  .querySelector('.popup-heading')
  .addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') || $('editor').hidden) return;
    e.preventDefault();
    movingEditor = {
      x: e.clientX,
      y: e.clientY,
      left: $('editor').offsetLeft,
      top: $('editor').offsetTop,
      capture: e.currentTarget,
      pointerId: e.pointerId,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    $('editor').classList.add('moving');
  });
window.addEventListener('pointermove', (e) => {
  if (!movingEditor) return;
  $('editor').style.left =
    Math.max(
      8,
      Math.min(
        innerWidth - $('editor').offsetWidth - 8,
        movingEditor.left + e.clientX - movingEditor.x,
      ),
    ) + 'px';
  $('editor').style.top =
    Math.max(
      8,
      Math.min(
        innerHeight - $('editor').offsetHeight - 8,
        movingEditor.top + e.clientY - movingEditor.y,
      ),
    ) + 'px';
});
window.addEventListener('pointerup', () => {
  if (movingEditor?.capture.hasPointerCapture(movingEditor.pointerId))
    movingEditor.capture.releasePointerCapture(movingEditor.pointerId);
  movingEditor = null;
  $('editor').classList.remove('moving');
});
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
function openName(mode, tid = null) {
  nameMode = mode;
  editingTaskId = tid;
  $('name-title').textContent = mode === 'project' ? 'New project' : 'Edit task';
  $('name-submit').textContent = mode === 'project' ? 'Create project' : 'Save task';
  $('description-field').hidden = false;
  const t = tid ? taskBy(tid) : null;
  $('name-input').value = t?.name || '';
  $('name-description').value = t?.description || '';
  $('name-dialog').showModal();
  $('name-input').focus();
}
$('add-task').onclick = () => {
  $('quick-task-project').value = active;
  $('quick-task-form').scrollIntoView({ block: 'start', behavior: 'smooth' });
  $('quick-task-name').focus({ preventScroll: true });
};
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
    } else {
      const t = taskBy(editingTaskId);
      t.name = name;
      t.description = $('name-description').value.trim();
    }
  });
  $('name-dialog').close();
  if (nameMode === 'project') location.hash = '#/project/' + active;
};
$('new-project-main').onclick = () => openName('project');
$('quick-task-form').onsubmit = (e) => {
  e.preventDefault();
  const name = $('quick-task-name').value.trim(),
    projectId = $('quick-task-project').value;
  if (!name || !data.projects.some((p) => p.id === projectId)) return;
  const created = commit(() => {
    data.projects
      .find((p) => p.id === projectId)
      .tasks.unshift({
        id: uid(),
        name,
        events: [],
        edges: [],
      });
  });
  if (!created) return;
  $('quick-task-name').value = '';
  if (view !== 'project' || active !== projectId) location.hash = '#/project/' + projectId;
  else scrollTo({ top: 0, behavior: 'smooth' });
};
let keepSiteState = false;
window.addEventListener('hashchange', () => {
  if (focusedTask) closeTask();
  closeEditor();
  infoOpen = false;
  $('workspace-search').value = '';
  // Messages belong to the screen they were shown on, unless go() set them for the next one.
  if (!keepSiteState) siteState = { email: siteState.email, note: '', error: '' };
  keepSiteState = false;
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
  openEditor(
    tid,
    null,
    a,
    false,
    anchor,
    iso(end - start < 2 ? start : Math.floor((start + end) / 2)),
    b,
  );
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
    '[data-first],[data-zoom],[data-fit],[data-expand],[data-between],[data-edge],[data-event],[data-before],[data-tidy],[data-move-task],[data-edit-task],[data-add-sequence]',
  );
  if (!target || drag) return;
  if (target.dataset.addSequence) openBatch(target.dataset.addSequence);
  else if (target.dataset.editTask) openName('edit-task', target.dataset.editTask);
  else if (target.dataset.moveTask)
    moveTask(target.dataset.moveTask, Number(target.dataset.direction));
  else if (target.dataset.tidy)
    commit(() => {
      for (const event of taskBy(target.dataset.tidy).events) delete event.layout;
    });
  else if (target.dataset.first) openEditor(target.dataset.first);
  else if (target.dataset.before) openBefore(target.dataset.task, target.dataset.before, target);
  else if (target.dataset.zoom) {
    const k = target.dataset.surface + ':' + target.dataset.task;
    viewZoom[k] = Math.min(
      8,
      Math.max(0.35, (viewZoom[k] || 1) * (target.dataset.zoom === 'in' ? 1.3 : 1 / 1.3)),
    );
    target.dataset.surface === 'modal' ? renderTaskDialog() : render();
  } else if (target.dataset.fit) {
    if (taskBy(target.dataset.fit).events.some((e) => e.layout))
      commit(() => {
        for (const event of taskBy(target.dataset.fit).events) delete event.layout;
      });
    fitTask(target.dataset.fit, target.dataset.surface);
    target.dataset.surface === 'modal' ? renderTaskDialog() : render();
    resetFitScroll(target.dataset.fit, target.dataset.surface);
  } else if (target.dataset.expand) openTask(target.dataset.expand);
  else if (target.dataset.between !== undefined)
    insert(target.dataset.task, +target.dataset.between, target);
  else if (target.dataset.edge !== undefined)
    openConnection(target.dataset.task, +target.dataset.edge);
  else if (target.dataset.event)
    openEditor(target.dataset.task, target.dataset.event, null, false, target);
}
function moveTask(id, step, toId = null, after = false) {
  const tasks = project().tasks,
    from = tasks.findIndex((t) => t.id === id),
    target = toId ? tasks.findIndex((t) => t.id === toId) : -1,
    beforeRemoval = toId ? target + (after ? 1 : 0) : from + step,
    to = toId && from < beforeRemoval ? beforeRemoval - 1 : beforeRemoval;
  if (from < 0 || to < 0 || to >= tasks.length || from === to) return;
  commit(() => {
    tasks.splice(to, 0, tasks.splice(from, 1)[0]);
  });
}
let draggedTask = null,
  dropTarget = null,
  dropPlaceholder = null,
  dragSource = null;
function clearTaskDrag() {
  dropPlaceholder?.remove();
  dragSource?.classList.remove('drag-source');
  draggedTask = dropTarget = dropPlaceholder = dragSource = null;
}
$('timeline-content').addEventListener('dragstart', (e) => {
  const handle = e.target.closest('[data-drag-task]');
  if (!handle) return;
  draggedTask = handle.dataset.dragTask;
  dragSource = handle.closest('[data-task-row]');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedTask);
  e.dataTransfer.setDragImage(dragSource.querySelector('.task-label'), 28, 20);
  requestAnimationFrame(() => dragSource?.classList.add('drag-source'));
});
$('timeline-content').addEventListener('dragover', (e) => {
  if (!draggedTask) return;
  const row = e.target.closest('[data-task-row]');
  if (!row && !e.target.closest('.task-drop-placeholder')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (!row) return;
  if (row.dataset.taskRow === draggedTask) {
    dropPlaceholder?.remove();
    dropTarget = null;
    return;
  }
  const head = row.querySelector('.task-label').getBoundingClientRect(),
    after = e.clientY > head.top + head.height / 2;
  if (dropTarget?.id === row.dataset.taskRow && dropTarget.after === after) return;
  dropPlaceholder ||= document.createElement('div');
  dropPlaceholder.className = 'task-drop-placeholder';
  dropPlaceholder.textContent = 'Place task here';
  row.parentNode.insertBefore(dropPlaceholder, after ? row.nextSibling : row);
  dropTarget = { id: row.dataset.taskRow, after };
  if (e.clientY < 80) window.scrollBy(0, -12);
  else if (e.clientY > innerHeight - 80) window.scrollBy(0, 12);
});
$('timeline-content').addEventListener('drop', (e) => {
  if (!draggedTask || !dropTarget) return;
  e.preventDefault();
  const { id, after } = dropTarget,
    source = draggedTask;
  clearTaskDrag();
  moveTask(source, 0, id, after);
});
$('timeline-content').addEventListener('dragend', clearTaskDrag);
for (const container of [$('timeline-content'), $('task-dialog-content')]) {
  container.addEventListener(
    'click',
    (e) => {
      if (
        performance.now() >= suppressClickUntil ||
        !e.target.closest('[data-event],[data-port],[data-before]')
      )
        return;
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
    if (!e.relatedTarget?.closest?.('[data-event],[data-edge]')) hideHover();
  });
  container.addEventListener('focusout', hideHover);
  container.addEventListener('pointerdown', beginDrag);
}
function fitTask(tid, surface = 'main') {
  const scroll = document.querySelector(
    `.task-scroll[data-scroll="${tid}"][data-surface="${surface}"]`,
  );
  if (scroll) viewZoom[surface + ':' + tid] = fitTimelineZoom(taskBy(tid), scroll.clientWidth - 36);
}
function resetFitScroll(tid, surface = 'main') {
  const scroll = document.querySelector(
    `.task-scroll[data-scroll="${tid}"][data-surface="${surface}"]`,
  );
  if (scroll) scroll.scrollLeft = 0;
}
$('fit').onclick = () => {
  if (project().tasks.some((t) => t.events.some((e) => e.layout)))
    commit(() => {
      for (const task of project().tasks) for (const event of task.events) delete event.layout;
    });
  for (const task of project().tasks) fitTask(task.id);
  render();
  for (const task of project().tasks) resetFitScroll(task.id);
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
$('delete-connection').onclick = () => {
  const { tid, index } = connection;
  $('connection-dialog').close();
  commit(() => {
    taskBy(tid).edges.splice(index, 1);
  });
  toast('Connection deleted. Drag from a + handle to reconnect.');
};
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
  const node = e.target.closest('[data-event]'),
    edge = e.target.closest('[data-edge]');
  if (!node && !edge) return;
  const r = (node || edge).getBoundingClientRect();
  if (node) {
    const t = taskBy(node.dataset.task),
      ev = t.events.find((x) => x.id === node.dataset.event);
    $('hover-preview').innerHTML =
      `<strong dir="auto">${esc(ev.description)}</strong><span><bdi>${esc(t.name)}</bdi> · ${ev.kind === 'fact' ? 'Recorded event' : ev.done ? 'Completed action' : 'Action needed'}</span>${ev.kind === 'fact' ? `<div>Occurred <b>${dateLabel(ev.occurred)}</b></div>` : `<div>Triggered <b>${dateLabel(ev.triggered)}</b></div><div>Target <b>${ev.scheduled ? dateLabel(ev.scheduled) : 'Not set'}</b></div><div>Actual <b>${dateLabel(ev.actual)}</b></div><div>Original target <b>${dateLabel(ev.planned)}</b></div>`}`;
  } else {
    const t = taskBy(edge.dataset.task),
      [a, b] = t.edges[Number(edge.dataset.edge)],
      from = t.events.find((x) => x.id === a),
      to = t.events.find((x) => x.id === b),
      days = Math.abs(day(visibleDate(to)) - day(visibleDate(from))),
      complete = (from.kind === 'fact' || from.done) && (to.kind === 'fact' || to.done),
      adjusted = !!(from.layout || to.layout);
    $('hover-preview').innerHTML =
      `<strong>${days ? plural(days, 'day') : 'Same day'}</strong><span>${complete ? 'Time between activities' : 'Scheduled interval'}</span><div><bdi dir="auto">${esc(from.description)}</bdi><b>${dateLabel(visibleDate(from))}</b></div><div><bdi dir="auto">${esc(to.description)}</bdi><b>${dateLabel(visibleDate(to))}</b></div>${adjusted ? '<small>Visual spacing adjusted · dates unchanged</small>' : ''}`;
  }
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
    e.preventDefault();
    const svg = node.closest('svg'),
      ev = taskBy(node.dataset.task).events.find((x) => x.id === node.dataset.event);
    node.classList.add('dragging');
    drag = {
      kind: 'arrange',
      tid: node.dataset.task,
      eid: node.dataset.event,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      node,
      port: svg.querySelector(`[data-port="${node.dataset.event}"]`),
      beforePort: svg.querySelector(`[data-before="${node.dataset.event}"]`),
      svg,
      baseWidth: Number(svg.getAttribute('width')),
      baseHeight: Number(svg.getAttribute('height')),
      offset: ev.layout || { dx: 0, dy: 0 },
      deltaX: 0,
      deltaY: 0,
      surface: svg.dataset.surface,
    };
  } else if (panning && !e.target.closest('button')) {
    drag = {
      kind: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      left: scroll.scrollLeft,
      top: scroll.scrollTop,
      pageTop: window.scrollY,
      scroll,
      moved: false,
    };
    e.preventDefault();
  }
  if (drag) {
    drag.pointerId = e.pointerId;
    drag.capture = scroll;
    scroll.setPointerCapture(e.pointerId);
  }
}
function previewPointMove(d, rawX, rawY, clientX, clientY) {
  const t = taskBy(d.tid),
    g = geometry.get(d.surface + ':' + d.tid),
    base = g.nodes.get(d.eid),
    dx = Math.max(78 - base.x, -5000 - d.offset.dx, Math.min(5000 - d.offset.dx, rawX)),
    dy = Math.max(8 - base.labelY, -5000 - d.offset.dy, Math.min(5000 - d.offset.dy, rawY)),
    moved = { x: base.x + dx, y: base.y + dy };
  d.deltaX = dx;
  d.deltaY = dy;
  d.node.setAttribute('transform', `translate(${dx},${dy})`);
  d.port?.setAttribute('transform', `translate(${dx},${dy})`);
  d.beforePort?.setAttribute('transform', `translate(${dx},${dy})`);
  for (let i = 0; i < t.edges.length; i++) {
    const [a, b] = t.edges[i];
    if (a !== d.eid && b !== d.eid) continue;
    const before = edgeGeometry(g.nodes.get(a), g.nodes.get(b)),
      next = edgeGeometry(
        a === d.eid ? moved : g.nodes.get(a),
        b === d.eid ? moved : g.nodes.get(b),
      );
    d.svg.querySelector(`[data-edge="${i}"]`)?.setAttribute('d', next.path);
    d.svg.querySelector(`[data-edge-line="${i}"]`)?.setAttribute('d', next.path);
    const between = d.svg.querySelector(`[data-between="${i}"]`);
    between?.setAttribute('transform', `translate(${next.mx - before.mx},${next.my - before.my})`);
  }
  d.svg.setAttribute('width', Math.max(d.baseWidth, moved.x + 90));
  d.svg.setAttribute('height', Math.max(d.baseHeight, moved.y + 52));
  $('drag-cue').hidden = false;
  $('drag-cue').textContent = 'Visual layout only · dates unchanged';
  $('drag-cue').style.left =
    Math.min(innerWidth - $('drag-cue').offsetWidth - 12, clientX + 16) + 'px';
  $('drag-cue').style.top = Math.min(innerHeight - 38, clientY + 16) + 'px';
}
window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.startX,
    dy = e.clientY - drag.startY;
  if (Math.abs(dx) + Math.abs(dy) > 7) drag.moved = true;
  if (drag.kind === 'pan') {
    drag.scroll.scrollLeft = drag.left - dx;
    if (drag.scroll.dataset.surface === 'modal') drag.scroll.scrollTop = drag.top - dy;
    else window.scrollTo(window.scrollX, drag.pageTop - dy);
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
  if (drag.kind === 'arrange' && drag.moved) previewPointMove(drag, dx, dy, e.clientX, e.clientY);
});
window.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (d.capture?.hasPointerCapture(d.pointerId)) d.capture.releasePointerCapture(d.pointerId);
  $('drag-cue').hidden = true;
  d.node?.classList.remove('dragging');
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
        date = d.moved ? iso(b.dateAt(e.clientX - r.left)) : iso(day(visibleDate(from)) + 1),
        branch = d.moved && Math.abs(e.clientY - d.startY) > 40;
      openEditor(d.tid, null, d.from, branch, d.port, date);
    }
  } else if (d.kind === 'arrange' && d.moved) {
    commit(() => {
      taskBy(d.tid).events.find((x) => x.id === d.eid).layout = {
        dx: Math.round(d.offset.dx + d.deltaX),
        dy: Math.round(d.offset.dy + d.deltaY),
      };
    });
  } else if (d.kind === 'arrange') {
    openEditor(d.tid, d.eid, null, false, d.node);
  }
  // Ignore the click the browser fires right after this pointerup. A time window, rather than a
  // one-off listener, cannot swallow a later click when the pointer was released elsewhere.
  if (d.moved || d.kind === 'arrange') suppressClickUntil = performance.now() + 400;
});
window.addEventListener('pointercancel', () => {
  if (movingEditor) {
    movingEditor = null;
    $('editor').classList.remove('moving');
  }
  if (!drag) return;
  drag.path?.remove();
  drag = null;
  $('drag-cue').hidden = true;
  render();
  if (focusedTask) renderTaskDialog();
});
function showCalendar() {
  const date = $('calendar-date').value || today(),
    rows = [];
  $('calendar-month').textContent = new Date(date.slice(0, 7) + '-01T12:00:00Z').toLocaleDateString(
    'en-GB',
    {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    },
  );
  $('calendar-selected-label').textContent = new Date(date + 'T12:00:00Z').toLocaleDateString(
    'en-GB',
    {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    },
  );
  const first = date.slice(0, 7) + '-01',
    offset = (new Date(first + 'T12:00:00Z').getUTCDay() + 6) % 7,
    gridStart = day(first) - offset,
    end = day(
      new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7), 0)).toISOString().slice(0, 10),
    ),
    count = Math.ceil((end - gridStart + 1) / 7) * 7;
  $('calendar-grid').innerHTML = Array.from({ length: count }, (_, index) => {
    const current = iso(gridStart + index),
      events = data.projects.flatMap((p) =>
        p.tasks.flatMap((t) =>
          t.events.filter(
            (e) =>
              (e.kind === 'fact' && e.occurred === current) ||
              (e.kind === 'action' &&
                (e.triggered === current || e.scheduled === current || e.actual === current)),
          ),
        ),
      ),
      recorded = events.some((e) => e.kind === 'fact'),
      action = events.some((e) => e.kind === 'action');
    return `<button class="calendar-day${current.slice(0, 7) === date.slice(0, 7) ? '' : ' outside'}${current === today() ? ' today' : ''}" data-calendar-day="${current}" aria-pressed="${current === date}" aria-label="${dateLabel(current)}, ${events.length} ${events.length === 1 ? 'activity' : 'activities'}"><span>${+current.slice(8)}</span><i class="calendar-dots">${recorded ? '<b class="fact"></b>' : ''}${action ? '<b class="action"></b>' : ''}</i></button>`;
  }).join('');
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
                  ? 'Target today'
                  : !e.done && e.scheduled && e.scheduled < date
                    ? 'Overdue action'
                    : 'Active action',
          });
      }
  $('calendar-results').innerHTML = rows.length
    ? rows
        .map(
          ({ p, t, e, label }) =>
            `<button class="calendar-entry ${e.kind}" type="button" data-calendar-project="${p.id}" data-calendar-task="${t.id}" data-calendar-event="${e.id}"><i class="calendar-entry-dot"></i><div><span><bdi>${esc(p.name)}</bdi> / <bdi>${esc(t.name)}</bdi></span><strong dir="auto">${esc(e.description)}</strong><small>${label}${e.kind === 'action' ? (e.scheduled ? ' · Target ' + dateLabel(e.scheduled) : ' · No target date') : ''}</small></div></button>`,
        )
        .join('')
    : '<p class="calendar-empty">Nothing scheduled or recorded for this day.</p>';
}
$('calendar-nav').onclick = () => {
  $('calendar-date').value = today();
  $('calendar-date').dispatchEvent(new Event('input', { bubbles: true }));
  showCalendar();
  $('calendar-dialog').showModal();
};
$('calendar-date').onchange = () => {
  if ($('calendar-date').checkValidity()) showCalendar();
};
$('calendar-grid').onclick = (event) => {
  const button = event.target.closest('[data-calendar-day]');
  if (!button) return;
  $('calendar-date').value = button.dataset.calendarDay;
  $('calendar-date').dispatchEvent(new Event('input', { bubbles: true }));
  showCalendar();
};
$('calendar-results').onclick = (event) => {
  const entry = event.target.closest('[data-calendar-event]');
  if (!entry) return;
  const {
    calendarProject: projectId,
    calendarTask: taskId,
    calendarEvent: eventId,
  } = entry.dataset;
  $('calendar-dialog').close();
  const open = () => openEditor(taskId, eventId);
  if (view === 'project' && active === projectId) open();
  else {
    window.addEventListener('hashchange', () => requestAnimationFrame(open), { once: true });
    location.hash = `#/project/${projectId}`;
  }
};
for (const [id, change] of [
  ['calendar-prev', -1],
  ['calendar-next', 1],
])
  $(id).onclick = () => {
    const selected = $('calendar-date').checkValidity()
        ? $('calendar-date').value || today()
        : today(),
      month = new Date(Date.UTC(+selected.slice(0, 4), +selected.slice(5, 7) - 1 + change, 1));
    $('calendar-date').value = month.toISOString().slice(0, 10);
    $('calendar-date').dispatchEvent(new Event('input', { bubbles: true }));
    showCalendar();
  };
$('calendar-today').onclick = () => {
  $('calendar-date').value = today();
  $('calendar-date').dispatchEvent(new Event('input', { bubbles: true }));
  showCalendar();
};
$('close-calendar').onclick = () => $('calendar-dialog').close();
window.addEventListener('keydown', (e) => {
  const typing = e.target.matches('input,textarea,select,[contenteditable]'),
    dialogOpen = document.querySelector('dialog[open]:not(#task-dialog)'),
    editorWasOpen = !$('editor').hidden;
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
    if (editorWasOpen) {
      e.preventDefault();
      closeEditor();
    }
    if (drag) {
      drag.path?.remove();
      drag = null;
      render();
      if (focusedTask) renderTaskDialog();
    }
    if (infoOpen && !editorWasOpen && !dialogOpen) closeContextInfo();
  }
  if (e.key === 'Tab' && infoOpen && !editorWasOpen && !dialogOpen) {
    const items = [...$(`${view}-info`).querySelectorAll('button,a,input,select,textarea')].filter(
        (item) => !item.disabled && !item.closest('[hidden]'),
      ),
      first = items[0],
      last = items.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
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
function download(name, content, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('excel-export').onclick = () => {
  const selected = view === 'portfolio' ? data.projects : [project()],
    scope =
      view === 'portfolio'
        ? 'all-tasks'
        : project()
            .name.toLocaleLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') || project().id;
  download(
    `revtimeline-${scope}-${today()}.xlsx`,
    createExcelFile(selected),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  toast(`Excel export downloaded for ${view === 'portfolio' ? 'All tasks' : project().name}.`);
};
$('export').onclick = () => {
  download(
    `revtimeline-backup-${today()}.json`,
    JSON.stringify({ app: 'RevTimeline', exportedAt: new Date().toISOString(), data }, null, 2),
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
    incoming = migrate(BACKUP_APPS.includes(parsed?.app) ? parsed.data : parsed);
    reason = checkData(incoming);
  } catch {
    reason = 'It is not a RevTimeline backup file.';
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
// Replaces everything on screen with data saved elsewhere (another tab or device).
// Undo history is cleared because it refers to the replaced data.
function replaceData(incoming, message) {
  data = incoming;
  undoStack = [];
  redoStack = [];
  ensureActive();
  closeEditor();
  for (const id of ['delete-dialog', 'connection-dialog', 'import-dialog', 'project-dialog'])
    $(id).close();
  if (focusedTask && !taskBy(focusedTask)) closeTask();
  viewZoom = {};
  if (screen === 'app') {
    render();
    if (focusedTask) renderTaskDialog();
  }
  if (message) toast(message);
}
// Guest mode: another tab saved, so load its data rather than overwrite it with an older copy.
window.addEventListener('storage', (e) => {
  if (user || e.key !== key || !e.newValue) return;
  let incoming;
  try {
    incoming = readStored(e.newValue);
  } catch {
    return;
  }
  replaceData(incoming, 'Updated with changes made in another tab.');
});
function showRecovery() {
  $('recovery-text').textContent = saveBlocked
    ? 'Your saved RevTimeline data could not be read, so the sample project is shown instead. ' +
      'This browser had no room to keep a safety copy, so changes will not be saved until you download the unreadable data.'
    : 'Your saved RevTimeline data could not be read, so the sample project is shown instead. ' +
      'A copy of the unreadable data has been kept in this browser and will not be overwritten. Download it and keep it safe; it may be recoverable.';
  $('recovery').hidden = false;
}
$('recovery-download').onclick = () => {
  download(`revtimeline-unreadable-${today()}.json`, unreadable);
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

// ---- Accounts and syncing ----
const STATUS_TEXT = {
  pending: 'Saving…',
  saving: 'Saving…',
  saved: 'Saved to your account',
  offline: 'Offline · changes kept on this device',
};
function setStatus(state) {
  if (!user) return;
  $('saved').textContent = STATUS_TEXT[state] || '';
  if (state === 'saved') {
    writeAccountCache(false);
    if (!conflictMine) {
      try {
        localStorage.removeItem(conflictKey());
      } catch {}
    }
  }
}
function remoteData(latest) {
  const incoming = migrate(structuredClone(latest.data)),
    error = checkData(incoming);
  if (error) throw Error('The workspace saved in your account could not be read. ' + error);
  return incoming;
}
// First sign-in: upload this browser's projects, or start empty, or start with the example.
function chooseFirstWorkspace() {
  const guest = readGuest(),
    sampleProjects = JSON.stringify(migrate(structuredClone(sample)).projects),
    hasGuest = !!guest && JSON.stringify(guest.projects) !== sampleProjects;
  $('first-upload').hidden = !hasGuest;
  $('first-summary').textContent = hasGuest
    ? `This browser has ${plural(guest.projects.length, 'project')} saved without an account. Upload them to your account, or start fresh. The projects in this browser stay here either way.`
    : 'Your account has no projects yet. Start with an empty project, or explore the example project first.';
  return new Promise((resolve) => {
    const pick = (value) => {
      $('first-dialog').close();
      resolve(value);
    };
    $('first-upload').onclick = () => pick(guest);
    $('first-empty').onclick = () =>
      pick(
        migrate({
          projects: [{ id: uid(), name: 'My first project', description: '', tasks: [] }],
        }),
      );
    $('first-sample').onclick = () => pick(migrate(structuredClone(sample)));
    $('booting').hidden = true;
    $('first-dialog').showModal();
  });
}
$('first-dialog').addEventListener('cancel', (e) => e.preventDefault());

// Loads the account's workspace, using the copy kept on this device to open instantly.
async function startAccount(sessionUser) {
  user = sessionUser;
  sync = createSync({
    save: account.save,
    load: account.load,
    onStatus: setStatus,
    onConflict: showConflict,
    onRemote: (latest) => {
      try {
        replaceData(remoteData(latest), 'Updated with changes from another device.');
        writeAccountCache(false);
      } catch (err) {
        toast(err.message);
      }
    },
  });
  const cached = readAccountCache(),
    savedConflict = readAccountConflict();
  if (cached) {
    data = migrate(cached.data);
    sync.setVersion(cached.version);
  }
  let latest;
  try {
    latest = await account.load();
  } catch (err) {
    if (!cached) throw err;
    setStatus('offline');
    return;
  }
  if (!latest) {
    data = await chooseFirstWorkspace();
    sync.setVersion(0);
    save();
    await sync.flushNow();
  } else if (savedConflict) {
    sync.setVersion(latest.version);
    showConflict(latest, savedConflict);
  } else if (cached?.dirty && cached.version === latest.version) {
    save(); // Upload changes made on this device while it was offline.
  } else if (cached?.dirty) {
    sync.setVersion(latest.version);
    showConflict(latest, cached.data);
  } else {
    data = remoteData(latest);
    sync.setVersion(latest.version);
    writeAccountCache(false);
    setStatus('saved');
  }
  undoStack = [];
  redoStack = [];
  active = data.projects[0].id;
}
let entering = null;
function enterAccount(sessionUser) {
  if (user?.id === sessionUser.id) return Promise.resolve();
  entering ||= (async () => {
    $('booting').hidden = false;
    try {
      await startAccount(sessionUser);
    } catch (err) {
      console.error(err);
      user = null;
      sync = null;
      $('booting').textContent =
        'RevTimeline could not load your workspace. Check your internet connection, then reload the page.';
      return;
    }
    unwatch = account.watch(user.id, (version) => sync.remoteChanged(version).catch(() => {}));
    if (location.hash !== '#/new-password' && !/^#\/(portfolio|project\/)/.test(location.hash))
      history.replaceState(null, '', '#/portfolio');
    route();
    render();
  })().finally(() => (entering = null));
  return entering;
}
function showConflict(latest, mine) {
  conflictMine = mine;
  let keptOnDevice = false;
  try {
    localStorage.setItem(conflictKey(), JSON.stringify(mine));
    keptOnDevice = true;
  } catch {}
  try {
    replaceData(remoteData(latest));
  } catch (err) {
    toast(err.message);
  }
  if (keptOnDevice) setStatus('saved');
  else $('saved').textContent = "Conflict · download this device's version";
  $('conflict').hidden = false;
}
$('conflict-keep').onclick = () => {
  const mine = migrate(structuredClone(conflictMine));
  conflictMine = null;
  $('conflict').hidden = true;
  replaceData(mine, "Saving this device's version to your account.");
  save();
};
$('conflict-download').onclick = () =>
  download(
    `revtimeline-this-device-${today()}.json`,
    JSON.stringify(
      { app: 'RevTimeline', exportedAt: new Date().toISOString(), data: conflictMine },
      null,
      2,
    ),
  );
$('conflict-dismiss').onclick = () => {
  conflictMine = null;
  $('conflict').hidden = true;
  try {
    localStorage.removeItem(conflictKey());
  } catch {}
};
// Leaves the account. Projects stay in the account; this device's copy is removed.
function leaveAccount() {
  unwatch?.();
  unwatch = null;
  try {
    localStorage.removeItem(accountKey());
  } catch {}
  user = null;
  sync = null;
  data = readGuest() || migrate(structuredClone(sample));
  active = data.projects[0].id;
  undoStack = [];
  redoStack = [];
  viewZoom = {};
  $('conflict').hidden = true;
  $('saved').textContent = 'Saved in this browser';
  go('#/');
}
async function signOut() {
  if (conflictMine) {
    toast('Choose a workspace version before signing out.');
    return;
  }
  if (!sync.idle()) await sync.flushNow().catch(() => {});
  if (!sync.idle()) {
    toast(
      "Some changes haven't reached your account yet. Reconnect to the internet, then sign out.",
    );
    return;
  }
  try {
    const { error } = await account.signOut();
    if (error) throw error;
  } catch (err) {
    toast('Sign out failed. ' + friendlyError(err));
    return;
  }
  if (user) leaveAccount();
}
$('account-action').onclick = () => (user ? signOut() : go('#/sign-in'));
document.addEventListener('visibilitychange', () => {
  if (!user || document.visibilityState !== 'visible') return;
  sync.flushNow();
  sync.remoteChanged().catch(() => {});
});
window.addEventListener('online', () => user && sync.flushNow());

// Public screens: links, sign-in providers and forms.
function formMessage(kind, text) {
  const el = $(kind === 'error' ? 'form-error' : 'form-note');
  if (!el) return toast(text);
  el.textContent = text;
  el.hidden = false;
}
$('site').addEventListener('click', async (e) => {
  const scroll = e.target.closest('[data-scroll]');
  if (scroll) {
    if (screen !== 'landing') go('#/');
    requestAnimationFrame(() => $(scroll.dataset.scroll)?.scrollIntoView({ behavior: 'smooth' }));
    return;
  }
  const provider = e.target.closest('[data-provider]');
  if (provider) {
    const { error } = await account.signInWith(provider.dataset.provider);
    if (error) formMessage('error', friendlyError(error));
    return;
  }
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'guest') {
    try {
      localStorage.setItem(GUEST_KEY, '1');
    } catch {}
    location.hash = '#/portfolio';
  } else if (action === 'resend') {
    const email = (e.target.form?.email?.value || siteState.email).trim();
    if (!email) return formMessage('error', 'Enter your email first.');
    const { error } = await account.resendConfirmation(email);
    if (error) formMessage('error', friendlyError(error));
    else formMessage('note', `Sent to ${email}. Check your inbox and spam folder.`);
  }
});
$('site').addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  if (!account)
    return formMessage('error', 'Accounts are not available right now. Try again later.');
  const kind = form.dataset.form,
    f = Object.fromEntries(new FormData(form)),
    button = form.querySelector('button.primary');
  if (f.email) siteState.email = f.email.trim();
  for (const id of ['form-error', 'form-note']) if ($(id)) $(id).hidden = true;
  button.disabled = true;
  try {
    if (kind === 'sign-in') {
      const { data: res, error } = await account.signIn(siteState.email, f.password);
      if (error) {
        formMessage('error', friendlyError(error));
        if (/not confirmed/i.test(error.message))
          form.querySelector('[data-action="resend"]').hidden = false;
        return;
      }
      await enterAccount(res.user);
    } else if (kind === 'sign-up') {
      const { data: res, error } = await account.signUp(f.name.trim(), siteState.email, f.password);
      if (error) return formMessage('error', friendlyError(error));
      // With email confirmation on, Supabase answers an existing address with no identities.
      if (res.user?.identities?.length === 0)
        return formMessage('error', 'An account with this email already exists. Sign in instead.');
      if (res.session) return enterAccount(res.user);
      go('#/check-email');
    } else if (kind === 'forgot') {
      const { error } = await account.sendPasswordReset(siteState.email);
      if (error) return formMessage('error', friendlyError(error));
      formMessage(
        'note',
        "If there's an account for that email, a reset link is on its way. Check your inbox and spam folder.",
      );
    } else if (kind === 'new-password') {
      if (f.password !== f.repeat) return formMessage('error', "The two passwords don't match.");
      const { error } = await account.setPassword(f.password);
      if (error) return formMessage('error', friendlyError(error));
      location.hash = '#/portfolio';
      toast('Your new password is saved.');
    }
  } finally {
    button.disabled = false;
  }
});

// Start-up: restore the session (including after a confirmation, sign-in or reset link).
let booted = false,
  recovering = false;
async function boot() {
  const params = new URLSearchParams(location.search),
    arrivedWithCode = params.has('code'),
    linkError = params.get('error_description');
  try {
    account = window.supabase ? createAccount() : null;
  } catch (err) {
    console.error(err);
    account = null;
  }
  if (account) {
    account.onChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        recovering = true;
        if (user) location.hash = '#/new-password';
      } else if (event === 'SIGNED_OUT' && user) leaveAccount();
      else if (event === 'SIGNED_IN' && session && booted && !user) enterAccount(session.user);
    });
    const [session, list] = await Promise.all([
      account.session().catch(() => null),
      account.providers(),
    ]);
    providers = list;
    if (arrivedWithCode || linkError)
      history.replaceState(null, '', location.pathname + location.hash);
    if (session) {
      await enterAccount(session.user);
      if (recovering) location.hash = '#/new-password';
    } else if (linkError) {
      siteState.error = `${linkError}. Sign in, or ask for a new link.`;
      history.replaceState(null, '', '#/sign-in');
    } else if (arrivedWithCode) {
      siteState.note = 'Your email is confirmed. Sign in to continue.';
      history.replaceState(null, '', '#/sign-in');
    }
  }
  booted = true;
  if (user) return;
  route();
  render();
  if (unreadable) {
    showRecovery();
    if (saveBlocked) save();
  } else if (stored) save();
}
boot();
