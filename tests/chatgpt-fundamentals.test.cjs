const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('mychart.html', 'utf8');
const start = html.indexOf('function chatGptFundamentalsUrl(ticker){');
const end = html.indexOf('\nasync function render(){', start);
assert.ok(start > 0 && end > start);
const makeUrl = vm.runInNewContext(html.slice(start, end) + '\nchatGptFundamentalsUrl', {
  encodeURIComponent,
});

test('ChatGPT question follows the ticker and contains no saved private data', () => {
  const aapl = new URL(makeUrl('AAPL'));
  const nvda = new URL(makeUrl('NVDA'));
  assert.equal(aapl.origin, 'https://chatgpt.com');
  assert.deepEqual([...aapl.searchParams.keys()], ['q']);
  assert.match(aapl.searchParams.get('q'), /ティッカー AAPL のファンダメンタルズ/);
  assert.match(nvda.searchParams.get('q'), /ティッカー NVDA のファンダメンタルズ/);
  assert.doesNotMatch(nvda.href, /td-key|av-key|FINNHUB_API_KEY/);
});

test('the quick link opens separately without sharing a referrer', () => {
  assert.match(html, /id="askGptFund"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  assert.match(html, /askGpt\.hidden=exprMode/);
});
