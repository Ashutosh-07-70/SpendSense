import { spawn } from "node:child_process";
import path from "node:path";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const USER_DATA_DIR = path.resolve("./.tmp-inspect-profile");

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const edge = spawn(EDGE_PATH, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=9225",
    `--user-data-dir=${USER_DATA_DIR}`, "http://localhost:3000/auth"
  ]);

  await sleep(1500);
  const list = await (await fetch("http://127.0.0.1:9225/json/list")).json();
  const page = list.find(p => p.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 1;
  const cbs = new Map();
  ws.onmessage = (e) => {
    const d = JSON.parse(e.data);
    if (d.id && cbs.has(d.id)) { cbs.get(d.id)(d); cbs.delete(d.id); }
  };
  await new Promise(r => ws.onopen = r);
  const send = (m, p = {}) => new Promise(r => { const i = id++; cbs.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await send("Runtime.enable");

  const info = await send("Runtime.evaluate", {
    expression: `
      (() => {
        const btn = document.querySelector('.theme-switcher-trigger');
        const icon = btn.querySelector('.theme-switcher-trigger-icon');
        const text = btn.querySelector('.theme-switcher-trigger-label');
        const label = btn.querySelector('.theme-switcher-trigger-label');

        function dump(el, name) {
          if (!el) return { name, exists: false };
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return {
            name,
            rect: { x: r.x, y: r.y, w: r.width, h: r.height },
            display: cs.display,
            flexDirection: cs.flexDirection,
            alignItems: cs.alignItems,
            position: cs.position,
            overflow: cs.overflow,
            fontSize: cs.fontSize,
            lineHeight: cs.lineHeight,
            whiteSpace: cs.whiteSpace,
            color: cs.color,
            width: cs.width,
            height: cs.height,
          };
        }

        return {
          btn: dump(btn, 'btn'),
          icon: dump(icon, 'icon'),
          text: dump(text, 'text'),
          label: dump(label, 'label'),
          btnInnerHTML: btn.innerHTML
        };
      })()
    `,
    returnByValue: true
  });

  console.log(JSON.stringify(info.result.result.value, null, 2));

  ws.close();
  edge.kill();
}
main().catch(console.error);
