const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('mychart.html', 'utf8');

test('chart has an in-place fundamentals button and no ChatGPT jump', () => {
  assert.match(html, /id="quickFundBtn"[^>]*aria-controls="quickFundPanel"/);
  assert.match(html, /id="quickFundPanel"[^>]*hidden/);
  assert.doesNotMatch(html, /id="askGptFund"|chatGptFundamentalsUrl|chatgpt\.com\/\?q=/);
});

test('summary uses matching fiscal periods and marks unavailable data', () => {
  const start = html.indexOf('function renderQuickFund(){');
  const end = html.indexOf('\nfunction fundInput(', start);
  assert.ok(start > 0 && end > start);
  const summary = html.slice(start, end);
  assert.match(summary, /rows\.slice\(0,3\)/);
  assert.match(summary, /x\.period===r\.period/);
  assert.match(summary, /snapshot\.eps\)\?snapshot\.eps:r\.estimate/);
  assert.match(summary, /rev\?\.currency==='USD'/);
  assert.match(summary, /未取得/);
  assert.match(summary, /AIによる分析ではありません/);
});

test('chart chip shows only the next earnings date, leaving volume visible', () => {
  const start = html.indexOf('function showEarnings(ticker, message){');
  const end = html.indexOf('\nfunction earningsChipSummary(', start);
  const chip = html.slice(start, end);
  assert.match(chip, /chip\.replaceChildren\(first\)/);
  assert.doesNotMatch(chip, /chip\.appendChild|earningsChipSummary\(ticker\)/);
});

test('EPS and revenue surprise is explicit and colored, including missing forecasts', () => {
  const start = html.indexOf('function quickFundSurprise(actual,estimate){');
  const end = html.indexOf('\nfunction quickFundMetric(', start);
  assert.ok(start > 0 && end > start);
  const surprise = Function(html.slice(start, end) + '\nreturn quickFundSurprise')();
  assert.deepEqual(surprise(.11,.09), {text:'予想超え +22.2%',cls:'quickFundGood'});
  assert.deepEqual(surprise(-.09,-.06), {text:'予想未達 -50.0%',cls:'quickFundBad'});
  assert.deepEqual(surprise(0,0), {text:'予想どおり',cls:'quickFundUnknown'});
  assert.deepEqual(surprise(.1,null), {text:'予想データなし',cls:'quickFundUnknown'});
  assert.match(html, /\.quickFundCompare\.quickFundGood\{background:/);
  assert.match(html, /\.quickFundCompare\.quickFundBad\{background:/);
});

test('latest quarter shows quarter-over-quarter growth and its acceleration', () => {
  const start = html.indexOf('function quickFundQuarterGrowth(actual,previous){');
  const end = html.indexOf('\nfunction quickFundMetric(', start);
  assert.ok(start > 0 && end > start);
  const {growth,trend} = Function(html.slice(start,end)+
    '\nreturn {growth:quickFundQuarterGrowth,trend:quickFundQuarterTrend}')();
  const periods=['2026-06-30','2026-03-31','2025-12-31'];
  const rows=[.11,.10,.095].map((eps,i)=>({period:periods[i],eps}));
  const latest=trend(rows,0,'eps');
  assert.equal(latest.text,'前期比 +10.0%');
  assert.ok(Math.abs(latest.rate-10)<1e-8);
  assert.equal(latest.momentum,'加速');
  assert.equal(latest.previousText,'前期比 +5.3%');
  rows[2].eps=.08;
  assert.equal(trend(rows,0,'eps').momentum,'減速');
  assert.deepEqual(growth(.11,-.09),{text:'黒字転換',rate:null});
  assert.equal(trend([{period:'2026-06-30',eps:.11},{period:'2025-12-31',eps:.1}],0,'eps'),null);
  assert.equal(trend([{period:periods[0],revenue:110,currency:'USD'},
    {period:periods[1],revenue:100,currency:'EUR'}],0,'revenue'),null);
});
