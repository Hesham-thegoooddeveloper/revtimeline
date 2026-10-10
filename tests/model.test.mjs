import test from 'node:test';
import assert from 'node:assert/strict';
import {
  updateEvent,
  validateTask,
  canConnect,
  migrate,
  visibleDate,
  removeEvent,
  checkData,
  projectTotals,
  termsPercent,
  SCHEMA_VERSION,
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
test('moving an event earlier shifts upcoming actions back by the same difference', () => {
  const t = task();
  assert.deepEqual(updateEvent(t, 'review', { scheduled: '2026-10-09' }), {
    delta: -1,
    shifted: 2,
  });
  assert.equal(t.events[2].scheduled, '2026-10-14');
  assert.equal(t.events[3].scheduled, '2026-10-19');
  assert.equal(t.events[2].planned, '2026-10-15');
});
test('changing a recorded event to an action and back keeps dates consistent', () => {
  const t = task();
  updateEvent(t, 'past', { kind: 'action', done: false, scheduled: '2026-10-08' });
  assert.equal(t.events[0].actual, null);
  assert.equal(visibleDate(t.events[0]), '2026-10-08');
  updateEvent(t, 'past', { kind: 'fact', occurred: '2026-10-08' });
  assert.equal(t.events[0].done, true);
  assert.equal(t.events[0].actual, '2026-10-08');
});
test('old unfinished records migrate to actions and migration is repeatable', () => {
  const data = {
    projects: [
      {
        tasks: [
          {
            events: [{ id: 'old', done: false, planned: '2026-10-03', scheduled: '2026-10-06' }],
            edges: [],
          },
        ],
      },
    ],
  };
  migrate(data);
  const once = structuredClone(data),
    e = data.projects[0].tasks[0].events[0];
  assert.equal(e.kind, 'action');
  assert.equal(e.triggered, '2026-10-03');
  assert.equal(visibleDate(e), '2026-10-06');
  migrate(data);
  assert.deepEqual(data, once);
});
// Current behavior pending owner confirmation: shifts are date-based, so upcoming actions on
// unconnected parallel paths move too.
test('date shifts include upcoming actions on unconnected parallel paths', () => {
  const t = {
    events: [fact('x', '2026-10-10'), action('y', '2026-10-12'), action('z', '2026-10-20', 1)],
    edges: [['x', 'y']],
  };
  assert.deepEqual(updateEvent(t, 'x', { occurred: '2026-10-11' }), { delta: 1, shifted: 2 });
  assert.equal(t.events[2].scheduled, '2026-10-21');
});

// Known defect from the October 2026 audit, awaiting an owner decision on trigger-date shifts.
// Until then the rejection names the blocked action (covered below).
test(
  'moving an event earlier also moves downstream trigger dates',
  { todo: 'audit #4: shifts move due dates but not trigger dates' },
  () => {
    const t = {
      events: [fact('x', '2026-10-10'), { ...action('y', '2026-10-15'), triggered: '2026-10-14' }],
      edges: [['x', 'y']],
    };
    assert.equal(updateEvent(t, 'x', { occurred: '2026-10-05' }).error, undefined);
  },
);
test('validation errors name the event that is invalid', () => {
  const t = task();
  t.events[0] = { ...t.events[0], description: 'Legacy record', actual: null, occurred: null };
  assert.match(validateTask(t), /Legacy record/);
  const late = task();
  late.events[1].description = 'Review drawings';
  assert.match(updateEvent(late, 'review', { scheduled: '2026-10-07' }).error, /Review drawings/);
});
test('migration tolerates projects and tasks with missing collections', () => {
  const data = migrate({ projects: [{ id: 'p', name: 'P' }] });
  assert.deepEqual(data.projects[0].tasks, []);
  assert.equal(data.schemaVersion, SCHEMA_VERSION);
});
test('saved and imported data must have a valid structure and safe IDs', () => {
  assert.equal(checkData(migrate(structuredClone(sample))), null);
  assert.match(checkData({ projects: [] }), /no projects/);
  assert.match(checkData(null), /no projects/);
  const unsafe = migrate(structuredClone(sample));
  unsafe.projects[0].tasks[0].events[0].id = '"><img src=x onerror=alert(1)>';
  assert.match(checkData(unsafe), /invalid details/);
  const dangling = migrate(structuredClone(sample));
  dangling.projects[0].tasks[0].edges.push(['d1', 'missing']);
  assert.match(checkData(dangling), /missing event/);
  const badDetails = migrate(structuredClone(sample));
  badDetails.projects[0].details.value = '250000';
  assert.match(checkData(badDetails), /invalid project details/);
  const extendedDetails = migrate(structuredClone(sample));
  extendedDetails.projects[0].details.projectNumber = 'PRJ-101';
  extendedDetails.projects[0].details.contractor = 'Example Contractor';
  assert.equal(checkData(extendedDetails), null);
  extendedDetails.projects[0].details.contractor = 42;
  assert.match(checkData(extendedDetails), /invalid project details/);
  const badOccurrence = migrate(structuredClone(sample));
  badOccurrence.projects[0].tasks[0].events[0].occurred = '2026-02-30';
  assert.match(checkData(badOccurrence), /invalid details or dates/);
  const badTrigger = migrate(structuredClone(sample));
  badTrigger.projects[0].tasks[0].events[6].triggered = 'not-a-date';
  assert.match(checkData(badTrigger), /invalid details or dates/);
  const positioned = migrate(structuredClone(sample));
  positioned.projects[0].tasks[0].events[0].layout = { dx: 120, dy: 64 };
  assert.equal(checkData(positioned), null);
  positioned.projects[0].tasks[0].events[0].layout.dx = Infinity;
  assert.match(checkData(positioned), /invalid details or dates/);
  const describedTask = migrate(structuredClone(sample));
  describedTask.projects[0].tasks[0].description = 'Review the drawings';
  assert.equal(checkData(describedTask), null);
  describedTask.projects[0].tasks[0].description = 42;
  assert.match(checkData(describedTask), /invalid name or ID/);
  assert.match(checkData({ schemaVersion: SCHEMA_VERSION + 1, projects: [{}] }), /newer version/);
});
test('projects without commercial details remain valid', () => {
  const data = migrate({
    projects: [{ id: 'p', name: 'Old project', tasks: [{ id: 't', name: 'T', events: [] }] }],
  });
  assert.equal(checkData(data), null);
  assert.deepEqual(projectTotals(undefined), { value: null, rate: null, vat: null, total: null });
});
test('VAT and total are calculated only once a VAT rate is entered', () => {
  assert.deepEqual(projectTotals({ value: 250000, vatRate: null }), {
    value: 250000,
    rate: null,
    vat: null,
    total: null,
  });
  assert.deepEqual(projectTotals({ value: 250000, vatRate: 15 }), {
    value: 250000,
    rate: 15,
    vat: 37500,
    total: 287500,
  });
  assert.deepEqual(projectTotals({ value: 1234.56, vatRate: 5 }), {
    value: 1234.56,
    rate: 5,
    vat: 61.73,
    total: 1296.29,
  });
  assert.equal(projectTotals({ value: 1000, vatRate: 0 }).total, 1000);
});
test('payment term percentages are summed, ignoring blank shares', () => {
  assert.equal(termsPercent(sample.projects[0].details), 100);
  assert.equal(termsPercent({ paymentTerms: [{ percent: 30 }, { percent: null }] }), 30);
  assert.equal(termsPercent(undefined), 0);
});
