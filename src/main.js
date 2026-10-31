import './style.css';
import { createGame } from './game.js';
import { loadGameAssets } from './assets.js';

const root = document.getElementById('app');
let game, assets, destroyQA;
let disposed = false;
let loading = false;
async function boot() {
  if (loading || disposed) return;
  loading = true;
  root.classList.add('game-root');
  root.innerHTML = `<div class="loading-screen"><p class="eyebrow">НЕЗВАНЫЕ ГОСТИ</p>
    <h1>За дверью кто-то есть.</h1><p role="status">Подготавливаем квартиру…</p>
    <progress max="15" value="0" aria-label="Загрузка моделей"></progress>
    <small>Модели и материалы загружаются с сервера игры.</small></div>`;
  try {
    assets = await loadGameAssets((done, total) => {
      if (disposed) return;
      root.querySelector('progress').max = total;
      root.querySelector('progress').value = done;
      root.querySelector('[role="status"]').textContent = `Модели и материалы · ${done} / ${total}`;
    });
    if (disposed) { assets.dispose(); return; }
    root.replaceChildren();
    game = createGame({ root, assets });
    if (game.qa) {
      const { mountQA } = await import('./qa.js');
      if (!disposed) destroyQA = mountQA(root, game.qa);
    }
  } catch (error) {
    if (disposed) return;
    console.error(error);
    game?.dispose(); game = null;
    assets?.dispose();
    root.innerHTML = '<div class="loading-screen"><p class="eyebrow">НЕЗВАНЫЕ ГОСТИ</p><h1>Квартира пока закрыта.</h1><p role="status"></p></div>';
    root.querySelector('[role="status"]').textContent = 'Не удалось открыть игру. Проверьте WebGL 2 и доступ к серверу, затем повторите попытку.';
    const retry = document.createElement('button');
    retry.className = 'button'; retry.textContent = 'Повторить загрузку';
    retry.addEventListener('click', boot, { once: true });
    root.querySelector('.loading-screen').append(retry);
  } finally { loading = false; }
}
boot();
if (import.meta.hot) import.meta.hot.dispose(() => {
  disposed = true;
  destroyQA?.(); game?.dispose(); assets?.dispose();
});
