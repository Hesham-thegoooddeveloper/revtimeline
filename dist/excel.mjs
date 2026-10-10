import { projectTotals, visibleDate } from './model.mjs';

const encoder = new TextEncoder();
const xml = (value) =>
  String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
const date = (value) =>
  value
    ? {
        value: Math.round((Date.parse(value + 'T00:00:00Z') - Date.UTC(1899, 11, 30)) / 86400000),
        style: 2,
      }
    : null;
const amount = (value) => (Number.isFinite(value) ? { value, style: 3 } : null);
const percent = (value) => (Number.isFinite(value) ? { value, style: 4 } : null);
const cellName = (column, row) => {
  let letters = '';
  for (let n = column + 1; n; n = Math.floor((n - 1) / 26))
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return letters + row;
};
const cell = (value, column, row) => {
  if (value === null || value === undefined || value === '') return '';
  const ref = cellName(column, row),
    typed = typeof value === 'object' && 'value' in value ? value : { value },
    style = typed.style ? ` s="${typed.style}"` : '';
  if (typeof typed.value === 'number') return `<c r="${ref}"${style}><v>${typed.value}</v></c>`;
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xml(typed.value)}</t></is></c>`;
};
const worksheet = (headers, rows) => {
  const last = cellName(headers.length - 1, rows.length + 1),
    widths = headers.map((header, index) =>
      Math.min(
        44,
        Math.max(
          12,
          header.length + 3,
          ...rows.slice(0, 100).map((row) => {
            const value = row[index];
            return typeof value === 'string' ? Math.min(44, value.length + 2) : 12;
          }),
        ),
      ),
    );
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:${last}"/>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="18"/>
<cols>${widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>
<sheetData><row r="1" ht="25" customHeight="1">${headers.map((header, i) => `<c r="${cellName(i, 1)}" s="1" t="inlineStr"><is><t>${xml(header)}</t></is></c>`).join('')}</row>${rows.map((values, i) => `<row r="${i + 2}">${values.map((value, column) => cell(value, column, i + 2)).join('')}</row>`).join('')}</sheetData>
<autoFilter ref="A1:${last}"/>
</worksheet>`;
};

export function workbookSheets(projects) {
  const projectRows = [],
    taskRows = [],
    activityRows = [],
    termRows = [],
    connectionRows = [];
  for (const project of projects) {
    const details = project.details || {},
      totals = projectTotals(details),
      tasks = project.tasks || [];
    projectRows.push([
      project.name,
      project.description || '',
      details.customer || '',
      details.scope || '',
      details.currency || '',
      amount(totals.value),
      percent(totals.rate),
      amount(totals.vat),
      amount(totals.total),
      tasks.length,
      tasks.reduce((sum, task) => sum + task.events.length, 0),
    ]);
    for (const [index, task] of tasks.entries()) {
      taskRows.push([
        project.name,
        task.name,
        task.description || '',
        index + 1,
        task.events.length,
        task.events.filter((event) => event.kind === 'action' && !event.done).length,
      ]);
      const names = new Map(task.events.map((event) => [event.id, event.description]));
      for (const event of task.events) {
        activityRows.push([
          project.name,
          task.name,
          event.description,
          event.kind === 'fact' ? 'Recorded event' : 'Action',
          event.kind === 'fact' ? 'Recorded' : event.done ? 'Completed' : 'Open',
          date(visibleDate(event)),
          date(event.occurred),
          date(event.triggered),
          date(event.planned),
          date(event.scheduled),
          date(event.actual),
          event.lane || 0,
        ]);
      }
      for (const [from, to, reverse] of task.edges || [])
        connectionRows.push([
          project.name,
          task.name,
          names.get(from) || from,
          names.get(to) || to,
          reverse ? 'Reverse' : 'Forward',
        ]);
    }
    for (const term of details.paymentTerms || [])
      termRows.push([project.name, term.label || '', percent(term.percent), term.condition || '']);
  }
  return [
    {
      name: 'Projects',
      headers: [
        'Project',
        'Description',
        'Customer',
        'Scope',
        'Currency',
        'Value excl. VAT',
        'VAT rate (%)',
        'VAT',
        'Total incl. VAT',
        'Tasks',
        'Activities',
      ],
      rows: projectRows,
    },
    {
      name: 'Tasks',
      headers: ['Project', 'Task', 'Description', 'Order', 'Activities', 'Open actions'],
      rows: taskRows,
    },
    {
      name: 'Activities',
      headers: [
        'Project',
        'Task',
        'Activity',
        'Type',
        'Status',
        'Visible date',
        'Occurrence date',
        'Trigger date',
        'Original due date',
        'Current due date',
        'Actual completion date',
        'Lane',
      ],
      rows: activityRows,
    },
    {
      name: 'Payment terms',
      headers: ['Project', 'Milestone', 'Share (%)', 'Condition'],
      rows: termRows,
    },
    {
      name: 'Connections',
      headers: ['Project', 'Task', 'From activity', 'To activity', 'Direction'],
      rows: connectionRows,
    },
  ];
}

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="dd mmm yyyy"/><numFmt numFmtId="165" formatCode="#,##0.00"/><numFmt numFmtId="166" formatCode="0.##&quot;%&quot;"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF17313D"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
const crc32 = (bytes) => {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};
const join = (parts) => {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    result.set(part, at);
    at += part.length;
  }
  return result;
};
function zip(files) {
  const local = [],
    central = [];
  let offset = 0;
  for (const [name, content] of files) {
    const filename = encoder.encode(name),
      data = encoder.encode(content),
      crc = crc32(data),
      header = new Uint8Array(30 + filename.length),
      view = new DataView(header.buffer),
      directory = new Uint8Array(46 + filename.length),
      dir = new DataView(directory.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, filename.length, true);
    header.set(filename, 30);
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, data.length, true);
    dir.setUint32(24, data.length, true);
    dir.setUint16(28, filename.length, true);
    dir.setUint32(42, offset, true);
    directory.set(filename, 46);
    local.push(header, data);
    central.push(directory);
    offset += header.length + data.length;
  }
  const directory = join(central),
    end = new Uint8Array(22),
    view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, files.length, true);
  view.setUint16(10, files.length, true);
  view.setUint32(12, directory.length, true);
  view.setUint32(16, offset, true);
  return join([...local, directory, end]);
}

export function createExcelFile(projects) {
  const sheets = workbookSheets(projects),
    contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, i) => `<sheet name="${xml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    relationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  return zip([
    ['[Content_Types].xml', contentTypes],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ],
    ['xl/workbook.xml', workbook],
    ['xl/_rels/workbook.xml.rels', relationships],
    ['xl/styles.xml', styles],
    ...sheets.map((sheet, i) => [
      `xl/worksheets/sheet${i + 1}.xml`,
      worksheet(sheet.headers, sheet.rows),
    ]),
  ]);
}
