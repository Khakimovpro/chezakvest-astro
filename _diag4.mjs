import { chromium } from 'playwright';
const BASE='http://127.0.0.1:4599/chezakvest-preview';
const OUT='/home/claude/che_za_kvest/work/tester-report/evidence/dead-controls';
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
const go=async u=>{await p.goto(u,{waitUntil:'load'});await p.waitForTimeout(2800);};
await go(BASE+'/kids/');

// --- p41: сценарии rail (t1196 with href)
console.log('=== p41 t1196 scenarios ===');
console.log(JSON.stringify(await p.evaluate(()=>{
  const recs=[...document.querySelectorAll('.t1196')];
  return recs.map(r=>({
    title:r.closest('.t-rec')?.querySelector('.js-block-header-title')?.textContent.trim().slice(0,50),
    rec:r.closest('.t-rec')?.id,
    items:[...r.querySelectorAll('.t1196__item')].slice(0,2).map(i=>({tag:i.tagName,href:i.getAttribute('href')}))
  }));
}),null,1));
{
  const card=p.locator('#rec1144951641 .t1196__item[href]').first();
  await card.scrollIntoViewIfNeeded(); await p.waitForTimeout(700);
  await p.screenshot({path:OUT+'/p41-kids-scenarios-before.png'});
  const u=p.url(); await card.click(); await p.waitForTimeout(1800);
  console.log('p41 mouse click ->', p.url(), 'changed:', p.url()!==u);
  await p.screenshot({path:OUT+'/p41-kids-scenarios-after-click.png'});
}
await go(BASE+'/kids/');

// --- p44: t395 tabs
console.log('=== p44 t395 tabs ===');
console.log(JSON.stringify(await p.evaluate(()=>{
  const w=document.querySelector('.t395__wrapper');
  if(!w) return null;
  return {rec:w.closest('.t-rec')?.id, current:w.dataset.tabCurrent,
    tabs:[...w.querySelectorAll('.t395__tab')].map(t=>({n:t.dataset.tabNumber, recs:t.dataset.tabRecIds, active:t.classList.contains('t395__tab_active'), label:t.textContent.trim().slice(0,30)})),
    visibleRecs:['rec844797074','rec844797091','rec1188610846','rec844797092','rec1188618831'].map(id=>{const e=document.getElementById(id);return id+':'+(e? (getComputedStyle(e).display+'/'+ (e.offsetHeight>0)) :'absent');})};
}),null,1));
{
  const tab2=p.locator('#tab2_844797072');
  await tab2.scrollIntoViewIfNeeded(); await p.waitForTimeout(600);
  await p.screenshot({path:OUT+'/p44-tabs-before.png'});
  await tab2.click(); await p.waitForTimeout(1200);
  console.log('after tab2 click:', JSON.stringify(await p.evaluate(()=>{
    const w=document.querySelector('.t395__wrapper');
    return {current:w.dataset.tabCurrent,
      active:[...w.querySelectorAll('.t395__tab')].map(t=>t.classList.contains('t395__tab_active')),
      aria:[...w.querySelectorAll('button')].map(x=>x.getAttribute('aria-selected')),
      recs:['rec844797074','rec1188610846','rec1188618831'].map(id=>{const e=document.getElementById(id);return id+':'+(e?(e.offsetHeight>0?'visible':'hidden'):'absent');})};
  })));
  await p.screenshot({path:OUT+'/p44-tabs-after-click-tab2.png'});
}

// --- p55/56: t829 card links
console.log('=== p55/56 t829 links ===');
console.log(JSON.stringify(await p.evaluate(()=>{
  return ['rec844797119','rec844797122'].map(id=>{
    const r=document.getElementById(id);
    if(!r) return {id,absent:true};
    const links=[...r.querySelectorAll('.t-card__link')];
    const first=links[0];
    const rect=first?first.getBoundingClientRect():null;
    return {id, count:links.length, href:first?.getAttribute('href'),
      rect:rect?{w:rect.width,h:rect.height}:null,
      popupInPage: !!document.querySelector('[data-tooltip-hook="#popup:dopuslugi"], [data-tooltip-hook="#popup:masterklass"]')};
  });
}),null,1));
{
  const link=p.locator('#rec844797119 .t-card__link').first();
  await link.scrollIntoViewIfNeeded(); await p.waitForTimeout(700);
  await p.screenshot({path:OUT+'/p55-dopuslugi-before.png'});
  await link.click(); await p.waitForTimeout(1300);
  console.log('p55 click -> url', p.url());
  await p.screenshot({path:OUT+'/p55-dopuslugi-after-click.png'});
  // click the card IMAGE (what a user actually aims at)
}
await go(BASE+'/kids/');
{
  const img=p.locator('#rec844797119 .t829__imgwrapper').first();
  await img.scrollIntoViewIfNeeded(); await p.waitForTimeout(700);
  const u=p.url(); await img.click(); await p.waitForTimeout(1200);
  console.log('p55 image click -> url', p.url(), 'changed:', p.url()!==u);
  await p.screenshot({path:OUT+'/p55-dopuslugi-image-click.png'});
}
await b.close();
