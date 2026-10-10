const MONTHS = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const DAY_MS = 86400000;
const validDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const dateAt = (year, month, date) =>
  new Date(Date.UTC(year, month, date)).toISOString().slice(0, 10);
const localToday = () => {
  const now = new Date();
  return dateAt(now.getFullYear(), now.getMonth(), now.getDate());
};

export function monthDays(year, month) {
  const first = new Date(Date.UTC(year, month, 1));
  const start = first.getTime() - ((first.getUTCDay() + 6) % 7) * DAY_MS;
  return Array.from({ length: 42 }, (_, index) =>
    new Date(start + index * DAY_MS).toISOString().slice(0, 10),
  );
}

let active = null;
function closePicker() {
  active?.panel.remove();
  active = null;
}
function renderPicker() {
  if (!active) return;
  const { input, panel, view } = active;
  const selected = validDate(input.value) ? input.value : '';
  const current = localToday();
  panel.replaceChildren();
  const head = document.createElement('div');
  head.className = 'date-picker-head';
  const title = document.createElement('strong');
  title.textContent = MONTHS.format(view);
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = 'date-picker-nav';
  previous.textContent = '‹';
  previous.setAttribute('aria-label', 'Previous month');
  const next = previous.cloneNode(true);
  next.textContent = '›';
  next.setAttribute('aria-label', 'Next month');
  previous.onclick = () => moveMonth(-1);
  next.onclick = () => moveMonth(1);
  head.append(previous, title, next);
  panel.append(head);
  const weekdays = document.createElement('div');
  weekdays.className = 'date-picker-weekdays';
  for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
    const label = document.createElement('span');
    label.textContent = day;
    weekdays.append(label);
  }
  panel.append(weekdays);
  const grid = document.createElement('div');
  grid.className = 'date-picker-grid';
  for (const value of monthDays(view.getUTCFullYear(), view.getUTCMonth())) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'date-picker-day';
    if (Number(value.slice(5, 7)) !== view.getUTCMonth() + 1) button.classList.add('outside');
    if (value === current) button.classList.add('today');
    button.setAttribute(
      'aria-label',
      new Date(`${value}T00:00:00Z`).toLocaleDateString('en', {
        dateStyle: 'full',
        timeZone: 'UTC',
      }),
    );
    button.setAttribute('aria-pressed', String(value === selected));
    button.textContent = Number(value.slice(8));
    button.onclick = () => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      closePicker();
      input.focus();
    };
    grid.append(button);
  }
  panel.append(grid);
  const footer = document.createElement('div');
  footer.className = 'date-picker-footer';
  const today = document.createElement('button');
  today.type = 'button';
  today.textContent = 'Today';
  today.onclick = () => {
    input.value = current;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    closePicker();
    input.focus();
  };
  footer.append(today);
  if (!input.required) {
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.textContent = 'Clear';
    clear.onclick = () => {
      input.value = '';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      closePicker();
      input.focus();
    };
    footer.append(clear);
  }
  panel.append(footer);
}
function moveMonth(offset) {
  active.view = new Date(
    Date.UTC(active.view.getUTCFullYear(), active.view.getUTCMonth() + offset, 1),
  );
  renderPicker();
}
function positionPicker() {
  if (!active) return;
  const rect = active.button.getBoundingClientRect();
  const width = 304;
  active.panel.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - width - 8))}px`;
  const height = active.panel.offsetHeight;
  active.panel.style.top = `${rect.bottom + height + 8 <= innerHeight ? rect.bottom + 6 : Math.max(8, rect.top - height - 6)}px`;
}
function openPicker(input, button) {
  if (active?.input === input) return closePicker();
  closePicker();
  const selected = validDate(input.value) ? input.value : localToday();
  const panel = document.createElement('div');
  panel.className = 'date-picker-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Choose date');
  const host = input.closest('#batch-dialog, #calendar-dialog, #task-dialog') || document.body;
  host.append(panel);
  active = { input, button, panel, view: new Date(`${selected.slice(0, 7)}-01T00:00:00Z`) };
  renderPicker();
  positionPicker();
}
export function enhanceDateInput(input) {
  if (input.dataset.enhancedDate || input.readOnly) return;
  input.dataset.enhancedDate = 'true';
  input.type = 'text';
  input.inputMode = 'numeric';
  input.placeholder = 'YYYY-MM-DD';
  input.pattern = '\\d{4}-\\d{2}-\\d{2}';
  input.setAttribute('aria-description', 'Enter YYYY-MM-DD, or choose a date from the calendar');
  const wrapper = document.createElement('span');
  wrapper.className = 'date-control';
  input.before(wrapper);
  wrapper.append(input);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'date-open';
  button.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>';
  button.setAttribute(
    'aria-label',
    `Choose ${input.closest('label')?.textContent.trim() || 'date'}`,
  );
  button.onclick = () => openPicker(input, button);
  wrapper.append(button);
  const validate = () => {
    input.setCustomValidity(
      input.value && !validDate(input.value) ? 'Enter a real date as YYYY-MM-DD.' : '',
    );
  };
  input.addEventListener('input', validate);
  input.addEventListener('change', validate);
}
document.addEventListener('pointerdown', (event) => {
  if (active && !active.panel.contains(event.target) && !active.button.contains(event.target))
    closePicker();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && active) {
    closePicker();
    event.stopPropagation();
  }
});
window.addEventListener('resize', positionPicker);
