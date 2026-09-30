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
