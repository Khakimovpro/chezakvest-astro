const {chromium}=require('playwright');
const OUT='/home/claude/che_za_kvest/work/tester-report/evidence/form-fields/';
(async()=>{
 const b=await chromium.launch();
 const p=await b.newPage({viewport:{width:1440,height:900}});
 await p.goto('http://127.0.0.1:4599/chezakvest-preview/',{waitUntil:'networkidle'});
 await p.waitForTimeout(3000);
 const sel='form[name="form1144740346"]';
 await p.locator(sel).scrollIntoViewIfNeeded();
 await p.waitForTimeout(500);
 // клик по флагу
 await p.locator(sel+' .t-input-phonemask__select').click();
 await p.waitForTimeout(600);
 const after=await p.evaluate(()=>({options:document.querySelectorAll('.t-input-phonemask__options, .t-input-phonemask__select-list, [class*=phonemask][class*=option]').length}));
 console.log('FLAG CLICK ->',JSON.stringify(after));
 await p.screenshot({path:OUT+'13-flag-click-no-dropdown.png',clip:{x:120,y:250,width:1200,height:420}});
 // мусор в телефон
 await p.locator(sel+' input.t-input-phonemask').fill('asdf!!!123');
 await p.waitForTimeout(300);
 const v=await p.evaluate(()=>{const i=document.querySelector('form[name="form1144740346"] input.t-input-phonemask');const h=document.querySelector('form[name="form1144740346"] input.js-phonemask-result');return {visible:i.value, hidden:h?h.value:'(нет скрытого)', validity:i.validity.valid};});
 console.log('GARBAGE PHONE',JSON.stringify(v));
 await p.locator(sel+' input[name="name"]').fill('фыва');
 await p.locator(sel+' input[type="checkbox"]').check();
 await p.screenshot({path:OUT+'52-garbage-phone-before-submit.png',clip:{x:120,y:250,width:1200,height:420}});
 await p.locator(sel+' button:has-text("Жду звонка")').click();
 await p.waitForTimeout(800);
 await p.screenshot({path:OUT+'52-garbage-phone-accepted.png',clip:{x:120,y:250,width:1200,height:450}});
 const st=await p.evaluate(()=>{const f=document.querySelector('form[name="form1144740346"]');const ib=f.querySelector('.t-form__inputsbox');return{submitted:f.dataset.submitted, inputsboxHiddenAttr:ib.hidden, inputsboxDisplay:getComputedStyle(ib).display, errBoxes:[...f.querySelectorAll('.t-input-error')].map(e=>e.textContent)};});
 console.log('AFTER GARBAGE SUBMIT',JSON.stringify(st));
 await b.close();
})();
