import { WEAPONS } from './simulation.js';

const rubles = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const paths = {
  slipper: '<path d="M9 28c-3-5-3-15 0-20 2-4 7-4 9-1 4 6 5 15 3 20-2 5-9 6-12 1Z"/><path d="M7 16c5-4 10-4 14 0M8 23c5-3 9-3 14-1"/>',
  newspaper: '<path d="m5 9 20-3 4 24-20 3Z"/><path d="m9 13 12-2m-11 6 12-2m-11 6 4-1m3 0 5-1m-11 6 12-2"/>',
  spray: '<path d="M10 12h13v19H10zM12 9h9v3m-7-3V5h7v4m2-3h4"/><path d="M10 20h13m-13 6h13"/>',
  hammer: '<path d="m8 12 7-7 13 8-4 5-10-4-8 5-3-3Z"/><path d="m14 14-8 16 4 2 9-16"/>',
  vacuum: '<path d="M6 22c0-7 15-7 15 0v7H6zM9 29v3m10-3v3m-4-15v-5c0-8 12-8 12-1v13m-4 0h8v5h-8Z"/>',
  extinguisher: '<path d="M11 12h12v19H11zM13 12V8h8v4m-4-4V4h9m-13 0h4M23 9c8 0 8 8 7 14m-4 0h6v5h-6ZM11 21h12"/>',
};
function clock(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

/** Menus retain trusted synchronous callbacks for Pointer Lock/audio. */
export function mountUI(root, { onStart, onRestart, onPause, onResume, onWeapon }) {
  let started = false, destroyed = false;
  const ui = document.createElement('div');
  ui.className = 'game-ui';
  ui.innerHTML = `
    <div class="horror-overlay" aria-hidden="true"></div>
    <header class="hud" hidden>
      <div class="hud__counter"><span>ОЧИСТИТЬ КВАРТИРУ</span><strong data-value="spiders">6 / 6</strong><small>пауков осталось</small></div>
      <div class="hud__damage"><span>УЩЕРБ ИМУЩЕСТВУ</span><strong data-value="damage">0 ₽</strong></div>
      <div class="hud__mood"><span data-value="mood">Прислушайтесь.</span><small data-value="time">0:00</small></div>
      <button class="pause-button" type="button" data-action="pause" aria-label="Приостановить игру">Пауза <kbd>Esc</kbd></button>
    </header>
    <div class="crosshair" aria-hidden="true" hidden></div>
    <section class="screen screen--start" data-screen="start" aria-labelledby="start-title">
      <div class="menu-copy">
        <p class="eyebrow">КВАРТИРА 01 <span aria-hidden="true">/</span> ПОСЛЕ ПОЛУНОЧИ</p>
        <h1 id="start-title">Незваные<br>гости<span class="title-period">.</span></h1>
        <p class="menu-subtitle">Вы здесь больше не одни.</p>
        <p class="menu-description">Три комнаты. Шесть пауков. Всё, что окажется<br class="desktop-break"> под рукой, может стать оружием.<br>За разбитую мебель придётся заплатить.</p>
        <button class="button menu-start" type="button" data-action="start"><span aria-hidden="true">—</span> Войти в квартиру</button>
        <details class="controls"><summary>Управление</summary>
          <div><span><kbd>W A S D</kbd> Ходьба</span><span><kbd>Мышь</kbd> Осмотр</span>
          <span><kbd>ЛКМ</kbd> Удар / распыление</span><span><kbd>1–6 / колесо</kbd> Инструмент</span><span><kbd>Esc</kbd> Пауза</span></div>
        </details>
        <p class="help">Клавиатура и мышь · Лучше играть в наушниках.<br>Нажатие захватит курсор. Esc — отпустить.</p>
      </div>
      <div class="menu-bottom"><span>НЕ ОСТАВЛЯЙТЕ СВЕТ ВЫКЛЮЧЕННЫМ</span><span>Модели и материалы · Poly Haven / CC0</span></div>
    </section>
    <section class="screen screen--hidden" data-screen="pause" aria-labelledby="pause-title" aria-hidden="true">
      <div class="menu-copy pause-copy">
        <p class="eyebrow">ДВЕРЬ ПОКА ЗАКРЫТА</p><h2 id="pause-title">Тихо.</h2>
        <p data-value="pause-note">Время и пауки замерли.</p>
        <button class="button" type="button" data-action="resume"><span aria-hidden="true">—</span> Продолжить</button>
        <button class="button button--secondary" type="button" data-action="restart">Начать заново</button>
        <p class="help">Продолжение вернёт захват мыши.<br>Новый забег обнулит время и ущерб.</p>
      </div>
    </section>
    <section class="screen screen--hidden" data-screen="won" aria-labelledby="won-title" aria-hidden="true">
      <div class="menu-copy results-copy">
        <p class="eyebrow">ОПИСЬ ПОСЛЕ ПРОИСШЕСТВИЯ</p><h2 id="won-title">Больше никого.</h2>
        <p>Квартира снова ваша. Посмотрим, какой ценой.</p>
        <dl class="results">
          <div><dt>Уничтожено пауков</dt><dd data-value="kills">6</dd></div>
          <div><dt>Время</dt><dd data-value="final-time">0:00</dd></div>
          <div><dt>К возмещению</dt><dd data-value="final-damage">0 ₽</dd></div>
        </dl>
        <button class="button" type="button" data-action="restart"><span aria-hidden="true">—</span> Ещё одна ночь</button>
        <p class="help">Новая расстановка. Попробуйте оставить мебель целой.</p>
      </div>
    </section>
    <footer class="inventory" hidden>
      <p class="inventory-label"><span data-value="weapon">Тапок</span><small>ЛКМ — использовать</small></p>
      <nav class="weapon-bar" aria-label="Выбор инструмента"></nav>
    </footer>`;
  const bar = ui.querySelector('.weapon-bar');
  const weaponButtons = new Map();
  WEAPONS.forEach((weapon, index) => {
    const button = document.createElement('button');
    button.className = 'weapon-button'; button.type = 'button';
    button.dataset.weapon = weapon.id; button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', `${index + 1} — ${weapon.label}`);
    button.title = `${index + 1} — ${weapon.label}`;
    button.innerHTML = `<kbd>${index + 1}</kbd><svg viewBox="0 0 36 36" aria-hidden="true">${paths[weapon.id]}</svg><span>${weapon.label}</span>`;
    bar.append(button); weaponButtons.set(weapon.id, button);
  });
  root.append(ui);
  const values = new Map([...ui.querySelectorAll('[data-value]')].map(el => [el.dataset.value, el]));
  const screens = [...ui.querySelectorAll('[data-screen]')];
  const hud = ui.querySelector('.hud'), crosshair = ui.querySelector('.crosshair');
  const inventory = ui.querySelector('.inventory'), horror = ui.querySelector('.horror-overlay');
  const actions = { start: onStart, restart: onRestart, pause: onPause, resume: onResume };
  function handleClick(event) {
    const button = event.target.closest('button');
    if (!button || !ui.contains(button)) return;
    if (button.dataset.weapon) { onWeapon(button.dataset.weapon); return; }
    const action = button.dataset.action;
    if (action === 'start' || action === 'restart') started = true;
    actions[action]?.();
  }
  ui.addEventListener('click', handleClick);
  const set = (key, value) => { const el = values.get(key); if (el.textContent !== value) el.textContent = value; };
  return {
    render(state, { weaponId, paused = false, locked = false } = {}) {
      if (destroyed || !state) return;
      if (locked) started = true;
      const won = state.status === 'won';
      const screen = won ? 'won' : !started ? 'start' : paused || !locked ? 'pause' : null;
      screens.forEach(el => {
        const hidden = el.dataset.screen !== screen;
        el.classList.toggle('screen--hidden', hidden);
        el.setAttribute('aria-hidden', String(hidden)); el.inert = hidden;
      });
      hud.hidden = !started || screen !== null;
      inventory.hidden = hud.hidden; crosshair.hidden = screen !== null;
      horror.dataset.active = String(started && !won && state.mood === 'horror');
      set('spiders', `${String(state.aliveSpiders).padStart(2, '0')} / ${String(state.totalSpiders).padStart(2, '0')}`);
      set('damage', `${rubles.format(state.damageRub)} ₽`); set('time', clock(state.elapsed));
      set('mood', state.mood === 'horror' ? 'Не оборачивайтесь.' : 'Прислушайтесь.');
      hud.dataset.mood = state.mood;
      set('pause-note', locked ? 'Игра приостановлена. Время и пауки замерли.' : 'Указатель свободен. Нажмите «Продолжить», чтобы вернуться.');
      set('kills', String(state.totalSpiders - state.aliveSpiders));
      set('final-time', clock(state.elapsed)); set('final-damage', `${rubles.format(state.damageRub)} ₽`);
      set('weapon', WEAPONS.find(w => w.id === weaponId)?.label || '');
      weaponButtons.forEach((button, id) => {
        button.classList.toggle('weapon-button--active', id === weaponId);
        button.setAttribute('aria-pressed', String(id === weaponId));
      });
    },
    destroy() { destroyed = true; ui.removeEventListener('click', handleClick); ui.remove(); },
  };
}
