import { chromium } from 'playwright';
const BASE='http://127.0.0.1:4599/chezakvest-preview';
const OUT='/home/claude/che_za_kvest/work/tester-report/evidence/dead-controls';
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
const go=async u=>{await p.goto(u,{waitUntil:'load'});await p.waitForTimeout(2800);};

await go(BASE+'/den-rozhdeniya-na-vr-arene/');
const card=p.locator('#rec2238302181 .t1196__item[href]').first();
await card.scrollIntoViewIfNeeded(); await p.waitForTimeout(800);
await p.screenshot({path:OUT+'/p76-vr-games-before.png'});
const u=p.url();
await card.click(); await p.waitForTimeout(1800);
console.log('p76 mouse click ->', p.url(), 'changed:', p.url()!==u);
await p.screenshot({path:OUT+'/p76-vr-games-after-click.png'});
// programmatic
await go(BASE+'/den-rozhdeniya-na-vr-arene/');
const u2=p.url();
await p.evaluate(()=>document.querySelector('#rec2238302181 .t1196__item[href]').click());
await p.waitForTimeout(1500);
console.log('p76 programmatic ->', p.url(), 'changed:', p.url()!==u2);

// p7 home t604: screenshot of the banner + evidence of dead click
await go(BASE+'/');
const w=p.locator('.t604__imgwrapper').first();
await w.scrollIntoViewIfNeeded(); await p.waitForTimeout(800);
await p.screenshot({path:OUT+'/p07-home-banner-before.png'});
await w.click(); await p.waitForTimeout(1500);
console.log('p7 click ->', p.url());
await p.screenshot({path:OUT+'/p07-home-banner-after-click.png'});
console.log('p7 t604 records:', JSON.stringify(await p.evaluate(()=>{
  const rec=document.querySelector('.t604__imgwrapper')?.closest('.t-rec');
  return {rec:rec?.id, type:rec?.dataset.recordType,
    captions:[...document.querySelectorAll('.t604__imgwrapper')].map(el=>el.parentElement.querySelector('meta[itemprop=caption]')?.content),
    titles:[...document.querySelectorAll('.t-slds__title')].map(t=>t.textContent.trim())};
})));
await b.close();
