'use strict';

const jibo = require('jibo'), BeSkill = require('@be/be-framework').BeSkill;
const lifecycle = require('./touch-lifecycle'), UI = require('./ui'), Clicks = require('./clicks'), Mover = require('./motion');
const tempo = require('./tempo');

const STORE_KEY = 'be.metronome.settings';
const RESTART_DELAY = 600; // ms after the last tempo tap before a running metronome picks up the new tempo
const START_TIMEOUT = 2500; // ms to wait for the dance to begin before clicking without it
const EVENT_LAG = 0.015;    // s: the expression service's events arrive about this late

class MetronomeSkill extends BeSkill {
    constructor() { super(...arguments); this.generation = 0; this.view = null; this.closing = null; }
    open() {
        // Reopen whenever the old view is gone; exit rather than sit with no UI if it still cannot close.
        if (this.view) { this.close(() => { if (!this.view) this.open(); else this.exit({ noElementsOfSurprise: true }); }); return; }
        const generation = ++this.generation, views = jibo.face.views;
        let saved = null; try { saved = global.localStorage.getItem(STORE_KEY); } catch (_) {}
        this.state = Object.assign(tempo.load(saved), { running: false });
        this.closing = null; this.leaving = false; this.restartTimer = null; this.startTimer = null;
        this.clicks = new Clicks(global.AudioContext || global.webkitAudioContext);
        this.mover = new Mover(jibo.expression);
        this.ui = new UI({
            step: (column, up) => {
                this.state.bpm = tempo.step(this.state.bpm, column, up); this.save(); this.render();
                if (this.state.running) { clearTimeout(this.restartTimer); this.restartTimer = setTimeout(() => this.restart(), RESTART_DELAY); }
            },
            toggleRunning: () => { if (this.state.running) this.stop(); else this.start(); },
            toggleMoving: () => {
                this.state.moving = !this.state.moving; this.save();
                if (this.state.running) this.restart(); else this.render(); // restarting re-syncs the clicks to the dance
            }
        });
        const view = this.view = lifecycle.prepareView(views.createView('View', this.ui.config(views)));
        view.addAction(views.ActionData.CALLBACK, { callback: () => this.leave() }, true, false, views.GESTURE.SWIPE_DOWN);
        const current = () => generation === this.generation && !this.leaving && !!this.view;
        views.changeView({ addView: view, transitionOpen: views.TRANSITION.IN, transitionClose: views.TRANSITION.OUT },
            () => { if (current()) this.interval = setInterval(() => this.render(), 40); },
            () => { if (current()) this.leave(); },
            () => { if (current()) { this.ui.decorate(view, global.PIXI); this.render(); } });
    }
    // The clicks follow the dance when he is dancing: they start on its first beat and are
    // nudged back into line each time the dance loop repeats.
    start() {
        const state = this.state, clicks = this.clicks, bpm = state.bpm, run = this.run = (this.run || 0) + 1;
        state.running = true; this.render();
        try { clicks.ensureContext(); } catch (_) { state.running = false; this.render(); return; }
        if (!state.moving) { clicks.start(bpm, clicks.now() + 0.05); return; }
        const begin = () => { clearTimeout(this.startTimer); if (run === this.run && state.running && !clicks.running) clicks.start(bpm, clicks.now() - EVENT_LAG); };
        this.startTimer = setTimeout(begin, START_TIMEOUT);
        this.mover.start(bpm, begin, () => clicks.nudge(clicks.now() - EVENT_LAG))
            .catch(() => { if (run === this.run) { this.mover.stop(); begin(); } }); // no dance: keep time anyway
    }
    stop() {
        clearTimeout(this.restartTimer); clearTimeout(this.startTimer);
        this.run = (this.run || 0) + 1; this.state.running = false; this.clicks.stop(); this.mover.stop(); this.render();
    }
    restart() { this.stop(); this.start(); }
    save() { try { global.localStorage.setItem(STORE_KEY, JSON.stringify({ bpm: this.state.bpm, moving: this.state.moving })); } catch (_) {} }
    render() { if (this.ui) this.ui.render(this.state, this.clicks.sinceBeat()); }
    leave() { if (this.leaving) return; this.leaving = true; this.exit({ noElementsOfSurprise: true }); }
    close(done) {
        done = done || (() => {});
        if (this.closing && this.closing.finished && this.closing.error) this.closing = null; // retry a failed close, don't replay it
        if (this.closing) {
            if (this.closing.finished) done(this.closing.error); else this.closing.callbacks.push(done);
            return;
        }
        const closing = this.closing = { finished: false, error: null, callbacks: [done] };
        ++this.generation; this.leaving = true; clearInterval(this.interval); this.interval = null;
        if (this.state) { try { this.stop(); } catch (_) {} }
        if (this.clicks) { try { this.clicks.close(); } catch (_) {} }
        lifecycle.closeView(jibo.face.views, jibo.face.tween, this.view, require('timers'), 'metronome', error => {
            closing.finished = true; closing.error = error || null;
            if (!error) { this.view = null; this.ui = null; }
            closing.callbacks.splice(0).forEach(callback => callback(closing.error));
        });
    }
    destroy(done) { this.close(error => super.destroy(baseError => done(error || baseError))); }
}

module.exports = MetronomeSkill;
