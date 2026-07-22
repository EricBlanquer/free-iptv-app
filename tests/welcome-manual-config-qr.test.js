/**
 * Regression test: choosing "configure manually" from the welcome dialog must
 * lead to the settings screen, where the remote-configuration QR code is shown.
 *
 * Commit b4b760b changed the welcome dialog's noAction from showSettings() to
 * showPlaylistEdit(), which dropped the user straight onto the raw add-playlist
 * form and hid the QR code used to configure the app remotely from a phone.
 * The manual-config path must reach showSettings() (whose first section holds
 * the QR), not showPlaylistEdit().
 */

const fs = require('fs');

function extractMethodBody(src, name) {
    const start = src.search(new RegExp(name + '\\s*\\([^)]*\\)\\s*\\{'));
    if (start === -1) throw new Error('Method not found: ' + name);
    const open = src.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(open + 1, i);
        }
    }
    throw new Error('Unbalanced braces for ' + name);
}

const appSrc = fs.readFileSync('./js/app.js', 'utf8');
const I18n = { t: function(key, fallback) { return fallback; } };

function runWelcomeDemo() {
    const body = extractMethodBody(appSrc, 'showWelcomeDemo');
    const fn = new Function('I18n', 'return function() {' + body + '};')(I18n);
    const ctx = {
        calls: [],
        capturedOptions: null,
        showConfirmModal: function(message, yesAction, options) { this.capturedOptions = options; },
        showSettings: function() { this.calls.push('showSettings'); },
        showPlaylistEdit: function() { this.calls.push('showPlaylistEdit'); },
        addDemoPlaylist: function() { this.calls.push('addDemoPlaylist'); }
    };
    fn.call(ctx);
    return ctx;
}

describe('Welcome dialog manual configuration path', () => {
    test('offers a "configure manually" option', () => {
        const ctx = runWelcomeDemo();
        expect(ctx.capturedOptions).toBeTruthy();
        expect(typeof ctx.capturedOptions.noAction).toBe('function');
    });

    test('manual configuration opens settings (with the remote QR), not the raw add form', () => {
        const ctx = runWelcomeDemo();
        ctx.capturedOptions.noAction();
        expect(ctx.calls).toContain('showSettings');
        expect(ctx.calls).not.toContain('showPlaylistEdit');
    });
});
