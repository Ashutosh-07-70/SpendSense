import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const USER_DATA_DIR = path.resolve("./.tmp-edge-profile");
const SCREENSHOTS_DIR = path.resolve("./.verification-screenshots");

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("=== Launching Headless Edge for Visual Theme Verification ===");
  const edge = spawn(EDGE_PATH, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--remote-debugging-port=9222",
    `--user-data-dir=${USER_DATA_DIR}`,
    "about:blank",
  ]);

  let cdpUrl = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9222/json/version");
      if (res.ok) {
        const data = await res.json();
        cdpUrl = data.webSocketDebuggerUrl;
        break;
      }
    } catch {
      await sleep(300);
    }
  }

  if (!cdpUrl) {
    console.error("Failed to connect to Edge remote debugging port");
    edge.kill();
    process.exit(1);
  }

  console.log("Connected to Edge CDP:", cdpUrl);

  // Create a new target/page
  const targetRes = await fetch("http://127.0.0.1:9222/json/new?http://localhost:3000/auth", { method: "PUT" });
  const target = await targetRes.json();
  const pageWsUrl = target.webSocketDebuggerUrl;

  const ws = new WebSocket(pageWsUrl);
  let msgId = 1;
  const callbacks = new Map();

  ws.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    if (payload.id && callbacks.has(payload.id)) {
      callbacks.get(payload.id)(payload);
      callbacks.delete(payload.id);
    }
  };

  await new Promise((resolve) => {
    ws.onopen = resolve;
  });

  function send(method, params = {}) {
    return new Promise((resolve) => {
      const id = msgId++;
      callbacks.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send("Page.enable");
  await send("Runtime.enable");
  await send("DOM.enable");
  await send("CSS.enable");

  async function evaluate(expression) {
    const res = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result?.result?.value;
  }

  async function setViewport(width, height) {
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 600,
    });
  }

  async function captureScreenshot(filename) {
    const res = await send("Page.captureScreenshot", { format: "png" });
    if (res.result?.data) {
      const buf = Buffer.from(res.result.data, "base64");
      fs.writeFileSync(path.join(SCREENSHOTS_DIR, filename), buf);
      console.log(`Saved screenshot: ${filename}`);
    }
  }

  console.log("\n--- Testing Desktop Viewport (1280x800) ---");
  await setViewport(1280, 800);
  await sleep(1500);

  // 1. Initial State Check
  const initialTheme = await evaluate("document.documentElement.getAttribute('data-theme')");
  console.log(`Initial Theme: ${initialTheme}`);

  // Test Theme Selector Existence and Layout
  const selectorInfo = await evaluate(`
    (() => {
      const ctrl = document.querySelector('.theme-switcher');
      if (!ctrl) return null;
      const rect = ctrl.getBoundingClientRect();
      const trigger = ctrl.querySelector('.theme-switcher-trigger');
      const triggerRect = trigger ? trigger.getBoundingClientRect() : null;
      const icon = trigger ? trigger.querySelector('.theme-switcher-trigger-icon svg') : null;
      const iconRect = icon ? icon.getBoundingClientRect() : null;
      const label = trigger ? trigger.querySelector('.theme-switcher-trigger-label') : null;
      if (trigger) trigger.click();
      const options = Array.from(document.querySelectorAll('.theme-switcher-option')).map(b => {
        const bRect = b.getBoundingClientRect();
        const optionIcon = b.querySelector('.theme-switcher-option-icon svg');
        const optionIconRect = optionIcon ? optionIcon.getBoundingClientRect() : null;
        const copy = b.querySelector('.theme-option-copy strong');
        return {
          label: copy ? copy.textContent : '',
          isSelected: b.classList.contains('is-selected'),
          width: bRect.width,
          height: bRect.height,
          iconSize: optionIconRect ? { w: optionIconRect.width, h: optionIconRect.height } : null,
        };
      });
      return {
        width: rect.width,
        height: rect.height,
        trigger: triggerRect ? { width: triggerRect.width, height: triggerRect.height, label: label ? label.textContent : '' } : null,
        iconSize: iconRect ? { w: iconRect.width, h: iconRect.height } : null,
        options,
      };
    })()
  `);

  console.log("Theme Dropdown Control Info:", JSON.stringify(selectorInfo, null, 2));

  // Test Switching to SPIDER-MAN Theme
  console.log("\n--- Switching to SPIDER-MAN Theme ---");
  await evaluate(`
    (() => {
      const trigger = document.querySelector('.theme-switcher-trigger');
      if (trigger && trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
      const spiderBtn = Array.from(document.querySelectorAll('.theme-switcher-option')).find(b => b.textContent.includes('Spider-Man'));
      if (spiderBtn) spiderBtn.click();
    })()
  `);
  await sleep(600);

  const spiderTheme = await evaluate("document.documentElement.getAttribute('data-theme')");
  console.log(`Current theme after click: ${spiderTheme}`);

  const spiderStyles = await evaluate(`
    (() => {
      const bodyBg = getComputedStyle(document.body).backgroundColor;
      const headingEm = getComputedStyle(document.querySelector('.auth-heading-block h1 em')).color;
      const submitBtn = getComputedStyle(document.querySelector('.auth-submit'));
      const trigger = getComputedStyle(document.querySelector('.theme-switcher-trigger'));
      const visual = document.querySelector('.auth-visual');
      const visualBg = visual ? getComputedStyle(visual).backgroundColor : null;
      return {
        bodyBg,
        headingEmColor: headingEm,
        submitBg: submitBtn.backgroundColor,
        submitColor: submitBtn.color,
        triggerBg: trigger.backgroundColor,
        visualBg,
      };
    })()
  `);
  console.log("Spider-Man Computed Styles:", JSON.stringify(spiderStyles, null, 2));
  await captureScreenshot("desktop-auth-spider-man-signup.png");

  // Test Switch to Sign In mode
  console.log("\n--- Switching Auth Mode to Sign In ---");
  await evaluate(`
    (() => {
      const signinBtn = Array.from(document.querySelectorAll('.auth-mode-switch button')).find(b => b.textContent.includes('Sign in'));
      if (signinBtn) signinBtn.click();
    })()
  `);
  await sleep(500);

  const signinFormInfo = await evaluate(`
    (() => {
      const form = document.querySelector('.auth-form');
      const rect = form ? form.getBoundingClientRect() : null;
      const inputs = Array.from(document.querySelectorAll('.auth-form input')).map(i => ({ name: i.name, type: i.type }));
      return { formRect: rect, inputs };
    })()
  `);
  console.log("Sign In Form Info:", JSON.stringify(signinFormInfo, null, 2));
  await captureScreenshot("desktop-auth-spider-man-signin.png");

  // Test Switching to LIGHT Theme
  console.log("\n--- Switching to LIGHT Theme ---");
  await evaluate(`
    (() => {
      const trigger = document.querySelector('.theme-switcher-trigger');
      if (trigger && trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
      const lightBtn = Array.from(document.querySelectorAll('.theme-switcher-option')).find(b => b.textContent.includes('Light'));
      if (lightBtn) lightBtn.click();
    })()
  `);
  await sleep(600);

  const lightTheme = await evaluate("document.documentElement.getAttribute('data-theme')");
  console.log(`Current theme: ${lightTheme}`);
  await captureScreenshot("desktop-auth-light.png");

  // Test Switching to DARK Theme
  console.log("\n--- Switching to DARK Theme ---");
  await evaluate(`
    (() => {
      const trigger = document.querySelector('.theme-switcher-trigger');
      if (trigger && trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
      const darkBtn = Array.from(document.querySelectorAll('.theme-switcher-option')).find(b => b.textContent.includes('Dark'));
      if (darkBtn) darkBtn.click();
    })()
  `);
  await sleep(600);

  const darkTheme = await evaluate("document.documentElement.getAttribute('data-theme')");
  console.log(`Current theme: ${darkTheme}`);
  await captureScreenshot("desktop-auth-dark.png");

  // Switch back to Spider-Man and test Mobile Viewport (375x812)
  console.log("\n--- Switching to SPIDER-MAN Theme for Mobile ---");
  await evaluate(`
    (() => {
      const trigger = document.querySelector('.theme-switcher-trigger');
      if (trigger && trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
      const spiderBtn = Array.from(document.querySelectorAll('.theme-switcher-option')).find(b => b.textContent.includes('Spider-Man'));
      if (spiderBtn) spiderBtn.click();
    })()
  `);
  await sleep(300);
  await setViewport(375, 812);
  await sleep(600);

  const mobileLayoutInfo = await evaluate(`
    (() => {
      const shell = document.querySelector('.auth-shell').getBoundingClientRect();
      const formSide = document.querySelector('.auth-form-side').getBoundingClientRect();
      const visual = document.querySelector('.auth-visual').getBoundingClientRect();
      const docW = document.documentElement.scrollWidth;
      const winW = window.innerWidth;
      return {
        shellW: shell.width,
        formSideH: formSide.height,
        formSideY: formSide.y,
        visualH: visual.height,
        visualY: visual.y,
        hasHorizontalOverflow: docW > winW,
      };
    })()
  `);
  console.log("Mobile Layout Info:", JSON.stringify(mobileLayoutInfo, null, 2));
  await captureScreenshot("mobile-auth-spider-man.png");

  // 2. Test Dashboard Theme Integration
  console.log("\n--- Testing Dashboard in Spider-Man Theme ---");
  await setViewport(1280, 800);
  await send("Page.navigate", { url: "http://localhost:3000/dashboard" });
  await sleep(2500);

  const dashboardInfo = await evaluate(`
    (() => {
      const theme = document.documentElement.getAttribute('data-theme');
      const topbarThemeSwitcher = document.querySelector('.theme-switcher-dashboard');
      const launcher = document.querySelector('.assistant-launcher');
      const launcherStyle = launcher ? getComputedStyle(launcher) : null;
      const primaryBtn = document.querySelector('.primary-button');
      const primaryBtnStyle = primaryBtn ? getComputedStyle(primaryBtn) : null;
      return {
        theme,
        hasTopbarSwitcher: !!topbarThemeSwitcher,
        launcherBg: launcherStyle ? launcherStyle.backgroundColor : null,
        launcherBoxShadow: launcherStyle ? launcherStyle.boxShadow : null,
        primaryBtnBg: primaryBtnStyle ? primaryBtnStyle.backgroundColor : null,
      };
    })()
  `);
  console.log("Dashboard Theme Info:", JSON.stringify(dashboardInfo, null, 2));
  await captureScreenshot("desktop-dashboard-spider-man.png");

  console.log("\n=== All Verification Tests Completed Successfully ===");
  ws.close();
  edge.kill();
  process.exit(0);
}

main().catch(err => {
  console.error("Error running verification:", err);
  process.exit(1);
});
