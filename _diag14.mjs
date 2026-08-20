import { chromium } from 'playwright';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:900}});
const p=await ctx.newPage();
const cdp=await ctx.newCDPSession(p);
await cdp.send('Debugger.enable');
const scripts=new Map();
cdp.on('Debugger.scriptParsed',e=>scripts.set(e.scriptId,e.url));
await p.goto('https://xn--80aehcht5ci1b.xn--p1ai/',{waitUntil:'domcontentloaded',timeout:90000});
await p.waitForTimeout(8000);
const {result}=await cdp.send('Runtime.evaluate',{expression:"document.querySelector('.t-slds__item_active .t604__imgwrapper')"});
const l=await cdp.send('DOMDebugger.getEventListeners',{objectId:result.objectId, depth:-1, pierce:true});
for(const li of l.listeners){
  console.log(li.type, '->', scripts.get(li.scriptId), 'line', li.lineNumber, 'col', li.columnNumber);
  try{
    const src=await cdp.send('Debugger.getScriptSource',{scriptId:li.scriptId});
    const lines=src.scriptSource.split('\n');
    const line=lines[li.lineNumber]||'';
    console.log('SNIPPET:', line.slice(Math.max(0,li.columnNumber-900), li.columnNumber+600));
  }catch(e){console.log('src err',String(e).slice(0,80));}
}
await b.close();
