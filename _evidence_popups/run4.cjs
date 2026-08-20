const fs=require('fs');
const {chromium}=require('playwright');
const OUT='/home/claude/che_za_kvest/work/tester-report/evidence/popups/';
const base='http://127.0.0.1:4599/chezakvest-preview';
const log=[]; const say=s=>{log.push(s);fs.writeFileSync(OUT+'log-run4.txt',log.join('\n'));console.log(s);};
const state=p=>p.evaluate(()=>({hash:location.hash,y:Math.round(scrollY),
  booking:getComputedStyle(document.querySelector('#source-booking')).display,
  title:document.querySelector('#source-booking h2')?.textContent,
  openPopups:[...document.querySelectorAll('.t-popup')].filter(e=>getComputedStyle(e).display!=='none').map(e=>e.getAttribute('data-tooltip-hook'))}));
async function probeCard(p,title){
  return await p.evaluate((t)=>{
    const a=[...document.querySelectorAll('a.t-card__link')].find(e=>e.textContent.trim()===t);
    if(!a) return null;
    const card=a.closest('.t959__card-inner')||a.closest('.t-card__col');
    const r=card?card.getBoundingClientRect():null;
    card&&card.setAttribute('data-probe-card','1');
    return {href:a.getAttribute('href'), cardWrapped:!!a.closest('a.t959__card-wrapper'),
      cardTag:card?card.tagName+'.'+card.className.slice(0,40):null};
  },title);
}
(async()=>{
const b=await chromium.launch();
try{
const p=await b.newPage({viewport:{width:1440,height:900}});

// ---- п.47: клик по плитке (не по тексту) на /kids/
await p.goto(base+'/kids/',{waitUntil:'networkidle'}); await p.waitForTimeout(3000);
say('п.47 карточка «Мафия»: '+JSON.stringify(await probeCard(p,'Мафия')));
await p.evaluate(()=>document.querySelector('[data-probe-card]').scrollIntoView({block:'center'}));
await p.waitForTimeout(600);
const box=await p.locator('[data-probe-card]').boundingBox();
await p.mouse.click(box.x+box.width/2, box.y+box.height*0.25); // по картинке, не по подписи
await p.waitForTimeout(900);
say('п.47 после клика по картинке карточки: '+JSON.stringify(await state(p)));
await p.screenshot({path:OUT+'p47-kids-tile-click.png'});
// клик по самому тексту
await p.evaluate(()=>{const a=[...document.querySelectorAll('a.t-card__link')].find(e=>e.textContent.trim()==='Мафия');a.setAttribute('data-probe','y');});
await p.click('[data-probe=y]'); await p.waitForTimeout(900);
say('п.47 после клика по подписи: '+JSON.stringify(await state(p)));
await p.screenshot({path:OUT+'p47-kids-title-click.png'});

// ---- /new-year/ : п.66, 69, 70, 71
await p.goto(base+'/new-year/',{waitUntil:'networkidle'}); await p.waitForTimeout(3000);
say('new-year: попапы = '+JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('.t-popup')].map(e=>({h:e.getAttribute('data-tooltip-hook'),l:e.getAttribute('aria-label')})))));
say('new-year: source-quiz-cta = '+JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('.source-quiz-cta')].map(e=>({t:e.textContent.trim().slice(0,60),href:e.querySelector('a')?.getAttribute('href')})))));
say('п.69 карточка шоу «Мафия»: '+JSON.stringify(await probeCard(p,'Мафия')));
say('п.70 «Забронировать дату»: '+JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('a')].filter(a=>/Забронировать дату/i.test(a.textContent)).map(a=>a.getAttribute('href')))));

// ---- /den-rozhdeniya-na-vr-arene/ : п.75, 77
await p.goto(base+'/den-rozhdeniya-na-vr-arene/',{waitUntil:'networkidle'}); await p.waitForTimeout(3000);
say('VR: попапы = '+JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('.t-popup')].map(e=>({h:e.getAttribute('data-tooltip-hook'),l:e.getAttribute('aria-label')})))));
say('п.75 кнопки: '+JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('a')].filter(a=>/Рассчитать стоимость|Подобрать игру|Узнать стоимость|Заказать сертификат/i.test(a.textContent)).map(a=>({t:a.textContent.trim().slice(0,40),href:a.getAttribute('href')})))));
}catch(e){say('ERR '+e.message+'\n'+e.stack);}
await b.close();
})();
