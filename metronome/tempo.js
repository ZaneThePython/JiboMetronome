'use strict';

// Pure tempo, beat and sway math (no Jibo APIs), so it runs under plain Node 6 tests.
const MIN_BPM = 30, MAX_BPM = 250, DEFAULT_BPM = 100;
const STEPS = [100, 10, 1]; // chevron columns: hundreds, tens, ones

const clamp = bpm => Math.max(MIN_BPM, Math.min(MAX_BPM, bpm));
const step = (bpm, column, up) => clamp(bpm + (up ? 1 : -1) * STEPS[column]);
// Leading zero hidden, like a real metronome display: 60 -> ['', '6', '0'].
const digits = bpm => { const s = String(bpm); return ['', '', ''].map((_, i) => s[s.length - 3 + i] || ''); };
// Saved settings come from localStorage: anything unexpected falls back to the defaults.
function load(raw) {
    let saved = {};
    try { saved = JSON.parse(raw) || {}; } catch (_) {}
    return {
        bpm: Number.isInteger(saved.bpm) && saved.bpm >= MIN_BPM && saved.bpm <= MAX_BPM ? saved.bpm : DEFAULT_BPM,
        moving: saved.moving !== false
    };
}

// Beat times in [from, to) on the grid origin + k * period.
function beatsBetween(origin, period, from, to) {
    const out = [];
    for (let k = Math.max(0, Math.ceil((from - origin) / period - 1e-9)); origin + k * period < to; k++) out.push(origin + k * period);
    return out;
}

// One loop of the dance as expression-service channels (radians): the head sways side to side
// over two beats, reaching each side on a beat, and the body dips (torso against pelvis, as in
// Jibo's listening head-bob) on every beat. The loop is a whole number of two-beat cycles
// (~1 minute) so it repeats seamlessly; the robot plays one long loop exactly in time, and the
// short gap at each repeat is absorbed by `Clicks.nudge`.
const SWAY_DEG = 15, DIP_DEG = 5, SAMPLE_HZ = 40, LOOP_SECONDS = 60;
function sway(bpm) {
    const beat = 60 / bpm, cycles = Math.max(1, Math.round(LOOP_SECONDS / (2 * beat))), length = cycles * 2 * beat;
    const scale = Math.min(1, 140 / bpm) * Math.PI / 180; // smaller moves at fast tempos keep the motors comfortable
    const n = Math.ceil(length * SAMPLE_HZ), times = [], head = [], dip = [];
    for (let i = 0; i <= n; i++) {
        const t = i * length / n, c = Math.cos(Math.PI * t / beat);
        times.push(t); head.push(-SWAY_DEG * scale * c); dip.push(DIP_DEG * scale * Math.pow(Math.abs(c), 3));
    }
    const channel = (dofName, values) => ({ dofName: dofName, length: length, times: times, values: values });
    return {
        beats: cycles * 2, length: length,
        data: { header: { fileType: 'Animation', version: '0.5.0' }, content: { name: 'metronome-sway',
            events: [{ time: 0, eventName: 'metronome-loop', payload: {} }],
            channels: [channel('topSection_r', head), channel('middleSection_r', dip.map(v => -v)), channel('bottomSection_r', dip)] } }
    };
}

module.exports = { MIN_BPM, MAX_BPM, DEFAULT_BPM, clamp, step, digits, load, beatsBetween, sway };
