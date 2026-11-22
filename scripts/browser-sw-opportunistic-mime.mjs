import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve,join,extname } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const root=resolve("dist");
const index=await readFile(join(root,"index.html"));
const probe="/assets/__missing_js_spa_fallback.js";
const payload="globalThis.__assetMimeProbe = true;";
let fixed=false;
const mimeType={".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"};
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url??"/","http://127.0.0.1").pathname;
  res.setHeader("Cache-Control","no-store");
  if(pathname===probe){
    res.writeHead(200,{"Content-Type":fixed?"text/javascript":"text/html"});
    res.end(fixed?payload:index);return;
  }
  const path=pathname==="/"?join(root,"index.html"):join(root,pathname.slice(1));
  try{
    const bytes=await readFile(path);
    res.writeHead(200,{"Content-Type":mimeType[extname(path)]??"text/html"});
    res.end(bytes);
  }catch{res.writeHead(404,{"Content-Type":"text/plain"}).end("Not found");}
});
await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
const origin="http://127.0.0.1:"+server.address().port+"/";
let browser;
try {
  browser=await chromium.launch({
    executablePath:process.env.EDGE_PATH||"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless:true,
  });
  const context=await browser.newContext({serviceWorkers:"allow"});
  const page=await context.newPage();
  await page.goto(origin,{waitUntil:"load"});
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.waitForFunction(()=>navigator.serviceWorker.controller!==null,{timeout:15000});
  const getCache=()=>page.evaluate(async path=>{
    const c=await caches.open("echo-relay-event-v4");
    const value=await c.match(path);
    return value&&{mime:value.headers.get("Content-Type"),body:await value.text()};
  },probe);
  const bad=await page.evaluate(path=>fetch(path).then(r=>({
    status:r.status,mime:r.headers.get("Content-Type"),
  })),probe);
  assert.equal(bad.status,200);
  assert.match(bad.mime,/text\/html/i);
  assert.equal(await getCache(),undefined,
    "Never store HTTP 200 text/html SPA fallback in JS asset cache");
  fixed=true;
  // Inject the invalid cache value that older service workers could leave.
  await page.evaluate(async({path,body})=>{
    const cache=await caches.open("echo-relay-event-v4");
    await cache.put(path,new Response(body,{headers:{"Content-Type":"text/html"}}));
  },{path:probe,body:index.toString("utf8")});
  const repaired=await page.evaluate(async path=>{
    const res=await fetch(path);
    return {status:res.status,mime:res.headers.get("Content-Type"),body:await res.text()};
  },probe);
  assert.equal(repaired.status,200);
  assert.match(repaired.mime,/javascript/i,"Reject previously cached HTML and refetch real JS");
  assert.equal(repaired.body,payload);
  const cached=await getCache();
  assert.match(cached?.mime??"",/javascript/i);
  assert.equal(cached?.body,payload);
  await context.setOffline(true);
  const offline=await page.evaluate(async path=>{
    const res=await fetch(path);
    return {status:res.status,mime:res.headers.get("Content-Type"),body:await res.text()};
  },probe);
  assert.equal(offline.status,200);
  assert.match(offline.mime,/javascript/i);
  assert.equal(offline.body,payload);
  console.log(JSON.stringify({status:"PASS",fallbackIgnored:true,poisonRecovered:true,offlineValidAsset:true,content:cached?.mime}));
  await context.close();
} finally { await browser?.close(); await new Promise(ok=>server.close(ok)); }
