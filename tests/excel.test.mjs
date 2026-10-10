import test from 'node:test';
import assert from 'node:assert/strict';
import { createExcelFile, workbookSheets } from '../dist/excel.mjs';
import { sample } from '../dist/sample.mjs';

function filesIn(bytes) {
  const files = new Map();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const length = view.getUint32(at + 18, true),
      nameLength = view.getUint16(at + 26, true),
      extraLength = view.getUint16(at + 28, true),
      name = new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLength)),
      start = at + 30 + nameLength + extraLength;
    files.set(name, new TextDecoder().decode(bytes.subarray(start, start + length)));
    at = start + length;
  }
  assert.equal(view.getUint32(at, true), 0x02014b50);
  return files;
}

test('Excel export includes only selected projects with typed amounts and dates', () => {
  const first = structuredClone(sample.projects[0]);
  const second = { id: 'beta', name: 'Project Beta', description: '', tasks: [] };
  const all = workbookSheets([first, second]);
  assert.deepEqual(
    all.map((sheet) => sheet.name),
    ['Projects', 'Tasks', 'Activities', 'Payment terms', 'Connections'],
  );
  assert.equal(all[0].rows.length, 2);
  assert.equal(all[1].rows.length, first.tasks.length);
  assert.equal(
    all[2].rows.length,
    first.tasks.reduce((count, task) => count + task.events.length, 0),
  );
  assert.equal(all[0].rows[0][5].value, 250000);
  assert.equal(all[2].rows[0][5].style, 2);
  const selected = filesIn(createExcelFile([first]));
  assert.ok(selected.has('[Content_Types].xml'));
  assert.ok(selected.get('xl/workbook.xml').includes('Payment terms'));
  assert.ok(selected.get('xl/worksheets/sheet1.xml').includes('Project Alpha'));
  assert.ok(!selected.get('xl/worksheets/sheet1.xml').includes('Project Beta'));
  assert.match(selected.get('xl/worksheets/sheet3.xml'), /<c r="F2" s="2"><v>\d+<\/v><\/c>/);
});

test('activity text is escaped and never becomes a spreadsheet formula', () => {
  const project = structuredClone(sample.projects[0]);
  project.tasks[0].events[0].description = '=HYPERLINK("https://example.test", "<click>")';
  const activities = filesIn(createExcelFile([project])).get('xl/worksheets/sheet3.xml');
  assert.ok(
    activities.includes('=HYPERLINK(&quot;https://example.test&quot;, &quot;&lt;click&gt;&quot;)'),
  );
  assert.ok(!activities.includes('<f>'));
});
