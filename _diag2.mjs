import { chromium } from 'playwright';
const BASE='http://127.0.0.1:4599/chezakvest-preview';
const OUT='/home/claude/che_za_kvest/work/tester-report/evidence/dead-controls';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:900}});
const p=await ctx.newPage();
p.on('console',m=>{if(m.type()==='error')console.log('CONSOLE-ERR:',m.text().slice(0,200));});
p.on('pageerror',e=>console.log('PAGEERROR:',String(e).slice(0,200)));
const go=async u=>{await p.goto(u,{waitUntil:'load'});await p.waitForTimeout(2600);};

// ===== 31: quest page "Другие квесты" =====
await go(BASE+'/kvest_v_realnosti_sherlock_holms/');
const card = p.locator('.t1196__item[href]').nth(1);
await card.scrollIntoViewIfNeeded();
await p.waitForTimeout(600);
console.log('=== p31 card info ===', JSON.stringify(await card.evaluate(el=>({
  tag:el.tagName, href:el.getAttribute('href'), target:el.getAttribute('target'),
  rect:el.getBoundingClientRect().toJSON(),
  topElem:(()=>{const r=el.getBoundingClientRect();const t=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return t?t.className+'/'+t.tagName:null;})(),
  pointerEvents:getComputedStyle(el).pointerEvents
}))));
await p.screenshot({path:OUT+'/p31-quest-rail-before.png'});
const urlBefore=p.url();
await card.click();
await p.waitForTimeout(1800);
console.log('p31 after real click url =', p.url(), '| changed:', p.url()!==urlBefore);
await p.screenshot({path:OUT+'/p31-quest-rail-after-click.png'});

// dispatch synthetic click (no pointer sequence) to prove the anchor itself is fine
await p.goto(BASE+'/kvest_v_realnosti_sherlock_holms/',{waitUntil:'load'});await p.waitForTimeout(2600);
const u2=p.url();
await p.evaluate(()=>{document.querySelectorAll('.t1196__item[href]')[1].click();});
await p.waitForTimeout(1500);
console.log('p31 after el.click() url =', p.url(), '| changed:', p.url()!==u2);

await b.close();
