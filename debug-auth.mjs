import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const USER_DATA_DIR = path.resolve("./.tmp-edge-profile-debug");

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const edge = spawn(EDGE_PATH, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--remote-debugging-port=9223",
    `--user-data-dir=${USER_DATA_DIR}`,
    "about:blank",
  ]);

  let cdpUrl = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9223/json/version");
      if (res.ok) {
        cdpUrl = (await res.json()).webSocketDebuggerUrl;
        break;
      }
    } catch { await sleep(200); }
  }

  const targetRes = await fetch("http://127.0.0.1:9223/json/new?http://localhost:3000/auth", { method: "PUT" });
  const target = await targetRes.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 1;
  const cbs = new Map();
  ws.onmessage = (e) => {
    const d = JSON.parse(e.data);
    if (d.id && cbs.has(d.id)) { cbs.get(d.id)(d); cbs.delete(d.id); }
  };
  await new Promise((r) => { ws.onopen = r; });
  const send = (m, p = {}) => new Promise((r) => { const i = id++; cbs.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await send("Runtime.enable");
  const evalFn = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

  await sleep(1500);

  console.log("INITIAL STATE:");
  console.log("html[data-theme]:", await evalFn("document.documentElement.dataset.theme"));
  console.log("main.className:", await evalFn("document.querySelector('main').className"));

  console.log("\nCLICKING SPIDER-MAN BUTTON...");
  await evalFn(`
    (() => {
      const trigger = document.querySelector('.theme-switcher-trigger');
      if (trigger && trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
      const b = Array.from(document.querySelectorAll('.theme-switcher-option')).find(b => b.textContent.includes('Spider-Man'));
      b.click();
    })()
  `);
  await sleep(1000);

  console.log("\nAFTER CLICK:");
  console.log("html[data-theme]:", await evalFn("document.documentElement.dataset.theme"));
  console.log("main.className:", await evalFn("document.querySelector('main').className"));
  
  const submitStyles = await evalFn(`
    (() => {
      const btn = document.querySelector('.auth-submit');
      const cs = getComputedStyle(btn);
      return {
        bg: cs.background,
        bgColor: cs.backgroundColor,
        bgImage: cs.backgroundImage,
        color: cs.color,
        border: cs.border,
      };
    })()
  `);
  console.log("Submit styles:", JSON.stringify(submitStyles, null, 2));

  ws.close();
  edge.kill();
}
main().catch(console.error);
