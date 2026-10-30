'use strict';
// node tests/close-retry.test.js  (Node 6 compatible)
// A failed native close must not stick: the next launch retries the close and opens,
// and if the old view still cannot close the skill exits instead of sitting with no UI.
const assert = require('assert'), Module = require('module');

const log = [];
let closeFailures = 0;
const component = () => ({ text: '', display: { visible: true, rotation: 0, alpha: 1 }, lockInput() {}, setupHitArea() {},
    movieClip: { hourCounter: {}, minuteTensCounter: {}, minuteOnesCounter: {}, button: { value: {} }, blueBar: {}, on() {}, once() {}, off() {} } });
const views = { currentView: null, viewStackLength: 1, _viewProcess: { active: false, processQueue: [] },
    STATE: { OPENED: 'opened', CLOSED: 'closed', DESTROYED: 'destroyed' }, ComponentGroup: { prototype: { destroy() {} } },
    ActionData: { CALLBACK: 'cb' }, GESTURE: { SWIPE_DOWN: 'sd' }, TRANSITION: { IN: 'in', OUT: 'out' },
    events: { process: { on() {}, off() {} } },
    createView() {
        const c = {};
        return { state: 'opened', addAction() {}, getComponentById(id) { return c[id] || (c[id] = component()); }, stage: { addChildAt() {}, addChild() {} } };
    },
    changeView(cfg, ready, fail, before) {
        if (cfg.addView) { log.push('open'); views.currentView = cfg.addView; if (before) before(); if (ready) ready(); return; }
        log.push('remove');
        if (closeFailures > 0) { closeFailures--; fail(); return; } // native close failure
        views.currentView.state = 'destroyed'; views.currentView = null; ready();
    } };
const jibo = { face: { views, tween: { stop() {} } }, tts: { speak() { return Promise.resolve(); }, stop() {} },
    volume: { MIN_VOLUME: 1, MAX_VOLUME: 10, currentVolume: 5, changeVolume() {} }, expression: {} };
class BeSkill { exit() { log.push('exit'); } destroy(done) { done(); } }
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
global.AudioContext = function () {};
const graphics = function () {
    const g = {};
    ['beginFill', 'drawRect', 'endFill', 'clear', 'lineStyle', 'drawCircle', 'drawEllipse', 'moveTo', 'lineTo', 'arc', 'drawRoundedRect', 'drawPolygon']
        .forEach(name => { g[name] = () => g; });
    return g;
};
global.PIXI = { Graphics: graphics, Rectangle: function () {}, Text: function () { this.visible = true; } };
const load = Module._load;
Module._load = function (request) {
    if (request === 'jibo') return jibo;
    if (request === '@be/be-framework') return { BeSkill };
    return load.apply(this, arguments);
};
const Skill = require('../index.js');

// One failed close, then the user relaunches: the close is retried and the skill opens.
let skill = new Skill();
skill.open();
let closeError;
closeFailures = 1; skill.close(error => { closeError = error; });
assert.ok(closeError && /view_close_failed$/.test(closeError.code), 'first close reports the native failure');
assert.ok(skill.view, 'the view is kept while it is still on screen');
log.length = 0;
skill.open();
assert.deepStrictEqual(log, ['remove', 'open'], 'relaunch retries the close and opens again');
assert.ok(skill.view && views.currentView === skill.view);
clearInterval(skill.interval);

// The old view still cannot close: exit instead of staying open with no UI.
skill = new Skill();
skill.open();
closeFailures = 2; skill.close();
log.length = 0;
skill.open();
assert.deepStrictEqual(log, ['remove', 'exit'], 'a stale view that cannot close exits the skill');
clearInterval(skill.interval);

console.log('close-retry ok');
