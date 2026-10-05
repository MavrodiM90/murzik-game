import { clamp, lerp, smoothstep } from '../logic/math';
import type { Cat } from './cat';

export interface ActionDef {
  dur: number;
  prio: number;
  allowAirborne?: boolean;
  allowLying?: boolean;
  start?(c: Cat): void;
  run(c: Cat, t: number, u: number): void;
  end?(c: Cat): void;
  after?(c: Cat): void;
}

/** Огибающая: плавный вход и выход. */
const env = (u: number, a = 0.1, b = 0.8): number => (u < a ? smoothstep(u / a) : u > b ? smoothstep((1 - u) / (1 - b)) : 1);


const defs = {
  // ---------- реакции на касания ----------
  pet: {
    dur: 0.6,
    prio: 3,
    start(c) {
      c.sfx('purr');
    },
    run(c, t) {
      const p = c.p;
      p.lidL = p.lidR = 0.78;
      p.smile = 1;
      p.mouth = 0;
      p.earDroop = 0.25;
      p.headZ += 0.22;
      p.headX += 0.12;
      p.tailDrive = Math.sin(t * 5) * 0.4;
      p.look = 0;
      if (Math.floor(t * 3) !== Math.floor((t - c.dt) * 3)) c.fx('hearts', 'head', 1);
    },
    end(c) {
      c.sfx('purrStop');
    },
  },
  giggle: {
    dur: 1.7,
    prio: 3,
    start(c) {
      c.sfx('giggle');
      c.fx('hearts', 'belly', 2);
      c.sq.value = 0.88;
    },
    run(c, t, u) {
      const e = env(u, 0.08, 0.75);
      const s = Math.sin(t * 26);
      c.set('mouth', 0.4 + 0.25 * Math.abs(s), e);
      c.set('smile', 1, e);
      c.set('lidL', 0.8, e);
      c.set('lidR', 0.8, e);
      c.set('legLx', s * 1.0, e);
      c.set('legRx', -s * 1.0, e);
      c.set('armLz', -0.5 - 0.35 * s, e);
      c.set('armRz', 0.5 + 0.35 * s, e);
      c.set('bodyZ', Math.sin(t * 13) * 0.05, e);
      c.set('headZ', Math.sin(t * 13 + 1) * 0.1, e);
      c.set('tailDrive', Math.sin(t * 18) * 0.5, e);
      c.set('look', 0);
      c.sq.target = 1 + Math.sin(t * 26) * 0.04 * e;
    },
  },
  laugh: {
    dur: 2.8,
    prio: 4,
    start(c) {
      c.sfx('laugh');
      c.fx('hearts', 'head', 3);
    },
    run(c, t, u) {
      const e = env(u, 0.06, 0.8);
      const s = Math.sin(t * 30);
      c.set('mouth', 0.65 + 0.3 * Math.abs(s), e);
      c.set('smile', 1, e);
      c.set('lidL', 0.9, e);
      c.set('lidR', 0.9, e);
      c.set('tongue', 1, e);
      c.set('legLx', s * 1.2, e);
      c.set('legRx', -s * 1.2, e);
      c.set('armLz', -1.0 - 0.5 * s, e);
      c.set('armRz', 1.0 + 0.5 * s, e);
      c.set('headX', -0.35, e);
      c.set('bodyZ', Math.sin(t * 15) * 0.1, e);
      c.set('hop', Math.abs(Math.sin(t * 15)) * 0.18, e);
      c.set('tailDrive', Math.sin(t * 22) * 0.7, e);
      c.set('look', 0);
      c.sq.target = 1 + Math.sin(t * 30) * 0.05 * e;
      if (Math.floor(t * 4) !== Math.floor((t - c.dt) * 4)) c.fx('hearts', 'head', 1);
    },
  },
  sneeze: {
    dur: 1.9,
    prio: 3,
    start(c) {
      c.sfx('sneeze');
    },
    run(c, t) {
      const p = c.p;
      if (t < 0.75) {
        // «а... а...»
        const k = smoothstep(t / 0.7);
        p.headX = -0.45 * k;
        p.mouth = 0.5 * k;
        p.lidL = p.lidR = 0.5 * k;
        p.pupilS = 1 - 0.1 * k;
        p.armLz = -0.2 - 0.3 * k;
        p.armRz = 0.2 + 0.3 * k;
        c.sq.target = 1 + 0.06 * k;
      } else if (t < 1.1) {
        // апчхи!
        const k = smoothstep((t - 0.75) / 0.12);
        p.headX = lerp(-0.45, 0.55, k);
        p.mouth = 0.85;
        p.lidL = p.lidR = 1;
        c.sq.target = 1 - 0.1 * k;
        if (t - c.dt < 0.75) {
          c.fx('sneeze', 'nose', 8);
          c.sq.value = 0.82;
          c.kickEars(14);
        }
      } else {
        const k = smoothstep((t - 1.1) / 0.6);
        p.headX = lerp(0.55, 0, k);
        p.headY = Math.sin(t * 24) * 0.25 * (1 - k);
        p.mouth = 0.2 * (1 - k);
        p.lidL = p.lidR = 0.6 * (1 - k);
      }
      p.look = 0;
    },
  },
  highFive: {
    dur: 1.5,
    prio: 3,
    start(c) {
      c.sfx('meowShort');
    },
    run(c, t, u) {
      const e = env(u, 0.18, 0.78);
      const R = c.side > 0;
      const kz = R ? 'armRz' : 'armLz';
      const kx = R ? 'armRx' : 'armLx';
      const sg = R ? 1 : -1;
      c.set(kz, sg * 2.55, e);
      c.set(kx, -0.3, e);
      c.set('smile', 1, e);
      c.set('mouth', 0.3, e);
      c.set('headZ', -0.12 * sg, e);
      c.set('tailDrive', Math.sin(t * 12) * 0.5, e);
      if (t > 0.5 && t - c.dt <= 0.5) {
        c.sfx('five');
        c.fx('stars', R ? 'pawR' : 'pawL', 6);
        c.sq.value = 0.92;
      }
      if (t > 0.5 && t < 0.8) c.set(kz, sg * (2.55 + Math.sin((t - 0.5) * 30) * 0.18), e);
    },
  },
  tailHuff: {
    dur: 1.6,
    prio: 3,
    start(c) {
      c.sfx('huff');
      c.kickTail(-6);
    },
    run(c, t, u) {
      const e = env(u, 0.12, 0.75);
      c.set('headY', 0.55, e);
      c.set('earDroop', 0.9, e);
      c.set('lidL', 0.45, e);
      c.set('lidR', 0.45, e);
      c.set('smile', -0.4, e);
      c.set('mouth', 0.08 + (t > 0.25 && t < 0.5 ? 0.25 : 0), e);
      c.set('armLz', -0.45, e);
      c.set('armRz', 0.45, e);
      c.set('tailCurl', 0.3, e);
      c.set('look', 0);
      c.set('bodyZ', 0.06, e);
    },
  },
  wiggle: {
    dur: 0.8,
    prio: 2,
    run(c, t, u) {
      const e = env(u, 0.1, 0.5);
      c.set('bodyZ', Math.sin(t * 22) * 0.07, e);
      c.set('smile', 1, e);
      c.set('tailDrive', Math.sin(t * 18) * 0.5, e);
    },
  },
  // ---------- после падения ----------
  dizzy: {
    dur: 2,
    prio: 6,
    allowAirborne: true,
    start(c) {
      c.setDizzyStars(true);
      c.sfx('dizzy');
      c.fx('stars', 'head', 4);
    },
    run(c, t, u) {
      c.easeRotToLanding();
      c.set('lidL', 0.2);
      c.set('lidR', 0.2);
      c.set('headZ', Math.sin(t * 5) * 0.28);
      c.set('bodyZ', Math.sin(t * 5 + 1) * 0.14);
      c.set('mouth', 0.2 + 0.1 * Math.sin(t * 5));
      c.set('smile', 0.2);
      c.set('pupilX', Math.cos(t * 9) * 0.08);
      c.set('pupilY', Math.sin(t * 9) * 0.1);
      c.set('armLz', -0.9 + Math.sin(t * 5) * 0.3);
      c.set('armRz', 0.9 + Math.sin(t * 5 + 2) * 0.3);
      c.set('look', 0);
      c.set('earDroop', 0.3);
      c.set('tailDrive', Math.sin(t * 5) * 0.3);
      if (u > 0.92) c.set('lidL', 0.5);
    },
    end(c) {
      c.setDizzyStars(false);
      c.setUprightImmediate();
    },
    after(c) {
      c.play('getup', { force: true });
    },
  },
  getup: {
    dur: 0.9,
    prio: 5,
    run(c, t, u) {
      const e = env(u, 0.2, 0.5);
      c.set('armLz', -1.6 * (1 - smoothstep(u * 1.5)), 1);
      c.set('armRz', 1.6 * (1 - smoothstep(u * 1.5)), 1);
      c.set('smile', 1);
      c.set('mouth', 0.25 * (1 - u));
      if (t < 0.25) c.sq.target = 0.85;
      else c.sq.target = 1.08;
      if (t > 0.3 && t - c.dt <= 0.3) c.sfx('hop');
      c.set('tailDrive', Math.sin(t * 12) * 0.4 * e);
    },
    end(c) {
      c.sq.target = 1;
      c.fx('sparkle', 'head', 3);
    },
  },
  // ---------- простые ----------
  meow: {
    dur: 0.85,
    prio: 2,
    start(c) {
      c.sfx('meow');
    },
    run(c, _t, u) {
      const e = env(u, 0.15, 0.7);
      const m = Math.sin(clamp(u, 0, 1) * Math.PI);
      c.set('mouth', 0.2 + 0.7 * m, 1);
      c.set('headX', -0.22 * e);
      c.set('smile', 0.8);
      c.set('look', 0.5);
    },
  },
  sigh: {
    dur: 1.7,
    prio: 1,
    start(c) {
      c.sfx('sigh');
    },
    run(c, t, u) {
      const e = env(u, 0.3, 0.6);
      c.set('headX', -0.1 * e + 0.2 * smoothstep((u - 0.5) * 2));
      c.set('mouth', 0.18 * e, 1);
      c.set('lidL', 0.6 * e);
      c.set('lidR', 0.6 * e);
      c.set('earDroop', 0.5 + 0.3 * e);
      c.sq.target = 1 + 0.04 * Math.sin(u * Math.PI);
      c.set('look', 0);
      void t;
    },
  },
  yawn: {
    dur: 2.2,
    prio: 1,
    start(c) {
      c.sfx('yawn');
    },
    run(c, t, u) {
      const e = env(u, 0.25, 0.7);
      c.set('mouth', 0.95 * e, 1);
      c.set('tongue', 1, e);
      c.set('headX', -0.35 * e);
      c.set('lidL', 0.95 * e);
      c.set('lidR', 0.95 * e);
      c.set('armLz', -2.2 * e);
      c.set('armRz', 2.2 * e);
      c.set('look', 0);
      c.sq.target = 1 + 0.07 * e;
      void t;
    },
  },
  scratch: {
    dur: 1.8,
    prio: 1,
    run(c, t, u) {
      const e = env(u, 0.15, 0.8);
      const s = Math.sin(t * 20);
      c.set('legRx', (-1.4 + s * 0.35) * e);
      c.set('headZ', 0.28 * e);
      c.set('lidL', 0.75 * e);
      c.set('lidR', 0.75 * e);
      c.set('smile', 1, e);
      c.set('bodyZ', -0.07 * e);
      c.set('look', 0);
      c.set('earR', Math.sin(t * 20) * 0.2 * e);
    },
  },
  lookAround: {
    dur: 2.6,
    prio: 1,
    run(c, t, u) {
      const e = env(u, 0.15, 0.85);
      const s = Math.sin(u * Math.PI * 2);
      c.set('headY', s * 0.6 * e);
      c.set('pupilX', s * 0.1, 1);
      c.set('earL', Math.sin(t * 8) * 0.15 * (u > 0.5 ? 1 : 0), e);
      c.set('look', 0);
    },
  },
  wave: {
    dur: 1.9,
    prio: 1,
    start(c) {
      c.sfx('meowShort');
    },
    run(c, t, u) {
      const e = env(u, 0.18, 0.8);
      c.set('armRz', 2.6 + Math.sin(t * 11) * 0.25, e);
      c.set('armRx', -0.2, e);
      c.set('smile', 1, e);
      c.set('mouth', 0.25, e);
      c.set('headZ', -0.1, e);
    },
  },
  cheer: {
    dur: 1.6,
    prio: 4,
    start(c) {
      c.sfx('cheer');
      c.fx('stars', 'head', 8);
      c.fx('hearts', 'head', 3);
    },
    run(c, t, u) {
      const e = env(u, 0.1, 0.8);
      const bounce = Math.abs(Math.sin(t * 9));
      c.set('armLz', -2.5, e);
      c.set('armRz', 2.5, e);
      c.set('legLx', Math.sin(t * 9) * 0.5, e);
      c.set('legRx', -Math.sin(t * 9) * 0.5, e);
      c.set('mouth', 0.7, e);
      c.set('smile', 1, e);
      c.set('hop', bounce * 0.45, e);
      c.set('tailDrive', Math.sin(t * 16) * 0.6, e);
      c.set('look', 0);
      c.set('pupilS', 1.15, e);
    },
  },
  newClothes: {
    dur: 1.5,
    prio: 4,
    start(c) {
      c.sfx('sparkle');
      c.fx('sparkle', 'head', 8);
      c.fx('hearts', 'head', 2);
    },
    run(c, t, u) {
      const e = env(u, 0.1, 0.75);
      c.set('headZ', Math.sin(t * 8) * 0.18, e);
      c.set('headY', Math.sin(t * 4) * 0.3, e);
      c.set('smile', 1, e);
      c.set('mouth', 0.3, e);
      c.set('armLz', -1.1, e);
      c.set('armRz', 1.1, e);
      c.set('hop', Math.abs(Math.sin(t * 8)) * 0.2, e);
      c.set('look', 0);
    },
  },
  // ---------- еда ----------
  eat: {
    dur: 2.2,
    prio: 4,
    start(c) {
      c.sfx('yum');
    },
    run(c, t, u) {
      const e = env(u, 0.1, 0.85);
      const chew = Math.abs(Math.sin(t * 9));
      c.set('mouth', 0.08 + 0.35 * chew, e);
      c.set('smile', 1, e);
      c.set('lidL', 0.7, e);
      c.set('lidR', 0.7, e);
      c.set('headZ', Math.sin(t * 4.5) * 0.08, e);
      c.set('look', 0);
      c.set('tailDrive', Math.sin(t * 8) * 0.4, e);
      c.sq.target = 1 + chew * 0.02;
      if (Math.floor(t * 4.5) !== Math.floor((t - c.dt) * 4.5)) c.fx('crumbs', 'mouth', 2);
    },
  },
  eatFavorite: {
    dur: 2.6,
    prio: 4,
    start(c) {
      c.sfx('yum');
      c.sfx('cheer');
      c.fx('hearts', 'head', 5);
    },
    run(c, t, u) {
      const e = env(u, 0.1, 0.85);
      const chew = Math.abs(Math.sin(t * 9));
      c.set('mouth', 0.1 + 0.4 * chew, e);
      c.set('smile', 1, e);
      c.set('lidL', 0.85, e);
      c.set('lidR', 0.85, e);
      c.set('hop', Math.abs(Math.sin(t * 7)) * 0.3, e);
      c.set('armLz', -1.2, e);
      c.set('armRz', 1.2, e);
      c.set('look', 0);
      c.set('tailDrive', Math.sin(t * 14) * 0.7, e);
      if (Math.floor(t * 4) !== Math.floor((t - c.dt) * 4)) {
        c.fx('crumbs', 'mouth', 2);
        c.fx('hearts', 'head', 1);
      }
    },
  },
  eatDisliked: {
    dur: 2.6,
    prio: 4,
    start(c) {
      c.sfx('yuck');
    },
    run(c, t, u) {
      const wince = u < 0.4 ? smoothstep(u / 0.1) : 1 - smoothstep((u - 0.4) / 0.4);
      const chew = u > 0.35 ? Math.abs(Math.sin(t * 8)) : 0;
      c.set('lidL', 0.95 * wince + 0.5 * (1 - wince) * 0);
      c.set('lidR', 0.95 * wince);
      c.set('mouth', 0.15 + 0.25 * chew, 1);
      c.set('tongue', wince * 0.8);
      c.set('smile', -0.6 * wince + 0.5 * (1 - wince));
      c.set('headY', Math.sin(t * 20) * 0.22 * wince);
      c.set('earDroop', 0.6 * wince);
      c.set('look', 0);
      c.set('armLz', -0.6 * wince);
      c.set('armRz', 0.6 * wince);
      if (u > 0.4 && u < 0.45) c.fx('sweat', 'head', 2);
    },
  },
  // ---------- туалет, купание ----------
  potty: {
    dur: 4.2,
    prio: 5,
    start(c) {
      c.sq.value = 0.82;
    },
    run(c, t, u) {
      const e = env(u, 0.08, 0.9);
      if (t < 2.0) {
        const strain = Math.sin(t * 14) * 0.015;
        c.set('mouth', 0.12, e);
        c.set('smile', -0.6, e);
        c.set('lidL', 0.85, e);
        c.set('lidR', 0.85, e);
        c.set('headX', 0.18, e);
        c.set('armLz', -0.3, e);
        c.set('armRz', 0.3, e);
        c.set('look', 0);
        c.set('bodyZ', strain * 8, e);
        c.sq.target = 0.84;
        c.set('legLx', -1.15, e);
        c.set('legRx', -1.15, e);
      } else {
        if (t - c.dt < 2.0) {
          c.sfx('fart');
          c.fx('puff', 'feet', 4);
          c.sq.value = 1.12;
        }
        const k = (t - 2.0) / 2.2;
        const surprise = t < 2.7;
        c.set('mouth', surprise ? 0.75 : 0.35, 1);
        c.set('smile', surprise ? 0.2 : 1);
        c.set('lidL', surprise ? 0 : 0.7);
        c.set('lidR', surprise ? 0 : 0.7);
        c.set('pupilS', surprise ? 0.8 : 1.1);
        c.set('tongue', surprise ? 0 : 1);
        c.set('legLx', -1.15 * (1 - smoothstep(k)));
        c.set('legRx', -1.15 * (1 - smoothstep(k)));
        c.set('armLz', -1.2);
        c.set('armRz', 1.2);
        c.set('hop', Math.abs(Math.sin(t * 8)) * 0.2 * (surprise ? 0 : 1));
        c.set('look', 0);
        c.sq.target = 1;
        if (!surprise && Math.floor(t * 2) !== Math.floor((t - c.dt) * 2)) c.fx('hearts', 'head', 1);
      }
    },
  },
  scrub: {
    dur: 0.5,
    prio: 3,
    run(c, t) {
      c.set('lidL', 0.8);
      c.set('lidR', 0.8);
      c.set('smile', 1);
      c.set('mouth', 0.2 + 0.1 * Math.sin(t * 12));
      c.set('bodyZ', Math.sin(t * 16) * 0.06);
      c.set('headZ', Math.sin(t * 16 + 1) * 0.1);
      c.set('look', 0);
      c.set('legLx', Math.sin(t * 14) * 0.3);
      c.set('legRx', -Math.sin(t * 14) * 0.3);
    },
  },
  rinse: {
    dur: 0.5,
    prio: 3,
    run(c, t) {
      c.set('lidL', 1);
      c.set('lidR', 1);
      c.set('mouth', 0.3 + 0.2 * Math.abs(Math.sin(t * 9)));
      c.set('smile', 1);
      c.set('headY', Math.sin(t * 7) * 0.2);
      c.set('look', 0);
      c.set('armLz', -0.9);
      c.set('armRz', 0.9);
    },
  },
  shake: {
    dur: 1.1,
    prio: 4,
    start(c) {
      c.sfx('shake');
      c.fx('drops', 'body', 10);
    },
    run(c, t, u) {
      const e = env(u, 0.05, 0.7);
      c.set('bodyZ', Math.sin(t * 40) * 0.16, e);
      c.set('headZ', Math.sin(t * 40 + 1) * 0.2, e);
      c.set('lidL', 0.9, e);
      c.set('lidR', 0.9, e);
      c.set('smile', 1, e);
      c.set('look', 0);
      c.set('earL', Math.sin(t * 50) * 0.3, e);
      c.set('earR', Math.sin(t * 50) * 0.3, e);
    },
  },
  // ---------- сон ----------
  sleep: {
    dur: Number.POSITIVE_INFINITY,
    prio: 6,
    allowLying: true,
    start(c) {
      c.setDizzyStars(false);
    },
    run(c, t) {
      c.set('lidL', 1);
      c.set('lidR', 1);
      c.set('smile', 0.7);
      c.set('mouth', 0);
      c.set('armLz', -0.6);
      c.set('armRz', 0.6);
      c.set('legLx', 0.5);
      c.set('legRx', 0.5);
      c.set('earDroop', 0.4);
      c.set('tailDrive', Math.sin(t * 0.8) * 0.08);
      c.set('look', 0);
      c.set('headX', 0.1);
      if (Math.floor(t / 2.6) !== Math.floor((t - c.dt) / 2.6)) {
        c.fx('zzz', 'head', 1);
        c.sfx('snore');
      }
    },
  },
  grumble: {
    dur: 1.2,
    prio: 7,
    allowLying: true,
    start(c) {
      c.sfx('grumble');
      c.fx('zzz', 'head', 2);
    },
    run(c, t, u) {
      const e = env(u, 0.1, 0.6);
      c.set('lidL', 1 - 0.35 * Math.sin(u * Math.PI));
      c.set('lidR', 1 - 0.35 * Math.sin(u * Math.PI));
      c.set('smile', -0.5, e);
      c.set('mouth', 0.15, e);
      c.set('earDroop', 0.4);
      c.set('look', 0);
      c.set('headZ', Math.sin(t * 9) * 0.06, e);
    },
    after(c) {
      if (c.mode === 'lying') c.play('sleep', { force: true });
    },
  },
  wake: {
    dur: 2.4,
    prio: 6,
    start(c) {
      c.sfx('yawn');
      c.sq.value = 0.9;
    },
    run(c, t, u) {
      const e = env(u, 0.2, 0.7);
      c.set('mouth', 0.9 * e, 1);
      c.set('tongue', 1, e);
      c.set('lidL', 1 - smoothstep(u * 1.4), 1);
      c.set('lidR', 1 - smoothstep(u * 1.4), 1);
      c.set('armLz', -2.3 * e);
      c.set('armRz', 2.3 * e);
      c.set('headX', -0.3 * e);
      c.set('look', 0);
      c.sq.target = 1 + 0.07 * e;
      void t;
    },
  },
  // ---------- голос ----------
  listen: {
    dur: Number.POSITIVE_INFINITY,
    prio: 3,
    run(c, t) {
      c.set('headZ', 0.32);
      c.set('headX', -0.05);
      c.set('pupilS', 1.15);
      c.set('earL', Math.sin(t * 2.5) * 0.12);
      c.set('earR', Math.sin(t * 2.5 + 2) * 0.12);
      c.set('smile', 0.7);
      c.set('look', 0);
    },
  },
  speak: {
    dur: Number.POSITIVE_INFINITY,
    prio: 4,
    run(c, t) {
      c.set('smile', 1);
      c.set('pupilS', 1.1);
      c.set('headZ', Math.sin(t * 6) * 0.1);
      c.set('hop', c.mouthDrive * 0.1);
      c.set('look', 0);
      c.set('tailDrive', Math.sin(t * 9) * 0.4);
    },
  },
  kick: {
    dur: 0.5,
    prio: 2,
    run(c, t, u) {
      const e = Math.sin(u * Math.PI);
      c.set('legRx', -1.2 * e);
      c.set('bodyZ', -0.08 * e);
      c.set('smile', 1);
      c.set('mouth', 0.2 * e);
      void t;
    },
  },
  paw: {
    dur: 0.6,
    prio: 2,
    run(c, t, u) {
      const e = Math.sin(u * Math.PI);
      c.set('armLz', -1.5 * e);
      c.set('armLx', -0.6 * e);
      c.set('smile', 1);
      void t;
    },
  },
} satisfies Record<string, ActionDef>;

export type ActionName = keyof typeof defs;
export const ACTIONS: Record<ActionName, ActionDef> = defs;
export const IDLE_ACTIONS: ActionName[] = ['scratch', 'yawn', 'lookAround', 'wave', 'meow', 'lookAround'];
