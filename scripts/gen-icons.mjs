// Генерирует иконки PWA: кот рисуется как SVG, затем экспортируется в PNG через Chromium из Playwright.
// Запуск: npm run icons
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = 'public';
mkdirSync(`${OUT}/icons`, { recursive: true });

/** Мордочка Мурзика. scale — доля холста, которую занимает кот (для maskable нужна «безопасная зона»). */
function catFace(scale = 1) {
  const s = scale;
  return `
  <g transform="translate(256 256) scale(${s}) translate(-256 -256)">
    <path d="M92 214 L78 70 Q78 54 94 62 L196 128 Z" fill="#ff9a3c" stroke="#2a1a14" stroke-width="12" stroke-linejoin="round"/>
    <path d="M420 214 L434 70 Q434 54 418 62 L316 128 Z" fill="#ff9a3c" stroke="#2a1a14" stroke-width="12" stroke-linejoin="round"/>
    <path d="M112 186 L104 104 L168 148 Z" fill="#ffa8a8"/>
    <path d="M400 186 L408 104 L344 148 Z" fill="#ffa8a8"/>
    <ellipse cx="256" cy="296" rx="196" ry="162" fill="#ff9a3c" stroke="#2a1a14" stroke-width="12"/>
    <path d="M226 150 q-6 34 4 56 M256 142 q0 38 0 60 M286 150 q6 34 -4 56" stroke="#e07a1f" stroke-width="14" stroke-linecap="round" fill="none"/>
    <ellipse cx="256" cy="372" rx="92" ry="62" fill="#fff7ec"/>
    <ellipse cx="184" cy="286" rx="52" ry="64" fill="#fff" stroke="#2a1a14" stroke-width="10"/>
    <ellipse cx="328" cy="286" rx="52" ry="64" fill="#fff" stroke="#2a1a14" stroke-width="10"/>
    <ellipse cx="190" cy="294" rx="30" ry="40" fill="#1a1020"/>
    <ellipse cx="322" cy="294" rx="30" ry="40" fill="#1a1020"/>
    <circle cx="200" cy="276" r="12" fill="#fff"/><circle cx="332" cy="276" r="12" fill="#fff"/>
    <circle cx="180" cy="312" r="6" fill="#fff"/><circle cx="312" cy="312" r="6" fill="#fff"/>
    <ellipse cx="116" cy="352" rx="30" ry="18" fill="#ffa3a0" opacity=".75"/>
    <ellipse cx="396" cy="352" rx="30" ry="18" fill="#ffa3a0" opacity=".75"/>
    <path d="M236 340 h40 q-4 22 -20 26 q-16 -4 -20 -26z" fill="#ff7a93" stroke="#2a1a14" stroke-width="6" stroke-linejoin="round"/>
    <path d="M256 366 v14 M256 380 q-16 22 -38 6 M256 380 q16 22 38 6" stroke="#2a1a14" stroke-width="8" stroke-linecap="round" fill="none"/>
    <path d="M150 372 L60 358 M150 392 L62 402 M362 372 L452 358 M362 392 L450 402" stroke="#2a1a14" stroke-width="5" stroke-linecap="round"/>
  </g>`;
}

function svg({ bg, scale }) {
  const background =
    bg === 'full'
      ? '<rect width="512" height="512" fill="url(#g)"/>'
      : bg === 'round'
        ? '<rect width="512" height="512" rx="108" fill="url(#g)"/>'
        : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9c4"/><stop offset="1" stop-color="#ffc27a"/></linearGradient></defs>
  ${background}${catFace(scale)}</svg>`;
}

const jobs = [
  { file: `${OUT}/icons/icon-192.png`, size: 192, svg: svg({ bg: 'round', scale: 0.86 }), transparent: true },
  { file: `${OUT}/icons/icon-512.png`, size: 512, svg: svg({ bg: 'round', scale: 0.86 }), transparent: true },
  // maskable: фон на весь холст, кот внутри «безопасной зоны» (80%)
  { file: `${OUT}/icons/maskable-512.png`, size: 512, svg: svg({ bg: 'full', scale: 0.7 }), transparent: false },
  // iOS не любит прозрачность
  { file: `${OUT}/icons/apple-touch-icon.png`, size: 180, svg: svg({ bg: 'full', scale: 0.8 }), transparent: false },
];

writeFileSync(`${OUT}/favicon.svg`, svg({ bg: 'round', scale: 0.9 }).replace(' width="512" height="512"', ''));

const browser = await chromium.launch();
for (const j of jobs) {
  const page = await browser.newPage({ viewport: { width: j.size, height: j.size }, deviceScaleFactor: 1 });
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><div style="width:${j.size}px;height:${j.size}px">${j.svg.replace('width="512" height="512"', `width="${j.size}" height="${j.size}"`)}</div></body></html>`,
  );
  await page.screenshot({ path: j.file, omitBackground: j.transparent, clip: { x: 0, y: 0, width: j.size, height: j.size } });
  await page.close();
  console.log('ok', j.file);
}
await browser.close();
