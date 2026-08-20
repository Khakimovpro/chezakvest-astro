const fs=require('fs');
const {chromium}=require('playwright');
const OUT='/home/claude/che_za_kvest/work/tester-report/evidence/popups/';
const base='http://127.0.0.1:4599/chezakvest-preview';
const log=[]; const say=s=>{log.push(s);fs.writeFileSync(OUT+'log-run2.txt',log.join('\n'));console.log(s);};
const state=p=>p.evaluate(()=>({hash:location.hash,y:Math.round(scrollY),
  booking:getComputedStyle(document.querySelector('#source-booking')).display,
  title:document.querySelector('#source-booking h2')?.textContent,
  openPopups:[...document.querySelectorAll('.t-popup')].filter(e=>getComputedStyle(e).display!=='none').map(e=>e.getAttribute('data-tooltip-hook'))}));
(async()=>{
const b=await chromium.launch();
try{
const p=await b.newPage({viewport:{width:1440,height:900}});

// ===== п.29 квестовая страница: «Расписание не загрузилось…» (ориг. #popup:nondaries)
await p.goto(base+'/mystery_shack/',{waitUntil:'networkidle'}); await p.waitForTimeout(2600);
const nd=await p.evaluate(()=>{
  const a=[...document.querySelectorAll('a')].find(e=>/Расписание не загрузилось/i.test(e.textContent));
  if(!a) return null; a.setAttribute('data-probe','nd');
  return {href:a.getAttribute('href'),text:a.textContent.trim().slice(0,60)};
});
say('п.29 ссылка: '+JSON.stringify(nd));
if(nd){ await p.evaluate(()=>document.querySelector('[data-probe=nd]').scrollIntoView({block:'center'}));
  await p.waitForTimeout(500); await p.click('[data-probe=nd]'); await p.waitForTimeout(900);
  await p.screenshot({path:OUT+'p29-quest-nondaries.png'});
  say('п.29 после клика: '+JSON.stringify(await state(p)));
  say('п.29 родной попап в DOM: '+JSON.stringify(await p.evaluate(()=>{
    const e=document.querySelector('[data-tooltip-hook="#popup:nondaries"]');
    return e?{label:e.getAttribute('aria-label'),title:e.querySelector('.t-popup__container .t-title,.t702__title,.t-name')?.textContent,
      selects:e.querySelectorAll('select').length,inputs:e.querySelectorAll('input').length,display:getComputedStyle(e).display}:null;})));
}
// ===== п.38 плашка «Бонус»
await p.goto(base+'/',{waitUntil:'networkidle'}); await p.waitForTimeout(2600);
const bon=await p.evaluate(()=>{const a=document.querySelector('.quiz-pop__link');return a?{href:a.getAttribute('href'),text:a.textContent.trim()}:null;});
say('п.38 плашка Бонус: '+JSON.stringify(bon));
await p.click('.quiz-pop__link'); await p.waitForTimeout(900);
await p.screenshot({path:OUT+'p38-bonus-click.png'});
say('п.38 после клика: '+JSON.stringify(await state(p)));
}catch(e){say('ERR '+e.message+'\n'+e.stack);}
await b.close();
})();
