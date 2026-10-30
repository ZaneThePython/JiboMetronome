'use strict';
const tempo = require('./tempo');

// Jibo's body dance, played by the expression service as one long looping animation
// (the same API the stock animations use). Attention is turned off while dancing so he
// does not look around, and the body is returned to rest afterwards, like Radio's dances.
const CACHE = 'be-metronome';

class Mover {
    constructor(expression) { this.expression = expression; this.instance = null; this.token = 0; this.active = false; this.stopping = Promise.resolve(); }
    // onStarted() when the motion begins (beat 0), onLoop() at each repeat (also a beat).
    // Resolves false if a newer start/stop replaced this one.
    start(bpm, onStarted, onLoop) {
        const e = this.expression, token = ++this.token, sway = tempo.sway(bpm);
        this.active = true;
        // Wait for any earlier stop to finish, so its cleanup cannot undo this dance.
        return this.stopping.then(() => token === this.token && e.setAttentionMode(e.AttentionMode.OFF))
            .then(() => token === this.token && e.createAnimation({ data: sway.data, src: null, cacheName: CACHE, dofs: e.dofs.BODY, loops: 0 }))
            .then(instance => {
                if (!instance) return false;
                if (token !== this.token) { instance.stop(); return false; }
                this.instance = instance;
                let first = true;
                instance.events.started.on(() => { if (token === this.token && first) { first = false; onStarted(); } });
                instance.events.general.on(p => { if (token === this.token && p && p.name === 'metronome-loop' && !first) onLoop(); });
                return instance.play().then(() => true);
            });
    }
    stop() {
        const e = this.expression, instance = this.instance;
        this.token++; this.instance = null;
        if (!this.active) return Promise.resolve();
        this.active = false;
        return this.stopping = Promise.resolve(instance && instance.stop())
            .then(() => e.cleanup({ dofs: e.dofs.BODY }))
            .then(() => e.destroyCaches(CACHE))
            .then(() => e.setAttentionMode(e.AttentionMode.ENGAGED))
            .catch(() => {});
    }
}

module.exports = Mover;
