import { day, visibleDate } from './model.mjs?v=2026-10-10-date-picker';

const PAD = 78;
const MIN_GAP = 184;
const MAX_COLUMNS_PER_VIEW = 5;
const STACK_STEP = 112;

// Keep connected activities in order when several share a day. Unconnected
// activities retain their creation order, so a newly added one sits below them.
function orderedSameDay(events, edges) {
  const byId = new Map(events.map((event) => [event.id, event]));
  const index = new Map(events.map((event, position) => [event.id, position]));
  const incoming = new Map(events.map((event) => [event.id, 0]));
  const outgoing = new Map(events.map((event) => [event.id, []]));
  for (const [from, to] of edges) {
    if (!byId.has(from) || !byId.has(to)) continue;
    outgoing.get(from).push(to);
    incoming.set(to, incoming.get(to) + 1);
  }
  const ready = events.filter((event) => incoming.get(event.id) === 0);
  const ordered = [];
  while (ready.length) {
    ready.sort((a, b) => index.get(a.id) - index.get(b.id));
    const event = ready.shift();
    ordered.push(event);
    for (const next of outgoing.get(event.id)) {
      incoming.set(next, incoming.get(next) - 1);
      if (incoming.get(next) === 0) ready.push(byId.get(next));
    }
  }
  // A malformed imported cycle still gets a visible layout.
  return ordered.length === events.length
    ? ordered
    : [...ordered, ...events.filter((event) => !ordered.includes(event))];
}

export function timelineLayout(task, viewportWidth, zoom = 1) {
  const width = Math.max(240, viewportWidth);
  const dates = [...new Set(task.events.map((event) => day(visibleDate(event))))].sort(
    (a, b) => a - b,
  );
  const first = dates[0] ?? day(new Date().toISOString().slice(0, 10));
  const last = dates.at(-1) ?? first + 14;
  const baseGap = Math.max(MIN_GAP, (width - PAD * 2) / (MAX_COLUMNS_PER_VIEW - 1));
  const gap = (days) =>
    Math.max(0.25, (baseGap + Math.min(baseGap / 2, Math.log2(Math.max(1, days)) * 24)) * zoom);
  const columns = new Map();
  let right = PAD;
  for (let i = 0; i < dates.length; i++) {
    if (i) right += gap(dates[i] - dates[i - 1]);
    columns.set(dates[i], right);
  }
  const x = (date) => {
    const target = day(date);
    if (columns.has(target)) return columns.get(target);
    if (!dates.length) return PAD;
    if (target < first) return PAD + (target - first) * gap(1);
    if (target > last) return right + (target - last) * gap(1);
    const upper = dates.findIndex((value) => value > target);
    const lowerDay = dates[upper - 1];
    return (
      columns.get(lowerDay) +
      ((target - lowerDay) / (dates[upper] - lowerDay)) *
        (columns.get(dates[upper]) - columns.get(lowerDay))
    );
  };
  const dateAt = (position) => {
    if (!dates.length) return first + Math.round((position - PAD) / gap(1));
    if (position <= PAD) return first + Math.round((position - PAD) / gap(1));
    if (position >= right) return last + Math.round((position - right) / gap(1));
    const upper = dates.findIndex((value) => columns.get(value) > position);
    const lowerDay = dates[upper - 1];
    return Math.round(
      lowerDay +
        ((position - columns.get(lowerDay)) / (columns.get(dates[upper]) - columns.get(lowerDay))) *
          (dates[upper] - lowerDay),
    );
  };

  const nodes = new Map();
  const lanes = [...new Set(task.events.map((event) => event.lane))].sort((a, b) => a - b);
  const stackStep = zoom < 0.75 ? Math.max(18, STACK_STEP * zoom) : STACK_STEP;
  let laneTop = 0;
  for (const lane of lanes) {
    const groups = new Map();
    for (const event of task.events.filter((item) => item.lane === lane)) {
      const date = day(visibleDate(event));
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date).push(event);
    }
    let deepest = 0;
    for (const [date, events] of groups) {
      const ordered = orderedSameDay(events, task.edges);
      deepest = Math.max(deepest, ordered.length);
      ordered.forEach((event, stack) => {
        const labelY = laneTop + 16 + stack * stackStep;
        nodes.set(event.id, { x: columns.get(date), labelY, y: labelY + 70 });
      });
    }
    laneTop += deepest * stackStep + 30;
  }
  for (const event of task.events) {
    const node = nodes.get(event.id);
    const offset = event.layout || { dx: 0, dy: 0 };
    const dx = Math.max(PAD - node.x, offset.dx);
    const dy = Math.max(8 - node.labelY, offset.dy);
    node.x += dx;
    node.y += dy;
    node.labelY += dy;
  }
  return {
    start: first,
    end: last,
    pad: PAD,
    zoom,
    x,
    dateAt,
    nodes,
    width: Math.max(width, right + 140, ...[...nodes.values()].map((node) => node.x + 140)),
    height: Math.max(172, laneTop + 12, ...[...nodes.values()].map((node) => node.y + 52)),
  };
}

export function fitTimelineZoom(task, viewportWidth) {
  const width = Math.max(240, viewportWidth);
  if (timelineLayout(task, width, 1).width <= width) return 1;
  let low = 0.0001;
  let high = 1;
  for (let attempt = 0; attempt < 24; attempt++) {
    const middle = (low + high) / 2;
    if (timelineLayout(task, width, middle).width <= width) low = middle;
    else high = middle;
  }
  return low;
}
