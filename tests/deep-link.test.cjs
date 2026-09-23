const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('mychart.html', 'utf8');
const start = html.indexOf('const linkedTicker=new URLSearchParams(location.search)');
const end = html.indexOf('\nrender();', start);
assert.ok(start > 0 && end > start);
const snippet = html.slice(start, end);

function target(search) {
  const context = { URLSearchParams, location: {search}, current: {ticker: 'AAPL'} };
  vm.runInNewContext(snippet, context);
  return context.current.ticker;
}

test('a screener link selects only the requested ticker', () => {
  assert.equal(target('?ticker=nvda'), 'NVDA');
  assert.equal(target('?ticker=BRK.B'), 'BRK.B');
  assert.equal(target('?ticker=BAD%2CNVDA'), 'AAPL');
  assert.equal(target('?ticker=%3Cscript%3E'), 'AAPL');
  assert.equal(target(''), 'AAPL');
});
