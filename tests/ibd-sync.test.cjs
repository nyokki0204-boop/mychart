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

function fixture(current = ['AAPL', 'NVDA', 'MSFT']) {
  const date = '2026-09-24';
  const history = ['date,ticker', '2026-09-22,MSFT', '2026-09-23,AAPL',
    ...current.map(t => `${date},${t}`)];
  if (!current.length) history.push(`${date},(該当なし)`);
  return {
    'results.csv': ['ticker,sector,industry', ...current.map(t => `${t},Technology,"Software, Tools"`)].join('\n'),
    'ticker_history.csv': history.join('\n'),
    'last_updated.txt': date,
    'scan_status.json': JSON.stringify({ok:true, market_date:date, expected_date:date,
      coverage:0.95, universe:100, matched:current.length})
  };
}

function setup(files) {
  const saved = new Map();
  const manual = {id:1,name:'メイン',tickers:['TSLA']};
  const russell = {id:'russell:all',source:'russell:all',name:'ラッセル候補',tickers:['AMD']};
  const nodes = Object.fromEntries(['ibdSync','ibdSyncText','russellSync','russellSyncText']
    .map(id=>[id,{textContent:'',classList:{toggle(){}}}]));
  const context = {
    lists:[manual,russell],
    store:{get(k,fallback){return saved.has(k)?saved.get(k):fallback;},
      set(k,v){saved.set(k,structuredClone(v));return true;}},
    document:{getElementById(id){return nodes[id];}},
    fetch:async url=>{
      const name=url.split('/').at(-1);
      if(!(name in files)) throw new Error('offline');
      return {ok:true,text:async()=>files[name]};
    },
    renderTabs(){},renderList(){},setFoot(){},console
  };
  vm.createContext(context);
  vm.runInContext(source+'\nglobalThis.api={syncIbd};',context);
  return {context,saved,manual,russell,nodes,files};
}

test('IBD candidates, first appearances and reentries sync without changing other lists',async()=>{
  const {context,saved,manual,russell,nodes}=setup(fixture());
  await context.api.syncIbd();
  const lists=saved.get('mychart-lists');
  assert.deepEqual(lists.find(x=>x.source==='ibd:all').tickers,['AAPL','NVDA','MSFT']);
  assert.deepEqual(lists.find(x=>x.source==='ibd:new').tickers,['NVDA']);
  assert.deepEqual(lists.find(x=>x.source==='ibd:reentry').tickers,['MSFT']);
  assert.deepEqual(lists.find(x=>x.id===1),manual);
  assert.deepEqual(lists.find(x=>x.source==='russell:all'),russell);
  assert.match(nodes.ibdSyncText.textContent,/候補3・初登場1・再登場1/);
});

test('failed scan and mismatched history preserve the last good candidates',async()=>{
  const files=fixture();
  const {context,saved,nodes}=setup(files);
  await context.api.syncIbd();
  const previous=saved.get('mychart-lists');
  files['scan_status.json']=JSON.stringify({ok:false,market_date:'2026-09-24'});
  await context.api.syncIbd();
  assert.deepEqual(saved.get('mychart-lists'),previous);
  assert.match(nodes.ibdSyncText.textContent,/前回 2026-09-24 の候補を保持/);
  Object.assign(files,fixture());
  files['ticker_history.csv']=files['ticker_history.csv'].replace('2026-09-24,MSFT','');
  await context.api.syncIbd();
  assert.deepEqual(saved.get('mychart-lists'),previous);
  assert.match(nodes.ibdSyncText.textContent,/銘柄履歴と候補が一致しません/);
});

test('a valid zero-candidate scan clears only IBD lists',async()=>{
  const files=fixture();
  const {context,saved}=setup(files);
  await context.api.syncIbd();
  Object.assign(files,fixture([]));
  await context.api.syncIbd();
  const lists=saved.get('mychart-lists');
  assert.deepEqual(lists.find(x=>x.source==='ibd:all').tickers,[]);
  assert.deepEqual(lists.find(x=>x.source==='ibd:new').tickers,[]);
  assert.deepEqual(lists.find(x=>x.source==='russell:all').tickers,['AMD']);
  assert.deepEqual(lists.find(x=>x.id===1).tickers,['TSLA']);
});
