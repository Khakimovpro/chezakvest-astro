const {chromium}=require('playwright');
const OUT='/home/claude/che_za_kvest/work/tester-report/evidence/form-fields/';
(async()=>{
 const b=await chromium.launch();
 const p=await b.newPage({viewport:{width:1440,height:900}});
 await p.goto('https://xn--80aehcht5ci1b.xn--p1ai/',{waitUntil:'domcontentloaded',timeout:60000});
 await p.waitForTimeout(9000);
 const f='form[name="form1144740346"]';
 const has=await p.locator(f).count();
 console.log('form present',has);
 await p.locator(f).scrollIntoViewIfNeeded(); await p.waitForTimeout(1200);
 await p.screenshot({path:OUT+'origin-12-estvopros-before.png'});
 // 1) клик по флагу -> список стран
 await p.locator(f+' .t-input-phonemask__select').click();
 await p.waitForTimeout(900);
 const drop=await p.evaluate(()=>{
   const el=document.querySelector('.t-input-phonemask__options, .t-input-phonemask__wrapper-options, [class*="phonemask__options"]');
   return el?{cls:el.className, items:el.querySelectorAll('li,div[data-phonemask-iso],[class*=option-item]').length, display:getComputedStyle(el).display}:null;
 });
 console.log('DROPDOWN',JSON.stringify(drop));
 await p.screenshot({path:OUT+'origin-13-country-dropdown.png'});
 await p.keyboard.press('Escape');
 // 2) маска
 await p.locator(f+' input.t-input-phonemask').click();
 await p.locator(f+' input.t-input-phonemask').type('9282163623',{delay:60});
 await p.waitForTimeout(400);
 const v=await p.evaluate(()=>{const i=document.querySelector('form[name="form1144740346"] input.t-input-phonemask');const h=document.querySelector('form[name="form1144740346"] input.js-phonemask-result');return{visible:i.value,hidden:h?h.value:null};});
 console.log('MASK RESULT',JSON.stringify(v));
 await p.screenshot({path:OUT+'origin-13-mask-typed.png'});
 // 3) мусор
 await p.locator(f+' input.t-input-phonemask').fill('');
 await p.locator(f+' input.t-input-phonemask').type('asdf!!!123',{delay:50});
 await p.waitForTimeout(400);
 console.log('GARBAGE ORIGIN =',await p.locator(f+' input.t-input-phonemask').inputValue());
 await p.screenshot({path:OUT+'origin-52-garbage-rejected.png'});
 // 4) пустая отправка
 await p.locator(f+' input.t-input-phonemask').fill('');
 await p.locator(f+' button:has-text("Жду звонка")').click();
 await p.waitForTimeout(1500);
 const errs=await p.evaluate(()=>{const fo=document.querySelector('form[name="form1144740346"]');return{errors:[...fo.querySelectorAll('.t-input-error')].map(e=>e.textContent.trim()),success:getComputedStyle(fo.querySelector('.js-successbox')).display};});
 console.log('EMPTY SUBMIT ORIGIN',JSON.stringify(errs));
 await p.screenshot({path:OUT+'origin-12-empty-submit-errors.png'});
 await b.close();
})();
