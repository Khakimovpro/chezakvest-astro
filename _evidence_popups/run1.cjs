const fs=require('fs');
const {chromium}=require('playwright');
const OUT='/home/claude/che_za_kvest/work/tester-report/evidence/popups/';
const base='http://127.0.0.1:4599/chezakvest-preview';
const log=[]; const say=s=>{log.push(s);fs.writeFileSync(OUT+'log-run1.txt',log.join('\n'));console.log(s);};
(async()=>{
const b=await chromium.launch();
try{
const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto(base+'/',{waitUntil:'networkidle'}); await p.waitForTimeout(2600);
const cert=await p.evaluate(()=>{
  const img=[...document.querySelectorAll('a.tn-atom > img')].find(i=>/tild3334-6265-4539-a161-376638336433/.test(i.dataset.original||i.src||''));
  if(!img) return null;
  const a=img.closest('a'); a.setAttribute('data-probe','cert');
  return {href:a.getAttribute('href')};
});
say('п.9 кнопка-картинка «Получить консультацию» (ориг. href="#popup:cert"): '+JSON.stringify(cert));
await p.evaluate(()=>document.querySelector('[data-probe=cert]').scrollIntoView({block:'center'}));
await p.waitForTimeout(600);
const before=await p.evaluate(()=>Math.round(scrollY));
await p.click('[data-probe=cert]');
await p.waitForTimeout(900);
await p.screenshot({path:OUT+'p09-home-cert-click.png'});
say('п.9 после клика: '+JSON.stringify(await p.evaluate(()=>({hash:location.hash,
   bookingDisplay:getComputedStyle(document.querySelector('#source-booking')).display,
   bookingTitle:document.querySelector('#source-booking h2')?.textContent,
   hasPhoneMask:!!document.querySelector('#source-booking .t-input-phonemask'),
   policyLink:!!document.querySelector('#source-booking a[href*="privacy"]'),
   certPopupDisplay:getComputedStyle(document.querySelector('[data-tooltip-hook="#popup:cert"]')).display,
   y:Math.round(scrollY)})))+' | scrollBefore='+before);
// закрытие кликом по фону (в углу, чтобы не попасть в диалог)
await p.mouse.click(30,30);
await p.waitForTimeout(800);
say('п.10 после клика по фону: '+JSON.stringify(await p.evaluate(()=>({hash:location.hash,y:Math.round(scrollY)}))));
await p.screenshot({path:OUT+'p10-home-after-close.png'});
}catch(e){say('ERR '+e.message);}
await b.close();
})();
