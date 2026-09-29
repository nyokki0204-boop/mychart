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

test('Alpaca daily bars use SIP, split adjustments and New York dates',async()=>{
  const calls=[];
  const ctx=vm.createContext({
    store:{get:k=>({'alpaca-id':'test','alpaca-secret':'test'}[k])},
    fetch:async(url,options)=>{
      calls.push({url:String(url),options});
      return {ok:true,json:async()=>({bars:[
        {t:'2026-09-25T04:00:00Z',o:14.82,h:15,l:14,c:14.9,v:1668852}
      ],next_page_token:null})};
    },URLSearchParams,Date,Intl,Map,Set
  });
  vm.runInContext(section('function isSaneRow(v){','/* 1日のAPI回数を数える'),ctx);
  vm.runInContext(section('function priceProvider(){','/* =========================================================\n   ③ サンプルデータ'),ctx);
  const data=await ctx.fetchAlpaca('PD','1d');
  assert.equal(data.candles[0].time,'2026-09-25');
  assert.equal(data.volumes[0].value,1668852);
  assert.match(calls[0].url,/feed=sip/);
  assert.match(calls[0].url,/adjustment=split/);
  assert.equal(calls[0].options.headers['APCA-API-KEY-ID'],'test');
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
