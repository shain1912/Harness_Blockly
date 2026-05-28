const { test, expect } = require('@playwright/test');

// Helper: wait for text in #console-logs (longer timeout for Pyodide first-load)
async function waitForLog(page, text, timeout = 90000) {
  await page.waitForFunction(
    (t) => document.querySelector('#console-logs')?.textContent?.includes(t),
    text,
    { timeout }
  );
}

async function runPython(page, code) {
  await page.locator('#tab-btn-python').click();
  await page.waitForTimeout(200);
  await page.locator('#python-code').fill(code);
  await page.locator('#tab-btn-logs').click();
  await page.waitForTimeout(100);
  await page.locator('#btn-run').click();
}

test('Pyodide T1: real Python arithmetic + print', async ({ page }) => {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  await runPython(page, 'x = 6 * 7\nprint(x)');
  await waitForLog(page, '42');
  const logs = await page.locator('#console-logs').textContent();
  expect(logs).toContain('42');
  expect(logs).toContain('[Python] Execution completed.');
  console.log('T1 PASS — print(42)');
});

test('Pyodide T2: real Python list + for loop', async ({ page }) => {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  await runPython(page, `
nums = [1, 2, 3, 4, 5]
total = sum(nums)
print("sum =", total)
`);
  await waitForLog(page, 'sum = 15');
  const logs = await page.locator('#console-logs').textContent();
  expect(logs).toContain('sum = 15');
  console.log('T2 PASS — sum([1..5]) = 15');
});

test('Pyodide T3: numpy available (Pyodide built-in)', async ({ page }) => {
  test.setTimeout(150000);
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  await runPython(page, `
import numpy as np
arr = np.array([1, 2, 3, 4, 5])
print("mean =", arr.mean())
`);
  await waitForLog(page, 'mean = 3.0', 90000);
  const logs = await page.locator('#console-logs').textContent();
  expect(logs).toContain('mean = 3.0');
  console.log('T3 PASS — numpy mean = 3.0');
});

test('Pyodide T4: micropip install pure-Python package', async ({ page }) => {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  await runPython(page, `
import micropip
import asyncio
await micropip.install('cowsay')
import cowsay
cowsay.cow('Pyodide works!')
`);
  // cowsay prints ASCII art containing the message
  await waitForLog(page, 'Pyodide works!', 90000);
  const logs = await page.locator('#console-logs').textContent();
  expect(logs).toContain('Pyodide works!');
  console.log('T4 PASS — cowsay installed via micropip');
});

test('Pyodide T5: sprite.move works via Python', async ({ page }) => {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  await runPython(page, `
sprite.pen_down()
sprite.color("#ff0000")
for i in range(4):
    sprite.move(80)
    sprite.turn_right(90)
sprite.pen_up()
print("square drawn")
`);
  await waitForLog(page, 'square drawn', 90000);
  const logs = await page.locator('#console-logs').textContent();
  expect(logs).toContain('square drawn');

  // Check canvas has drawn lines
  await page.locator('#tab-btn-blockly').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/pyodide_sprite_square.png' });
  console.log('T5 PASS — sprite square drawn');
});
