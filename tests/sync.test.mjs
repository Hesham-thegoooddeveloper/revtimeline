import test from 'node:test';
import assert from 'node:assert/strict';
import { createSync } from '../dist/sync.mjs';

// A fake server with the same version rule as save_workspace in supabase/schema.sql.
function server(initial = null) {
  const s = {
    row: initial,
    saves: 0,
    offline: false,
    async save(expected, data) {
      if (s.offline) throw Error('Network error');
      s.saves++;
      if (expected === 0) {
        if (s.row) return -1;
        s.row = { version: 1, data };
        return 1;
      }
      if (!s.row || s.row.version !== expected) return -1;
      s.row = { version: s.row.version + 1, data };
      return s.row.version;
    },
    async load() {
      if (s.offline) throw Error('Network error');
      return s.row && structuredClone(s.row);
    },
  };
  return s;
}
// Timers that only run when the test asks, so nothing depends on real time.
function fakeTimers() {
  const t = {
    queue: new Map(),
    next: 1,
    setTimeout(fn) {
      const id = t.next++;
      t.queue.set(id, fn);
      return id;
    },
    clearTimeout(id) {
      t.queue.delete(id);
    },
    async run() {
      const fns = [...t.queue.values()];
      t.queue.clear();
      for (const fn of fns) await fn();
      await new Promise((r) => setImmediate(r));
    },
  };
  return t;
}
function setup(initial) {
  const srv = server(initial),
    timers = fakeTimers(),
    events = { status: [], conflicts: [], remote: [] };
  const sync = createSync({
    save: srv.save,
    load: srv.load,
    timers,
    onStatus: (s) => events.status.push(s),
    onConflict: (latest, mine) => events.conflicts.push({ latest, mine }),
    onRemote: (latest) => events.remote.push(latest),
  });
  return { srv, timers, sync, events };
}

test('first save creates the workspace and later saves build on its version', async () => {
  const { srv, sync, events } = setup();
  sync.queue({ n: 1 });
  await sync.flushNow();
  assert.deepEqual(srv.row, { version: 1, data: { n: 1 } });
  sync.queue({ n: 2 });
  await sync.flushNow();
  assert.deepEqual(srv.row, { version: 2, data: { n: 2 } });
  assert.equal(sync.version, 2);
  assert.equal(events.status.at(-1), 'saved');
});

test('rapid edits are combined into one save after the delay', async () => {
  const { srv, sync, timers } = setup({ version: 3, data: {} });
  sync.setVersion(3);
  sync.queue({ n: 1 });
  sync.queue({ n: 2 });
  sync.queue({ n: 3 });
  await timers.run();
  assert.equal(srv.saves, 1);
  assert.deepEqual(srv.row, { version: 4, data: { n: 3 } });
});

test('a save based on an outdated version is refused and both versions are offered', async () => {
  const { srv, sync, events } = setup({ version: 5, data: { from: 'other device' } });
  sync.setVersion(4);
  sync.queue({ from: 'this device' });
  await sync.flushNow();
  assert.deepEqual(srv.row.data, { from: 'other device' });
  assert.equal(events.conflicts.length, 1);
  assert.deepEqual(events.conflicts[0].latest, { version: 5, data: { from: 'other device' } });
  assert.deepEqual(events.conflicts[0].mine, { from: 'this device' });
  assert.equal(sync.version, 5);
  sync.queue({ from: 'this device' });
  await sync.flushNow();
  assert.deepEqual(srv.row, { version: 6, data: { from: 'this device' } });
});

test('changes are kept and retried when the connection drops', async () => {
  const { srv, sync, timers, events } = setup({ version: 1, data: {} });
  sync.setVersion(1);
  srv.offline = true;
  sync.queue({ n: 1 });
  await sync.flushNow();
  assert.equal(events.status.at(-1), 'offline');
  assert.equal(sync.idle(), false);
  srv.offline = false;
  await timers.run();
  assert.deepEqual(srv.row, { version: 2, data: { n: 1 } });
  assert.equal(events.status.at(-1), 'saved');
});

test('edits made while a save is in progress are saved next', async () => {
  const { srv, sync } = setup({ version: 1, data: {} });
  sync.setVersion(1);
  sync.queue({ n: 1 });
  const first = sync.flushNow();
  sync.queue({ n: 2 });
  await first;
  await sync.flushNow();
  assert.deepEqual(srv.row, { version: 3, data: { n: 2 } });
});

test('another device’s save loads only when nothing here is waiting to be saved', async () => {
  const { srv, sync, events } = setup({ version: 2, data: { n: 'remote' } });
  sync.setVersion(1);
  assert.equal(await sync.remoteChanged(2), true);
  assert.deepEqual(events.remote[0], { version: 2, data: { n: 'remote' } });
  assert.equal(await sync.remoteChanged(2), false);
  srv.row = { version: 3, data: { n: 'newer' } };
  sync.queue({ n: 'local edit' });
  assert.equal(await sync.remoteChanged(3), false);
  assert.equal(events.remote.length, 1);
});
