/**
 * Regression test: actor age must account for the death date.
 *
 * The actor screen meta line used to compute the age as
 * `currentYear - birthYear`, which showed absurd values for deceased people
 * (e.g. "136 years old" for someone born in 1889 and dead in 1945).
 *
 * `_formatPersonAge` now:
 *  - stops the count at `deathday` and renders "birth-death (age)"
 *  - computes the exact age (month/day aware), not a plain year difference
 *  - returns '' when the birthday is missing or the dates are inconsistent
 */

const fs = require('fs');

function slice(src, name) {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract ' + name);
    return m[0].replace('IPTVApp.prototype.', 'TestApp.prototype.');
}

const detailsSrc = fs.readFileSync('./js/details.js', 'utf8');

global.I18n = {
    getLocale: () => 'en',
    t: (key, fallback, params) => {
        let out = key === 'details.lifespan'
            ? '{birth}-{death} ({count} years)'
            : '{count} years old';
        if (params) {
            Object.keys(params).forEach((p) => {
                out = out.split('{' + p + '}').join(params[p]);
            });
        }
        return out;
    }
};

function TestApp() {}
eval(slice(detailsSrc, '_parseIsoDate'));
eval(slice(detailsSrc, '_formatPersonAge'));

const app = new TestApp();
const TODAY = new Date(2026, 6, 20);

test('deceased person shows lifespan and age at death, not current age', () => {
    const out = app._formatPersonAge({ birthday: '1889-04-20', deathday: '1945-04-30' }, TODAY);
    expect(out).toBe('1889-1945 (56 years)');
});

test('living person shows the current age', () => {
    const out = app._formatPersonAge({ birthday: '1974-11-11' }, TODAY);
    expect(out).toBe('51 years old');
});

test('birthday not reached yet this year subtracts one year', () => {
    const out = app._formatPersonAge({ birthday: '1974-07-21' }, TODAY);
    expect(out).toBe('51 years old');
});

test('birthday reached today counts the full year', () => {
    const out = app._formatPersonAge({ birthday: '1974-07-20' }, TODAY);
    expect(out).toBe('52 years old');
});

test('death before the birthday of that year subtracts one year', () => {
    const out = app._formatPersonAge({ birthday: '1930-08-25', deathday: '2019-03-04' }, TODAY);
    expect(out).toBe('1930-2019 (88 years)');
});

test('empty deathday is treated as still alive', () => {
    const out = app._formatPersonAge({ birthday: '1974-11-11', deathday: '' }, TODAY);
    expect(out).toBe('51 years old');
});

test('missing birthday yields no age', () => {
    expect(app._formatPersonAge({ deathday: '1945-04-30' }, TODAY)).toBe('');
    expect(app._formatPersonAge({}, TODAY)).toBe('');
    expect(app._formatPersonAge(null, TODAY)).toBe('');
});

test('malformed or inconsistent dates yield no age', () => {
    expect(app._formatPersonAge({ birthday: 'unknown' }, TODAY)).toBe('');
    expect(app._formatPersonAge({ birthday: '1990-01-01', deathday: '1980-01-01' }, TODAY)).toBe('');
});
