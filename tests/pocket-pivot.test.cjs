const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'mychart.html'), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(html.slice(html.indexOf('const ta = {'), html.indexOf('let indicators =')), ctx);
const code = html.match(/const POCKET_PIVOT_CODE = `([\s\S]*?)`;/)[1];
const evaluate = new Function('close', 'volume', 'ta', 'toggle', 'signal', 'timeframe', code);
function fixture() {
  const close = Array.from({length:60}, (_,i)=>100+i*.1);
  close[54]=close[53]-1;
  close[59]=110;
  const volume = Array(60).fill(100);
  volume[54]=200;
  volume[59]=201;
  return {close, volume};
}
function run(data, extended=false, timeframe='1d') {
  let result=[];
  evaluate(data.close, data.volume, vm.runInContext('ta',ctx), ()=>extended,
    (arr,opt)=>{result=Array.from(arr); result.label=opt.text;}, timeframe);
  return result;
}
test('requires previous-close rise, close above SMA50 and strictly greater down-day volume', ()=>{
  const d=fixture();
  assert.equal(run(d)[59],true);
  assert.equal(run(d).label,'PP10');
  d.volume[59]=200;
  assert.equal(run(d)[59],false);
  d.volume[59]=201; d.close[59]=d.close[58];
  assert.equal(run(d)[59],false);
  // A green candle alone must not qualify; only the previous close matters.
  d.close[58]=90; d.close[59]=91;
  assert.equal(run(d)[59],false);
});
test('15-day comparison includes earlier down days and excludes current bar', ()=>{
  const d=fixture();
  d.close[45]=d.close[44]-1; d.volume[45]=300;
  assert.equal(run(d)[59],true);
  assert.equal(run(d,true)[59],false);
  d.volume[59]=301;
  assert.equal(run(d,true)[59],true);
  assert.equal(run(d,true).label,'PP15');
  d.volume[45]=301;
  assert.equal(run(d,true)[59],false);
  // Old volume does not matter if the day was up, even with a red candle.
  d.close[45]=d.close[44]+.05;
  assert.equal(run(d,true)[59],true);
});
test('does not infer a signal with no down days, missing inputs or insufficient SMA history', ()=>{
  let d=fixture(); d.close[54]=d.close[53]+.05;
  assert.equal(run(d)[59],false);
  for(const missing of [null, undefined, NaN, 0, -1]){
    d=fixture(); d.volume[54]=missing;
    assert.equal(run(d)[59],false);
  }
  d=fixture(); d.close[30]=null;
  assert.equal(run(d)[59],false);
  d=fixture();
  assert.ok(run({close:d.close.slice(0,49),volume:d.volume.slice(0,49)}).every(x=>!x));
});
test('daily, weekly and monthly signals use their own bars without future data', ()=>{
  const d=fixture();
  for(const [tf,unit] of [['1d',''],['1w','週'],['1M','月']]){
    assert.equal(run(d,false,tf)[59],true);
    assert.equal(run(d,false,tf).label,'PP10'+unit);
    d.close[45]=d.close[44]-1; d.volume[45]=300;
    assert.equal(run(d,true,tf)[59],false);
    assert.equal(run(d,true,tf).label,'PP15'+unit);
  }
  for(const tf of ['65m','3M','6M']) assert.equal(run(d,false,tf).length,0);
  const before=run(d);
  d.close.push(1); d.volume.push(99999);
  assert.deepEqual(run(d).slice(0,60),before.slice(0,60));
});
test('existing indicator runner exposes timeframe and preserves saved comparison setting', ()=>{
  const d=fixture(); d.close[45]=d.close[44]-1; d.volume[45]=300;
  const context=vm.createContext({
    currentCandles:d.close.map((close,i)=>({time:i,open:close,high:close,low:close,close})),
    currentVols:d.volume.map(value=>({value})), current:{step:'1d'},
    htf:()=>{}, fade:()=>{}, collectingInputs:false
  });
  vm.runInContext(html.slice(html.indexOf('const ta = {'),html.indexOf('let indicators =')),context);
  const a=html.indexOf('function runIndicatorCode(ind){');
  vm.runInContext(html.slice(a,html.indexOf('/* 表示中の自作インジを全部消す */',a)),context);
  const ind={code};
  assert.equal(context.runIndicatorCode(ind).signals[0].arr[59],true);
  ind.params={'15本で比較（OFFは10本）':true};
  assert.equal(context.runIndicatorCode(ind).signals[0].arr[59],false);
  context.current.step='1w';
  const result=context.runIndicatorCode(ind);
  assert.equal(result.signals.length,1);
  assert.equal(result.signals[0].arr[59],false);
  assert.equal(result.signals[0].opt.text,'PP15週');
  assert.equal(result.inputs.length,1);
  // Existing indicator code still runs with the additional timeframe argument.
  assert.equal(context.runIndicatorCode({code:"plot(ta.sma(close,50),{pane:'main'});"}).plots.length,1);
});

test('saved built-in PP upgrades without losing 15-bar setting or touching edited code', ()=>{
  const context=vm.createContext({});
  const a=html.indexOf('const POCKET_PIVOT_CODE =');
  vm.runInContext(html.slice(a,html.indexOf('if(indicators.map(upgradePocketPivot)',a)),context);
  const oldCode=code
    .replace('前足終値比の上昇・50本SMAより上・下落足の最大出来高超え','前日終値比の上昇・50日SMAより上・下落日の最大出来高超え')
    .replace('15本で比較（OFFは10本）','15営業日で比較（OFFは10営業日）')
    .replace("if (['1d', '1w', '1M'].includes(timeframe))","if (timeframe === '1d')")
    .replace("text:'PP'+days+(timeframe==='1w'?'週':timeframe==='1M'?'月':'')","text:'PP'+days");
  const ind={id:'pocket-pivot',name:'ポケットピボット（日足）',code:oldCode,on:false,
    params:{'15営業日で比較（OFFは10営業日）':true}};
  assert.equal(context.upgradePocketPivot(ind),true);
  assert.equal(ind.code,code);
  assert.equal(ind.name,'ポケットピボット');
  assert.equal(ind.on,false);
  assert.equal(ind.params['15本で比較（OFFは10本）'],true);
  assert.equal(context.upgradePocketPivot(ind),false);
  for(const custom of [{...ind,code:oldCode+'\n// Edited'}, {...ind,id:123,code:oldCode}]){
    const before=JSON.stringify(custom);
    assert.equal(context.upgradePocketPivot(custom),false);
    assert.equal(JSON.stringify(custom),before);
  }
});
