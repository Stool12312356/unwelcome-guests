import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/simulation.js';
import { canOccupy } from '../src/movement.js';

test('погрешность накопленных шагов не отбрасывает целый шаг при касании стены', () => {
  const state = createSimulation({ seed: 1 }).getState();
  const step = 3.2 * 0.05 / 3;
  let x = -7;
  for (let i = 0; i < 360; i++) if (canOccupy(state, x + step, 0)) x += step;
  const east = state.layout.walls.find(w => w.id === 'east');
  const contact = east.x - east.width / 2 - 0.22;
  assert.ok(Math.abs(x - contact) < 1e-9, `Остановка ${x}, граница касания ${contact}`);
  assert.equal(canOccupy(state, x + step, 0), false, 'Следующий шаг в стену запрещён');
  assert.equal(canOccupy(state, contact + 1e-6, 0), false, 'Даже микрометр реального проникновения запрещён');
});

test('численный допуск симметричен для стен и мебели и не позволяет пройти через них', () => {
  const state = createSimulation({ seed: 1 }).getState();
  for (const [x, z, dx, dz] of [[8.68, 0, 1, 0], [-8.68, 0, -1, 0], [-6, 5.68, 0, 1], [-6, -5.68, 0, -1]]) {
    // South contact must be checked in a location without the sofa.
    const px = z > 0 ? -8.5 : x;
    assert.equal(canOccupy(state, px + dx * 3e-14, z + dz * 3e-14), true);
    assert.equal(canOccupy(state, px + dx * 1e-6, z + dz * 1e-6), false);
  }
  const prop = state.props[0];
  const contact = prop.x + prop.width / 2 + 0.22;
  assert.equal(canOccupy(state, contact - 3e-14, prop.z), true);
  assert.equal(canOccupy(state, contact - 1e-6, prop.z), false);
  assert.equal(canOccupy(state, prop.x, prop.z), false);
  assert.equal(canOccupy(state, NaN, 0), false);
});
