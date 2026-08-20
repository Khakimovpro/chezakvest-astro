import { chromium } from 'playwright';
const ORIG='https://xn--80aehcht5ci1b.xn--p1ai';
const OUT='/home/claude/che_za_kvest/work/tester-report/evidence/dead-controls';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:900}});
ctx.on('page',async pg=>{console.log('NEW TAB ->', pg.url()); await pg.waitForTimeout(2000); console.log('NEW TAB settled ->', pg.url());});
const p=await ctx.newPage();
await p.goto(ORIG+'/',{waitUntil:'domcontentloaded',timeout:90000}); await p.waitForTimeout(7000);
const info=await p.evaluate(()=>{
  const act=document.querySelector('.t-slds__item_active .t604__imgwrapper');
  act.scrollIntoView({block:'center'});
  const r=act.getBoundingClientRect();
  return {caption: act.closest('.t-slds__wrapper')?.querySelector('meta[itemprop=caption]')?.content, rect:{x:r.x,y:r.y,w:r.width,h:r.height}};
});
console.log('caption:', info.caption);
await p.waitForTimeout(300);
// probe: which listeners on document handle click for t604?
await p.mouse.click(info.rect.x+info.rect.w/2, info.rect.y+info.rect.h/2);
await p.waitForTimeout(5000);
console.log('main url ->', p.url());
console.log('pages:', ctx.pages().map(x=>x.url()));
await b.close();
