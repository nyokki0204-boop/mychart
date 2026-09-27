const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'mychart.html'), 'utf8');
const start = html.indexOf('const SECTOR_NAMES=');
const end = html.indexOf('/* =========================================================\n   ② 実データ取得', start);
assert.ok(start > 0 && end > start);
const context = vm.createContext({});
vm.runInContext(html.slice(start, end) + '\nglobalThis.api={sectorDecision,validateSectorFeed};', context);
const {sectorDecision, validateSectorFeed} = context.api;

test('official holdings take priority; Russell classifications are marked estimated', () => {
  const feed = {holdings: {AAPL: 'XLK', AMZN: 'XLY'}};
  const russell = {AAPL: 'Consumer Cyclical', ABC: 'Healthcare', ZZ: 'その他'};
  assert.equal(sectorDecision('AAPL', feed, russell, {}).sector, 'XLK');
  assert.equal(sectorDecision('AAPL', feed, russell, {}).source, '確認済み');
  assert.equal(sectorDecision('AMZN', feed, russell, {}).sector, 'XLY');
  assert.equal(sectorDecision('ABC', feed, russell, {}).source, '推定');
  assert.equal(sectorDecision('ABC', feed, russell, {}).sector, 'XLV');
  assert.equal(sectorDecision('ZZ', feed, russell, {}).source, '不明');
  assert.equal(sectorDecision('BRK.B', {holdings:{'BRK-B':'XLF'}}, {}, {}).sector, 'XLF');
});

test('manual correction never masquerades as verified; expressions remain out of scope', () => {
  const decision = sectorDecision('AAPL', {holdings:{AAPL:'XLK'}}, {}, {AAPL:'XLY'});
  assert.equal(decision.sector, 'XLY');
  assert.equal(decision.source, '手動指定');
  assert.equal(sectorDecision('SOXX/QQQ', null, {}, {}).source, '式・対象外');
  assert.equal(sectorDecision('XLK', null, {}, {}).source, 'セクターETF');
});

test('feed requires the whole verified universe and all 11 scores', () => {
  const names = ['XLK','XLV','XLF','XLY','XLC','XLI','XLP','XLE','XLU','XLRE','XLB'];
  const feed = {
    version:1, benchmark:'QQQ', price_date:'2026-09-18', holdings_date:'2026-09-18',
    holdings:Object.fromEntries(Array.from({length:450},(_,i)=>['T'+i,'XLK'])),
    sectors:Object.fromEntries(names.map((ticker,i)=>[ticker,{score:1.01,change_pt:0.3,rank:i+1}]))
  };
  assert.equal(validateSectorFeed(feed), true);
  delete feed.sectors.XLK;
  assert.equal(validateSectorFeed(feed), false);
});
