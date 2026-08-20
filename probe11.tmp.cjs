const {chromium}=require('playwright');
const OUT='/home/claude/che_za_kvest/work/tester-report/evidence/form-fields/';
(async()=>{
 const b=await chromium.launch();
 const p=await b.newPage({viewport:{width:1440,height:900}});
 await p.goto('http://127.0.0.1:4599/chezakvest-preview/kids/',{waitUntil:'networkidle'});
 await p.waitForTimeout(4000);
 const inv=p.locator('#input_1719957545596');
 await inv.scrollIntoViewIfNeeded(); await p.waitForTimeout(600);
 await p.screenshot({path:OUT+'58-kids-invite-before.png'});
 await inv.click(); await p.waitForTimeout(700);
 let st=await p.evaluate(()=>({panels:document.querySelectorAll('[class*=datepicker][class*=inner],.t-datepicker__blocks,.t-datepicker__months').length}));
 console.log('CLICK INPUT panels',JSON.stringify(st));
 await p.screenshot({path:OUT+'58-kids-invite-date-click.png'});
 // клик по иконке календаря
 await p.evaluate(()=>{const i=document.querySelector('#input_1719957545596');const svg=i.parentElement.querySelector('svg.t-datepicker__icon');svg.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
 await p.waitForTimeout(700);
 st=await p.evaluate(()=>({panels:document.querySelectorAll('[class*=datepicker][class*=inner],.t-datepicker__blocks,.t-datepicker__months').length}));
 console.log('CLICK ICON panels',JSON.stringify(st));
 await inv.type('abc/xyz',{delay:40}); await p.waitForTimeout(300);
 console.log('typed=',await inv.inputValue());
 await p.screenshot({path:OUT+'58-kids-invite-icon-click.png'});
 // телефон в этой же секции
 const ph=await p.evaluate(()=>{
   const rec=document.querySelector('#rec844797134');
   return [...rec.querySelectorAll('input')].map(i=>({name:i.name,cls:i.className,ph:i.placeholder,type:i.type,req:i.required,mask:i.dataset.phonemaskMask||null}));
 });
 console.log('INVITE SECTION INPUTS',JSON.stringify(ph,null,1));
 await b.close();
})();
