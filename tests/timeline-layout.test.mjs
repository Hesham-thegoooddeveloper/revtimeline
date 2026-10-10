import test from 'node:test';
import assert from 'node:assert/strict';
import { timelineLayout } from '../dist/timeline-layout.mjs';
import { visibleDate } from '../dist/model.mjs';

const event = (id, date, lane = 0) => ({
  id,
  kind: 'fact',
  occurred: date,
  lane,
});

test('same-day activities stack below their predecessors, including inserted connections', () => {
  const task = {
    events: [
      event('first', '2026-10-10'),
      event('last', '2026-10-10'),
      event('inserted', '2026-10-10'),
    ],
    edges: [
      ['first', 'inserted'],
      ['inserted', 'last'],
    ],
  };
  const datesBefore = task.events.map(visibleDate);
  const layout = timelineLayout(task, 900);
  const points = ['first', 'inserted', 'last'].map((id) => layout.nodes.get(id));
  assert(points.every((point) => point.x === points[0].x));
  assert(points[0].y < points[1].y && points[1].y < points[2].y);
  assert(points[1].labelY - points[0].labelY >= 100);
  assert.deepEqual(task.events.map(visibleDate), datesBefore);
});

test('dense dates extend the scrollable canvas and keep a readable gap after Fit', () => {
  const task = {
    events: Array.from({ length: 24 }, (_, index) =>
      event('event-' + index, '2026-10-' + String(index + 1).padStart(2, '0')),
    ),
    edges: [],
  };
  const datesBefore = task.events.map(visibleDate);
  for (const width of [360, 1100, 1600]) {
    for (const zoom of [0.35, 1]) {
      const layout = timelineLayout(task, width, zoom);
      const positions = task.events.map((item) => layout.nodes.get(item.id).x);
      assert(positions.every((x, index) => index === 0 || x - positions[index - 1] >= 184));
      assert(layout.width > width);
      assert(layout.dateAt(positions[10]) === layout.start + 10);
    }
  }
  assert.deepEqual(task.events.map(visibleDate), datesBefore);
});

test('manual moves change visual positions while automatic layout stays date based', () => {
  const task = {
    events: [event('a', '2026-10-10'), event('b', '2026-10-10')],
    edges: [['a', 'b']],
  };
  const tidy = timelineLayout(task, 900);
  task.events[1].layout = { dx: 210, dy: 80 };
  const moved = timelineLayout(task, 900);
  assert.equal(moved.nodes.get('b').x, tidy.nodes.get('b').x + 210);
  assert.equal(moved.nodes.get('b').y, tidy.nodes.get('b').y + 80);
  assert.deepEqual(task.events.map(visibleDate), ['2026-10-10', '2026-10-10']);
});
