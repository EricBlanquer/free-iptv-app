/**
 * Feature test: actor biography cleanup.
 *
 * TMDB biographies are often copy-pasted from Wikipedia and keep artefacts:
 *  - footnote markers "[3]", "[note 1]", "[citation needed]"
 *  - the legacy TMDB footer "Description above from the Wikipedia article X,
 *    licensed under CC-BY-SA, full list of contributors on Wikipedia."
 *  - stray "*" characters (already stripped before this helper existed)
 *
 * `_cleanBiography` removes them without touching the rest of the text,
 * and leaves no dangling space in front of the punctuation it uncovers.
 */

const fs = require('fs');

function slice(src, name) {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract ' + name);
    return m[0].replace('IPTVApp.prototype.', 'TestApp.prototype.');
}

const detailsSrc = fs.readFileSync('./js/details.js', 'utf8');

function TestApp() {}
eval(slice(detailsSrc, '_cleanBiography'));

const app = new TestApp();

test('numeric footnote markers are removed', () => {
    const out = app._cleanBiography('Il publie ses mémoires de 1988 à 2006[3].');
    expect(out).toBe('Il publie ses mémoires de 1988 à 2006.');
});

test('several markers in a row are removed', () => {
    const out = app._cleanBiography('Né en 1916[1][2] à Amsterdam[12].');
    expect(out).toBe('Né en 1916 à Amsterdam.');
});

test('named markers are removed', () => {
    expect(app._cleanBiography('Acteur[note 1] et producteur[citation needed].'))
        .toBe('Acteur et producteur.');
    expect(app._cleanBiography('Réalisateur[réf. nécessaire].'))
        .toBe('Réalisateur.');
});

test('a marker followed by a space leaves a single space', () => {
    const out = app._cleanBiography('Il gagne un Oscar[4] puis se retire.');
    expect(out).toBe('Il gagne un Oscar puis se retire.');
});

test('the Wikipedia attribution footer is removed', () => {
    const out = app._cleanBiography(
        'Pitt was named Sexiest Man Alive in 1995.\n\n' +
        'Description above from the Wikipedia article Brad Pitt, licensed under CC-BY-SA, ' +
        'full list of contributors on Wikipedia.'
    );
    expect(out).toBe('Pitt was named Sexiest Man Alive in 1995.');
});

test('stray asterisks are removed', () => {
    expect(app._cleanBiography('Acteur *américain*.')).toBe('Acteur américain.');
});

test('paragraph breaks are preserved', () => {
    const out = app._cleanBiography('Premier paragraphe[1].\n\nSecond paragraphe.');
    expect(out).toBe('Premier paragraphe.\n\nSecond paragraphe.');
});

test('regular brackets in the text are preserved', () => {
    const out = app._cleanBiography('Le film [Spartacus] sort en 1960.');
    expect(out).toBe('Le film [Spartacus] sort en 1960.');
});

test('empty or missing input yields an empty string', () => {
    expect(app._cleanBiography('')).toBe('');
    expect(app._cleanBiography(null)).toBe('');
    expect(app._cleanBiography(undefined)).toBe('');
});
