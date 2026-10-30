'use strict';
const tempo = require('./tempo');

// Metronome clicks on the Web Audio clock: a timer looks a little ahead and schedules
// each click at its exact time, so clicks stay steady even when the page is busy.
const LOOKAHEAD = 0.15, INTERVAL_MS = 25;

class Clicks {
    constructor(AudioContext, timers) {
        this.AudioContext = AudioContext; this.timers = timers || global;
        this.ctx = null; this.timer = null; this.period = 0; this.origin = 0; this.next = 0; this.lastBeat = null;
    }
    now() { return this.ctx ? this.ctx.currentTime : 0; }
    // Beat 0 lands at audio time `origin` (or right away if that has just passed).
    start(bpm, origin) {
        this.stop(); this.ensureContext();
        this.period = 60 / bpm; this.origin = origin; this.next = this.now() - 0.03;
        this.timer = this.timers.setInterval(() => this.schedule(), INTERVAL_MS);
        this.schedule();
    }
    ensureContext() { return this.ctx = this.ctx || new this.AudioContext(); }
    schedule() {
        const now = this.now(), until = now + LOOKAHEAD;
        tempo.beatsBetween(this.origin, this.period, this.next, until)
            .filter(t => this.lastBeat === null || t > this.lastBeat + this.period / 2) // a nudge must never double a click
            .forEach(t => this.click(Math.max(t, now)));
        this.next = until;
    }
    // Move the beat grid toward a measured beat time (half the error at a time, at most a third of a beat).
    nudge(measured) {
        if (!this.timer) return;
        const k = Math.round((measured - this.origin) / this.period);
        const error = measured - (this.origin + k * this.period), limit = this.period / 3;
        this.origin += Math.max(-limit, Math.min(limit, error)) / 2;
    }
    click(when) {
        const ctx = this.ctx, osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.frequency.value = 1760; // short woodblock-like tick
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(0.9, when + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(when); osc.stop(when + 0.06);
        this.lastBeat = when;
    }
    // Seconds since the most recent click that has sounded, or null.
    sinceBeat() {
        const now = this.now();
        if (this.lastBeat === null || !this.timer) return null;
        const last = this.lastBeat <= now ? this.lastBeat : this.lastBeat - this.period;
        return now - last;
    }
    stop() { if (this.timer) { this.timers.clearInterval(this.timer); this.timer = null; } this.lastBeat = null; }
    get running() { return !!this.timer; }
    close() {
        this.stop();
        const ctx = this.ctx; this.ctx = null;
        if (ctx && ctx.close) { try { ctx.close(); } catch (_) {} }
    }
}

module.exports = Clicks;
