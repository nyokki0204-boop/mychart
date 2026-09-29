import fs from 'node:fs';

const token=process.env.FINNHUB_API_KEY;
if(!token) throw new Error('FINNHUB_API_KEY is required');
const path=new URL('../data/earnings.json',import.meta.url);
const old=JSON.parse(fs.readFileSync(path,'utf8'));
const now=new Date(), day=now.toISOString().slice(0,10);
const offset=n=>new Date(now.getTime()+n*86400000).toISOString().slice(0,10);
const calendar=[];
for(let start=-30;start<90;start+=7){
  const url=new URL('https://finnhub.io/api/v1/calendar/earnings');
  url.searchParams.set('from',offset(start)); url.searchParams.set('to',offset(Math.min(start+6,90)));
  const res=await fetch(url,{headers:{'X-Finnhub-Token':token}});
  if(!res.ok) throw new Error(`Finnhub HTTP ${res.status}`);
  const json=await res.json();
  if(!Array.isArray(json.earningsCalendar)) throw new Error('Finnhub calendar response is invalid');
  calendar.push(...json.earningsCalendar);
}
const metric=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const events={...old.events};
for(const item of calendar){
  const symbol=String(item.symbol||'').toUpperCase(), date=item.date;
  if(!/^[A-Z0-9][A-Z0-9.\-]{0,14}$/.test(symbol) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
  const id=symbol+'@'+date, prev=events[id]||{};
  const forecast=(prev.forecast && (prev.forecast.eps!==null || prev.forecast.revenue!==null) ? prev.forecast : null) || (date>day ? {
    capturedAt:now.toISOString(),eps:metric(item.epsEstimate),revenue:metric(item.revenueEstimate)
  } : null);
  events[id]={symbol,date,quarter:item.quarter??null,year:item.year??null,
    forecast,eps:metric(item.epsActual)??prev.eps??null,revenue:metric(item.revenueActual)??prev.revenue??null,
    latestEstimate:{eps:metric(item.epsEstimate),revenue:metric(item.revenueEstimate)}};
}
// 過去のスナップショットは残しつつ、公開ファイルが無制限に増えないようにする。
const cutoff=offset(-730);
const sorted=Object.fromEntries(Object.entries(events).filter(([,e])=>e.date>=cutoff).sort());
fs.writeFileSync(path,JSON.stringify({version:1,updatedAt:now.toISOString(),events:sorted})+'\n');
console.log(`Saved ${Object.keys(sorted).length} earnings events`);
