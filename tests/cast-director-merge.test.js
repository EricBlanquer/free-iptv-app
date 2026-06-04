/**
 * Feature/regression test (2026-06-05): when the director also plays a role,
 * the two cast cards are merged into one labelled "Director & <character>"
 * instead of showing the same person twice.
 */

const fs = require('fs');
const path = require('path');

window.log = jest.fn();
global.cssUrl = function(u) { return 'url(' + u + ')'; };
global.I18n = { t: function(k, d) { return d; } };

const detailsCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'details.js'), 'utf8');
function slice(name) {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = detailsCode.match(re);
    if (!m) throw new Error('Could not extract ' + name);
    return m[0];
}
function IPTVApp() {}
// eslint-disable-next-line no-eval
eval(slice('createCastCard'));
// eslint-disable-next-line no-eval
eval(slice('renderCast'));

function buildApp() {
    document.body.innerHTML =
        '<div id="details-cast-section"><div id="details-cast-grid"></div></div>';
    const app = new IPTVApp();
    app.setHidden = function(el, hidden) { el.hidden = hidden; };
    app.invalidateFocusables = function() {};
    return app;
}

function cards() {
    return Array.from(document.querySelectorAll('#details-cast-grid .cast-card'));
}

describe('renderCast: merge director + actor when it is the same person', () => {
    it('merges into one "Réalisateur & <character>" card (match by id)', () => {
        const app = buildApp();
        const director = { id: 1, name: 'Philippe Lacheau' };
        const cast = [
            { id: 1, name: 'Philippe Lacheau', character: 'David Ticoule' },
            { id: 2, name: 'Élodie Fontan', character: 'Tess' }
        ];
        app.renderCast(cast, director, 'Réalisateur');
        const c = cards();
        expect(c.length).toBe(2);
        expect(c[0].querySelector('.cast-character').textContent).toBe('Réalisateur & David Ticoule');
        expect(c[1].querySelector('.cast-character').textContent).toBe('Tess');
    });

    it('matches by name when ids are missing', () => {
        const app = buildApp();
        const director = { name: 'Philippe Lacheau' };
        const cast = [{ name: 'PHILIPPE LACHEAU', character: 'David Ticoule' }];
        app.renderCast(cast, director, 'Réalisateur');
        const c = cards();
        expect(c.length).toBe(1);
        expect(c[0].querySelector('.cast-character').textContent).toBe('Réalisateur & David Ticoule');
    });

    it('keeps separate cards when the director is not in the cast', () => {
        const app = buildApp();
        const director = { id: 99, name: 'Other Director' };
        const cast = [
            { id: 1, name: 'Philippe Lacheau', character: 'David Ticoule' },
            { id: 2, name: 'Élodie Fontan', character: 'Tess' }
        ];
        app.renderCast(cast, director, 'Réalisateur');
        const c = cards();
        expect(c.length).toBe(3);
        expect(c[0].querySelector('.cast-character').textContent).toBe('Réalisateur');
    });
});
