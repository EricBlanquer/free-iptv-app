/**
 * Settings menu gating (onboarding + playlist type).
 *
 * Reported by testers:
 *  - "rien ne fonctionne dans le menu settings sans compte" -> when no account is
 *    configured, only "Manage playlists" (settings-manual-section) is shown.
 *  - "quand une playlist m3u est configurée, pas mal d'options ne servent pas
 *    non plus" -> when every playlist is a plain m3u (live channels only, no
 *    VOD/series API), provider/VOD-specific sections are hidden.
 *
 * Pins buildSettingsMenu():
 *  - not configured        -> only settings-manual-section
 *  - provider configured   -> all (non-hidden) sections
 *  - m3u-only              -> provider/VOD sections hidden, universal ones kept
 *  - mixed (m3u + provider)-> full menu (provider settings still needed)
 *  - hidden sections are always skipped
 */

const fs = require('fs');

const settingsCode = fs.readFileSync('./js/settings.js', 'utf8');
const slice = (name) => {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = settingsCode.match(re);
    if (!m) throw new Error('Could not extract ' + name);
    return m[0];
};
const sliceArray = (name) => {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*\\[[\\s\\S]*?\\];');
    const m = settingsCode.match(re);
    if (!m) throw new Error('Could not extract ' + name);
    return m[0];
};

global.I18n = { t: (key, def) => def };

function IPTVApp() {}
IPTVApp.prototype.showSettingsSection = function() {};
// Source slices below contain only our own trusted code (static, from settings.js).
// eslint-disable-next-line no-eval
eval(sliceArray('SETTINGS_MENU_ORDER'));
// eslint-disable-next-line no-eval
eval(sliceArray('M3U_HIDDEN_SECTIONS'));
// eslint-disable-next-line no-eval
eval(slice('buildSettingsMenu'));

const ALL = [
    'settings-manual-section', 'language-section', 'filters-section', 'display-section',
    'category-patterns-section', 'provider-language-section', 'subtitles-section',
    'player-settings-section', 'buffer-section', 'progress-section', 'apis-section',
    'services-section', 'freebox-section', 'data-section'
];
const M3U_HIDDEN = [
    'filters-section', 'category-patterns-section', 'provider-language-section',
    'subtitles-section', 'apis-section', 'progress-section', 'freebox-section',
    'services-section', 'buffer-section'
];

function setupDOM(sectionIds, hiddenIds) {
    hiddenIds = hiddenIds || [];
    document.body.innerHTML =
        '<div id="settings-menu"></div><div id="settings-container"></div>';
    const container = document.getElementById('settings-container');
    sectionIds.forEach((id) => {
        const sec = document.createElement('div');
        sec.id = id;
        sec.className = 'settings-section' + (hiddenIds.indexOf(id) !== -1 ? ' hidden' : '');
        const title = document.createElement('div');
        title.className = 'settings-title';
        const span = document.createElement('span');
        span.textContent = id;
        title.appendChild(span);
        sec.appendChild(title);
        container.appendChild(sec);
    });
}

function menuTargets() {
    return Array.prototype.map.call(
        document.querySelectorAll('#settings-menu .settings-menu-item'),
        (el) => el.dataset.target
    );
}

function makeApp(playlists, configured) {
    const app = new IPTVApp();
    app.settings = { playlists: playlists || [] };
    app.isIPTVConfigured = () => configured;
    return app;
}

describe('Settings menu gating', () => {
    describe('no account configured', () => {
        it('shows only Manage playlists', () => {
            setupDOM(ALL);
            makeApp([], false).buildSettingsMenu();
            expect(menuTargets()).toEqual(['settings-manual-section']);
        });

        it('keeps Manage playlists even when other sections are hidden', () => {
            setupDOM(ALL, ['language-section']);
            makeApp([], false).buildSettingsMenu();
            expect(menuTargets()).toEqual(['settings-manual-section']);
        });
    });

    describe('provider account', () => {
        it('shows all (non-hidden) sections', () => {
            setupDOM(ALL);
            makeApp([{ type: 'provider' }], true).buildSettingsMenu();
            expect(menuTargets()).toEqual(ALL);
        });

        it('still skips hidden sections', () => {
            setupDOM(ALL, ['filters-section']);
            makeApp([{ type: 'provider' }], true).buildSettingsMenu();
            expect(menuTargets()).not.toContain('filters-section');
            expect(menuTargets()).toContain('apis-section');
        });
    });

    describe('m3u-only', () => {
        it('hides provider/VOD sections, keeps universal ones', () => {
            setupDOM(ALL);
            makeApp([{ type: 'm3u' }], true).buildSettingsMenu();
            const targets = menuTargets();
            M3U_HIDDEN.forEach((id) => expect(targets).not.toContain(id));
            ['settings-manual-section', 'language-section', 'display-section',
             'player-settings-section', 'data-section']
                .forEach((id) => expect(targets).toContain(id));
        });

        it('applies when ALL playlists are m3u (incl. demo)', () => {
            setupDOM(ALL);
            makeApp([{ type: 'm3u' }, { type: 'm3u' }], true).buildSettingsMenu();
            expect(menuTargets()).not.toContain('apis-section');
        });
    });

    describe('mixed playlists (m3u + provider)', () => {
        it('shows the full menu (provider settings still needed)', () => {
            setupDOM(ALL);
            makeApp([{ type: 'm3u' }, { type: 'provider' }], true).buildSettingsMenu();
            expect(menuTargets()).toEqual(ALL);
        });
    });
});
