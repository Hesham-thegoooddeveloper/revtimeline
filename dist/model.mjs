export const DAY = 86400000;
export function day(s) {
  return Math.round(Date.parse(s + 'T00:00:00Z') / DAY);
}
export function iso(n) {
  return new Date(n * DAY).toISOString().slice(0, 10);
}
export function visibleDate(e) {
  return e.kind === 'fact' ? e.occurred : e.done ? e.actual : e.scheduled;
}
export function migrate(data) {
  for (const p of data.projects)
    for (const t of p.tasks)
      for (const e of t.events) {
        if (!e.kind) {
          e.kind = e.done ? 'fact' : 'action';
          e.triggered = e.planned || e.scheduled || e.actual;
          e.occurred = e.done ? e.actual : null;
        }
        e.lane = e.lane || 0;
      }
  return data;
}
export function validateTask(task) {
  for (const e of task.events) {
    const d = visibleDate(e);
    if (!d || !Number.isFinite(day(d))) return 'Enter a valid event date.';
    if (e.kind === 'action' && e.triggered && day(d) < day(e.triggered))
      return 'The due or completion date cannot be before the trigger date.';
  }
  const map = new Map(task.events.map((e) => [e.id, e]));
  for (const [a, b] of task.edges) {
    const x = map.get(a),
      y = map.get(b);
    if (x && y && day(visibleDate(x)) > day(visibleDate(y)))
      return 'This move would put an event before its preceding event. The dates were not changed.';
  }
  const slots = new Set();
  for (const e of task.events) {
    const slot = `${e.lane}:${visibleDate(e)}`;
    if (slots.has(slot))
      return 'These events would overlap on the same path. Choose another date or create a parallel branch.';
    slots.add(slot);
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
  let shifted = 0;
  if (delta) {
    for (const other of trial.events) {
      if (
        other.id !== id &&
        other.kind === 'action' &&
        !other.done &&
        day(other.scheduled) >= old
      ) {
        other.scheduled = iso(day(other.scheduled) + delta);
        shifted++;
      }
    }
  }
  Object.assign(e, next);
  const error = validateTask(trial);
  if (error) return { error, delta: 0, shifted: 0 };
  Object.assign(task, trial);
  return { delta, shifted };
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
export function removeEvent(task, id) {
  task.events = task.events.filter((e) => e.id !== id);
  task.edges = task.edges.filter((e) => !e.slice(0, 2).includes(id));
}
