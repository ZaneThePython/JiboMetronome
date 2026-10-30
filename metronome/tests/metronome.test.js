'use strict';
// node tests/metronome.test.js  (Node 6 compatible)
const assert = require('assert');
const tempo = require('../tempo'), Clicks = require('../clicks'), Mover = require('../motion');
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= (eps || 1e-9), (msg || '') + ' ' + a + ' vs ' + b);

// Tempo editing and saved settings.
assert.strictEqual(tempo.step(100, 0, true), 200);
assert.strictEqual(tempo.step(200, 0, true), tempo.MAX_BPM, 'clamped at the top');
assert.strictEqual(tempo.step(35, 1, false), tempo.MIN_BPM, 'clamped at the bottom');
assert.strictEqual(tempo.step(120, 2, false), 119);
assert.deepStrictEqual(tempo.digits(60), ['', '6', '0']);
assert.deepStrictEqual(tempo.digits(128), ['1', '2', '8']);
assert.deepStrictEqual(tempo.load(null), { bpm: 100, moving: true });
assert.deepStrictEqual(tempo.load('{"bpm":72,"moving":false}'), { bpm: 72, moving: false });
assert.deepStrictEqual(tempo.load('{"bpm":9000}'), { bpm: 100, moving: true }, 'out-of-range tempo ignored');
assert.deepStrictEqual(tempo.load('not json'), { bpm: 100, moving: true });

assert.deepStrictEqual(tempo.beatsBetween(1, 0.5, 0, 2.6), [1, 1.5, 2, 2.5]);
assert.deepStrictEqual(tempo.beatsBetween(1, 0.5, 1.5, 2), [1.5], 'start inclusive, end exclusive');

// The dance loop is whole two-beat cycles, starts and ends on the same pose, reaches each
// side of the sway on a beat, and dips on every beat.
[30, 60, 100, 137, 250].forEach(bpm => {
    const s = tempo.sway(bpm), beat = 60 / bpm, ch = s.data.content.channels;
    assert.strictEqual(s.beats % 2, 0);
    near(s.length, s.beats * beat, 1e-9, bpm + ' loop length');
    assert.ok(s.length > 40 && s.length < 80, bpm + ' loop is about a minute: ' + s.length);
    const head = ch[0], dip = ch[2], last = head.times.length - 1;
    near(head.times[last], s.length, 1e-9, 'last sample at loop end');
    near(head.values[0], head.values[last], 1e-9, 'seamless head'); near(dip.values[0], dip.values[last], 1e-9, 'seamless dip');
    const at = (c, t) => { let i = 0; while (c.times[i + 1] < t) i++; return c.values[i]; };
    assert.ok(head.values[0] < 0 && at(head, beat) > 0, bpm + ' sways to the other side by the next beat');
    assert.ok(Math.max.apply(null, head.values.map(Math.abs)) <= 15 * Math.PI / 180 + 1e-9, 'never more than 15 degrees');
    ch[1].values.forEach((v, i) => near(v, -dip.values[i], 1e-12, 'torso and pelvis dip together'));
});

// Fake Web Audio and timers record what is scheduled.
function fakeAudio() {
    const clicks = [];
    function Ctx() {
        this.currentTime = 10; this.destination = {};
        const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
        this.createOscillator = () => ({ frequency: {}, connect() {}, start(t) { clicks.push(t); }, stop() {} });
        this.createGain = () => ({ gain: param(), connect() {} });
    }
    return { Ctx: Ctx, clicks: clicks };
}
const timers = { setInterval: () => 1, clearInterval() {} };

const audio = fakeAudio(), c = new Clicks(audio.Ctx, timers);
c.start(120, 10.05);
const ctx = c.ctx;
for (let t = 10; t < 12; t += 0.025) { ctx.currentTime = t; c.schedule(); }
assert.deepStrictEqual(audio.clicks.map(t => Math.round(t * 1000)), [10050, 10550, 11050, 11550, 12050]);

// A nudge moves the grid half way to the measured beat, and never doubles a click.
audio.clicks.length = 0;
c.nudge(12.09); near(c.origin, 10.07, 1e-9, 'half the 40 ms error');
c.nudge(13.81); near(c.origin, 10.07 + 0.5 / 3 / 2, 1e-9, 'big errors are capped'); // 240 ms late, capped to a third of a beat
for (let t = 12; t < 13; t += 0.025) { ctx.currentTime = t; c.schedule(); }
for (let i = 1; i < audio.clicks.length; i++) assert.ok(audio.clicks[i] - audio.clicks[i - 1] > 0.25, 'no doubled click');

// A start right after its beat 0 time plays beat 0 now instead of skipping it.
audio.clicks.length = 0; ctx.currentTime = 20; c.start(60, 19.985);
assert.deepStrictEqual(audio.clicks, [20]);
c.stop(); assert.strictEqual(c.sinceBeat(), null);

// Mover against a fake expression service.
function fakeExpression() {
    const log = [], handlers = {};
    const e = {
        log: log, handlers: handlers, AttentionMode: { OFF: 'OFF', ENGAGED: 'ENGAGED' }, dofs: { BODY: 'BODY' },
        setAttentionMode: m => { log.push('attention ' + m); return Promise.resolve(); },
        createAnimation: options => { log.push('create loops=' + options.loops); return Promise.resolve({
            events: { started: { on: f => handlers.started = f }, general: { on: f => handlers.general = f } },
            play: () => { log.push('play'); return Promise.resolve(); }, stop: () => { log.push('stop'); return Promise.resolve(); } }); },
        cleanup: () => { log.push('cleanup'); return Promise.resolve(); },
        destroyCaches: () => { log.push('destroyCaches'); return Promise.resolve(); }
    };
    return e;
}

const e1 = fakeExpression(), m1 = new Mover(e1);
let started = 0, loops = 0;
m1.start(100, () => started++, () => loops++).then(played => {
    assert.strictEqual(played, true);
    assert.deepStrictEqual(e1.log, ['attention OFF', 'create loops=0', 'play']);
    e1.handlers.general({ name: 'metronome-loop' }); assert.strictEqual(loops, 0, 'no loop before the start');
    e1.handlers.started(); e1.handlers.started(); assert.strictEqual(started, 1, 'started once');
    e1.handlers.general({ name: 'metronome-loop' }); assert.strictEqual(loops, 1);
    return m1.stop();
}).then(() => {
    assert.deepStrictEqual(e1.log.slice(3), ['stop', 'cleanup', 'destroyCaches', 'attention ENGAGED'], 'body back to rest, attention back on');
    e1.handlers.general({ name: 'metronome-loop' }); assert.strictEqual(loops, 1, 'old animation ignored after stop');
    // Stop while the animation is still being created: it must never play.
    const e2 = fakeExpression(), m2 = new Mover(e2);
    const pending = m2.start(100, () => assert.fail('must not start'), () => {});
    m2.stop();
    return pending.then(played => {
        assert.strictEqual(played, false);
        assert.ok(e2.log.indexOf('play') === -1, 'never played');
        const m3 = new Mover(fakeExpression());
        return m3.stop().then(() => assert.deepStrictEqual(m3.expression.log, [], 'stop without a dance leaves attention alone'));
    });
}).then(() => console.log('metronome tests passed'))
  .catch(error => { console.error(error); process.exit(1); });
