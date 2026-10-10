import { day } from './model.mjs?v=2026-10-10-flexible-dates';

// Summaries for the portfolio and project screens. `today` is a YYYY-MM-DD string.
export function openActions(project) {
  return project.tasks.flatMap((task) =>
    task.events.filter((e) => e.kind === 'action' && !e.done).map((event) => ({ task, event })),
  );
}
const byDue = (a, b) =>
  (a.event.scheduled ? day(a.event.scheduled) : Infinity) -
  (b.event.scheduled ? day(b.event.scheduled) : Infinity);
export function nextAction(project) {
  return openActions(project).sort(byDue)[0] || null;
}
export function projectStatus(project, today) {
  const open = openActions(project),
    overdue = open.filter((x) => x.event.scheduled && day(x.event.scheduled) < day(today)).length;
  return {
    key: overdue ? 'overdue' : open.length ? 'on-track' : 'idle',
    overdue,
    open: open.length,
  };
}
export function dueSoon(projects, today, days = 7) {
  const now = day(today);
  return projects
    .flatMap((project) => openActions(project).map((x) => ({ project, ...x })))
    .filter((x) => x.event.scheduled && day(x.event.scheduled) <= now + days)
    .sort(byDue)
    .map((x) => ({ ...x, late: day(x.event.scheduled) < now }));
}
export function contractValue(projects) {
  const totals = new Map();
  for (const p of projects) {
    const value = p.details?.value;
    if (!Number.isFinite(value)) continue;
    const currency = p.details.currency || '';
    totals.set(currency, Math.round(((totals.get(currency) || 0) + value) * 100) / 100);
  }
  return [...totals]
    .map(([currency, total]) => ({ currency, total }))
    .sort((a, b) => b.total - a.total);
}
export function historyCounts(project) {
  const events = project.tasks.flatMap((t) => t.events);
  return {
    done: events.filter((e) => e.done).length,
    open: events.filter((e) => !e.done).length,
  };
}
