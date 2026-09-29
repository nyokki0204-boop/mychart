const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'mychart.html'), 'utf8');
function section(from, to) {
  const a = html.indexOf(from), b = html.indexOf(to, a);
  assert.ok(a >= 0 && b > a);
  return html.slice(a, b);
}

test('trendline price at a date stays equal across daily and weekly coordinates', () => {
  const source = section('function layoutOneGeometry(d){', '// 1点目の目印の位置を最新にする');
  const node=()=>({attrs:{},setAttribute(k,v){this.attrs[k]=v;}});
  const parts = {hit:node(),vis:node(),hitA:node(),visA:node(),hitB:node(),visB:node()};
  const ctx = vm.createContext({
    elMap:{1:parts}, epochs:[], selected:null, logScale:false,
    tsToX:t=>t, Py:p=>p, showParts:()=>{},
    setPos:(node,attrs)=>Object.assign(node.attrs,attrs),
    plotAreaWidth:()=>1000, priceAreaHeight:()=>1000,
    dashOf:()=> 'none'
  });
  vm.runInContext(source,ctx);
  const d={id:1,type:'trend',a:{t:0,p:20},b:{t:10,p:10},color:'yellow'};
  const atFive=[];
  for(const epochs of [[0,1,2,3,4,5,6,7,8,9,10],[0,3,6,9]]){
    ctx.epochs=epochs;
    ctx.layoutOneGeometry(d);
    const points=parts.vis.attrs.points.split(' ').map(s=>s.split(',').map(Number));
    const before=points.filter(([x])=>x<=5).at(-1);
    const after=points.find(([x])=>x>=5);
    atFive.push(before[1]+(after[1]-before[1])*(5-before[0])/(after[0]-before[0]||1));
  }
  assert.deepEqual(atFive,[15,15]);
  ctx.logScale=true;
  ctx.Py=Math.log;
  ctx.epochs=[0,3,6,9];
  ctx.layoutOneGeometry(d);
  const points=parts.vis.attrs.points.split(' ').map(s=>s.split(',').map(Number));
  const before=points.filter(([x])=>x<=5).at(-1);
  const after=points.find(([x])=>x>=5);
  const logAtFive=before[1]+(after[1]-before[1])*(5-before[0])/(after[0]-before[0]);
  assert.ok(Math.abs(Math.exp(logAtFive)-Math.sqrt(200))<1e-9);
});

test('an impossible OHLC row is discarded', () => {
  const ctx=vm.createContext({});
  vm.runInContext(section('function isSaneRow(v){','/* 1日のAPI回数を数える'),ctx);
  assert.equal(ctx.isSaneRow({datetime:'2026-09-23',open:14,high:13,low:12,close:13}),false);
  assert.equal(ctx.isSaneRow({datetime:'2026-09-23',open:14,high:15,low:12,close:13}),true);
});
