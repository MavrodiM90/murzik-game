import './styles.css';
import { Game } from './game';
import { Hud } from './ui/hud';

declare global {
  interface Window {
    __murzik?: { game: Game; hud: Hud };
  }
}

function boot(): void {
  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  const game = new Game(canvas);
  const hud = new Hud(game, ui);
  game.onTapExtraHook = (id) => hud.handleExtra(id);
  game.start();
  // Хук для автотестов: не меняет поведение игры.
  if (location.search.includes('test')) window.__murzik = { game, hud };
}

// Блокировка зума, выделения, контекстного меню и жестов браузера
for (const ev of ['gesturestart', 'gesturechange', 'gestureend'] as const) {
  document.addEventListener(ev, (e) => e.preventDefault());
}
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('selectstart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false },
);

boot();
