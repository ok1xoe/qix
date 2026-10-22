// Test v Node: stavy, NaN, bot dokončující úrovně, screenshoty.  Použití: node tools/test.js [adresář-pro-png]
const path = require('path');
const H = require('/Users/hyman/EngetoAcademy/TizenOS/_kit/headless.js');
const root = path.join(__dirname, '..');
const out = process.argv[2] || '/tmp';
let seed = 12345;
function srand() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
const g = H.load([root + '/js/speccy.js', root + '/js/game.js']);
g.sandbox.Math = Object.assign(Object.create(Math), { random: srand });
const G = g.sandbox.GAME, Z = g.Z;
const GW = 120, GH = 78;
let fails = 0;
function ok(c, m) { console.log((c ? 'OK   ' : 'CHYBA ') + m); if (!c) fails++; }
function tapFire() { g.key(32, true); g.step(2); g.key(32, false); g.step(1); }

// title
g.step(30); ok(G.state === 'title', 'start na titulní obrazovce');
g.png(out + '/title.png', 3);
tapFire(); ok(G.state === 'play', 'mezerník spustí hru');
g.step(60); g.png(out + '/play0.png', 3);

// bot: svislé čáry ze spodního okraje
const KEYS = { left: 37, right: 39, up: 38, down: 40 };
function hold(dir) { for (const k in KEYS) { g.key(KEYS[k], k === dir); } }
function cellG(x, y) { return G.grid[y * GW + x]; }
function bfsNext(tx, ty) {
    const prev = new Int32Array(GW * GH).fill(-1), q = [G.py * GW + G.px]; prev[q[0]] = q[0];
    for (let i = 0; i < q.length; i++) {
        const c = q[i], x = c % GW, y = (c / GW) | 0;
        if (x === tx && y === ty) { let n = c; while (prev[n] !== q[0] && n !== q[0]) { n = prev[n]; } return n; }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
            const n = ny * GW + nx;
            if (prev[n] === -1 && G.grid[n] === 1) { prev[n] = c; q.push(n); }
        }
    }
    return -1;
}
function pickX() {
    let best = null;
    for (let x = 4; x < GW - 4; x++) {
        // sloupec musí být celý volný a konec nahoře obsazený
        let free = true; for (let y = 1; y < GH - 1; y++) { if (cellG(x, y) !== 0) { free = false; break; } }
        if (!free || cellG(x, GH - 1) !== 1) continue;
        let d = 1e9; for (const q of G.qix) d = Math.min(d, Math.abs(x - q.x));
        if (d < 12) continue;
        if (best === null || d < best.d) best = { x, d };
    }
    return best && best.x;
}
let states = new Set(), nan = false, deaths = 0, maxLevel = 1, lastState = 'play', fastDraws = 0, slowDraws = 0, shot = false;
let plan = null, ticks = 0;
G.lives = 99;
while (ticks < 60000 && G.level < 3) {
    ticks++;
    states.add(G.state);
    if (G.state === 'dying' && lastState !== 'dying') deaths++;
    lastState = G.state;
    if (G.state === 'clear') { hold(null); if (!shot) { g.png(out + '/clear.png', 3); shot = true; } g.step(70); tapFire(); plan = null; continue; }
    if (G.state !== 'play') { g.step(1); plan = null; continue; }
    if (G.drawing) {
        g.key(32, G.fast);
        hold('up');
    } else {
        if (plan === null) { const x = pickX(); plan = x === null ? undefined : x; if (plan === undefined) { plan = null; hold(null); g.step(1); if (ticks % 50 === 0) { /* nic k nakreslení */ } if (ticks > 55000) break; continue; } }
        if (G.py === GH - 1 && G.px === plan) { g.key(32, (ticks >> 3) % 2 === 0); (G.fast = true); hold('up'); }
        else { const n = bfsNext(plan, GH - 1); if (n < 0) { plan = null; } else { const nx = n % GW, ny = (n / GW) | 0; hold(nx > G.px ? 'right' : nx < G.px ? 'left' : ny > G.py ? 'down' : 'up'); } }
    }
    g.step(1);
    if (g.hasNaN({ a: G.px, b: G.py, q: G.qix, s: G.sparks, c: G.claimed, sc: G.score })) nan = true;
    if (G.drawing) { if (G.fast) fastDraws++; else slowDraws++; }
    if (G.drawing && !shot && G.trail.length > 30) { g.png(out + '/drawing.png', 3); }
    if (G.level > maxLevel) { maxLevel = G.level; console.log('úroveň', maxLevel, 'tiků', ticks, 'skóre', G.score, 'smrtí', deaths); }
}
hold(null); g.key(32, false); maxLevel = Math.max(maxLevel, G.level);
ok(!nan, 'žádné NaN');
ok(maxLevel >= 3, 'bot dokončil aspoň 2 úrovně (dosažená úroveň ' + maxLevel + ', tiků ' + ticks + ', smrtí ' + deaths + ')');
ok(states.has('clear') && states.has('play'), 'stavy play/clear: ' + [...states].join(','));
g.png(out + '/play1.png', 3);

// smrt a konec hry: stoupnout do pole a nechat zabít
G.lives = 0; G.level = 1; G.score = 777;
g.step(1);
{ const G2 = G; 
  // nová hra
  while (G2.state !== 'title') { if (G2.state === 'clear' || G2.state === 'over') { g.step(120); tapFire(); } else { G2.lives = 0; G2.state = 'play'; break; } }
}
if (G.state === 'title') { tapFire(); }
G.lives = 0; G.score = 777;
// vyjet do pole a vložit stopu pod Qix
hold(null);
let guard = 0;
while (G.state === 'play' && guard++ < 3000) {
    if (!G.drawing && G.py === GH - 1) { hold('up'); g.step(3); }
    else if (!G.drawing) { const n = bfsNext(GW >> 1, GH - 1); if (n < 0) break; const nx = n % GW; hold(nx > G.px ? 'right' : nx < G.px ? 'left' : 'down'); g.step(1); }
    else { // kresli ke Qixu
        const q = G.qix[0]; hold(q.x > G.px + 1 ? 'right' : q.x < G.px - 1 ? 'left' : q.y < G.py ? 'up' : 'down'); g.key(32, false); g.step(1); }
}
hold(null);
ok(G.state === 'dying' || G.state === 'over', 'zásah ukončí život (stav ' + G.state + ')');
g.step(200);
ok(G.state === 'over', 'konec hry po ztrátě posledního života');
g.png(out + '/over.png', 3);
ok(Z.hi.get('oplocenka') >= 777, 'rekord uložen: ' + Z.hi.get('oplocenka'));
g.step(120); tapFire();
ok(G.state === 'title', 'návrat na titulní obrazovku');
console.log(fails ? 'SELHÁNÍ: ' + fails : 'VŠE V POŘÁDKU');
process.exit(fails ? 1 : 0);
