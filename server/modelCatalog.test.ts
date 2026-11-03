import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenPriceCategory, parameterBillions, sortCatalogModels } from '../shared/modelCatalog';
test('only explicit OpenRouter input and output zero prices are marked free', () => {
  assert.equal(tokenPriceCategory('openrouter',{prompt:'0',completion:'0.000'}),'free');
  assert.equal(tokenPriceCategory('openrouter',{prompt:'0',completion:'0.0001'}),'paid');
  for (const pricing of [null,{}, {prompt:'0'}, {prompt:'',completion:'0'}, {prompt:'-1',completion:0}, {prompt:'invalid',completion:0}]) assert.equal(tokenPriceCategory('openrouter',pricing),'unknown');
  assert.equal(tokenPriceCategory('groq',{prompt:0,completion:0}),'unknown');
});
test('free models sort first, larger known sizes first; unknown prices never labeled free', () => {
  const m=(id:string,priceCategory:'free'|'unknown'|'paid')=>({provider:'openrouter',name:id,id,priceCategory});
  const models=[m('paid-120b','paid'),m('free-8b','free'),m('unknown-400b','unknown'),m('free-no-size','free'),m('free-70b','free')];
  assert.deepEqual(sortCatalogModels(models).map(x=>x.id), ['free-70b','free-8b','free-no-size','unknown-400b','paid-120b']);
  assert.equal(models[0].id,'paid-120b');
  assert.equal(parameterBillions(m('mixtral-8x7b-instruct','free')),null);
});
