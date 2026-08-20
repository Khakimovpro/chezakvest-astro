const {chromium}=require('playwright');
const OUT='/home/claude/che_za_kvest/work/tester-report/evidence/form-fields/';
(async()=>{
 const b=await chromium.launch();
 const p=await b.newPage({viewport:{width:1440,height:900}});
 await p.goto('http://127.0.0.1:4599/chezakvest-preview/',{waitUntil:'networkidle'});
 await p.waitForTimeout(3000);
 const form=p.locator('form[name="form1144740346"]');
 await form.scrollIntoViewIfNeeded();
 await p.waitForTimeout(600);
 await p.screenshot({path:OUT+'12-home-estvopros-before.png'});
 // 1) пустая отправка
 await p.locator('form[name="form1144740346"] button:has-text("Жду звонка")').click();
 await p.waitForTimeout(800);
 await p.screenshot({path:OUT+'12-home-estvopros-empty-submit.png'});
 const st=await p.evaluate(()=>{
   const f=document.querySelector('form[name="form1144740346"]');
   const sb=f.querySelector('.js-successbox');
   return {submitted:f.dataset.submitted, successDisplay:sb&&getComputedStyle(sb).display, successText:sb&&sb.textContent, successColor:sb&&getComputedStyle(sb).color, bg:sb&&getComputedStyle(sb).backgroundColor, inputsHidden:f.querySelector('.t-form__inputsbox')?.hidden, url:location.href};
 });
 console.log('EMPTY SUBMIT',JSON.stringify(st,null,1));
 await b.close();
})();
