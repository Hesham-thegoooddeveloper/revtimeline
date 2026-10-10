import test from 'node:test';
import assert from 'node:assert/strict';
import {
  openActions,
  nextAction,
  projectStatus,
  dueSoon,
  contractValue,
  historyCounts,
} from '../dist/portfolio.mjs';
import { sample } from '../dist/sample.mjs';

const alpha = sample.projects[0];

test('open actions and the next action come from unfinished actions only', () => {
  assert.equal(openActions(alpha).length, 9);
  const next = nextAction(alpha);
  assert.equal(next.event.id, 'd7');
  assert.equal(next.task.id, 'drawings');
  assert.equal(nextAction({ tasks: [] }), null);
});

test('project status reports overdue actions against today', () => {
  assert.deepEqual(projectStatus(alpha, '2026-10-03'), { key: 'on-track', overdue: 0, open: 9 });
  assert.deepEqual(projectStatus(alpha, '2026-10-12'), { key: 'overdue', overdue: 1, open: 9 });
  assert.equal(projectStatus({ tasks: [] }, '2026-10-03').key, 'idle');
});
test('untargeted actions are open but never overdue or due soon', () => {
  const project = {
    tasks: [
      {
        id: 't',
        events: [
          { id: 'a', kind: 'action', triggered: '2026-10-01', scheduled: null, done: false },
        ],
      },
    ],
  };
  assert.deepEqual(projectStatus(project, '2026-12-01'), { key: 'on-track', overdue: 0, open: 1 });
  assert.deepEqual(dueSoon([project], '2026-12-01'), []);
  assert.equal(nextAction(project).event.id, 'a');
});

test('due soon lists late and upcoming actions across projects in due order', () => {
  assert.deepEqual(
    dueSoon([alpha], '2026-10-03').map((x) => [x.event.id, x.late]),
    [['d7', false]],
  );
  const later = dueSoon([alpha], '2026-10-12');
  assert.deepEqual(
    later.map((x) => [x.event.id, x.late]),
    [
      ['d7', true],
      ['d8', false],
      ['f1', false],
    ],
  );
  assert.equal(later[0].project, alpha);
});

test('contract value is summed per currency and skips projects without a value', () => {
  const projects = [
    { details: { currency: 'SAR', value: 250000.1 } },
    { details: { currency: 'SAR', value: 100000.2 } },
    { details: { currency: 'USD', value: 5000 } },
    { details: { currency: 'SAR', value: null } },
    {},
  ];
  assert.deepEqual(contractValue(projects), [
    { currency: 'SAR', total: 350000.3 },
    { currency: 'USD', total: 5000 },
  ]);
  assert.deepEqual(contractValue([]), []);
});

test('history counts split finished and open events', () => {
  assert.deepEqual(historyCounts(alpha), { done: 10, open: 9 });
});
