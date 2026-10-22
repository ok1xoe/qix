// Oplocenka – hra ve stylu Qix / Xonix pro sadu ZX Spectrum (speccy.js).
(function () {
    'use strict';
    var GW = 120, GH = 78, OX = 8, OY = 26;       // pole 120x78 buněk po 2 px
    var NEED = 0.75;
    var INTERIOR = (GW - 2) * (GH - 2);
    var FILL = [1, 3, 4, 5, 2, 6];                 // barvy obsazeného území podle úrovně
    var grid = new Uint8Array(GW * GH);            // 0 volno, 1 obsazeno, 2 stopa
    var mark = new Uint8Array(GW * GH);
    var stack = new Int32Array(GW * GH);

    var G = {
        state: 'title', t: 0, level: 1, score: 0, lives: 3, claimed: 0, hi: 0,
        px: 0, py: 0, drawing: false, fast: true, trail: [], sx: 0, sy: 0,
        cd: 0, inv: 0, qix: [], sparks: [], popup: null, bonus: 0, axis: 'h', clearInfo: null, grid: grid
    };
    window.GAME = G;

    function rnd() { return Math.random(); }
    function inb(x, y) { return x >= 0 && y >= 0 && x < GW && y < GH; }
    function cell(x, y) { return inb(x, y) ? grid[y * GW + x] : 1; }
    function isRing(x, y) { return x === 0 || y === 0 || x === GW - 1 || y === GH - 1; }
    function pct() { return G.claimed / INTERIOR; }

    // ---------- úroveň
    function qixCount(l) { return 1 + (l >= 3 ? 1 : 0) + (l >= 7 ? 1 : 0); }
    function sparkCount(l) { return Math.min(6, 2 + Math.floor((l - 1) / 2)); }

    function newQix(x, y, l) {
        return { x: x, y: y, a: rnd() * 6.28, s: Math.min(0.62, 0.30 + 0.03 * l), la: rnd() * 6.28,
                 da: (rnd() < 0.5 ? -1 : 1) * 0.09, hist: [], ht: 0 };
    }

    var RING_SPOTS = [[10, 0], [GW - 11, 0], [0, 20], [GW - 1, 20], [0, GH - 20], [GW - 1, GH - 20], [30, GH - 1], [GW - 31, GH - 1], [GW >> 1, 0]];

    function placeSparks() {
        var spots = RING_SPOTS.slice().sort(function (a, b) {
            var da = Math.abs(a[0] - G.px) + Math.abs(a[1] - G.py), db = Math.abs(b[0] - G.px) + Math.abs(b[1] - G.py);
            return db - da;
        });
        G.sparks = [];
        var n = sparkCount(G.level);
        for (var i = 0; i < n; i++) {
            var p = spots[i % spots.length];
            var d = p[1] === 0 ? [1, 0] : p[0] === 0 ? [0, 1] : p[0] === GW - 1 ? [0, -1] : [-1, 0];
            if (i & 1) { d = [-d[0], -d[1]]; }
            G.sparks.push({ x: p[0], y: p[1], dx: d[0], dy: d[1], t: 0 });
        }
    }

    function resetLevelField() {
        grid.fill(0);
        for (var x = 0; x < GW; x++) { grid[x] = 1; grid[(GH - 1) * GW + x] = 1; }
        for (var y = 0; y < GH; y++) { grid[y * GW] = 1; grid[y * GW + GW - 1] = 1; }
        G.claimed = 0; G.trail = []; G.drawing = false;
        G.px = GW >> 1; G.py = GH - 1;
        var n = qixCount(G.level);
        G.qix = [];
        for (var i = 0; i < n; i++) {
            var fx = n === 1 ? 0.5 : (i + 1) / (n + 1);
            G.qix.push(newQix(Math.round(GW * fx + (rnd() - 0.5) * 10), Math.round(GH * (0.35 + rnd() * 0.2)), G.level));
        }
        placeSparks();
        G.cd = 0; G.inv = 100; G.popup = null;
    }

    function startGame() {
        G.level = 1; G.score = 0; G.lives = 3;
        resetLevelField();
        G.state = 'play'; G.t = 0;
        Z.pauseOk = true;
    }

    // ---------- pohyb hráče
    function dirInput() {
        var I = Z.input;
        if (I.hit('left') || I.hit('right')) { G.axis = 'h'; }
        if (I.hit('up') || I.hit('down')) { G.axis = 'v'; }
        var dx = (I.down('right') ? 1 : 0) - (I.down('left') ? 1 : 0);
        var dy = (I.down('down') ? 1 : 0) - (I.down('up') ? 1 : 0);
        if (dx && dy) { if (G.axis === 'h') { dy = 0; } else { dx = 0; } }
        return [dx, dy];
    }

    function movePlayer() {
        if (G.cd > 0) { G.cd--; }
        if (G.cd > 0) { return; }
        var d = dirInput();
        if (!d[0] && !d[1]) { return; }
        var nx = G.px + d[0], ny = G.py + d[1];
        if (!inb(nx, ny)) { return; }
        var c = grid[ny * GW + nx];
        if (c === 2) { return; }
        if (!G.drawing) {
            if (c === 1) { G.px = nx; G.py = ny; G.cd = 2; return; }
            // vyjetí do pole: začíná čára
            G.drawing = true; G.fast = Z.input.down('fire');
            G.sx = G.px; G.sy = G.py;
            G.px = nx; G.py = ny;
            grid[ny * GW + nx] = 2; G.trail.push(ny * GW + nx);
            G.cd = G.fast ? 2 : 4;
            Z.snd.beep(G.fast ? 520 : 360, 0.03, 0, 0.12);
            return;
        }
        if (c === 0) {
            G.px = nx; G.py = ny;
            grid[ny * GW + nx] = 2; G.trail.push(ny * GW + nx);
            G.cd = G.fast ? 2 : 4;
            return;
        }
        // c === 1: uzavření
        G.px = nx; G.py = ny; G.cd = 2;
        closeArea();
    }

    function closeArea() {
        var i, t = G.trail, gained = t.length;
        for (i = 0; i < t.length; i++) { grid[t[i]] = 1; }
        G.trail = []; G.drawing = false;
        mark.fill(0);
        for (var q = 0; q < G.qix.length; q++) {
            var s = Math.round(G.qix[q].y) * GW + Math.round(G.qix[q].x);
            if (grid[s] !== 0 || mark[s]) { continue; }
            var sp = 0; stack[sp++] = s; mark[s] = 1;
            while (sp) {
                var c = stack[--sp], cx = c % GW, cy = (c / GW) | 0;
                if (cx > 0 && !mark[c - 1] && grid[c - 1] === 0) { mark[c - 1] = 1; stack[sp++] = c - 1; }
                if (cx < GW - 1 && !mark[c + 1] && grid[c + 1] === 0) { mark[c + 1] = 1; stack[sp++] = c + 1; }
                if (cy > 0 && !mark[c - GW] && grid[c - GW] === 0) { mark[c - GW] = 1; stack[sp++] = c - GW; }
                if (cy < GH - 1 && !mark[c + GW] && grid[c + GW] === 0) { mark[c + GW] = 1; stack[sp++] = c + GW; }
            }
        }
        for (i = 0; i < grid.length; i++) { if (grid[i] === 0 && !mark[i]) { grid[i] = 1; gained++; } }
        G.claimed += gained;
        var pts = gained * (G.fast ? 5 : 10);
        G.score += pts;
        G.popup = { txt: '+' + pts, t: 70, x: G.px, y: G.py };
        Z.snd.coin();
        if (pct() >= NEED) { levelClear(); }
    }

    function levelClear() {
        var over = Math.round((pct() - NEED) * 100);
        var bonus = 1000 * G.level + over * 100 + G.lives * 500;
        G.score += bonus;
        G.clearInfo = { bonus: bonus, over: over };
        G.state = 'clear'; G.t = 0;
        Z.snd.win();
    }

    // ---------- nepřátelé
    function qixFree(x, y) { return cell(Math.round(x), Math.round(y)) === 0; }

    function updateQix(q) {
        if (rnd() < 0.02) { q.a += (rnd() - 0.5) * 1.8; }
        var vx = Math.cos(q.a) * q.s, vy = Math.sin(q.a) * q.s;
        var bx = !qixFree(q.x + vx, q.y), by = !qixFree(q.x, q.y + vy);
        if (!bx && !by && !qixFree(q.x + vx, q.y + vy)) { bx = by = true; }
        if (bx) { vx = -vx; }
        if (by) { vy = -vy; }
        if (bx || by) { q.a = Math.atan2(vy, vx) + (rnd() - 0.5) * 0.7; }
        if (qixFree(q.x + vx, q.y + vy)) { q.x += vx; q.y += vy; }
        q.la += q.da;
        if (rnd() < 0.01) { q.da = -q.da; }
        if (++q.ht >= 3) {
            q.ht = 0; q.hist.push(lineOf(q));
            if (q.hist.length > 3) { q.hist.shift(); }
        }
    }

    function lineOf(q) {
        var L = 4.5;
        var C = function (v, m) { return Math.max(0, Math.min(m, v)); };
        return [C(q.x - Math.cos(q.la) * L, GW - 1), C(q.y - Math.sin(q.la) * L, GH - 1), C(q.x + Math.cos(q.la) * L, GW - 1), C(q.y + Math.sin(q.la) * L, GH - 1)];
    }

    function qixHitsTrail(q) {
        if (!G.trail.length) { return false; }
        var l = lineOf(q), n = 14;
        for (var i = 0; i <= n; i++) {
            var x = Math.round(l[0] + (l[2] - l[0]) * i / n), y = Math.round(l[1] + (l[3] - l[1]) * i / n);
            if (cell(x, y) === 2) { return true; }
        }
        return false;
    }

    function sparkValid(x, y) {
        if (!inb(x, y) || grid[y * GW + x] !== 1) { return false; }
        if (isRing(x, y)) { return true; }
        for (var j = -1; j <= 1; j++) {
            for (var i = -1; i <= 1; i++) { if (cell(x + i, y + j) !== 1) { return true; } }
        }
        return false;
    }

    function updateSpark(s) {
        var cand = [[s.dx, s.dy], [s.dy, -s.dx], [-s.dy, s.dx]], opts = [], i;
        for (i = 0; i < 3; i++) { if (sparkValid(s.x + cand[i][0], s.y + cand[i][1])) { opts.push(cand[i]); } }
        var pick = null;
        if (opts.length) {
            pick = (sparkValid(s.x + s.dx, s.y + s.dy) && rnd() < 0.85) ? cand[0] : opts[(rnd() * opts.length) | 0];
        } else if (sparkValid(s.x - s.dx, s.y - s.dy)) {
            pick = [-s.dx, -s.dy];
        } else {
            for (i = 0; i < 4; i++) {
                var d = [[1, 0], [-1, 0], [0, 1], [0, -1]][i];
                if (cell(s.x + d[0], s.y + d[1]) === 1 && inb(s.x + d[0], s.y + d[1])) { pick = d; break; }
            }
        }
        if (!pick) { s.x = 0; s.y = (rnd() * (GH - 2) + 1) | 0; s.dx = 0; s.dy = 1; return; }
        s.dx = pick[0]; s.dy = pick[1]; s.x += pick[0]; s.y += pick[1];
        if (!sparkValid(s.x, s.y) && cell(s.x, s.y) === 1) {
            // stojí uvnitř obsazené plochy: přesunout zpět na okraj pole
            s.x = (rnd() * (GW - 2) + 1) | 0; s.y = 0; s.dx = 1; s.dy = 0;
        }
    }

    function die() {
        if (G.state !== 'play') { return; }
        G.state = 'dying'; G.t = 0;
        Z.snd.die();
    }

    function checkHits() {
        var q, s, i;
        for (i = 0; i < G.qix.length; i++) {
            q = G.qix[i];
            if (qixHitsTrail(q)) { die(); return; }
        }
        if (G.inv <= 0) {
            for (i = 0; i < G.sparks.length; i++) {
                s = G.sparks[i];
                if (Math.abs(s.x - G.px) + Math.abs(s.y - G.py) <= 1) { die(); return; }
            }
        }
    }

    function respawn() {
        var i;
        for (i = 0; i < G.trail.length; i++) { grid[G.trail[i]] = 0; }
        G.trail = [];
        if (G.drawing) { G.px = G.sx; G.py = G.sy; }
        G.drawing = false;
        placeSparks();
        G.inv = 120; G.cd = 4; G.state = 'play';
    }

    // ---------- smyčka
    function tickPlay() {
        G.t++;
        if (G.inv > 0) { G.inv--; }
        if (G.popup && --G.popup.t <= 0) { G.popup = null; }
        movePlayer();
        if (G.state !== 'play') { return; }
        var sint = G.level >= 3 ? 2 : 3, i;
        for (i = 0; i < G.qix.length; i++) { updateQix(G.qix[i]); }
        for (i = 0; i < G.sparks.length; i++) { if (G.t % sint === 0) { updateSpark(G.sparks[i]); } }
        checkHits();
    }

    function tick() {
        Z.border = G.state === 'play' || G.state === 'dying' ? 0 : 1;
        var fire = Z.input.hit('fire');
        if (G.state === 'title') {
            G.t++; Z.pauseOk = false;
            if (fire) { startGame(); }
        } else if (G.state === 'play') {
            Z.pauseOk = true;
            tickPlay();
        } else if (G.state === 'dying') {
            G.t++;
            if (G.t > 75) {
                G.lives--;
                if (G.lives < 0) {
                    G.hi = Z.hi.submit('oplocenka', G.score);
                    G.state = 'over'; G.t = 0; Z.pauseOk = false; Z.snd.over();
                } else { respawn(); }
            }
        } else if (G.state === 'clear') {
            G.t++;
            if (G.t > 60 && fire || G.t > 300) {
                G.level++; resetLevelField(); G.state = 'play'; G.t = 0;
            }
        } else if (G.state === 'over') {
            G.t++; Z.pauseOk = false;
            if (G.t > 100 && fire) { G.state = 'title'; G.t = 0; }
        }
    }

    // ---------- kreslení
    var QCOL = [15, 14, 10, 2];

    function px2(x) { return OX + x * 2; }
    function py2(y) { return OY + y * 2; }

    function drawField() {
        var base = FILL[(G.level - 1) % FILL.length], x, y, c, run, col;
        for (y = 0; y < GH; y++) {
            x = 0;
            while (x < GW) {
                c = grid[y * GW + x];
                if (c === 0) { x++; continue; }
                run = x;
                while (run < GW && grid[y * GW + run] === c) { run++; }
                if (c === 2) { col = G.fast ? 10 : 13; }
                else if (y === 0 || y === GH - 1) { col = 7; }
                else { col = (y & 1) ? base | 8 : base; }
                Z.rect(px2(x), py2(y), (run - x) * 2, 2, col);
                x = run;
            }
        }
        for (y = 1; y < GH - 1; y++) { Z.rect(OX, py2(y), 2, 2, 7); Z.rect(OX + (GW - 1) * 2, py2(y), 2, 2, 7); }
    }

    function drawHud() {
        Z.text(8, 0, 'PUNKTY ' + G.score, 15);
        Z.text(248, 0, 'REKORD ' + Math.max(G.hi, Z.hi.get('oplocenka'), G.score), 14, { align: 'right' });
        Z.text(8, 9, 'ÚROVEŇ ' + G.level, 11);
        var p = Math.floor(pct() * 100);
        Z.text(160, 9, 'OBSAZENO ' + p + '/75', p >= 75 ? 12 : 15, { align: 'center' });
        var L = ''; for (var i = 0; i < Math.min(6, Math.max(0, G.lives)); i++) { L += '*'; }
        Z.text(8, 182, 'ŽIVOTY ' + L, 10);
        // ukazatel plnění
        Z.frame(8, 18, 240, 5, 7);
        Z.rect(9, 19, Math.min(238, Math.floor(238 * Math.min(1, pct() / NEED))), 3, p >= 75 ? 12 : 13);
        if (G.drawing && (G.state === 'play' || G.state === 'dying')) { Z.text(190, 182, G.fast ? 'RYCHLE x1' : 'POMALU x2', G.fast ? 10 : 13, { align: 'center' }); }
    }

    function drawActors() {
        var i, j, q, s, l;
        for (i = 0; i < G.qix.length; i++) {
            q = G.qix[i];
            for (j = 0; j < q.hist.length; j++) {
                l = q.hist[j];
                Z.line(px2(l[0]) + 1, py2(l[1]) + 1, px2(l[2]) + 1, py2(l[3]) + 1, QCOL[Math.min(3, q.hist.length - j)]);
            }
            l = lineOf(q);
            Z.line(px2(l[0]) + 1, py2(l[1]) + 1, px2(l[2]) + 1, py2(l[3]) + 1, 15);
            Z.line(px2(l[0]) + 1, py2(l[1]) + 2, px2(l[2]) + 1, py2(l[3]) + 2, 13);
        }
        for (i = 0; i < G.sparks.length; i++) {
            s = G.sparks[i];
            var cx = px2(s.x) + 1, cy = py2(s.y) + 1, f = (G.t >> 2) & 1;
            Z.rect(cx - 3, cy - 1, 7, 3, f ? 11 : 14);
            Z.rect(cx - 1, cy - 3, 3, 7, f ? 14 : 11);
            Z.rect(cx - 1, cy - 1, 3, 3, 15);
        }
        if (G.state === 'dying' && (G.t >> 2) & 1) { return; }
        if (G.state !== 'clear' && !(G.inv > 0 && (G.t >> 2) & 1)) {
            var X = px2(G.px) + 1, Y = py2(G.py) + 1;
            Z.rect(X - 2, Y - 2, 5, 5, 0);
            Z.rect(X - 2, Y - 2, 4, 4, 15);
            Z.rect(X - 1, Y - 1, 2, 2, G.drawing ? (G.fast ? 10 : 13) : 12);
        }
        if (G.popup) { Z.text(px2(G.popup.x), py2(G.popup.y) - 12 - (70 - G.popup.t) / 8, G.popup.txt, 14, { align: 'center' }); }
    }

    function box(h, lines) {
        var y0 = 96 - (h >> 1);
        Z.rect(40, y0, 176, h, 0); Z.frame(40, y0, 176, h, 15); Z.frame(42, y0 + 2, 172, h - 4, 2);
        lines.forEach(function (l, i) { Z.text(128, y0 + 8 + i * 11, l[0], l[1], { align: 'center' }); });
    }

    function drawTitle() {
        Z.cls(0, 7);
        // ozdobné obsazené území
        var f, k;
        for (k = 0; k < 7; k++) {
            f = [1, 3, 4, 5, 2, 6, 1][k];
            Z.rect(8 + k * 4, 6 + k * 4, 240 - k * 8, 2, f | 8);
            Z.rect(8 + k * 4, 6 + k * 4, 2, 50 - k * 4, f | 8);
            Z.rect(246 - k * 4, 6 + k * 4, 2, 50 - k * 4, f | 8);
        }
        Z.text(128, 16, 'OPLOCENKA', 14, { scale: 3, align: 'center' });
        Z.text(128, 44, 'OBEHNEJ SI SVÉ ÚZEMÍ', 11, { align: 'center' });
        Z.text(128, 66, 'Vyjeď z okraje do pole a nakresli čáru.', 15, { align: 'center' });
        Z.text(128, 77, 'Uzavřená oblast bez nepřítele je tvá.', 15, { align: 'center' });
        Z.text(128, 88, 'Obsaď 75 procent pole a postup dál!', 15, { align: 'center' });
        Z.text(128, 102, 'Čára je křehká: Qix ji přeřízne,', 10, { align: 'center' });
        Z.text(128, 112, 'jiskry po okraji tě sežehnou.', 10, { align: 'center' });
        Z.text(128, 128, 'ŠIPKY / WASD ... pohyb', 12, { align: 'center' });
        Z.text(128, 138, 'MEZERNÍK držet ... rychle (x1)', 12, { align: 'center' });
        Z.text(128, 148, 'bez mezerníku ... pomalu (x2 body)', 12, { align: 'center' });
        Z.text(128, 158, 'P pauza   M zvuk', 13, { align: 'center' });
        Z.text(128, 172, 'REKORD ' + Z.hi.get('oplocenka'), 14, { align: 'center' });
        if ((G.t >> 5) & 1) { Z.text(128, 182, 'STISKNI MEZERNÍK', 15, { align: 'center' }); }
    }

    function draw() {
        if (G.state === 'title') { drawTitle(); return; }
        Z.cls(0, 7);
        drawField();
        drawActors();
        drawHud();
        if (G.state === 'clear') {
            box(70, [['ÚZEMÍ OBSAZENO!', 14], ['Bonus: ' + G.clearInfo.bonus, 15], ['Nad plán: +' + G.clearInfo.over, 11],
                     [(G.t > 60 ? 'Mezerník = další úroveň' : ' '), 13]]);
        } else if (G.state === 'over') {
            box(74, [['KONEC HRY', 10], ['Skóre: ' + G.score, 15], ['Rekord: ' + Z.hi.get('oplocenka'), 14],
                     [G.score >= G.hi && G.score > 0 ? 'NOVÝ REKORD!' : ' ', 12], [(G.t > 100 ? 'Mezerník = zpět na titul' : ' '), 13]]);
        }
    }

    Z.init({
        title: 'Oplocenka',
        touch: [{ act: 'left', label: '◀' }, { act: 'up', label: '▲' }, { act: 'down', label: '▼' }, { act: 'right', label: '▶' },
                { act: 'fire', label: 'RYCHLE', cls: 'big' }]
    });
    G.hi = Z.hi.get('oplocenka');
    Z.run({ tick: tick, draw: draw });
})();
