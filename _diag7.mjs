import { chromium } from 'playwright';
const BASE='http://127.0.0.1:4599/chezakvest-preview';
const OUT='/home/claude/che_za_kvest/work/tester-report/evidence/dead-controls';
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
await p.goto(BASE+'/',{waitUntil:'load'}); await p.waitForTimeout(3000);
const info=await p.evaluate(()=>{
  const el=document.querySelector('.t604__imgwrapper');
  el.scrollIntoView({block:'center'});
  const r=el.getBoundingClientRect();
  const top=document.elementFromPoint(r.x+r.width/2, r.y+r.height/2);
  return {rect:{x:r.x,y:r.y,w:r.width,h:r.height},
    top: top? top.tagName+'.'+String(top.className) : null,
    cursor:getComputedStyle(el).cursor,
    caption: el.parentElement.querySelector('meta[itemprop=caption]')?.content};
});
console.log('p7 info', JSON.stringify(info));
await p.waitForTimeout(600);
await p.screenshot({path:OUT+'/p07-home-banner-before.png'});
const u=p.url();
await p.mouse.click(info.rect.x+info.rect.w/2, info.rect.y+info.rect.h/2);
await p.waitForTimeout(1500);
console.log('p7 raw mouse click ->', p.url(), 'changed:', p.url()!==u);
await p.screenshot({path:OUT+'/p07-home-banner-after-click.png'});
await b.close();
