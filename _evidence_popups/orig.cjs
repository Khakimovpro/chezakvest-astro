const fs=require('fs');
const {chromium}=require('playwright');
const OUT='/home/claude/che_za_kvest/work/tester-report/evidence/popups/';
const log=[]; const say=s=>{log.push(s);fs.writeFileSync(OUT+'log-origin.txt',log.join('\n'));console.log(s);};
(async()=>{
const b=await chromium.launch();
try{
const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto('https://xn--80aehcht5ci1b.xn--p1ai/kids',{waitUntil:'domcontentloaded',timeout:90000});
await p.waitForTimeout(9000);
say('ORIGIN kids загружен');
say('попапы: '+JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('.t-popup')].map(e=>({h:e.getAttribute('data-tooltip-hook'),d:getComputedStyle(e).display})))));
// клик по плитке шоу-программы
const info=await p.evaluate(()=>{
  const a=[...document.querySelectorAll('a.t-card__link')].find(e=>e.textContent.trim()==='Мафия');
  if(!a) return null;
  const card=a.closest('.t959__card-inner');
  card.setAttribute('data-probe-card','1'); card.scrollIntoView({block:'center'});
  return {href:a.getAttribute('href'),cursor:getComputedStyle(card).cursor};
});
say('карточка «Мафия»: '+JSON.stringify(info));
await p.waitForTimeout(1200);
const box=await p.locator('[data-probe-card]').boundingBox();
const y0=await p.evaluate(()=>Math.round(scrollY));
await p.mouse.click(box.x+box.width/2, box.y+box.height*0.25);
await p.waitForTimeout(1500);
say('после клика по КАРТИНКЕ карточки: '+JSON.stringify(await p.evaluate(()=>({hash:location.hash,y:Math.round(scrollY),
  shown:[...document.querySelectorAll('.t-popup_show')].map(e=>e.getAttribute('data-tooltip-hook')),
  bodyCls:document.body.className}))) + ' y0='+y0);
await p.screenshot({path:OUT+'origin-p47-tile-click.png'});
// закрытие Esc / клик по фону
await p.mouse.click(20,20); await p.waitForTimeout(1200);
say('после клика по фону: '+JSON.stringify(await p.evaluate(()=>({hash:location.hash,y:Math.round(scrollY),shown:[...document.querySelectorAll('.t-popup_show')].length}))));
await p.screenshot({path:OUT+'origin-p47-after-close.png'});
}catch(e){say('ERR '+e.message);}
await b.close();
})();
