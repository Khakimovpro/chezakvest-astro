const {chromium}=require('playwright');
const OUT='/home/claude/che_za_kvest/work/tester-report/evidence/form-fields/';
(async()=>{
 const b=await chromium.launch();
 const p=await b.newPage({viewport:{width:1440,height:900}});
 await p.goto('http://127.0.0.1:4599/chezakvest-preview/magnitogorskaya1/',{waitUntil:'networkidle'});
 await p.waitForTimeout(3000);
 // принудительно показываем родной попап Tilda, чтобы снять состояние полей
 await p.evaluate(()=>{
   const inp=document.querySelector('input.t-datepicker');
   const pop=inp.closest('.t-popup');
   pop.style.display='block'; pop.style.opacity='1'; pop.style.visibility='visible';
   pop.classList.add('t-popup_show');
   inp.scrollIntoView({block:'center'});
 });
 await p.waitForTimeout(600);
 await p.screenshot({path:OUT+'20-venue-popup-forced.png'});
 const dp=p.locator('input.t-datepicker').first();
 await dp.click({force:true}); await p.waitForTimeout(600);
 const st=await p.evaluate(()=>{const i=document.querySelector('input.t-datepicker');return{type:i.type,mask:i.dataset.tildaMask,rule:i.dataset.tildaRule,req:i.required,panels:document.querySelectorAll('[class*=datepicker][class*=inner],.t-datepicker__blocks,.t-datepicker__months').length};});
 console.log('FORCED POPUP DATE',JSON.stringify(st));
 await dp.type('abcdef',{delay:40}); await p.waitForTimeout(300);
 console.log('typed value =',await dp.inputValue());
 await p.screenshot({path:OUT+'20-venue-popup-date-typed.png'});
 await b.close();
})();
