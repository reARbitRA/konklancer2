import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listManagedModels, callManagedModel } from '../src/services/managedLLM';
import { setAuthAccessToken } from '../src/services/authToken';

test('managed preview requests models and generation without a browser credential', async () => {
  const original=globalThis.fetch;
  setAuthAccessToken(null);
  const requests:any[]=[];
  globalThis.fetch=(async (url:any,init:any)=>{requests.push({url,init});return new Response(JSON.stringify(init.method==='POST'?{text:'ok',model:'model',provider:'openrouter'}:{providers:[]}),{headers:{'content-type':'application/json'}});}) as typeof fetch;
  try {
    await listManagedModels();
    const result=await callManagedModel({id:'model',name:'Model',provider:'openrouter'},{prompt:'hello'});
    assert.equal(result.text,'ok');
    assert.equal(requests[0].url,'/api/models');
    assert.equal(requests[0].init.headers.Authorization,undefined);
    assert.equal(requests[1].init.headers.Authorization,undefined);
  } finally {globalThis.fetch=original;}
});
