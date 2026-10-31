import { WEAPONS } from './simulation.js';

/**
 * Панель приёмки (только при ?qa=1). Все действия — настоящие события клавиатуры/мыши/колеса,
 * поэтому проверяются те же обработчики, что и у игрока. Игровая логика здесь не дублируется.
 */
export function mountQA(root, qa) {
  const panel = document.createElement('aside');
  panel.className = 'qa-panel';
  panel.innerHTML = '<details open><summary>QA · приёмка</summary><output data-qa="info"></output><output data-qa="effects"></output><div data-qa="buttons"></div></details>';
  root.append(panel);
  const info = panel.querySelector('[data-qa="info"]');
  const box = panel.querySelector('[data-qa="buttons"]');

  const key = (code, type = 'keydown') => qa.key(code, type);
  const mouse = (type, init = {}) => qa.canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init }));
  const aimAt = (t, distance) => {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const x = t.x + Math.sin(a) * distance;
      const z = t.z + Math.cos(a) * distance;
      if (!qa.canStand(x, z)) continue;
      // Прямая видимость: ни одна перегородка не между игроком и целью.
      let clear = true;
      const state = qa.info().state;
      for (let s = 1; s < 10; s++) {
        const px = x + (t.x - x) * s / 10, pz = z + (t.z - z) * s / 10;
        clear = clear && !state.layout.walls.some(w => Math.abs(px - w.x) < w.width / 2 && Math.abs(pz - w.z) < w.depth / 2);
      }
      if (!clear) continue;
      qa.teleport(x, z);
      const dx = t.x - x;
      const dz = t.z - z;
      qa.face(Math.atan2(-dx, -dz), Math.atan2(t.y - 1.65, Math.hypot(dx, dz)));
      return true;
    }
    return false;
  };
  const nearest = (list) => {
    const { x, z } = qa.info();
    return list.slice().sort((p, q) => Math.hypot(p.x - x, p.z - z) - Math.hypot(q.x - x, q.z - z))[0];
  };
  const aimSpider = () => {
    const spider = nearest(qa.info().state.spiders.filter((s) => s.hp > 0));
    return spider ? aimAt(spider, 0.9) : false;
  };
  const aimProp = () => {
    const prop = nearest(qa.info().state.props.filter((p) => !p.broken));
    if (!prop) return false;
    const center = qa.info().targetCenters[prop.id];
    return aimAt({ ...prop, ...center }, Math.max(prop.width, prop.depth) / 2 + 0.5);
  };
  const hit = () => qa.hit();
  let hunt = 0;
  const stopHunt = () => { clearInterval(hunt); hunt = 0; };

  const actions = [
    ['К старту', () => { qa.teleport(-7, 0); qa.face(-Math.PI / 2); }],
    ['Лицом к +X', () => qa.face(-Math.PI / 2)],
    ['Лицом к -X', () => qa.face(Math.PI / 2)],
    ['Лицом к -Z', () => qa.face(0)],
    ['У окна', () => { qa.teleport(-6, -4.5); qa.face(0, 0.08); }],
    ['Окно справа', () => { qa.teleport(-5.45, -4.5); qa.face(0, 0.08); }],
    ['Использовать и стоп-кадр', () => qa.captureUse()],
    ['Снять стоп-кадр', () => qa.unfreeze()],
    ['Поворот мышью вправо', () => document.dispatchEvent(new MouseEvent('mousemove', { movementX: 300, movementY: 0 }))],
    // Настоящие keydown/keyup; время прогоняется синхронно, чтобы результат не зависел от частоты кадров.
    // Мышь над кнопкой тоже вращает камеру, поэтому курс задаётся перед каждой прогулкой.
    ['Идти к +X 6 с', () => { qa.face(-Math.PI / 2); key('KeyW'); qa.advance(6); key('KeyW', 'keyup'); }],
    ['Идти к -X 6 с', () => { qa.face(Math.PI / 2); key('KeyW'); qa.advance(6); key('KeyW', 'keyup'); }],
    ['Идти к -Z 3 с', () => { qa.face(0); key('KeyW'); qa.advance(3); key('KeyW', 'keyup'); }],
    ['Идти к +Z 3 с', () => { qa.face(Math.PI); key('KeyW'); qa.advance(3); key('KeyW', 'keyup'); }],
    ['Встать у стены (z=3)', () => { qa.teleport(1.5, 3); qa.face(-Math.PI / 2); }],
    ['Esc', () => key('Escape')],
    ['Колесо вниз', () => qa.wheel(100)],
    ...WEAPONS.map((w, i) => [`Клавиша ${i + 1}`, () => key(`Digit${i + 1}`)]),
    ['Прицелиться в паука', aimSpider],
    ['Прицелиться в предмет', aimProp],
    ['Удар ЛКМ', hit],
    ['Автоохота', () => {
      if (hunt) return;
      hunt = setInterval(() => {
        if (qa.info().state.status === 'won') { stopHunt(); return; }
        if (aimSpider()) hit();
      }, 120);
    }],
    ['Пропустить 10 с', () => qa.skip(10)],
  ];
  for (const [label, run] of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', run);
    box.append(button);
  }

  let frameId;
  const render = () => {
    const i = qa.info();
    const s = i.state;
    const broken = s.props.filter((p) => p.broken).length;
    info.textContent = `seed=${s.seed} x=${i.x.toFixed(2)} z=${i.z.toFixed(2)} | yaw=${i.yaw.toFixed(2)} | инструмент=${i.weaponId} | статус=${s.status} | пауков=${s.aliveSpiders}/${s.totalSpiders} | разбито=${broken} | ущерб=${s.damageRub} | t=${s.elapsed.toFixed(1)} | mood=${s.mood} | пауза=${i.paused} | active=${i.active} | keys=${i.keys} | last=${i.lastKey} | целей=${i.targets}`;
    info.textContent += ` | моделей=${i.assets} | геометрий=${i.graphics.geometries} | текстур=${i.graphics.textures}`;
    panel.querySelector('[data-qa="effects"]').textContent = `FX=${i.effects.last?.weaponId || 'нет'} | частиц=${i.effects.active} | атак=${i.effects.emitted} | стоп-кадр=${i.inspectionFrame}`;
    frameId = requestAnimationFrame(render);
  };
  render();
  return () => { stopHunt(); cancelAnimationFrame(frameId); panel.remove(); };
}
