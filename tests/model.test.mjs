import test from 'node:test';
import assert from 'node:assert/strict';
import {
  updateEvent,
  validateTask,
  canConnect,
  connectBefore,
  connectBatch,
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
test('late completion changes only the edited activity', () => {
  const t = task();
  assert.deepEqual(updateEvent(t, 'review', { done: true, actual: '2026-10-12' }), {
    delta: 2,
    shifted: 0,
  });
  assert.equal(t.events[2].scheduled, '2026-10-15');
  assert.equal(t.events[3].scheduled, '2026-10-20');
  assert.equal(t.events[2].planned, '2026-10-15');
  assert.equal(t.events[0].occurred, '2026-10-08');
});
test('description and repeat date edits preserve all other dates', () => {
  const t = task();
  updateEvent(t, 'review', { done: true, actual: '2026-10-12' });
  assert.deepEqual(updateEvent(t, 'review', { description: 'Review done' }), {
    delta: 0,
    shifted: 0,
  });
  assert.deepEqual(updateEvent(t, 'review', { actual: '2026-10-13' }), { delta: 1, shifted: 0 });
  assert.equal(t.events[2].scheduled, '2026-10-15');
});
test('connected activities can have dates in either order', () => {
  const t = task();
  assert.deepEqual(updateEvent(t, 'review', { done: true, actual: '2026-10-07' }), {
    delta: -3,
    shifted: 0,
  });
  assert.equal(t.events[0].occurred, '2026-10-08');
  assert.equal(t.events[2].scheduled, '2026-10-15');
  assert.equal(validateTask(t), null);
});
test('connected and parallel activities may share a day without shifting dates', () => {
  const t = {
    events: [fact('a', '2026-10-08'), fact('b', '2026-10-10')],
    edges: [['a', 'b']],
  };
  assert.deepEqual(updateEvent(t, 'b', { occurred: '2026-10-08' }), {
    delta: -2,
    shifted: 0,
  });
  assert.deepEqual(t.events.map(visibleDate), ['2026-10-08', '2026-10-08']);
  const parallel = {
    events: [fact('a', '2026-10-08'), fact('b', '2026-10-08', 1)],
    edges: [['a', 'b']],
  };
  assert.equal(validateTask(parallel), null);
});
test('action target or completion may be earlier than its trigger', () => {
  const t = task();
  assert.deepEqual(updateEvent(t, 'review', { done: true, actual: '2026-09-30' }), {
    delta: -10,
    shifted: 0,
  });
  assert.equal(validateTask(t), null);
  assert.deepEqual(updateEvent(t, 'revise', { scheduled: '2026-09-29' }), {
    delta: -16,
    shifted: 0,
  });
});
test('an action can have no target date and uses its trigger date on the timeline', () => {
  const t = {
    events: [
      fact('start', '2026-10-08'),
      {
        ...action('followup', '2026-10-12'),
        triggered: '2026-10-10',
        scheduled: null,
        planned: null,
      },
    ],
    edges: [['start', 'followup']],
  };
  assert.equal(visibleDate(t.events[1]), '2026-10-10');
  assert.equal(validateTask(t), null);
  assert.deepEqual(updateEvent(t, 'start', { occurred: '2026-10-07' }), { delta: -1, shifted: 0 });
  assert.equal(t.events[1].triggered, '2026-10-10');
  assert.equal(t.events[1].scheduled, null);
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
test('all sample task histories contain real dates', () => {
  for (const t of sample.projects[0].tasks) assert.equal(validateTask(t), null, t.name);
});
test('moving an event earlier leaves upcoming actions unchanged', () => {
  const t = task();
  assert.deepEqual(updateEvent(t, 'review', { scheduled: '2026-10-09' }), {
    delta: -1,
    shifted: 0,
  });
  assert.equal(t.events[2].scheduled, '2026-10-15');
  assert.equal(t.events[3].scheduled, '2026-10-20');
  assert.equal(t.events[2].planned, '2026-10-15');
});
test('changing a recorded event to an action and back keeps dates consistent', () => {
  const t = task();
  updateEvent(t, 'past', {
    kind: 'action',
    done: false,
    scheduled: '2026-10-08',
    triggered: '2026-10-08',
  });
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
test('editing an event leaves actions on other paths unchanged', () => {
  const t = {
    events: [fact('x', '2026-10-10'), action('y', '2026-10-12'), action('z', '2026-10-20', 1)],
    edges: [['x', 'y']],
  };
  assert.deepEqual(updateEvent(t, 'x', { occurred: '2026-10-11' }), { delta: 1, shifted: 0 });
  assert.equal(t.events[2].scheduled, '2026-10-20');
});

test('moving an event earlier leaves another action’s due and trigger dates intact', () => {
  const t = {
    events: [fact('x', '2026-10-10'), { ...action('y', '2026-10-15'), triggered: '2026-10-14' }],
    edges: [['x', 'y']],
  };
  assert.deepEqual(updateEvent(t, 'x', { occurred: '2026-10-05' }), {
    delta: -5,
    shifted: 0,
  });
  assert.equal(t.events[1].scheduled, '2026-10-15');
  assert.equal(t.events[1].triggered, '2026-10-14');
  assert.equal(t.events[1].planned, '2026-10-15');
  assert.equal(validateTask(t), null);
});
test('adding before an event preserves all incoming paths and existing dates', () => {
  const t = {
    events: [fact('a', '2026-10-08'), fact('b', '2026-10-09', 1), fact('c', '2026-10-10')],
    edges: [
      ['a', 'c'],
      ['b', 'c'],
    ],
  };
  t.events.push(fact('before', '2026-10-09'));
  connectBefore(t, 'before', 'c');
  assert.deepEqual(t.edges, [
    ['a', 'before'],
    ['b', 'before'],
    ['before', 'c'],
  ]);
  assert.equal(validateTask(t), null);
  assert.deepEqual(t.events.slice(0, 3).map(visibleDate), [
    '2026-10-08',
    '2026-10-09',
    '2026-10-10',
  ]);
});
test('adding before a same-day predecessor inserts in the path without changing dates', () => {
  const t = {
    events: [fact('existing', '2026-10-10'), fact('target', '2026-10-10')],
    edges: [['existing', 'target']],
  };
  t.events.push(fact('before', '2026-10-09'));
  assert.equal(connectBefore(t, 'before', 'target'), 'inserted');
  assert.deepEqual(t.edges, [
    ['existing', 'before'],
    ['before', 'target'],
  ]);
  assert.equal(t.events.find((event) => event.id === 'target').occurred, '2026-10-10');
  assert.equal(validateTask(t), null);
});
test('batch placement spans both sides of a selected activity', () => {
  const t = { events: [fact('source', '2026-10-05')], edges: [] };
  t.events.push(fact('before', '2026-10-01'), action('after', '2026-10-06'));
  connectBatch(t, 'source', ['after', 'before'], 'date');
  assert.deepEqual(t.edges, [
    ['before', 'source'],
    ['source', 'after'],
  ]);
  assert.deepEqual(t.events.map(visibleDate), ['2026-10-05', '2026-10-01', '2026-10-06']);
  assert.equal(validateTask(t), null);
});
test('batch entered order accepts dates that run backward', () => {
  const t = { events: [fact('source', '2026-10-05')], edges: [] };
  t.events.push(fact('before', '2026-10-01'), action('after', '2026-10-06'));
  connectBatch(t, 'source', ['before', 'after'], 'entered');
  assert.deepEqual(t.edges, [
    ['source', 'before'],
    ['before', 'after'],
  ]);
  assert.equal(validateTask(t), null);
});
test('invalid calendar dates still reject a change without saving it', () => {
  const t = task();
  const original = structuredClone(t);
  assert.match(updateEvent(t, 'past', { occurred: '2026-02-30' }).error, /real calendar date/);
  assert.deepEqual(t, original);
});
test('validation errors name the event that is invalid', () => {
  const t = task();
  t.events[0] = { ...t.events[0], description: 'Legacy record', actual: null, occurred: null };
  assert.match(validateTask(t), /Legacy record/);
  const late = task();
  late.events[1].description = 'Review drawings';
  assert.match(updateEvent(late, 'review', { scheduled: '2026-02-30' }).error, /Review drawings/);
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
