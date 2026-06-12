/**
 * Regression test for: rapid double "back" on the home screen with exit
 * confirmation disabled fired tizen.application.exit() twice, leaving the
 * Tizen app process in a zombie state that refused to relaunch for minutes
 * (even after a force quit).
 *
 * Root cause: the Back key (focus.js case 10009) calls goBack() with no
 * debounce, and the screen:home back handler called doExit() with no
 * re-entrance guard. The exit confirmation modal normally absorbs the second
 * press, which is why the bug only reproduced with confirmation disabled.
 *
 * Fix: doExit() is now idempotent (self._exiting guard) — exit() is called at
 * most once per session regardless of how many back presses arrive.
 */

var fs = require('fs');
var vm = require('vm');

function loadHandlers() {
    var src = fs.readFileSync('./js/core/handlers.js', 'utf8');
    var sandbox = {};
    sandbox.window = { log: function() {} };
    sandbox.IPTVApp = function() {};
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);
    return sandbox;
}

describe('home exit is idempotent', function() {
    it('fires tizen exit() only once on rapid double back (confirmation off)', function() {
        var sandbox = loadHandlers();
        var exitCalls = 0;
        sandbox.tizen = {
            application: {
                getCurrentApplication: function() {
                    return { exit: function() { exitCalls++; } };
                }
            }
        };

        var app = new sandbox.IPTVApp();
        app.settings = { exitConfirmation: false };

        var homeBack = app.backHandlers['screen:home'];
        homeBack.call(app);
        homeBack.call(app);
        homeBack.call(app);

        expect(exitCalls).toBe(1);
    });

    it('still exits once on a single back', function() {
        var sandbox = loadHandlers();
        var exitCalls = 0;
        sandbox.tizen = {
            application: {
                getCurrentApplication: function() {
                    return { exit: function() { exitCalls++; } };
                }
            }
        };

        var app = new sandbox.IPTVApp();
        app.settings = { exitConfirmation: false };
        app.backHandlers['screen:home'].call(app);

        expect(exitCalls).toBe(1);
    });
});
