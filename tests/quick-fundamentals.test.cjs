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
