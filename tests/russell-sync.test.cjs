const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'mychart.html'), 'utf8');
const start = html.indexOf('const RUSSELL_BASE=');
const end = html.indexOf('/* =========================================================\n   ② 実データ取得', start);
assert.ok(start > 0 && end > start);
const source = html.slice(start, end);

function fixture(date, previous, current, older = []) {
  const all = new Set(current);
  const results = ['ticker,sector,industry,score,all_pass'];
  for (let i = 0; i < 1000; i++) {
    const ticker = current[i] || `T${i}`;
    results.push(`${ticker},Tech,"Software, Tools",${all.has(ticker) ? 5 : 0},${all.has(ticker) ? 'True' : 'False'}`);
  }
  const history = ['date,total,all_pass',
    `2026-09-05,1000,${older.length}`,
    `2026-09-12,1000,${previous.length}`,
    `${date},1000,${current.length}`];
  const passes = ['date,ticker',
    ...older.map(t => `2026-09-05,${t}`),
    ...previous.map(t => `2026-09-12,${t}`),
    ...current.map(t => `${date},${t}`)];
  return {
    'results.csv': results.join('\n'),
    'history.csv': history.join('\n'),
    'pass_history.csv': passes.join('\n'),
    'last_updated.txt': date
  };
}

function setup(files) {
  const saved = new Map();
  const manual = { id: 1, name: 'メイン', tickers: ['AAPL'] };
  const status = { classList: { toggle() {} } };
  const text = { textContent: '' };
  const context = {
    lists: [manual],
    store: {
      get(k, fallback) { return saved.has(k) ? saved.get(k) : fallback; },
      set(k, value) { saved.set(k, structuredClone(value)); return true; }
    },
    document: { getElementById(id) { return id === 'russellSyncText' ? text : status; } },
    fetch: async url => {
      const name = url.split('/').at(-1);
      if (!(name in files)) throw new Error('offline');
      return { ok: true, text: async () => files[name] };
    },
    renderTabs() {}, renderList() {}, setFoot() {},
    console
  };
  vm.createContext(context);
  vm.runInContext(source + '\nglobalThis.api={syncRussell,csvRows};', context);
  return { context, saved, manual, text, files };
}

test('current, first-time and returning candidates sync without changing a manual list', async () => {
  const files = fixture('2026-09-19', ['AAPL'], ['AAPL', 'NVDA', 'MSFT'], ['MSFT']);
  const { context, saved, manual, text } = setup(files);
  await context.api.syncRussell();
  const lists = saved.get('mychart-lists');
  assert.deepEqual(lists.find(l => l.source === 'russell:all').tickers, ['AAPL', 'NVDA', 'MSFT']);
  assert.deepEqual(lists.find(l => l.source === 'russell:new').tickers, ['NVDA']);
  assert.deepEqual(lists.find(l => l.source === 'russell:reentry').tickers, ['MSFT']);
  assert.deepEqual(lists.find(l => l.id === 1), manual);
  assert.match(text.textContent, /候補3・新規1・再登場1/);

  delete files['results.csv'];
  await context.api.syncRussell();
  assert.deepEqual(saved.get('mychart-lists'), lists);
  assert.match(text.textContent, /前回 2026-09-19 の候補を保持/);
});

test('a valid zero-candidate scan clears only synced lists', async () => {
  const files = fixture('2026-09-19', ['AAPL'], ['NVDA']);
  const { context, saved } = setup(files);
  await context.api.syncRussell();
  Object.assign(files, fixture('2026-09-19', ['AAPL'], []));
  await context.api.syncRussell();
  assert.deepEqual(saved.get('mychart-lists').find(l => l.source === 'russell:all').tickers, []);
  assert.deepEqual(saved.get('mychart-lists').find(l => l.id === 1).tickers, ['AAPL']);
});

test('mismatched scan count keeps the previous list', async () => {
  const files = fixture('2026-09-19', ['AAPL'], ['NVDA']);
  const { context, saved, text } = setup(files);
  await context.api.syncRussell();
  const before = saved.get('mychart-lists');
  files['results.csv'] = files['results.csv'].split('\n').slice(0, -1).join('\n');
  await context.api.syncRussell();
  assert.deepEqual(saved.get('mychart-lists'), before);
  assert.match(text.textContent, /スキャン件数が一致しません/);
});
