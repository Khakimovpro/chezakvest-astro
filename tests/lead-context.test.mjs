import test from 'node:test';
import assert from 'node:assert/strict';
import { visitContext } from '../src/scripts/lead-context.js';

test('first attribution survives direct and campaign visits for thirty days then expires',()=>{
  const entries=new Map();
  const storage={getItem:key=>entries.get(key),setItem:(key,value)=>entries.set(key,value)};
  const first=visitContext({storage,url:'https://site.test/?utm_source=test&yclid=123',referrer:'https://search.test/',now:1000});
  assert.equal(first.utm_source,'test');
  for(const url of ['https://site.test/','https://site.test/?utm_source=other']) {
    assert.deepEqual(visitContext({storage,url,now:2000}),first);
  }
  const expired=visitContext({storage,url:'https://site.test/?utm_source=new',now:1000+31*86400000});
  assert.equal(expired.utm_source,'new');
  assert.equal(expired.yclid,'');
});

test('denied or corrupt storage does not prevent attribution',()=>{
  const storage={getItem(){throw Error('denied');},setItem(){throw Error('denied');}};
  assert.equal(visitContext({storage,url:'https://site.test/?utm_source=test'}).utm_source,'test');
});
