import assert from 'node:assert/strict';
import test from 'node:test';
import {typograf} from '../src/lib/typograf.js';

test('Russian typography keeps particles, abbreviations, compounds and dashes readable',()=>{
 const cases=[
 ['Уверены ли вы в своих способностях','Уверены\u00a0ли вы в\u00a0своих способностях'],
 ['Игра в Кальмара – это формат','Игра в\u00a0Кальмара\u00a0— это формат'],
 ['ул. Магнитогорская, 1','ул.\u00a0Магнитогорская, 1'],
 ['на 40-летия Победы','на\u00a040-\u2060летия Победы'],
 ['ГАРРИ ПОТТЕР И КУБОК ОГНЯ','ГАРРИ ПОТТЕР И\u00a0КУБОК ОГНЯ'],
 ['Увлекательная шоу-программа','Увлекательная шоу-\u2060программа'],
 ['Вы и мы были бы рады','Вы и\u00a0мы были\u00a0бы рады'],
 ['60 минут\n2-24 игрока','60\u00a0минут\n2–24\u00a0игрока'],
 ];
 for(const [input,expected] of cases){assert.equal(typograf(input),expected);assert.equal(typograf(expected),expected,'idempotent');}
});
