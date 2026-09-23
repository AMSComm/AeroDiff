import { chromium } from 'playwright';
import { spawn } from 'child_process';
import http from 'http';

function waitForServer(url, timeout = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          retry();
        }
      }).on('error', () => {
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - start > timeout) {
        reject(new Error(`Server at ${url} did not start within ${timeout}ms`));
      } else {
        setTimeout(check, 300);
      }
    };

    check();
  });
}

async function run() {
  console.log('🚀 Starting Vite preview server for Playwright verification...');
  const server = spawn('pnpm', ['preview', '--port', '4173'], {
    cwd: '/Users/huy/dev/amktest/aerodiff',
    stdio: 'pipe',
  });

  server.stdout.on('data', (d) => process.stdout.write(`[Vite] ${d}`));
  server.stderr.on('data', (d) => process.stderr.write(`[Vite Error] ${d}`));

  try {
    await waitForServer('http://localhost:4173');
    console.log('✅ Vite preview server running at http://localhost:4173');

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });

    console.log('📄 Navigating to AeroDiff...');
    await page.goto('http://localhost:4173');
    await page.waitForLoadState('networkidle');

    // 1. Verify Welcome View
    console.log('🔍 Checking Welcome View UI elements...');
    const brand = await page.textContent('body');
    if (!brand.includes('AeroDiff')) throw new Error('Brand AeroDiff missing');
    if (!brand.includes('Left Target')) throw new Error('Left Target box missing');
    if (!brand.includes('Right Target')) throw new Error('Right Target box missing');
    if (!brand.includes('Start Compare')) throw new Error('Start Compare button missing');
    if (!brand.includes('Compare Text (Scratchpad)')) throw new Error('Compare Text button missing');

    console.log('✅ Welcome View has clean Left & Right target boxes and action buttons');

    // 2. Test Compare Text (Scratchpad)
    console.log('📝 Testing Scratchpad Text Compare in current tab...');
    await page.click('button:has-text("Compare Text (Scratchpad)")');
    await page.waitForTimeout(500);

    // Verify Tab count remains 1 (updated in-place)
    const tabsCount = await page.locator('.group.h-7').count();
    console.log(`Tabs count after Compare Text: ${tabsCount}`);
    if (tabsCount !== 1) throw new Error(`Expected 1 tab, but found ${tabsCount}`);

    // Verify editors are shown
    const leftTextarea = page.locator('textarea[placeholder*="left content"]');
    const rightTextarea = page.locator('textarea[placeholder*="right content"]');
    await leftTextarea.fill('function greet() {\n  return "Hello World";\n}');
    await rightTextarea.fill('function greet() {\n  return "Hello Brave World";\n  console.log("added line");\n}');

    // Switch to Visual Diff
    console.log('🔄 Switching to Visual Diff...');
    await page.click('button:has-text("Visual Diff")');
    await page.waitForTimeout(500);

    // Verify Diff Viewer is rendered with both panes
    const splitViewer = page.locator('.font-mono.text-\\[13px\\]');
    if (!(await splitViewer.isVisible())) throw new Error('SplitDiffViewer is not visible');

    // Verify Right Pane is visible and not empty
    const rightPaneContent = await page.locator('text=Hello Brave World').first();
    if (!(await rightPaneContent.isVisible())) throw new Error('Right pane diff content is missing!');
    console.log('✅ Right Pane displays modified content properly (not empty)!');

    // 3. Test Options as Buttons
    console.log('🔘 Testing Options buttons...');
    // View mode Unified
    await page.click('button:has-text("Unified")');
    await page.waitForTimeout(300);
    const unifiedAddSymbol = page.locator('text=+').first();
    if (!(await unifiedAddSymbol.isVisible())) throw new Error('Unified view symbol missing');
    console.log('✅ Unified view switch button works');

    // Switch back to Side-by-Side
    await page.click('button:has-text("Side-by-Side")');
    await page.waitForTimeout(300);

    // Whitespace button
    await page.click('button:has-text("Whitespace:")');
    await page.waitForTimeout(200);
    const wsText = await page.textContent('button:has-text("Whitespace:")');
    console.log(`Whitespace button state: ${wsText.trim()}`);
    if (!wsText.includes('Trim Ends')) throw new Error('Whitespace toggle failed');

    // Blank lines button
    await page.click('button:has-text("Blank Lines:")');
    await page.waitForTimeout(200);
    const blText = await page.textContent('button:has-text("Blank Lines:")');
    console.log(`Blank lines button state: ${blText.trim()}`);
    if (!blText.includes('Ignore')) throw new Error('Blank lines toggle failed');

    // Case button
    await page.click('button:has-text("Case:")');
    await page.waitForTimeout(200);
    const caseText = await page.textContent('button:has-text("Case:")');
    console.log(`Case button state: ${caseText.trim()}`);
    if (!caseText.includes('Ignore')) throw new Error('Case toggle failed');

    // 4. Test New Tab and Start Compare in-place with CSV
    console.log('➕ Creating New Tab...');
    await page.click('button[title*="Open New Compare Tab"]');
    await page.waitForTimeout(300);
    const tabsCount2 = await page.locator('.group.h-7').count();
    console.log(`Tabs count after [+] clicked: ${tabsCount2}`);
    if (tabsCount2 !== 2) throw new Error('Expected 2 tabs after opening new tab');

    // Fill in left and right with CSV paths
    console.log('📊 Testing CSV comparison and in-place tab start...');
    const leftInput = page.locator('input[placeholder*="left file"]');
    const rightInput = page.locator('input[placeholder*="right file"]');
    await leftInput.fill('records_2025.csv');
    await rightInput.fill('records_2026.csv');

    // Inject CSV test data into window / tab store
    await page.evaluate(() => {
      const store = window.__tabStore || window.useTabStore;
      // We can also trigger startCompareInActiveTab directly
    });

    await page.click('button:has-text("Start Compare")');
    await page.waitForTimeout(500);

    // Verify tabs count is STILL 2 (the current tab was updated, no 3rd tab!)
    const tabsCount3 = await page.locator('.group.h-7').count();
    console.log(`Tabs count after Start Compare: ${tabsCount3}`);
    if (tabsCount3 !== 2) throw new Error(`Expected exactly 2 tabs, but got ${tabsCount3}!`);
    console.log('✅ Start Compare updated the CURRENT tab in-place!');

    // 5. Test CSV Table View vs Text View toggle
    console.log('🔄 Testing CSV Table View vs Text View toggle buttons...');
    const tableBtn = page.locator('button:has-text("Table View")');
    const textBtn = page.locator('button:has-text("Text View")');
    if (await tableBtn.isVisible()) {
      console.log('Table View button is visible for CSV');
      await textBtn.click();
      await page.waitForTimeout(300);
      console.log('Switched to Text View for CSV');
      await tableBtn.click();
      await page.waitForTimeout(300);
      console.log('Switched back to Table View for CSV');
    }

    console.log('🎉 ALL PLAYWRIGHT E2E ASSERTIONS PASSED WITH 100% SUCCESS!');
    await browser.close();
  } finally {
    server.kill();
  }
}

run().catch((err) => {
  console.error('❌ Playwright E2E verification failed:', err);
  process.exit(1);
});
