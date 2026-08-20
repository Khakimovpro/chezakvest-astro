import { chromium } from 'playwright';
const BASE='http://127.0.0.1:4599/chezakvest-preview';
const OUT='/home/claude/che_za_kvest/work/tester-report/evidence/dead-controls';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:900}});
const p=await ctx.newPage();
const log=[];
const say=(...a)=>{console.log(...a);log.push(a.join(' '));};

async function go(url){ await p.goto(url,{waitUntil:'load'}); await p.waitForTimeout(2500); }

// ---- 1. HOME: t604 banner "подробнее"
await go(BASE+'/');
say('=== HOME t604 ===');
say(JSON.stringify(await p.evaluate(()=>{
  const w=[...document.querySelectorAll('.t604__imgwrapper')];
  return w.slice(0,3).map(el=>({
    cursor:getComputedStyle(el).cursor,
    inAnchor: !!el.closest('a'),
    caption: el.parentElement?.querySelector('meta[itemprop=caption]')?.content,
    html: el.outerHTML.slice(0,120)
  }));
}),null,1));
// click test
{
  const before=p.url();
  const el=await p.$('.t604__imgwrapper');
  if(el){ await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(400); await el.click({force:true}); await p.waitForTimeout(1200);}
  say('t604 click: url before='+before+' after='+p.url());
  await p.screenshot({path:OUT+'/p07-home-t604-after-click.png'});
}

// ---- 31: quest page rail
await go(BASE+'/kvest_v_realnosti_sherlock_holms/');
say('=== QUEST page rails ===');
say(JSON.stringify(await p.evaluate(()=>{
  const out={};
  out.t1196=[...document.querySelectorAll('.t1196__item')].slice(0,3).map(a=>({tag:a.tagName,href:a.getAttribute('href')}));
  out.railTitles=[...document.querySelectorAll('h2,h3')].map(h=>h.textContent.trim().slice(0,60)).filter(Boolean).slice(0,40);
  return out;
}),null,1));

await b.close();
console.log('---LOG---');
