const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','mychart.html'),'utf8');
function section(from,to){
  const a=html.indexOf(from), b=html.indexOf(to,a);
  assert.ok(a>=0 && b>a);
  return html.slice(a,b);
}
function context(){
  const ctx=vm.createContext({FUND_HISTORY_TTL:90*86400000});
  vm.runInContext(section('function csvRows(text){','function watchAutoTicker'),ctx);
  vm.runInContext(section('function validEarningsDate(s){','function draw(d){'),ctx);
  vm.runInContext(section('function toEpoch(t){','// 時刻(秒) → 「何本目か」'),ctx);
  return ctx;
}

test('calendar accepts only matching ticker and real dates, including quoted CSV fields',()=>{
  const ctx=context();
  const csv='symbol,name,reportDate,fiscalDateEnding,estimate,currency\n'
    +'IBM,"International, Business Machines",2026-10-21,2026-09-30,2.0,USD\n'
    +'MSFT,Microsoft,2026-10-22,2026-09-30,3.0,USD\n'
    +'IBM,IBM,2026-02-30,2025-12-31,1.0,USD\n';
  assert.deepEqual(Array.from(ctx.parseEarningsCalendar(csv,'IBM')),['2026-10-21']);
  assert.throws(()=>ctx.parseEarningsCalendar('{"Information":"rate limit"}','IBM'));
});

test('reported dates map to their own candle and containing weekly candle',()=>{
  const ctx=context();
  assert.deepEqual(Array.from(ctx.parseEarningsHistory({quarterlyEarnings:[
    {reportedDate:'2026-09-23'},{reportedDate:'2026-09-23'},
    {reportedDate:'2026-13-01'}]})),['2026-09-23']);
  ctx.epochs=['2026-09-22','2026-09-23','2026-09-24'].map(ctx.toEpoch);
  ctx.current={step:'1d'};
  assert.equal(ctx.earningsBarIndex('2026-09-23'),1);
  ctx.epochs=['2026-09-21','2026-09-28'].map(ctx.toEpoch);
  ctx.current={step:'1w'};
  assert.equal(ctx.earningsBarIndex('2026-09-23'),0);
  assert.equal(ctx.earningsBarIndex('2026-10-21'),-1);
});

test('quarterly EPS and revenue use matching fiscal periods and valid numbers',()=>{
  const ctx=context();
  const records=Array.from(ctx.parseEarningsRecords({quarterlyEarnings:[
    {reportedDate:'2026-08-20',fiscalDateEnding:'2026-07-31',reportedEPS:'1.20',estimatedEPS:'1.00'},
    {reportedDate:'2026-05-20',fiscalDateEnding:'2026-04-30',reportedEPS:'None',estimatedEPS:'0.80'}
  ]}));
  assert.equal(records[0].eps,1.2);
  assert.equal(records[1].eps,null);
  const revenue=Array.from(ctx.parseRevenueReports({quarterlyReports:[
    {fiscalDateEnding:'2026-07-31',totalRevenue:'16000000000',reportedCurrency:'USD'},
    {fiscalDateEnding:'2025-07-31',totalRevenue:'10000000000',reportedCurrency:'USD'}
  ]}));
  assert.equal(revenue[0].revenue,16e9);
  vm.runInContext(section('function fundNumber(n,digits=2){','function fundText(parent,tag,value,cls){'),ctx);
  assert.equal(ctx.fundYoY(revenue,0,'revenue'),'+60.0%');
  assert.equal(ctx.fundPercent(1,-1),'黒字転換');
  assert.equal(ctx.fundPercent(0,-1),'赤字解消');
});

test('stock relative performance compares matching trading dates only',()=>{
  const ctx=vm.createContext({});
  vm.runInContext(section('function stockRelativeReturns(stock,benchmark,weeks){','async function loadStockRs(ticker){'),ctx);
  const stock=[{time:'2026-06-26',close:100},{time:'2026-09-25',close:140}];
  const spy=[{time:'2026-06-26',close:100},{time:'2026-09-25',close:120}];
  const result=ctx.stockRelativeReturns(stock,spy,13);
  assert.ok(result && Math.abs(result.diff-20)<1e-9);
  assert.equal(ctx.stockRelativeReturns(stock,[{time:'2026-09-25',close:120}],13),null);
});

test('pre-announcement snapshots and guidance are included in backup keys',()=>{
  const ctx=vm.createContext({BK_KEYS:['td-key']});
  vm.runInContext(section('function isFundBackupKey(k){','// 書き出し：全設定を1つのファイルにしてダウンロード'),ctx);
  const key='mychart-fund-snapshot-NVDA-2026-07-31';
  assert.equal(ctx.isFundBackupKey(key),true);
  assert.equal(ctx.isFundBackupKey('mychart-fund-revenue-NVDA'),false);
  assert.deepEqual(Array.from(ctx.importedBackupKeys({[key]:'{}','td-key':'abc','unsafe-key':'x'})),[key,'td-key']);
});

test('a scheduled new report triggers one early refresh despite the long historical cache',()=>{
  const ctx=context();
  const event={reportDate:'2026-09-28',fiscalDateEnding:'2026-08-31'};
  const before=Date.parse('2026-09-27T00:00:00Z');
  const due=Date.parse('2026-09-30T00:00:00Z');
  const old={at:before,rows:[{period:'2026-05-31'}]};
  assert.equal(ctx.historyNeedsRefresh(old,event,due-1),false);
  assert.equal(ctx.historyNeedsRefresh(old,event,due),true);
  assert.equal(ctx.historyNeedsRefresh({...old,at:due+1},event,due+2),false);
  assert.equal(ctx.historyNeedsRefresh({...old,rows:[{period:'2026-08-31'}]},event,due),false);
});

test('unavailable revenue after a report is retried weekly, not every panel open',()=>{
  const ctx=context();
  const latest={date:'2026-09-28',period:'2026-08-31'};
  const due=Date.parse('2026-09-30T00:00:00Z');
  assert.equal(ctx.revenueNeedsRefresh({at:due-1,rows:[]},latest,due),true);
  assert.equal(ctx.revenueNeedsRefresh({at:due+1,rows:[]},latest,due+86400000),false);
  assert.equal(ctx.revenueNeedsRefresh({at:due+1,rows:[]},latest,due+8*86400000),true);
});
