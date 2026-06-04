// VERIFICATION: real opencv-python processes images and cv2.imshow returns a real PNG.
// Guards the real-cv2 pipeline (install opencv-python -> imread seeded sample -> real
// cvtColor/Canny/etc. -> imshow bridged to a PNG data URL) and image upload to the FS.
const { test, expect } = require('@playwright/test');

async function runReal(page, code) {
  return page.evaluate(async (code) => {
    const mod = await import('/src/utils/pyodideRunner.js');
    let log = ''; const imgs = [];
    await mod.runCode(code, {
      onLog: (l) => { log += l + '\n'; },
      onSpriteCommand: () => {}, onCv2Action: () => {},
      onCv2Image: (title, dataUrl) => imgs.push({ title, dataUrl }),
      onComplete: () => {},
    });
    return { log, imgs };
  }, code);
}

test('real cv2: grayscale + Canny produce a real PNG via imshow', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  const code = [
    'import cv2',
    'img = cv2.imread("input.jpg")',
    'gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)',
    'edges = cv2.Canny(gray, 50, 150)',
    'print("shapes", img.shape, gray.shape, edges.shape)',
    'cv2.imshow("Gray", gray)',
    'cv2.imshow("Edges", edges)',
  ].join('\n');
  const { log, imgs } = await runReal(page, code);
  expect(log).not.toContain('Runtime Error');
  expect(log).not.toContain('AttributeError');
  expect(log).toContain('opencv-python ready');
  // real shapes: color (h,w,3) -> gray (h,w)
  expect(log).toMatch(/shapes \(\d+, \d+, 3\) \(\d+, \d+\) \(\d+, \d+\)/);
  expect(imgs.length).toBe(2);
  for (const im of imgs) expect(im.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
});

test('uploaded image is readable by real cv2.imread', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  // Build a tiny 2x2 PNG in the page, write it via writeImageToFS, then read it with cv2.
  const out = await page.evaluate(async () => {
    const mod = await import('/src/utils/pyodideRunner.js');
    await mod.initPyodide(() => {});
    // Build a genuinely valid 30x20 PNG via a canvas, then upload it to the FS.
    const cv = document.createElement('canvas');
    cv.width = 30; cv.height = 20;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 30, 20);
    ctx.fillStyle = '#00ff00'; ctx.fillRect(5, 5, 10, 10);
    const dataUrl = cv.toDataURL('image/png');
    const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0));
    await mod.writeImageToFS('myphoto.png', bytes);
    let log = ''; const imgs = [];
    await mod.runCode('import cv2\nimg = cv2.imread("myphoto.png")\nprint("uploaded shape", None if img is None else img.shape)\ngray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)\ncv2.imshow("Up", gray)', {
      onLog: (l) => { log += l + '\n'; }, onSpriteCommand: () => {}, onCv2Action: () => {},
      onCv2Image: (t, d) => imgs.push(d), onComplete: () => {},
    });
    return { log, n: imgs.length, ok: imgs[0] ? imgs[0].startsWith('data:image/png') : false };
  });
  expect(out.log).not.toContain('Runtime Error');
  expect(out.log).toMatch(/uploaded shape \(20, 30/);   // real cv2 read the uploaded 30x20 image
  expect(out.n).toBe(1);
  expect(out.ok).toBe(true);
});
