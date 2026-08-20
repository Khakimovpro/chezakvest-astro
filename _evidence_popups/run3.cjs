const fs=require('fs');
const {chromium}=require('playwright');
const OUT='/home/claude/che_za_kvest/work/tester-report/evidence/popups/';
const base='http://127.0.0.1:4599/chezakvest-preview';
const log=[]; const say=s=>{log.push(s);fs.writeFileSync(OUT+'log-run3.txt',log.join('\n'));console.log(s);};
const state=p=>p.evaluate(()=>({hash:location.hash,y:Math.round(scrollY),
  booking:getComputedStyle(document.querySelector('#source-booking')).display,
  title:document.querySelector('#source-booking h2')?.textContent,
  openPopups:[...document.querySelectorAll('.t-popup')].filter(e=>getComputedStyle(e).display!=='none').map(e=>e.getAttribute('data-tooltip-hook'))}));
async function clickByText(p,rx,tag='a'){
  const ok=await p.evaluate(([rxs,tag])=>{
    const rx=new RegExp(rxs,'i');
    const el=[...document.querySelectorAll(tag)].find(e=>rx.test((e.textContent||'').trim()));
    if(!el) return null; el.setAttribute('data-probe','x'); el.scrollIntoView({block:'center'});
    return {href:el.getAttribute('href'),text:(el.textContent||'').trim().slice(0,50)};
  },[rx,tag]);
  if(!ok) return null;
  await p.waitForTimeout(500);
  const y0=await p.evaluate(()=>Math.round(scrollY));
  try{ await p.click('[data-probe=x]',{timeout:5000}); }catch(e){ ok.clickErr=e.message.slice(0,90); }
  await p.waitForTimeout(900);
  ok.y0=y0; ok.after=await state(p);
  await p.evaluate(()=>document.querySelector('[data-probe=x]')?.removeAttribute('data-probe'));
  return ok;
}
(async()=>{
const b=await chromium.launch();
try{
const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto(base+'/kids/',{waitUntil:'networkidle'}); await p.waitForTimeout(3000);
say('kids: попапы в DOM = '+JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('.t-popup')].map(e=>({h:e.getAttribute('data-tooltip-hook'),l:e.getAttribute('aria-label')})))));
say('kids: якорь #openquiz = '+await p.evaluate(()=>!!document.getElementById('openquiz')));
say('п.40 «Узнать стоимость»: '+JSON.stringify(await clickByText(p,'^Узнать стоимость$')));
await p.screenshot({path:OUT+'p40-kids-uznat-stoimost.png'});
await p.goto(base+'/kids/',{waitUntil:'networkidle'}); await p.waitForTimeout(3000);
say('п.50 «Забронировать дату»: '+JSON.stringify(await clickByText(p,'^Забронировать дату$')));
await p.screenshot({path:OUT+'p50-kids-zabronirovat-datu.png'});
await p.goto(base+'/kids/',{waitUntil:'networkidle'}); await p.waitForTimeout(3000);
say('п.61 «Создать пригласительный»: '+JSON.stringify(await clickByText(p,'Создать пригласительный')));
await p.screenshot({path:OUT+'p61-kids-priglasitelnyj.png'});
// п.47 плитки шоу-программы (ориг. #popup:calculatershow)
await p.goto(base+'/kids/',{waitUntil:'networkidle'}); await p.waitForTimeout(3000);
const tiles=await p.evaluate(()=>{
  const out=[];
  ['Мафия','Зельеварение','Нащупал','Угадай мелодию'].forEach(t=>{
    const el=[...document.querySelectorAll('.t396__elem,.tn-atom,a,div')].find(e=>(e.textContent||'').trim()===t);
    if(el){const a=el.closest('a');out.push({t,tag:el.tagName,cls:String(el.className).slice(0,60),anchor:a?a.getAttribute('href'):null});}
  });
  return out;});
say('п.47 плитки шоу-программы: '+JSON.stringify(tiles));
}catch(e){say('ERR '+e.message+'\n'+e.stack);}
await b.close();
})();
