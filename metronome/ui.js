'use strict';

const path = require('path');
const tempo = require('./tempo');

// Native Jibo face: black background, Proxima Nova labels, stock ActionButtons and Clock's
// chevrons (with Clock's hit areas and down-arrow rotation) above and below each tempo digit.
const GRAY = [0x58586D, 0x282735], CYAN = [0x25F2FB, 0x107799];
const res = name => path.join(__dirname, 'resources', name);
const STOCK = name => 'core://resources/actionIcons/' + name + '.png';
const DIGIT_X = [330, 470, 610], UP_Y = 190, DOWN_Y = 590, DIGIT_Y = 390;
const DOT = { x: 790, y: 300, r: 22 };

class UI {
    constructor(actions) { this.actions = actions; }
    config(views) {
        const components = [];
        const callback = fn => ({ type: views.ActionData.CALLBACK, data: { callback: fn } });
        const label = (id, x, y, size, font, anchor) => components.push({ type: 'Label', id: id, text: '',
            position: { x: x, y: y }, targetAnchor: anchor || { x: 0.5, y: 0.5 },
            style: { fontFamily: font, fontSize: size, fill: '#FFFFFF', fontWeight: size >= 100 ? 'bold' : 'normal' } });
        const button = (id, iconSrc, colors, x, y, fn) => components.push({ type: 'ActionButton', id: id, iconSrc: iconSrc,
            colors: colors, position: { x: x, y: y }, transform: { scaleX: 0.5, scaleY: 0.5 }, action: callback(fn) });

        DIGIT_X.forEach((x, column) => {
            label('digit' + column, x, DIGIT_Y, 220, 'Proxima Nova Soft');
            components.push({ id: 'up' + column, type: 'Button', assets: [{ id: 'chevron_up', src: res('chevron.png'), type: 'texture' }],
                position: { x: x - 24, y: UP_Y }, action: callback(() => this.actions.step(column, true)) });
            components.push({ id: 'down' + column, type: 'Button', assets: [{ id: 'chevron_down', src: res('chevron.png'), type: 'texture' }],
                position: { x: x + 24, y: DOWN_Y }, action: callback(() => this.actions.step(column, false)) });
        });
        label('bpm', 735, 455, 60, 'Proxima Nova Light', { x: 0, y: 0.5 });
        button('start', STOCK('play'), CYAN, 1014, 120, () => this.actions.toggleRunning());
        button('stop', STOCK('stop'), CYAN, 1014, 120, () => this.actions.toggleRunning());
        label('runCaption', 1080, 300, 40, 'Proxima Nova Light');
        button('still', res('dance.png'), GRAY, 1014, 400, () => this.actions.toggleMoving());
        button('moving', res('dance.png'), CYAN, 1014, 400, () => this.actions.toggleMoving());
        label('moveCaption', 1080, 580, 40, 'Proxima Nova Light');

        return { viewConfig: { type: 'View', id: 'metronome', category: 'gui', ignoreSwipeDown: true, transitionStageOnly: true },
            componentConfigs: components };
    }
    decorate(view, PIXI) {
        this.view = view;
        const background = new PIXI.Graphics(); background.beginFill(0x000000); background.drawRect(0, 0, 1280, 720); background.endFill();
        view.stage.addChildAt(background, 0);
        DIGIT_X.forEach((_, column) => {
            view.getComponentById('up' + column).setupHitArea(new PIXI.Rectangle(-50, -37, 150, 150));
            const down = view.getComponentById('down' + column);
            down.setupHitArea(new PIXI.Rectangle(-50, -37, 150, 150)); down.display.rotation = Math.PI;
        });
        // Beat light: flashes cyan on every click.
        const dot = this.dot = new PIXI.Graphics(); dot.beginFill(0x25F2FB); dot.drawCircle(DOT.x, DOT.y, DOT.r); dot.endFill();
        const ring = new PIXI.Graphics(); ring.lineStyle(4, 0x58586D); ring.drawCircle(DOT.x, DOT.y, DOT.r); view.stage.addChild(ring);
        view.stage.addChild(dot); dot.alpha = 0;
    }
    text(id, value) { const c = this.view.getComponentById(id); if (c && c.text !== value) c.text = value; }
    show(id, visible) { const c = this.view.getComponentById(id); c.display.visible = visible; if (c.lockInput) c.lockInput(!visible); }
    // sinceBeat: seconds since the last click (null when stopped).
    render(state, sinceBeat) {
        if (!this.view) return;
        tempo.digits(state.bpm).forEach((d, i) => this.text('digit' + i, d));
        this.text('bpm', 'BPM');
        this.show('start', !state.running); this.show('stop', state.running);
        this.text('runCaption', state.running ? 'Stop' : 'Start');
        this.show('still', !state.moving); this.show('moving', state.moving);
        this.text('moveCaption', state.moving ? 'Dancing' : 'Still');
        this.dot.alpha = sinceBeat === null ? 0 : sinceBeat < 0.12 ? 1 : Math.max(0, 1 - (sinceBeat - 0.12) / 0.15); // the face redraws ~10x a second, so hold the flash
    }
}

UI.DIGIT_X = DIGIT_X;
module.exports = UI;
