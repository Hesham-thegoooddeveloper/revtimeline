export const DAY = 86400000;
export function day(s) {
  return Math.round(Date.parse(s + 'T00:00:00Z') / DAY);
}
export function iso(n) {
  return new Date(n * DAY).toISOString().slice(0, 10);
}
export function visibleDate(e) {
  return e.kind === 'fact' ? e.occurred : e.done ? e.actual : e.scheduled || e.triggered;
}
export const SCHEMA_VERSION = 1;
const list = (v) => (Array.isArray(v) ? v : []);
// IDs are written into HTML attributes, so only allow characters that need no escaping.
const validId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(v);
const validDate = (v) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(day(v)) &&
  iso(day(v)) === v;
const label = (e) => {
  const d = String(e.description ?? '').trim() || 'Untitled event';
  return `“${d.length > 40 ? d.slice(0, 39) + '…' : d}”`;
};
export function migrate(data) {
  data.projects = list(data.projects);
  for (const p of data.projects) {
    p.tasks = list(p.tasks);
    for (const t of p.tasks) {
      t.events = list(t.events);
      t.edges = list(t.edges);
      for (const e of t.events) {
        if (!e.kind) {
          e.kind = e.done ? 'fact' : 'action';
          e.triggered = e.planned || e.scheduled || e.actual;
          e.occurred = e.done ? e.actual : null;
        }
        e.lane = e.lane || 0;
      }
    }
  }
  data.schemaVersion = SCHEMA_VERSION;
  return data;
}
const amount = (v) => (Number.isFinite(v) ? v : null);
// VAT is only calculated once the owner has entered a rate; no default rate is assumed.
export function projectTotals(details) {
  const value = amount(details?.value),
    rate = amount(details?.vatRate);
  if (value === null || rate === null) return { value, rate, vat: null, total: null };
  const vat = Math.round(value * rate) / 100;
  return { value, rate, vat, total: Math.round((value + vat) * 100) / 100 };
}
export function termsPercent(details) {
  return (details?.paymentTerms || []).reduce((sum, t) => sum + (amount(t.percent) ?? 0), 0);
}
function checkDetails(d) {
  if (d === undefined) return true;
  const text = (v) => v === undefined || typeof v === 'string',
    num = (v) => v === undefined || v === null || Number.isFinite(v);
  return (
    typeof d === 'object' &&
    d !== null &&
    text(d.projectNumber) &&
    text(d.customer) &&
    text(d.contractor) &&
    text(d.scope) &&
    text(d.currency) &&
    num(d.value) &&
    num(d.vatRate) &&
    (d.paymentTerms === undefined ||
      (Array.isArray(d.paymentTerms) &&
        d.paymentTerms.every((t) => t && text(t.label) && text(t.condition) && num(t.percent))))
  );
}
export function checkData(data) {
  if (!Array.isArray(data?.projects) || !data.projects.length) return 'It contains no projects.';
  if (data.schemaVersion > SCHEMA_VERSION) return 'It was saved by a newer version of RevTimeline.';
  const projects = new Set();
  for (const p of data.projects) {
    if (!validId(p?.id) || projects.has(p.id) || typeof p.name !== 'string')
      return 'A project has a missing or invalid name or ID.';
    if (!checkDetails(p.details)) return `Project “${p.name}” has invalid project details.`;
    projects.add(p.id);
    const tasks = new Set();
    for (const t of p.tasks) {
      if (
        !validId(t?.id) ||
        tasks.has(t.id) ||
        typeof t.name !== 'string' ||
        (t.description !== undefined && typeof t.description !== 'string')
      )
        return `Project “${p.name}” has a task with a missing or invalid name or ID.`;
      tasks.add(t.id);
      const events = new Set();
      for (const e of t.events) {
        if (
          !validId(e?.id) ||
          events.has(e.id) ||
          typeof e.description !== 'string' ||
          !['fact', 'action'].includes(e.kind) ||
          !Number.isInteger(e.lane) ||
          e.lane < 0 ||
          (e.layout !== undefined &&
            (!e.layout ||
              !Number.isFinite(e.layout.dx) ||
              !Number.isFinite(e.layout.dy) ||
              Math.abs(e.layout.dx) > 5000 ||
              Math.abs(e.layout.dy) > 5000)) ||
          !validDate(visibleDate(e)) ||
          (e.kind === 'action' &&
            (!validDate(e.triggered) || (e.scheduled != null && !validDate(e.scheduled)))) ||
          ['occurred', 'triggered', 'planned', 'scheduled', 'actual'].some(
            (field) => e[field] != null && !validDate(e[field]),
          )
        )
          return `Task “${t.name}” has an event with missing or invalid details or dates.`;
        events.add(e.id);
      }
      for (const edge of t.edges)
        if (!Array.isArray(edge) || !events.has(edge[0]) || !events.has(edge[1]))
          return `Task “${t.name}” has a connection to a missing event.`;
    }
  }
  return null;
}
export function validateTask(task) {
  for (const e of task.events) {
    if (
      !validDate(visibleDate(e)) ||
      (e.kind === 'action' && !validDate(e.triggered)) ||
      ['occurred', 'triggered', 'planned', 'scheduled', 'actual'].some(
        (field) => e[field] != null && !validDate(e[field]),
      )
    )
      return `${label(e)} needs a real calendar date. Check its date fields and try again.`;
  }
  return null;
}
export function updateEvent(task, id, values) {
  const trial = structuredClone(task),
    e = trial.events.find((x) => x.id === id),
    old = day(visibleDate(e)),
    next = { ...e, ...values };
  if (next.kind === 'fact') {
    next.done = true;
    next.actual = next.occurred;
  } else if (!next.done) next.actual = null;
  const delta = day(visibleDate(next)) - old;
  Object.assign(e, next);
  const error = validateTask(trial);
  if (error) return { error, delta: 0, shifted: 0 };
  Object.assign(task, trial);
  return { delta, shifted: 0 };
}
export function canConnect(task, from, to) {
  if (from === to || task.edges.some((e) => e[0] === from && e[1] === to)) return false;
  const queue = [to],
    seen = new Set();
  while (queue.length) {
    const id = queue.pop();
    if (id === from) return false;
    if (seen.has(id)) continue;
    seen.add(id);
    task.edges.filter((e) => e[0] === id).forEach((e) => queue.push(e[1]));
  }
  return true;
}
export function connectBefore(task, newId, targetId) {
  for (const edge of task.edges) if (edge[1] === targetId) edge[1] = newId;
  task.edges.push([newId, targetId]);
  return 'inserted';
}
export function connectBatch(task, sourceId, newIds, order = 'date') {
  const events = new Map(task.events.map((event) => [event.id, event]));
  const ids =
    order === 'date'
      ? [...newIds].sort(
          (a, b) => day(visibleDate(events.get(a))) - day(visibleDate(events.get(b))),
        )
      : newIds;
  if (order === 'entered' || !sourceId) {
    let prior = sourceId;
    for (const id of ids) {
      if (prior) task.edges.push([prior, id]);
      prior = id;
    }
    return;
  }
  const sourceDay = day(visibleDate(events.get(sourceId)));
  let priorAfter = sourceId;
  for (const id of ids) {
    if (day(visibleDate(events.get(id))) < sourceDay) connectBefore(task, id, sourceId);
    else {
      task.edges.push([priorAfter, id]);
      priorAfter = id;
    }
  }
}
export function removeEvent(task, id) {
  task.events = task.events.filter((e) => e.id !== id);
  task.edges = task.edges.filter((e) => !e.slice(0, 2).includes(id));
}
