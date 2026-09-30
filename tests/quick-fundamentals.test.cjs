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
  assert.match(summary, /未取得/);
  assert.match(summary, /AIによる分析ではありません/);
});

test('positive, negative and unavailable comparisons have distinct semantic colors', () => {
  const start = html.indexOf('function quickFundTrendClass(value){');
  const end = html.indexOf('\nfunction quickFundMetric(', start);
  assert.ok(start > 0 && end > start);
  const classify = Function(html.slice(start, end) + '\nreturn quickFundTrendClass')();
  assert.equal(classify('予想比 +22.2%'), 'quickFundGood');
  assert.equal(classify('前年比 黒字転換'), 'quickFundGood');
  assert.equal(classify('予想比 -50.0%'), 'quickFundBad');
  assert.equal(classify('前年比 赤字継続'), 'quickFundBad');
  assert.equal(classify('予想比 一致'), 'quickFundUnknown');
  assert.match(html, /\.quickFundCompare\.quickFundGood\{background:/);
  assert.match(html, /\.quickFundCompare\.quickFundBad\{background:/);
});
