import { chromium } from 'playwright';
const ORIG='https://xn--80aehcht5ci1b.xn--p1ai';
const OUT='/home/claude/che_za_kvest/work/tester-report/evidence/dead-controls';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:900}});
const p=await ctx.newPage();
const go=async u=>{for(let i=0;i<3;i++){try{await p.goto(u,{waitUntil:'domcontentloaded',timeout:90000});break;}catch(e){console.log('retry',i);} }await p.waitForTimeout(8000);};

await go(ORIG+'/kids');
// t1196 card click
console.log('== ORIGIN kids t1196 ==');
console.log(JSON.stringify(await p.evaluate(()=>{
  const r=document.querySelector('#rec1144951641');
  const items=[...r.querySelectorAll('.t1196__item')];
  return {n:items.length, first:{tag:items[0].tagName, href:items[0].getAttribute('href'), target:items[0].getAttribute('target')}};
})));
{
  const it=p.locator('#rec1144951641 .t1196__item').first();
  await it.scrollIntoViewIfNeeded(); await p.waitForTimeout(1200);
  await p.screenshot({path:OUT+'/p41-ORIGIN-scenarios-before.png'});
  const u=p.url(); await it.click(); await p.waitForTimeout(4000);
  console.log('ORIGIN t1196 click ->', p.url(), 'tabs:', ctx.pages().map(x=>x.url()));
  await p.screenshot({path:OUT+'/p41-ORIGIN-scenarios-after-click.png'});
}
await go(ORIG+'/kids');
// t395 tabs
console.log('== ORIGIN kids t395 ==');
{
  const before=await p.evaluate(()=>{
    const w=document.querySelector('#rec844797072 .t395__wrapper');
    return {cur:w.dataset.tabCurrent, recs:['rec844797074','rec1188610846','rec1188618831'].map(id=>{const e=document.getElementById(id);return id+':'+(e?(e.offsetHeight>0?'visible':'hidden'):'absent');})};
  });
  console.log('before', JSON.stringify(before));
  await p.locator('#tab2_844797072').scrollIntoViewIfNeeded(); await p.waitForTimeout(800);
  await p.screenshot({path:OUT+'/p44-ORIGIN-tabs-before.png'});
  await p.locator('#tab2_844797072').click(); await p.waitForTimeout(2500);
  console.log('after', JSON.stringify(await p.evaluate(()=>{
    const w=document.querySelector('#rec844797072 .t395__wrapper');
    return {cur:w.dataset.tabCurrent, recs:['rec844797074','rec1188610846','rec1188618831'].map(id=>{const e=document.getElementById(id);return id+':'+(e?(e.offsetHeight>0?'visible':'hidden')+'/'+getComputedStyle(e).display:'absent');})};
  })));
  await p.screenshot({path:OUT+'/p44-ORIGIN-tabs-after-click-tab2.png'});
}
// t829 доп.услуги
console.log('== ORIGIN kids t829 ==');
await go(ORIG+'/kids');
{
  const info=await p.evaluate(()=>{
    const r=document.getElementById('rec844797119');
    const card=r.querySelector('.t829__grid-item');
    card.scrollIntoView({block:'center'});
    const img=card.querySelector('.t829__imgwrapper');
    const link=card.querySelector('.t-card__link');
    const ib=img.getBoundingClientRect(), lb=link.getBoundingClientRect();
    return {imgInAnchor:!!img.closest('a'), href:link.getAttribute('href'),
      imgPoint:{x:ib.x+ib.width/2,y:ib.y+ib.height/2}, linkPoint:{x:lb.x+lb.width/2,y:lb.y+lb.height/2}};
  });
  console.log('t829 info', JSON.stringify(info));
  await p.waitForTimeout(800);
  await p.mouse.click(info.imgPoint.x, info.imgPoint.y);
  await p.waitForTimeout(2500);
  const popupAfterImg=await p.evaluate(()=>{const el=document.querySelector('[data-tooltip-hook="#popup:dopuslugi"]');return el?getComputedStyle(el).display+'/'+el.offsetHeight:'absent';});
  console.log('after IMAGE click, popup:', popupAfterImg);
  await p.screenshot({path:OUT+'/p55-ORIGIN-after-image-click.png'});
  await p.keyboard.press('Escape'); await p.waitForTimeout(1000);
  await p.mouse.click(info.linkPoint.x, info.linkPoint.y);
  await p.waitForTimeout(2500);
  console.log('after TITLE click, popup:', await p.evaluate(()=>{const el=document.querySelector('[data-tooltip-hook="#popup:dopuslugi"]');return el?getComputedStyle(el).display+'/'+el.offsetHeight:'absent';}), 'url', p.url());
  await p.screenshot({path:OUT+'/p55-ORIGIN-after-title-click.png'});
}
await b.close();
