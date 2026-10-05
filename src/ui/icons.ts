// Собственные SVG-иконки (рисованы вручную, без внешних ресурсов).
const S = 'stroke="#3b2a20" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"';
const svg = (inner: string): string => `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;

export const ICONS: Record<string, string> = {
  // --- шкалы ---
  food: svg(
    `<ellipse cx="29" cy="32" rx="19" ry="12" fill="#6fc3ff" ${S}/><path d="M46 32 L60 20 L58 44 Z" fill="#4aa7ea" ${S}/><circle cx="19" cy="29" r="3" fill="#3b2a20"/><path d="M30 22 Q34 32 30 42" fill="none" ${S} stroke-width="2"/>`,
  ),
  sleep: svg(
    `<path d="M40 8 A24 24 0 1 0 56 40 A19 19 0 0 1 40 8 Z" fill="#ffd966" ${S}/><path d="M50 12 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="#fff" ${S} stroke-width="2"/>`,
  ),
  toilet: svg(
    `<rect x="12" y="10" width="26" height="22" rx="6" fill="#bfe6ff" ${S}/><path d="M8 32 H52 Q52 52 30 52 Q8 52 8 32Z" fill="#fff" ${S}/><rect x="20" y="52" width="20" height="6" rx="3" fill="#bfe6ff" ${S}/>`,
  ),
  clean: svg(
    `<circle cx="24" cy="38" r="15" fill="#e6f6ff" ${S}/><circle cx="43" cy="22" r="10" fill="#e6f6ff" ${S}/><circle cx="46" cy="46" r="7" fill="#e6f6ff" ${S}/><circle cx="19" cy="33" r="4" fill="#fff"/><circle cx="40" cy="18" r="3" fill="#fff"/>`,
  ),
  health: svg(
    `<path d="M32 56 C8 40 4 22 16 14 C24 9 30 14 32 19 C34 14 40 9 48 14 C60 22 56 40 32 56Z" fill="#ff7a93" ${S}/><path d="M32 24 v16 M24 32 h16" ${S} stroke="#fff" stroke-width="5"/>`,
  ),
  fun: svg(
    `<circle cx="32" cy="32" r="24" fill="#ff5d73" ${S}/><path d="M10 26 Q32 36 54 26" fill="none" stroke="#fff" stroke-width="5"/><path d="M12 42 Q32 52 52 42" fill="none" stroke="#ffd23f" stroke-width="5"/><ellipse cx="22" cy="18" rx="5" ry="3" fill="#fff" opacity=".7"/>`,
  ),
  // --- навигация ---
  home: svg(`<path d="M8 32 L32 10 L56 32 H50 V54 H38 V40 H26 V54 H14 V32Z" fill="#ffb561" ${S}/><rect x="42" y="14" width="6" height="12" fill="#e07a1f" ${S} stroke-width="2"/>`),
  left: svg(`<path d="M40 8 L16 32 L40 56" fill="none" stroke="#fff" stroke-width="10"/><path d="M40 8 L16 32 L40 56" fill="none" stroke="#3b2a20" stroke-width="3" opacity=".0"/>`),
  right: svg(`<path d="M24 8 L48 32 L24 56" fill="none" stroke="#fff" stroke-width="10"/>`),
  gear: svg(
    `<circle cx="32" cy="32" r="10" fill="#d9d4cc" ${S}/><path d="M32 6 l4 8 8 -3 3 8 8 3 -3 8 8 4 -8 4 3 8 -8 3 -3 8 -8 -3 -4 8 -4 -8 -8 3 -3 -8 -8 -3 3 -8 -8 -4 8 -4 -3 -8 8 -3 3 -8 8 3z" fill="#e8e3da" ${S} stroke-width="2" opacity=".0"/><path d="M28 6h8l2 7 6 3 7-3 6 6-3 7 3 6 7 2v8l-7 2-3 6 3 7-6 6-7-3-6 3-2 7h-8l-2-7-6-3-7 3-6-6 3-7-3-6-7-2v-8l7-2 3-6-3-7 6-6 7 3 6-3z" fill="#e8e3da" ${S} stroke-width="2.5"/><circle cx="32" cy="32" r="9" fill="#bdb6aa" ${S} stroke-width="2.5"/>`,
  ),
  close: svg(`<circle cx="32" cy="32" r="26" fill="#ff7a7a" ${S}/><path d="M22 22 L42 42 M42 22 L22 42" stroke="#fff" stroke-width="7" stroke-linecap="round"/>`),
  check: svg(`<circle cx="32" cy="32" r="26" fill="#5ed07c" ${S}/><path d="M19 33 L28 42 L46 22" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`),
  coin: svg(`<circle cx="32" cy="32" r="26" fill="#ffd23f" ${S}/><circle cx="32" cy="32" r="16" fill="none" stroke="#e0a800" stroke-width="4"/><path d="M32 22 v20 M27 27 h8 a4 4 0 0 1 0 8 h-8" fill="none" stroke="#b98300" stroke-width="3.5" stroke-linecap="round"/>`),
  // --- кнопки действий ---
  shop: svg(`<path d="M12 22 H52 L48 56 H16Z" fill="#ff8fa3" ${S}/><path d="M22 22 V16 A10 10 0 0 1 42 16 V22" fill="none" ${S}/><circle cx="32" cy="40" r="7" fill="#ffd23f" ${S} stroke-width="2.5"/>`),
  wardrobe: svg(`<path d="M32 14 a5 5 0 1 1 5 5 v5 L58 40 Q60 46 54 46 H10 Q4 46 6 40 L27 24 v-5" fill="#9ad0ff" ${S}/>`),
  hat: svg(`<ellipse cx="32" cy="46" rx="26" ry="8" fill="#6a5acd" ${S}/><path d="M16 46 L20 16 Q32 8 44 16 L48 46Z" fill="#8b7bf0" ${S}/><rect x="17" y="34" width="30" height="7" fill="#ffd23f" ${S} stroke-width="2"/>`),
  ear: svg(`<path d="M22 54 Q22 46 28 40 Q40 32 40 22 A12 12 0 0 0 16 22" fill="#ffd2a8" ${S}/><path d="M26 22 A5 5 0 0 1 32 17" fill="none" ${S} stroke-width="2.5"/><path d="M48 14 q6 8 0 16 M54 10 q10 12 0 24" fill="none" stroke="#4aa7ea" stroke-width="3.5" stroke-linecap="round"/>`),
  gamepad: svg(`<path d="M16 22 H48 Q60 22 58 38 Q56 52 48 50 Q42 48 40 42 H24 Q22 48 16 50 Q8 52 6 38 Q4 22 16 22Z" fill="#7a6cf0" ${S}/><path d="M20 30 v10 M15 35 h10" stroke="#fff" stroke-width="4" stroke-linecap="round"/><circle cx="43" cy="31" r="3.5" fill="#ffd23f" ${S} stroke-width="2"/><circle cx="49" cy="37" r="3.5" fill="#ff6b81" ${S} stroke-width="2"/>`),
  chest: svg(`<rect x="8" y="26" width="48" height="28" rx="4" fill="#c98a4b" ${S}/><path d="M8 30 Q8 12 32 12 Q56 12 56 30Z" fill="#e0a566" ${S}/><rect x="26" y="28" width="12" height="12" rx="2" fill="#ffd23f" ${S} stroke-width="2.5"/><path d="M8 40 H56" stroke="#7b4a1e" stroke-width="2.5"/>`),
  fridge: svg(`<rect x="14" y="6" width="36" height="52" rx="5" fill="#d7f3ff" ${S}/><path d="M14 24 H50" ${S} stroke-width="2.5"/><rect x="40" y="12" width="4" height="8" rx="2" fill="#8aa4b4"/><rect x="40" y="30" width="4" height="14" rx="2" fill="#8aa4b4"/>`),
  sponge: svg(`<rect x="8" y="20" width="48" height="26" rx="8" fill="#ffd23f" ${S} transform="rotate(-8 32 32)"/><circle cx="20" cy="30" r="2.5" fill="#e0a800"/><circle cx="30" cy="36" r="2.5" fill="#e0a800"/><circle cx="42" cy="28" r="2.5" fill="#e0a800"/><circle cx="48" cy="38" r="2.5" fill="#e0a800"/><circle cx="50" cy="14" r="6" fill="#fff" ${S} stroke-width="2"/>`),
  shower: svg(`<path d="M6 16 H34 Q44 16 44 26 H6Z" fill="#cfd8e3" ${S} transform="rotate(20 25 21)"/><path d="M24 40 v8 M32 42 v10 M40 40 v8 M16 38 v6 M48 36 v6" stroke="#4aa7ea" stroke-width="4" stroke-linecap="round"/>`),
  lamp: svg(`<path d="M18 12 H46 L54 38 H10Z" fill="#ffe27a" ${S}/><rect x="29" y="38" width="6" height="14" fill="#b48cff" ${S} stroke-width="2.5"/><ellipse cx="32" cy="55" rx="14" ry="4" fill="#b48cff" ${S} stroke-width="2.5"/>`),
  vitamin: svg(`<rect x="20" y="20" width="24" height="36" rx="6" fill="#ffb347" ${S}/><rect x="23" y="8" width="18" height="12" rx="3" fill="#ff6b6b" ${S}/><rect x="24" y="30" width="16" height="14" rx="3" fill="#fff" ${S} stroke-width="2"/><path d="M32 33 v8 M28 37 h8" stroke="#ff6b6b" stroke-width="3" stroke-linecap="round"/>`),
  cabinet: svg(`<rect x="12" y="8" width="40" height="48" rx="5" fill="#fff" ${S}/><path d="M32 8 V56" ${S} stroke-width="2.5"/><path d="M22 24 v10 M18 29 h8" stroke="#ff6b6b" stroke-width="4" stroke-linecap="round"/><circle cx="38" cy="32" r="3" fill="#8aa4b4"/>`),
  // --- еда ---
  apple: svg(`<path d="M32 18 C20 10 6 20 10 36 C13 50 24 58 32 54 C40 58 51 50 54 36 C58 20 44 10 32 18Z" fill="#ff5a5a" ${S}/><path d="M32 18 q0 -8 6 -12" fill="none" ${S}/><path d="M36 10 q8 -4 12 2 q-6 4 -12 -2" fill="#5ed07c" ${S} stroke-width="2.5"/>`),
  broccoli: svg(`<rect x="26" y="38" width="12" height="18" rx="4" fill="#9ad66a" ${S}/><circle cx="20" cy="30" r="12" fill="#3fa84f" ${S}/><circle cx="44" cy="30" r="12" fill="#3fa84f" ${S}/><circle cx="32" cy="20" r="13" fill="#4cbb5a" ${S}/>`),
  milk: svg(`<path d="M18 22 L24 8 H40 L46 22 V56 H18Z" fill="#fff" ${S}/><rect x="18" y="30" width="28" height="16" fill="#6fc3ff" ${S} stroke-width="2.5"/><circle cx="32" cy="38" r="4" fill="#fff"/>`),
  fish: svg(`<ellipse cx="29" cy="32" rx="19" ry="12" fill="#6fc3ff" ${S}/><path d="M46 32 L60 20 L58 44 Z" fill="#4aa7ea" ${S}/><circle cx="19" cy="29" r="3" fill="#3b2a20"/><path d="M30 22 Q34 32 30 42" fill="none" ${S} stroke-width="2"/>`),
  cheese: svg(`<path d="M6 26 L54 12 V46 H6Z" fill="#ffd23f" ${S}/><path d="M6 26 L54 12 L58 18 L10 32Z" fill="#ffe680" ${S} stroke-width="2.5"/><circle cx="22" cy="38" r="4" fill="#e0a800"/><circle cx="40" cy="32" r="5" fill="#e0a800"/><circle cx="46" cy="42" r="3" fill="#e0a800"/>`),
  sausage: svg(`<rect x="6" y="22" width="52" height="20" rx="10" fill="#e0614f" ${S} transform="rotate(-20 32 32)"/><path d="M20 24 q4 8 0 16 M32 20 q4 8 0 16 M44 16 q4 8 0 16" fill="none" stroke="#a63a2c" stroke-width="2.5" transform="rotate(-20 32 32) translate(0 4)"/>`),
  cookie: svg(`<circle cx="32" cy="32" r="24" fill="#d9a066" ${S}/><circle cx="24" cy="24" r="4" fill="#5a3418"/><circle cx="40" cy="28" r="4" fill="#5a3418"/><circle cx="28" cy="42" r="4" fill="#5a3418"/><circle cx="44" cy="42" r="3" fill="#5a3418"/>`),
  cake: svg(`<rect x="8" y="30" width="48" height="26" rx="5" fill="#ffb3c6" ${S}/><path d="M8 38 q6 8 12 0 t12 0 t12 0 t12 0" fill="#fff" ${S} stroke-width="2.5"/><rect x="29" y="16" width="6" height="14" fill="#6fc3ff" ${S} stroke-width="2.5"/><path d="M32 6 q4 5 0 9 q-4 -4 0 -9" fill="#ffb347" ${S} stroke-width="2"/>`),
  icecream: svg(`<path d="M20 30 L32 58 L44 30Z" fill="#e0a566" ${S}/><circle cx="32" cy="24" r="14" fill="#ffb3c6" ${S}/><circle cx="24" cy="30" r="8" fill="#fff0a8" ${S} stroke-width="2.5"/><circle cx="42" cy="16" r="5" fill="#ff5a5a" ${S} stroke-width="2.5"/>`),
  // --- мини-игры и карточки ---
  balloon: svg(`<ellipse cx="32" cy="26" rx="17" ry="21" fill="#ff6b81" ${S}/><path d="M28 47 L32 52 L36 47Z" fill="#ff6b81" ${S} stroke-width="2.5"/><path d="M32 52 q-6 4 0 8 t0 4" fill="none" ${S} stroke-width="2.5"/><ellipse cx="25" cy="17" rx="4" ry="6" fill="#fff" opacity=".6"/>`),
  run: svg(`<circle cx="32" cy="30" r="22" fill="#ffb561" ${S}/><path d="M14 18 L18 6 L28 14Z M50 18 L46 6 L36 14Z" fill="#ffb561" ${S}/><circle cx="24" cy="28" r="4" fill="#3b2a20"/><circle cx="40" cy="28" r="4" fill="#3b2a20"/><path d="M26 38 Q32 44 38 38" fill="none" ${S}/><path d="M6 52 H58" stroke="#7bd88f" stroke-width="6" stroke-linecap="round"/>`),
  cards: svg(`<rect x="6" y="12" width="26" height="38" rx="5" fill="#ffd23f" ${S} transform="rotate(-10 19 31)"/><rect x="30" y="14" width="26" height="38" rx="5" fill="#fff" ${S} transform="rotate(8 43 33)"/><path d="M43 42 C34 36 34 28 40 28 C42 28 43 30 43 31 C43 30 44 28 46 28 C52 28 52 36 43 42Z" fill="#ff6b81" ${S} stroke-width="2"/>`),
  catch: svg(`<path d="M10 34 H54 L48 56 H16Z" fill="#c98a4b" ${S}/><path d="M10 34 Q32 24 54 34" fill="none" ${S}/><path d="M24 10 q8 -4 12 2 l-4 10 -10 -2Z" fill="#6fc3ff" ${S} stroke-width="2.5"/>`),
  star: svg(`<path d="M32 6 L39 24 L58 25 L43 37 L48 56 L32 45 L16 56 L21 37 L6 25 L25 24Z" fill="#ffd23f" ${S}/>`),
  heart: svg(`<path d="M32 56 C8 40 4 22 16 14 C24 9 30 14 32 19 C34 14 40 9 48 14 C60 22 56 40 32 56Z" fill="#ff6b81" ${S}/>`),
  moon: svg(`<path d="M40 8 A24 24 0 1 0 56 40 A19 19 0 0 1 40 8 Z" fill="#ffd966" ${S}/>`),
  sun: svg(`<circle cx="32" cy="32" r="14" fill="#ffd23f" ${S}/><path d="M32 4 v8 M32 52 v8 M4 32 h8 M52 32 h8 M12 12 l6 6 M46 46 l6 6 M12 52 l6 -6 M46 18 l6 -6" stroke="#ff9f1c" stroke-width="5" stroke-linecap="round"/>`),
  flower: svg(`<circle cx="32" cy="14" r="10" fill="#ff9fd0" ${S}/><circle cx="50" cy="28" r="10" fill="#ff9fd0" ${S}/><circle cx="43" cy="48" r="10" fill="#ff9fd0" ${S}/><circle cx="21" cy="48" r="10" fill="#ff9fd0" ${S}/><circle cx="14" cy="28" r="10" fill="#ff9fd0" ${S}/><circle cx="32" cy="32" r="9" fill="#ffd23f" ${S}/>`),
  ball: svg(`<circle cx="32" cy="32" r="24" fill="#4da3ff" ${S}/><path d="M8 26 Q32 38 56 26" fill="none" stroke="#fff" stroke-width="5"/><path d="M10 42 Q32 52 54 42" fill="none" stroke="#ffd23f" stroke-width="5"/>`),
  question: svg(`<rect x="8" y="8" width="48" height="48" rx="10" fill="#8b7bf0" ${S}/><path d="M24 26 Q24 16 32 16 Q42 16 42 25 Q42 31 34 34 V38" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/><circle cx="34" cy="47" r="3.5" fill="#fff"/>`),
  basket: svg(`<path d="M8 28 H56 L48 56 H16Z" fill="#c98a4b" ${S}/><path d="M8 28 Q32 14 56 28" fill="#e0a566" ${S}/><path d="M20 34 L24 52 M32 34 V52 M44 34 L40 52" stroke="#7b4a1e" stroke-width="2.5"/>`),
  zzz: svg(`<path d="M12 14 h20 l-20 22 h20" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M36 34 h14 l-14 16 h14" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`),
  potty: svg(`<rect x="12" y="10" width="26" height="22" rx="6" fill="#bfe6ff" ${S}/><path d="M8 32 H52 Q52 52 30 52 Q8 52 8 32Z" fill="#fff" ${S}/><rect x="20" y="52" width="20" height="6" rx="3" fill="#bfe6ff" ${S}/>`),
  gift: svg(`<rect x="8" y="26" width="48" height="30" rx="4" fill="#ff8fa3" ${S}/><rect x="6" y="18" width="52" height="12" rx="4" fill="#ffb3c6" ${S}/><rect x="28" y="18" width="8" height="38" fill="#ffd23f" ${S} stroke-width="2"/><path d="M32 18 C20 4 10 12 22 18 M32 18 C44 4 54 12 42 18" fill="none" ${S}/>`),
};

export function icon(name: string): string {
  return ICONS[name] ?? ICONS.question!;
}
