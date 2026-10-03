import test from 'node:test';
import assert from 'node:assert/strict';
import {
  updateEvent,
  validateTask,
  canConnect,
  migrate,
  visibleDate,
  removeEvent,
} from '../dist/model.mjs';
import { sample } from '../dist/sample.mjs';
const action = (id, date, lane = 0) => ({
  id,
  kind: 'action',
  triggered: '2026-10-01',
  planned: date,
  scheduled: date,
  actual: null,
  done: false,
  lane,
});
const fact = (id, date, lane = 0) => ({
  id,
  kind: 'fact',
  occurred: date,
  actual: date,
  done: true,
  lane,
});
function task() {
  return {
    events: [
      fact('past', '2026-10-08'),
      action('review', '2026-10-10'),
      action('revise', '2026-10-15'),
      action('approve', '2026-10-20'),
    ],
    edges: [
      ['past', 'review'],
      ['review', 'revise'],
      ['revise', 'approve'],
    ],
  };
}
test('late completion shifts upcoming actions and preserves original dates and history', () => {
  const t = task();
  assert.deepEqual(updateEvent(t, 'review', { done: true, actual: '2026-10-12' }), {
    delta: 2,
    shifted: 2,
  });
  assert.equal(t.events[2].scheduled, '2026-10-17');
  assert.equal(t.events[3].scheduled, '2026-10-22');
  assert.equal(t.events[2].planned, '2026-10-15');
  assert.equal(t.events[0].occurred, '2026-10-08');
});
test('description edits do not shift dates and repeat date edits use incremental changes', () => {
  const t = task();
  updateEvent(t, 'review', { done: true, actual: '2026-10-12' });
  assert.deepEqual(updateEvent(t, 'review', { description: 'Review done' }), {
    delta: 0,
    shifted: 0,
  });
  assert.deepEqual(updateEvent(t, 'review', { actual: '2026-10-13' }), { delta: 1, shifted: 2 });
  assert.equal(t.events[2].scheduled, '2026-10-18');
});
test('invalid chronology rejects the whole update, including proposed shifts', () => {
  const t = task(),
    before = structuredClone(t);
  assert(updateEvent(t, 'review', { done: true, actual: '2026-10-07' }).error);
  assert.deepEqual(t, before);
});
test('same-path overlaps reject changes while parallel same-day events are valid', () => {
  const t = { events: [fact('a', '2026-10-08'), fact('b', '2026-10-10')], edges: [] },
    before = structuredClone(t);
  assert(updateEvent(t, 'b', { occurred: '2026-10-08' }).error);
  assert.deepEqual(t, before);
  const parallel = {
    events: [fact('a', '2026-10-08'), fact('b', '2026-10-08', 1)],
    edges: [['a', 'b']],
  };
  assert.equal(validateTask(parallel), null);
});
test('completion before trigger is rejected without changing data', () => {
  const t = task(),
    before = structuredClone(t);
  assert(updateEvent(t, 'review', { done: true, actual: '2026-09-30' }).error);
  assert.deepEqual(t, before);
});
test('branch merges cannot create loops or duplicate connections', () => {
  const t = task();
  assert.equal(canConnect(t, 'approve', 'past'), false);
  assert.equal(canConnect(t, 'past', 'review'), false);
  assert.equal(canConnect(t, 'past', 'approve'), true);
});
test('deleting an event removes its incident connections only', () => {
  const t = task();
  removeEvent(t, 'revise');
  assert.equal(t.events.length, 3);
  assert.deepEqual(t.edges, [['past', 'review']]);
});
test('old completed records migrate to occurrence dates without losing original fields', () => {
  const data = {
    projects: [
      {
        tasks: [
          {
            events: [
              {
                id: 'old',
                done: true,
                actual: '2026-10-05',
                planned: '2026-10-03',
                scheduled: '2026-10-03',
              },
            ],
            edges: [],
          },
        ],
      },
    ],
  };
  migrate(data);
  const e = data.projects[0].tasks[0].events[0];
  assert.equal(visibleDate(e), '2026-10-05');
  assert.equal(e.planned, '2026-10-03');
});
test('all sample task histories satisfy the current date rules', () => {
  for (const t of sample.projects[0].tasks) assert.equal(validateTask(t), null, t.name);
});
