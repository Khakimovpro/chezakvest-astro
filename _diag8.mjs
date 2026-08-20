import { chromium } from 'playwright';
const ORIG='https://xn--80aehcht5ci1b.xn--p1ai';
const OUT='/home/claude/che_za_kvest/work/tester-report/evidence/dead-controls';
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
const go=async u=>{await p.goto(u,{waitUntil:'load',timeout:60000});await p.waitForTimeout(6000);};

// --- ORIGIN home: t604 banner
await go(ORIG+'/');
console.log('ORIG t604:', JSON.stringify(await p.evaluate(()=>{
  const el=document.querySelector('.t604__imgwrapper');
  if(!el) return null;
  el.scrollIntoView({block:'center'});
  const r=el.getBoundingClientRect();
  const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
  return {cursor:getComputedStyle(el).cursor, inAnchor:!!el.closest('a'),
    top: top?top.tagName+'.'+String(top.className).slice(0,60):null,
    outer: el.outerHTML.slice(0,200)};
})));
{
  await p.waitForTimeout(1500);
  const r=await p.evaluate(()=>{const el=document.querySelector('.t604__imgwrapper');const b=el.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};});
  const u=p.url();
  await p.mouse.click(r.x,r.y);
  await p.waitForTimeout(3000);
  console.log('ORIG t604 click ->', p.url(), 'changed:', p.url()!==u);
  await p.screenshot({path:OUT+'/p07-ORIGIN-after-banner-click.png'});
}
await b.close();
