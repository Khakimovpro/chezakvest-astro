const {chromium}=require('playwright');
const OUT='/home/claude/che_za_kvest/work/tester-report/evidence/form-fields/';
(async()=>{
 const b=await chromium.launch();
 const p=await b.newPage({viewport:{width:1440,height:900}});
 // --- п.20: страница адреса, форма «У нас вы можете отметить День рождения!»
 await p.goto('http://127.0.0.1:4599/chezakvest-preview/magnitogorskaya1/',{waitUntil:'networkidle'});
 await p.waitForTimeout(3000);
 const dp=p.locator('input.t-datepicker').first();
 await dp.scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
 await p.screenshot({path:OUT+'20-venue-date-before.png'});
 await dp.click(); await p.waitForTimeout(700);
 await dp.type('12'); await p.waitForTimeout(300);
 const st1=await p.evaluate(()=>{const i=document.querySelector('input.t-datepicker');return{value:i.value,type:i.type,panels:document.querySelectorAll('.t_datepicker__inner,.t-datepicker__inner,[class*=datepicker][class*=inner]').length};});
 console.log('VENUE DATEPICKER',JSON.stringify(st1));
 await p.screenshot({path:OUT+'20-venue-date-click-no-calendar.png'});
 // иконка календаря
 const icon=p.locator('svg.t-datepicker__icon').first();
 if(await icon.count()){ await icon.click({force:true}); await p.waitForTimeout(700);
   const st2=await p.evaluate(()=>document.querySelectorAll('[class*=datepicker][class*=inner],.t-datepicker__blocks').length);
   console.log('ICON CLICK panels=',st2);
   await p.screenshot({path:OUT+'20-venue-date-icon-click.png'});
 }
 // --- п.58: /kids/ конструктор пригласительного
 await p.goto('http://127.0.0.1:4599/chezakvest-preview/kids/',{waitUntil:'networkidle'});
 await p.waitForTimeout(3500);
 const inv=p.locator('input[name="date"][id="input_1719957545596"]');
 console.log('inv count',await inv.count());
 if(await inv.count()){
   await inv.scrollIntoViewIfNeeded(); await p.waitForTimeout(500);
   await p.screenshot({path:OUT+'58-kids-invite-before.png'});
   await inv.click(); await p.waitForTimeout(700);
   const st3=await p.evaluate(()=>({panels:document.querySelectorAll('[class*=datepicker][class*=inner],.t-datepicker__blocks').length}));
   console.log('INVITE DATE CLICK',JSON.stringify(st3));
   await p.screenshot({path:OUT+'58-kids-invite-date-click.png'});
   const icon2=p.locator('#input_1719957545596 ~ svg.t-datepicker__icon');
   if(await icon2.count()){await icon2.click({force:true}); await p.waitForTimeout(700);
     console.log('INVITE ICON panels=',await p.evaluate(()=>document.querySelectorAll('[class*=datepicker][class*=inner],.t-datepicker__blocks').length));
     await p.screenshot({path:OUT+'58-kids-invite-icon-click.png'});}
 }
 // --- п.51: форма «Проведите День Рождения вместе с нами»
 const bd=p.locator('form:has-text("ОТПРАВИТЬ")');
 await b.close();
})();
