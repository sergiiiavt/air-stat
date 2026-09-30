import fs from 'node:fs';
import assert from 'node:assert/strict';

const BASE = 'https://air-alert-stat.com';
const FROM = '2026-03-19';
const TO = '2026-09-19';
const ATTACK = /(атак|обстр|бпла|дрон|безпілот|ракет|шахед|вибух|attack|strike|drone|missile|explosion)/iu;
const IMPACT = /(улам|пошкод|влуч|пожеж|постраж|загин|поран|зруйн|debris|damage|hit|fire|injur|killed|dead|destroy)/iu;
const KYIV = /(ки(їв|єв)|київщ|kyiv|kiev|буч|бровар|борисп|вишгород|ірпін|гостомел|фастів|обухів|біла церква|вишнев)/iu;

const AREAS = [
  ['kyiv-city','Darnytskyi district','exact',/(дарницьк|darnytsk)/iu],
  ['kyiv-city','Desnianskyi district','exact',/(деснянськ|desniansk)/iu],
  ['kyiv-city','Dniprovskyi district','exact',/(дніпровськ|dniprovsk)/iu],
  ['kyiv-city','Holosiivskyi district','exact',/(голосіївськ|holosiivsk)/iu],
  ['kyiv-city','Obolonskyi district','exact',/(оболонськ|obolonsk)/iu],
  ['kyiv-city','Pecherskyi district','exact',/(печерськ|pechersk)/iu],
  ['kyiv-city','Podilskyi district','exact',/(подільськ|podilsk)/iu],
  ['kyiv-city','Shevchenkivskyi district','exact',/(шевченківськ|shevchenkivsk)/iu],
  ['kyiv-city','Solomianskyi district','exact',/(солом[’'ʼ]?янськ|solomiansk)/iu],
  ['kyiv-city','Sviatoshynskyi district','exact',/(святошинськ|sviatoshynsk)/iu],
  ['kyiv-oblast','Bilotserkivskyi raion','exact',/(білоцерківськ.{0,12}район|bilotserkivskyi raion|bila tserkva raion)/iu],
  ['kyiv-oblast','Boryspilskyi raion','exact',/(бориспільськ.{0,12}район|boryspilskyi raion|boryspil raion)/iu],
  ['kyiv-oblast','Brovarskyi raion','exact',/(броварськ.{0,12}район|brovarskyi raion|brovary raion)/iu],
  ['kyiv-oblast','Buchanskyi raion','exact',/(бучанськ.{0,12}район|buchanskyi raion|bucha raion)/iu],
  ['kyiv-oblast','Fastivskyi raion','exact',/(фастівськ.{0,12}район|fastivskyi raion|fastiv raion)/iu],
  ['kyiv-oblast','Obukhivskyi raion','exact',/(обухівськ.{0,12}район|obukhivskyi raion|obukhiv raion)/iu],
  ['kyiv-oblast','Vyshhorodskyi raion','exact',/(вишгородськ.{0,12}район|vyshhorodskyi raion|vyshhorod raion)/iu],
  ['kyiv-oblast','Bila Tserkva','settlement',/(біла церква|bila tserkva)/iu],
  ['kyiv-oblast','Boryspil','settlement',/(^|\W)(бориспіль|boryspil)(\W|$)/iu],
  ['kyiv-oblast','Brovary','settlement',/(^|\W)(бровари|brovary)(\W|$)/iu],
  ['kyiv-oblast','Bucha','settlement',/(^|\W)(буча|bucha)(\W|$)/iu],
  ['kyiv-oblast','Fastiv','settlement',/(^|\W)(фастів|fastiv)(\W|$)/iu],
  ['kyiv-oblast','Hostomel','settlement',/(гостомел|hostomel)/iu],
  ['kyiv-oblast','Irpin','settlement',/(ірпін|irpin)/iu],
  ['kyiv-oblast','Obukhiv','settlement',/(^|\W)(обухів|obukhiv)(\W|$)/iu],
  ['kyiv-oblast','Vyshhorod','settlement',/(^|\W)(вишгород|vyshhorod)(\W|$)/iu],
  ['kyiv-oblast','Vyshneve','settlement',/(вишнев|vyshneve)/iu],
];
const PARENT = new Map([
  ['Bila Tserkva','Bilotserkivskyi raion'],['Boryspil','Boryspilskyi raion'],['Brovary','Brovarskyi raion'],
  ['Bucha','Buchanskyi raion'],['Hostomel','Buchanskyi raion'],['Irpin','Buchanskyi raion'],
  ['Fastiv','Fastivskyi raion'],['Obukhiv','Obukhivskyi raion'],['Vyshhorod','Vyshhorodskyi raion'],
]);

const args = new Map();
for (let i=2;i<process.argv.length;i+=1) if (process.argv[i].startsWith('--')) {
  const k=process.argv[i].slice(2), n=process.argv[i+1];
  if (!n || n.startsWith('--')) args.set(k,'true'); else { args.set(k,n); i+=1; }
}
const addDays=(d,n)=>{const x=new Date(`${d}T12:00:00Z`);x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
const dates=(a,b)=>{const out=[];for(let d=a;d<=b;d=addDays(d,1))out.push(d);return out};
const norm=s=>String(s??'').toLowerCase().replace(/[‘’ʼ]/g,"'").replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const strip=s=>String(s??'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/giu,' ').replace(/&amp;/giu,'&').replace(/&quot;/giu,'"').replace(/&#39;/giu,"'").replace(/\s+/g,' ').trim();
const xml=s=>String(s??'').replace(/^<!\[CDATA\[/u,'').replace(/\]\]>$/u,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
const relevant=t=>ATTACK.test(t)&&IMPACT.test(t)&&KYIV.test(t);

function detectAreas(text){
  const m=new Map();
  for(const [scope,key,specificity,re] of AREAS) if(re.test(text)) m.set(`${scope}:${key}`,{scope,key,specificity});
  if(m.size) return [...m.values()];
  if(/(^|\W)(ки(їв|єв)|kyiv|kiev)(\W|$)/iu.test(text)&&!/(київщ|київськ.{0,12}област|kyiv oblast)/iu.test(text)) m.set('city',{scope:'kyiv-city',key:'Kyiv',specificity:'broad'});
  if(/(київщ|київськ.{0,12}област|kyiv oblast)/iu.test(text)) m.set('oblast',{scope:'kyiv-oblast',key:'Kyiv Oblast',specificity:'broad'});
  return [...m.values()];
}

const MONTHS=new Map([['січня',1],['лютого',2],['березня',3],['квітня',4],['травня',5],['червня',6],['липня',7],['серпня',8],['вересня',9],['жовтня',10],['листопада',11],['грудня',12]]);
function eventDateFromArticle(text,publishedDate){
  const cut=text.split(/Що передувало|Передісторія|Раніше повідомлялося/iu)[0];
  const pubMonth=Number(publishedDate.slice(5,7)), pubDay=Number(publishedDate.slice(8,10)), year=Number(publishedDate.slice(0,4));
  const matches=[...cut.matchAll(/(?:^|\W)(\d{1,2})\s+(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)(?:\s+(\d{4}))?/giu)];
  let skippedByline=false;
  for(const m of matches){
    const day=Number(m[1]),month=MONTHS.get(m[2].toLowerCase()),y=m[3]?Number(m[3]):year;
    if(!skippedByline&&month===pubMonth&&day===pubDay){skippedByline=true;continue}
    const d=`${y}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;return {date:d,confidence:'explicit'};
  }
  if(/\bсьогодні\b/iu.test(cut))return {date:publishedDate,confidence:'explicit-relative'};
  return {date:publishedDate,confidence:'publication-date-only'};
}

function parsePravda(html,date){
  const out=[],seen=new Set(),re=/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/giu;
  for(const m of html.matchAll(re)){
    let u;try{u=new URL(m[1].replaceAll('&amp;','&'),'https://www.pravda.com.ua')}catch{continue}
    if(!/(^|\.)pravda\.com\.ua$/u.test(u.hostname)||!/^\/news\/\d{4}\/\d{2}\/\d{2}\/\d+\/?$/u.test(u.pathname))continue;
    const title=strip(m[2]); if(!relevant(title)||seen.has(u.href))continue; seen.add(u.href);
    out.push({date,publisher:'Ukrainska Pravda',family:'pravda-direct',url:u.href,title,areas:detectAreas(title)});
  } return out;
}
function parseGoogle(body,date){
  const out=[],seen=new Set();
  for(const item of body.match(/<item\b[\s\S]*?<\/item>/giu)??[]){
    const title=xml(item.match(/<title>([\s\S]*?)<\/title>/iu)?.[1]), link=xml(item.match(/<link>([\s\S]*?)<\/link>/iu)?.[1]);
    const publisher=xml(item.match(/<source(?:\s[^>]*)?>([\s\S]*?)<\/source>/iu)?.[1])||'Unknown publisher';
    const pubRaw=xml(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/iu)?.[1]);
    const pubDate=pubRaw&&!Number.isNaN(new Date(pubRaw).getTime())?new Date(pubRaw).toISOString().slice(0,10):null;
    const text=`${title} ${strip(xml(item.match(/<description>([\s\S]*?)<\/description>/iu)?.[1]))}`;
    if(!link||pubDate!==date||!relevant(text)||seen.has(link))continue;seen.add(link);out.push({date,publisher,family:'google-news',dateConfidence:'publication-date-only',url:link,title,areas:detectAreas(text)});
  } return out;
}
function signals(candidates){
  const out=new Map();
  for(const c of candidates) for(const a of c.areas){
    const k=`${a.scope}:${a.key}`, s=out.get(k)??{...a,publishers:new Set(),families:new Set(),examples:[]};
    s.publishers.add(c.publisher);s.families.add(c.family);if(s.examples.length<3)s.examples.push({publisher:c.publisher,title:c.title,url:c.url});out.set(k,s);
  } return out;
}
function incidentText(i){return norm([i?.district,i?.locationName,i?.reportedLocation?.text,i?.localizations?.en?.areaName,i?.localizations?.uk?.areaName].filter(Boolean).join(' '))}
function hasArea(range,s){
  const scoped=(range.incidents??[]).filter(i=>i.scope===s.scope); if(!scoped.length)return false;if(s.specificity==='broad')return true;
  const key=norm(s.key),parent=PARENT.get(s.key),parentKey=parent?norm(parent):null;
  return scoped.some(i=>{const t=incidentText(i);return t.includes(key)||(parentKey&&t.includes(parentKey))||detectAreas(t).some(a=>a.scope===s.scope&&(a.key===s.key||a.key===parent))});
}
function evaluate(date,range,candidates,providers){
  const findings=[],ids=new Set();
  for(const i of range.incidents??[]){
    if(!i?.id)findings.push({severity:'review',kind:'incident-without-id'}); else if(ids.has(i.id))findings.push({severity:'missing',kind:'duplicate-incident-id',incidentId:i.id}); else ids.add(i.id);
    if(!i?.sources?.length)findings.push({severity:'review',kind:'incident-without-evidence',incidentId:i?.id??null});
  }
  for(const s of signals(candidates).values()) if(!hasArea(range,s)){
    const strong=s.specificity==='exact'&&s.families.has('pravda-direct-exact-date');
    findings.push({severity:strong?'missing':'review',kind:'external-area-not-in-production',scope:s.scope,area:s.key,specificity:s.specificity,publishers:[...s.publishers].sort(),sourceFamilies:[...s.families].sort(),examples:s.examples});
  }
  const healthy=Object.values(providers).filter(Boolean).length;
  if(!healthy)findings.push({severity:'review',kind:'external-discovery-unavailable'}); else if(healthy<Object.keys(providers).length)findings.push({severity:'review',kind:'external-discovery-degraded',providers});
  const miss=findings.some(f=>f.severity==='missing'),review=findings.some(f=>f.severity==='review');
  return {date,status:miss?'missing':review?'review':'verified',production:{alertCount:range.stats?.alertCount??0,attackCount:range.stats?.attackCount??0,incidentCount:range.stats?.incidentCount??0},discovery:{providers,candidateCount:candidates.length,publishers:[...new Set(candidates.map(c=>c.publisher))].sort()},findings};
}

async function get(url){let err;for(let i=0;i<3;i+=1){const c=new AbortController(),t=setTimeout(()=>c.abort(),15000);try{const r=await fetch(url,{redirect:'follow',signal:c.signal,headers:{'user-agent':'air-stat-completeness-audit/1.0'}});if(r.ok)return r;err=new Error(`HTTP ${r.status} ${url}`);if(r.status<500&&r.status!==429)throw err}catch(e){err=e}finally{clearTimeout(t)}await new Promise(r=>setTimeout(r,500*(i+1)))}throw err}
async function production(base,date){const u=new URL('/api/range',base);u.search=new URLSearchParams({from:date,to:date,scope:'both'});const j=await(await get(u)).json();if(!j?.stats||!Array.isArray(j.incidents))throw new Error(`Invalid production payload ${date}`);return j}
async function pravda(date){
  const [y,m,d]=date.split('-'),base=parsePravda(await(await get(`https://www.pravda.com.ua/news/date_${d}${m}${y}/`)).text(),date),out=[];
  for(const c of base.slice(0,8)){
    try{
      const body=strip(await(await get(c.url)).text()),at=body.indexOf(c.title),article=at>=0?body.slice(at,at+5000):body.slice(0,5000),event=eventDateFromArticle(article,date);
      if(event.date!==date)continue;out.push({...c,family:event.confidence==='explicit'||event.confidence==='explicit-relative'?'pravda-direct-exact-date':'pravda-direct-undated',dateConfidence:event.confidence});
    }catch{out.push({...c,family:'pravda-direct-undated',dateConfidence:'publication-date-only'})}
  }
  return out;
}
async function google(date){
  const q='(Київ OR Київщина OR Буча OR Бровари OR Бориспіль OR Вишгород OR Ірпінь OR Фастів OR Обухів) (атака OR обстріл OR дрон OR ракета OR уламки OR влучання OR пошкодження OR постраждалі OR загиблі)';
  const p=new URLSearchParams({q:`${q} after:${date} before:${addDays(date,1)}`,hl:'uk',gl:'UA',ceid:'UA:uk'});return parseGoogle(await(await get(`https://news.google.com/rss/search?${p}`)).text(),date);
}
async function auditDay(base,date){
  const [p,u,g]=await Promise.allSettled([production(base,date),pravda(date),google(date)]);if(p.status==='rejected')throw new Error(`Production API failed ${date}: ${p.reason}`);
  return evaluate(date,p.value,[...(u.status==='fulfilled'?u.value:[]),...(g.status==='fulfilled'?g.value:[])],{pravdaDirect:u.status==='fulfilled',googleNews:g.status==='fulfilled'});
}
async function mapLimit(items,n,fn){const out=new Array(items.length);let k=0;async function w(){for(;;){const i=k++;if(i>=items.length)return;out[i]=await fn(items[i],i)}}await Promise.all(Array.from({length:Math.min(n,items.length)},w));return out}
function report(days,from,to,start){const c={verified:0,review:0,missing:0};for(const d of days)c[d.status]+=1;const missingFindings=days.flatMap(d=>d.findings.filter(f=>f.severity==='missing').map(f=>({date:d.date,...f})));const reviewFindings=days.flatMap(d=>d.findings.filter(f=>f.severity==='review').map(f=>({date:d.date,...f})));return{schemaVersion:1,generatedAt:new Date().toISOString(),startedAt:start,window:{from,to,days:days.length},summary:{...c,missingFindings:missingFindings.length,reviewFindings:reviewFindings.length},interpretation:{verified:'No gap was found by this independent audit; this is not proof of absolute completeness.',review:'External discovery or an internal signal needs review.',missing:'A high-confidence external consequence/area signal is absent from production.'},missingFindings,reviewFindings,days}}
function markdown(r){const s=r.summary,a=[`# AirAlert completeness audit`,``,`Window: **${r.window.from} → ${r.window.to}** (${r.window.days} days)`,``,`- Verified: **${s.verified}**`,`- Review: **${s.review}**`,`- Missing: **${s.missing}**`,`- High-confidence missing findings: **${s.missingFindings}**`,``,`> Verified means no discrepancy was found by this audit; it is not a proof that public reporting is complete.`];if(r.missingFindings.length){a.push('','## Missing findings');for(const x of r.missingFindings.slice(0,50))a.push(`- ${x.date}: ${x.scope??'n/a'} / ${x.area??x.kind} — ${x.kind}`)}if(r.reviewFindings.length){a.push('','## Review queue (first 50)');for(const x of r.reviewFindings.slice(0,50))a.push(`- ${x.date}: ${x.area??x.kind} — ${x.kind}`)}return `${a.join('\n')}\n`}

function selfTest(){
  const p=parsePravda('<a href="https://www.pravda.com.ua/news/2026/09/28/1234567/">У Солом’янському районі Києва уламки дрона пошкодили будинок</a>','2026-09-28');assert.equal(p.length,1);assert.equal(p[0].areas[0].key,'Solomianskyi district');
  const g=parseGoogle('<item><title>У Бучанському районі внаслідок атаки пошкоджено будинки</title><link>https://news.google.com/a</link><pubDate>Mon, 28 Sep 2026 08:00:00 GMT</pubDate><source>Суспільне</source><description>Після атаки дронів є пошкодження</description></item>','2026-09-28');assert.equal(g[0].areas[0].key,'Buchanskyi raion');
  assert.deepEqual(eventDateFromArticle('Сайт навігація меню 18 вересня, 00:08 Увечері 16 вересня російські війська атакували Київ. Що передувало: 17 вересня...', '2026-09-18'),{date:'2026-09-16',confidence:'explicit'});
  const broad=evaluate('2026-09-28',{stats:{alertCount:0,attackCount:0,incidentCount:0},incidents:[]},[{...p[0],family:'pravda-direct-exact-date',areas:[{scope:'kyiv-city',key:'Kyiv',specificity:'broad'}]}],{pravdaDirect:true,googleNews:true});assert.equal(broad.status,'review');
  p[0].family='pravda-direct-exact-date';
  const ok=evaluate('2026-09-28',{stats:{alertCount:1,attackCount:1,incidentCount:1},incidents:[{id:'i1',scope:'kyiv-city',district:'Solomianskyi district',sources:[{}]}]},p,{pravdaDirect:true,googleNews:true});assert.equal(ok.status,'verified');
  const gap=evaluate('2026-09-28',{stats:{alertCount:1,attackCount:1,incidentCount:0},incidents:[]},p,{pravdaDirect:true,googleNews:true});assert.equal(gap.status,'missing');
  console.log('Completeness audit self-test passed.');
}

async function main(){
  if(args.has('self-test'))return selfTest(); const from=args.get('from')??FROM,to=args.get('to')??TO;if(!/^\d{4}-\d{2}-\d{2}$/u.test(from)||!/^\d{4}-\d{2}-\d{2}$/u.test(to)||from>to)throw new Error('Invalid audit window');
  const ds=dates(from,to),start=new Date().toISOString();let done=0;const days=await mapLimit(ds,Math.max(1,Math.min(8,Number(args.get('concurrency')??4))),async d=>{const x=await auditDay(args.get('base-url')??BASE,d);console.log(`[${++done}/${ds.length}] ${d}: ${x.status} (${x.discovery.candidateCount} candidates)`);return x});
  const r=report(days,from,to,start);fs.writeFileSync(args.get('report')??'completeness-report.json',`${JSON.stringify(r,null,2)}\n`);fs.writeFileSync(args.get('summary')??'completeness-summary.md',markdown(r));console.log(JSON.stringify(r.summary,null,2));
}
main().catch(e=>{console.error(e?.stack??String(e));process.exitCode=1});
