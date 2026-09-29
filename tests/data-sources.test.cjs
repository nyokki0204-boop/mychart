const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','mychart.html'),'utf8');
function section(a,b){
  const start=html.indexOf(a), end=html.indexOf(b,start);
  assert.ok(start>=0&&end>start); return html.slice(start,end);
}

test('previously saved Alpaca credentials are removed and never used for prices',async()=>{
  const saved=new Map([['alpaca-id','old-id'],['alpaca-secret','old-secret'],['td-key','twelve-key']]);
  const localStorage={removeItem:k=>saved.delete(k)};
  vm.runInNewContext(section('const store = {','/* 画面に文字を出す時'),{
    localStorage,document:{},JSON
  });
  assert.equal(saved.has('alpaca-id'),false);
  assert.equal(saved.has('alpaca-secret'),false);
  assert.equal(saved.get('td-key'),'twelve-key');
  assert.doesNotMatch(html,/data\.alpaca\.markets|APCA-API-SECRET-KEY|function editAlpacaKey/);
  const calls=[];
  const ctx=vm.createContext({
    fetchTwelve:async(symbol,step)=>{ calls.push([symbol,step]); return {candles:[],volumes:[]}; },
    Date,Map
  });
  vm.runInContext(section('function priceProvider(){','/* =========================================================\n   ③ サンプルデータ'),ctx);
  assert.equal(ctx.priceProvider(),'twelve');
  await ctx.fetchReal('PD','1d');
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0],['PD','1d']);
});

test('Finnhub snapshot is retained when estimates change after reporting',async()=>{
  const os=require('node:os'), {spawnSync}=require('node:child_process');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'earnings-test-'));
  fs.mkdirSync(path.join(dir,'scripts'));fs.mkdirSync(path.join(dir,'data'));
  fs.copyFileSync(path.join(__dirname,'..','scripts','update-earnings.mjs'),path.join(dir,'scripts','update-earnings.mjs'));
  const day=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  fs.writeFileSync(path.join(dir,'data','earnings.json'),'{"version":1,"updatedAt":null,"events":{}}');
  const mock=`globalThis.fetch=async()=>({ok:true,json:async()=>({earningsCalendar:[{
    symbol:'PD',date:'${day}',epsEstimate:0.2,revenueEstimate:100000000,epsActual:null,revenueActual:null
  }]})});\n`;
  const script=path.join(dir,'scripts','update-earnings.mjs');
  fs.writeFileSync(script,mock+fs.readFileSync(script,'utf8'));
  const run=()=>spawnSync(process.execPath,[script],{env:{...process.env,FINNHUB_API_KEY:'test'},encoding:'utf8'});
  assert.equal(run().status,0);
  const first=JSON.parse(fs.readFileSync(path.join(dir,'data','earnings.json'))).events['PD@'+day];
  assert.equal(first.forecast.eps,0.2);
  let changed=fs.readFileSync(script,'utf8').replace('epsEstimate:0.2','epsEstimate:0.3').replace('epsActual:null','epsActual:0.4');
  fs.writeFileSync(script,changed);
  assert.equal(run().status,0);
  const second=JSON.parse(fs.readFileSync(path.join(dir,'data','earnings.json'))).events['PD@'+day];
  assert.equal(second.forecast.eps,0.2);
  assert.equal(second.eps,0.4);
  fs.rmSync(dir,{recursive:true,force:true});
});
