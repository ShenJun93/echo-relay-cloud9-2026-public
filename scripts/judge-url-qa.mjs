/**
 * P42 — judge-accessible release smoke test: URL + pinned bundle + fresh browsers.
 * Requires ECHO_RELAY_PUBLIC_URL=https://approved-domain/ for actual publication QA.
 * The flag --local-test ONLY permits http://127.0.0.1 for local dry-run.
 * Does not deploy/upload, modify server files, or perform account operations.
 */
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";

const allowLocal = process.argv.includes("--local-test");
const target = process.env.ECHO_RELAY_PUBLIC_URL;
assert.ok(target, "ECHO_RELAY_PUBLIC_URL is required; no default domain");
const pinnedCommit = process.env.ECHO_RELAY_PINNED_COMMIT;
assert.match(pinnedCommit ?? "", /^[0-9a-f]{40}$/, "Exact 40-character pinned commit required");
const localCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding:"utf8" }).trim();
assert.equal(localCommit, pinnedCommit, "Local source HEAD differs from asserted public-release commit");
const url = new URL(target);
assert.equal(url.username, "", "Credentials in demo URL are forbidden");
assert.equal(url.password, "", "Credentials in demo URL are forbidden");
assert.equal(url.pathname, "/", "Game is a root-scope PWA. Use domain root '/'");
assert.equal(url.search, "", "Demo URL query parameters forbidden");
assert.equal(url.hash, "", "Demo URL fragment forbidden");
if (allowLocal) {
  assert.equal(url.hostname, "127.0.0.1", "Local-test flag only permits 127.0.0.1");
  assert.equal(url.protocol, "http:");
} else {
  assert.equal(url.protocol, "https:", "Public demo MUST use HTTPS");
  assert.ok(!["localhost", "127.0.0.1"].includes(url.hostname), "Public demo must be external");
}
const base = url.origin;
const site = base + "/";
const folder = resolve("dist");
const encoder = data => createHash("sha256").update(data).digest("hex");
const checkMIME = (res, expected) => assert.equal(
  (res.headers.get("content-type") || "").split(";")[0].toLowerCase(),
  expected, "Wrong MIME: " + res.url
);
const binary = async (file) => Buffer.from(await readFile(resolve(folder,file)));
const httpGet = async (path) => {
  const res = await fetch(base + path, { redirect:"manual", signal:AbortSignal.timeout(20000) });
  assert.equal(res.status, 200, "Public asset status is not 200: " + path);
  return res;
};
const exe = process.env.EDGE_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const errors=[];
const blockedExternal=[];
const fileEvidence=[];
let browser;
try {
  const indexResp=await httpGet("/");
  checkMIME(indexResp,"text/html");
  const html=await indexResp.text();
  assert.match(html, /<title>ECHO\/\/RELAY/);
  const js=[...html.matchAll(/\bsrc="(\/assets\/[^"]+\.js)"/g)].map(m=>m[1]);
  const css=[...html.matchAll(/\bhref="(\/assets\/[^"]+\.css)"/g)].map(m=>m[1]);
  assert.equal(js.length,1,"Expected exactly one release JavaScript asset");
  assert.equal(css.length,1,"Expected exactly one release CSS asset");
  assert.ok(html.includes('href="/favicon.svg"'),"Root favicon missing");

  for(const path of [...js,...css,"/sw.js","/favicon.svg"]){
    const response=await httpGet(path);
    const mime=path.endsWith(".js")?"text/javascript":path.endsWith(".css")?"text/css":path.endsWith(".svg")?"image/svg+xml":"text/javascript";
    // Different legitimate JavaScript media types are possible across CDNs.
    if(path.endsWith(".js"))assert.ok(["text/javascript","application/javascript"].includes((response.headers.get("content-type")||"").split(";")[0]),"Invalid JS content type "+path);
    else checkMIME(response,mime);
    const served=Buffer.from(await response.arrayBuffer());
    const expected=await binary(path.slice(1));
    // SVG copy step preserves checkout line endings: Windows CRLF vs Linux LF is harmless.
    const normalizeSVG = data => Buffer.from(data.toString("utf8").replace(/\r\n/g,"\n"),"utf8");
    const actualDigest=path.endsWith(".svg")?encoder(normalizeSVG(served)):encoder(served);
    const expectedDigest=path.endsWith(".svg")?encoder(normalizeSVG(expected)):encoder(expected);
    assert.equal(actualDigest,expectedDigest,"Public asset does not match local pinned build: "+path);
    fileEvidence.push({path,bytes:served.length,sha256:encoder(served),comparison:path.endsWith(".svg")?"normalized-SVG-LF":"byte-exact"});
  }
  const missing=await fetch(base+"/assets/p42-nonexistent-12345678.js",{redirect:"manual",signal:AbortSignal.timeout(20000)});
  const missingMime=(missing.headers.get("content-type")||"").split(";")[0].toLowerCase();
  assert.ok(!["text/javascript","application/javascript"].includes(missingMime),"Missing script incorrectly returned JS MIME");

  browser=await chromium.launch({executablePath:exe,headless:true});
  async function makeContext(viewport,withTouch){
    const ctx=await browser.newContext({
      viewport,deviceScaleFactor:1,hasTouch:withTouch,reducedMotion:"reduce",serviceWorkers:"allow",
      acceptDownloads:false,permissions:[]
    });
    const page=await ctx.newPage();
    page.on("pageerror",e=>errors.push({kind:"pageerror",message:e.message}));
    page.on("console",m=>{if(m.type()==="error")errors.push({kind:"console",message:m.text().slice(0,300)})});
    page.on("request",req=>{try{const u=new URL(req.url()); if(u.protocol.startsWith("http") && u.origin!==base)blockedExternal.push({type:"external",host:u.hostname})}catch{}});
    return {ctx,page};
  }
  const {ctx:mobileContext,page:mobile}=await makeContext({width:375,height:812},true);
  const response=await mobile.goto(site,{waitUntil:"networkidle",timeout:30000});
  assert.equal(response.status(),200);
  assert.equal(mobile.url(),site,"Unexpected redirect from public game");
  await mobile.getByRole("button",{name:"START 60-SECOND RUN"}).waitFor({timeout:12000});
  const firstVisit=await mobile.evaluate(()=>({
    localRecords:localStorage.getItem("echo-relay-booth-scores-v3"),
    buttons:document.querySelectorAll("button").length,
    w:document.documentElement.clientWidth,
    scrollW:document.documentElement.scrollWidth,
    canvasWidth:document.querySelector("#arena")?.getBoundingClientRect().width,
    title:document.title,
  }));
  assert.equal(firstVisit.localRecords,null,"Fresh browser unexpectedly contains player scores");
  assert.ok(firstVisit.scrollW<=firstVisit.w+2,"Horizontal scroll on fresh mobile page");
  assert.ok(firstVisit.canvasWidth>300,"Mobile canvas not readable");
  await mobile.getByRole("button",{name:"START 60-SECOND RUN"}).click();
  await mobile.getByText("LINK ACTIVE",{exact:true}).waitFor();
  await mobile.locator("#arena").tap({position:{x:130,y:110}});
  await mobile.getByText(/channel\./).first().waitFor({timeout:10000});
  await mobile.waitForTimeout(1100);
  assert.ok(Number(await mobile.locator("#time-left").textContent())<60);
  await mobile.waitForFunction(()=>!!navigator.serviceWorker?.controller,{timeout:18000});
  const preOffline=await mobile.evaluate(async()=>({
    controlled:!!navigator.serviceWorker?.controller,
    cacheNames:await caches.keys(),
  }));
  assert.ok(preOffline.cacheNames.some(x=>x.startsWith("echo-relay-event-")),"SW cache absent");
  await mobileContext.setOffline(true);
  await mobile.reload({waitUntil:"domcontentloaded",timeout:20000});
  const afterOffline=await mobile.evaluate(()=>({
    online:navigator.onLine,controller:!!navigator.serviceWorker?.controller,
  }));
  assert.equal(afterOffline.online,false);
  assert.equal(afterOffline.controller,true);
  await mobile.getByRole("button",{name:"START 60-SECOND RUN"}).waitFor({timeout:10000});
  await mobile.getByRole("button",{name:"START 60-SECOND RUN"}).click();
  await mobile.getByText("LINK ACTIVE",{exact:true}).waitFor();
  assert.match(await mobile.locator("#offline-status").textContent(),/OFFLINE PLAY READY/);
  await mobileContext.close();

  const {ctx:desktopContext,page:desktop}=await makeContext({width:1366,height:768},false);
  const desktopResponse=await desktop.goto(site,{waitUntil:"networkidle",timeout:30000});
  assert.equal(desktopResponse.status(),200);
  await desktop.getByRole("button",{name:"START 60-SECOND RUN"}).click();
  await desktop.getByText("LINK ACTIVE",{exact:true}).waitFor();
  await desktop.locator("#arena").focus();
  await desktop.keyboard.press("Space");
  await desktop.locator("#announcer").getByText(/channel\./).waitFor();
  assert.ok(await desktop.locator("#switch-button").isEnabled());
  await desktopContext.close();
  assert.equal(errors.length,0,"Browser JS errors: "+JSON.stringify(errors));
  assert.equal(blockedExternal.length,0,"Unexpected third party requests: "+JSON.stringify(blockedExternal));

  const receipt={
    tag:"P42_JUDGE_URL_QA_PASS",type:allowLocal?"LOCAL_DRY_RUN":"PUBLIC_HTTPS",
    url_origin:site,source_commit:pinnedCommit,
    asset_checks:fileEvidence,mobile_fresh_visit:firstVisit,service_worker:preOffline,
    offline_reload:afterOffline,desktop_keyboard:true,javaScript_errors:0,external_http_requests:0,
    limitation:"This test confirms start/input/offline and pinned assets, but does not claim human playtesting or a full real-time 60s round."
  };
  console.log("P42_JUDGE_URL_QA_PASS "+JSON.stringify(receipt));
} finally {
  await browser?.close();
}
