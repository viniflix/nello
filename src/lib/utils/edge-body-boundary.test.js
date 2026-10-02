import { expect, it } from 'vitest';
import { boundedBody } from '../../../supabase/functions/_shared/http.ts';

it('rejects a completed small overflow without retaining the oversized body', async () => {
  const req = new Request('http://localhost', {method:'POST',body:new Uint8Array(70000),headers:{'content-length':'70000'}});
  await expect(boundedBody(req,65536)).rejects.toMatchObject({status:413,code:'request_too_large'});
  expect(req.bodyUsed).toBe(true);
});
it('retains the original accepted byte limit and stops a much larger upload', async () => {
  expect((await boundedBody(new Request('http://localhost',{method:'POST',body:new Uint8Array(65536)}),65536)).byteLength).toBe(65536);
  await expect(boundedBody(new Request('http://localhost',{method:'POST',body:new Uint8Array(200000)}),65536)).rejects.toMatchObject({status:413});
});
it('rejects dishonest chunked length and malformed length headers', async () => {
  await expect(boundedBody(new Request('http://localhost',{method:'POST',body:new Uint8Array(70000),headers:{'content-length':'1'}}),65536)).rejects.toMatchObject({status:413});
  await expect(boundedBody(new Request('http://localhost',{method:'POST',body:'x',headers:{'content-length':'invalid'}}),65536)).rejects.toMatchObject({status:413});
});
it('bounds slow streams by the original deadline', async () => {
  const body = new ReadableStream({start(){}});
  await expect(boundedBody(new Request('http://localhost',{method:'POST',body,duplex:'half'}),65536,10)).rejects.toMatchObject({status:408});
});
