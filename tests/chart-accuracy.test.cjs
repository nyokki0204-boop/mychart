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

test('trendlines stay straight across compressed daily/weekly axes and price scales without changing anchors', () => {
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
  const original=JSON.stringify(d);
  // Uneven calendar gaps simulate weekends and market holidays. Real x
  // coordinates are evenly spaced by bar, not by elapsed calendar days.
  for(const epochs of [[0,1,2,5,6,7,10],[0,5,10]]){
    ctx.epochs=epochs;
    ctx.tsToX=t=>epochs.indexOf(t)*12;
    for(const logScale of [false,true]){
      ctx.logScale=logScale;
      ctx.Py=p=>logScale ? Math.log(p)*100 : p*10;
      for(const drawing of [d,{...d,a:d.b,b:d.a}]){
        ctx.layoutOneGeometry(drawing);
        const points=parts.vis.attrs.points.split(' ').map(s=>s.split(',').map(Number));
        assert.deepEqual(points, [
          [ctx.tsToX(drawing.a.t),ctx.Py(drawing.a.p)],
          [ctx.tsToX(drawing.b.t),ctx.Py(drawing.b.p)]
        ]);
        assert.equal(parts.hit.attrs.points,parts.vis.attrs.points);
        assert.equal(parts.hitA.attrs.cx,points[0][0]);
        assert.equal(parts.hitA.attrs.cy,points[0][1]);
        assert.equal(parts.hitB.attrs.cx,points[1][0]);
        assert.equal(parts.hitB.attrs.cy,points[1][1]);
      }
    }
  }
  assert.equal(JSON.stringify(d),original);
  // Off-screen anchors must remain outside the viewport, not clamp to its edge.
  ctx.tsToX=t=>t*200-400;
  ctx.layoutOneGeometry(d);
  assert.equal(parts.vis.attrs.points,'-400,'+ctx.Py(20)+' 1600,'+ctx.Py(10));
  assert.equal(parts.hitA.attrs.visibility,'hidden');
  assert.equal(parts.hitB.attrs.visibility,'hidden');
});

test('an impossible OHLC row is discarded', () => {
  const ctx=vm.createContext({});
  vm.runInContext(section('function isSaneRow(v){','/* 1日のAPI回数を数える'),ctx);
  assert.equal(ctx.isSaneRow({datetime:'2026-09-23',open:14,high:13,low:12,close:13}),false);
  assert.equal(ctx.isSaneRow({datetime:'2026-09-23',open:14,high:15,low:12,close:13}),true);
});
