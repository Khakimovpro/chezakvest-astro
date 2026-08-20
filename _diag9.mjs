import { chromium } from 'playwright';
const ORIG='https://xn--80aehcht5ci1b.xn--p1ai';
const OUT='/home/claude/che_za_kvest/work/tester-report/evidence/dead-controls';
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
await p.goto(ORIG+'/',{waitUntil:'load',timeout:60000}); await p.waitForTimeout(7000);
const info=await p.evaluate(()=>{
  const act=document.querySelector('.t-slds__item_active .t604__imgwrapper') || document.querySelector('.t604__imgwrapper');
  act.scrollIntoView({block:'center'});
  const r=act.getBoundingClientRect();
  const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
  return {cursor:getComputedStyle(act).cursor,
    caption: act.closest('.t-slds__wrapper')?.querySelector('meta[itemprop=caption]')?.content,
    rect:{x:r.x,y:r.y,w:r.width,h:r.height},
    top: top?top.tagName+'.'+String(top.className).slice(0,80):null,
    onclickAttr: act.getAttribute('onclick'),
    // jQuery handlers?
    jq: (()=>{ try{ const $=window.jQuery; if(!$) return 'no-jq'; const ev=$._data ? $._data(act,'events') : null; return ev?Object.keys(ev).join(','):'none'; }catch(e){return 'err'} })(),
    parentJq: (()=>{ try{ const $=window.jQuery; const par=act.closest('.t604'); const ev=$._data($(par)[0],'events'); return ev?Object.keys(ev).join(','):'none'; }catch(e){return 'err'} })()
  };
});
console.log('ORIG active t604:', JSON.stringify(info,null,1));
await p.waitForTimeout(500);
await p.screenshot({path:OUT+'/p07-ORIGIN-banner-before.png'});
const u=p.url();
await p.mouse.click(info.rect.x+info.rect.w/2, info.rect.y+info.rect.h/2);
await p.waitForTimeout(4000);
console.log('ORIG click ->', p.url(), 'changed:', p.url()!==u);
await p.screenshot({path:OUT+'/p07-ORIGIN-banner-after-click.png'});
await b.close();
