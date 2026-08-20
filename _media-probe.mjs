import { chromium } from 'playwright';
import fs from 'fs';
const OUT='/home/claude/che_za_kvest/work/tester-report/evidence/media/';
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1440,height:900}});
let ok=false;
for(let i=0;i<3 && !ok;i++){
  try{ await p.goto('https://xn--80aehcht5ci1b.xn--p1ai/kvest_v_realnosti_harry_potter_i_krestrazh',{waitUntil:'domcontentloaded',timeout:90000}); ok=true; }catch(e){ console.log('retry',i,e.message.slice(0,80)); }
}
if(!ok){await b.close();process.exit(1);}
await p.waitForTimeout(9000);
fs.writeFileSync('/home/claude/che_za_kvest/work/tester-report/origin/quest-krestrazh.html', await p.content());
await p.screenshot({path:OUT+'p25-origin-quest-hero.png'});
const info=await p.evaluate(()=>{
  const btn=document.querySelector('.play-btn');
  const wrap=btn?btn.closest('.tn-elem'):null;
  const r=btn?btn.getBoundingClientRect():null;
  const wr=wrap?wrap.getBoundingClientRect():null;
  const cs=wrap?getComputedStyle(wrap):null;
  // ищем скрипт, который вешает обработчик
  const scripts=[...document.querySelectorAll('script')].map(s=>s.textContent||'').filter(t=>/play-btn|pb-icon|videoModal|openVideo/i.test(t));
  return {btnBox:r?[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]:null,
    wrapBox:wr?[Math.round(wr.x),Math.round(wr.y),Math.round(wr.width),Math.round(wr.height)]:null,
    wrapCss: cs?{pos:cs.position,top:cs.top,left:cs.left,right:cs.right,bottom:cs.bottom,transform:cs.transform,zIndex:cs.zIndex}:null,
    wrapHtmlHead: wrap?wrap.outerHTML.slice(0,300):null,
    scriptsFound: scripts.length,
    scriptSample: scripts.map(s=>s.slice(0,1200))
  };
});
console.log(JSON.stringify(info,null,1));
// клик
const btn=p.locator('.play-btn').first();
await btn.scrollIntoViewIfNeeded(); await btn.click(); await p.waitForTimeout(3500);
await p.screenshot({path:OUT+'p25-origin-after-play-click.png'});
const after=await p.evaluate(()=>({bodyCls:document.body.className, iframes:[...document.querySelectorAll('iframe')].map(f=>f.src).filter(s=>/rutube|youtube|vk/.test(s)), popups:[...document.querySelectorAll('.t-popup')].filter(e=>getComputedStyle(e).display!=='none').map(e=>e.getAttribute('data-tooltip-hook')||e.className)}));
console.log('AFTER', JSON.stringify(after,null,1));
await b.close();
