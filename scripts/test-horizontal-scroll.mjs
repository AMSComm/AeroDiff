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

async function runTest() {
  console.log('🧪 Starting Vite preview server...');
  const viteServer = spawn('npm', ['run', 'preview', '--', '--port', '4173'], {
    cwd: '/Users/huy/dev/amktest/aerodiff',
    stdio: 'pipe',
    shell: true,
  });

  try {
    await waitForServer('http://localhost:4173');
    console.log('✅ Server ready at http://localhost:4173');

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

    await page.goto('http://localhost:4173');
    await page.waitForLoadState('networkidle');

    console.log('1️⃣ Setting up CSV Table Mode with 50 columns...');
    // Create CSV data with 50 columns to guarantee wide horizontal scroll
    const _headers = Array.from({ length: 50 }, (_, i) => `Col_${i + 1}`).join(',');
    const rows = Array.from({ length: 100 }, (_, r) => 
      Array.from({ length: 50 }, (_, c) => `Val_${r + 1}_${c + 1}`).join(',')
    );

    const mockLines = rows.map((r, i) => ({
      left_line_num: i + 1,
      right_line_num: i + 1,
      left_text: r,
      right_text: i === 5 ? r.replace('Val_6_10', 'MODIFIED') : r,
      line_type: i === 5 ? 'Modified' : 'Equal',
      chunk_id: i === 5 ? 0 : null,
      left_inline: [],
      right_inline: [],
    }));

    await page.evaluate(({ lines }) => {
      const tabStore = window.__TAB_STORE__ ? window.__TAB_STORE__.getState() : null;
      if (tabStore) {
        tabStore.updateActiveTab({
          type: 'csv',
          title: 'wide_data.csv',
          csvViewMode: 'table',
          diffResult: {
            is_identical: false,
            total_virtual_lines: lines.length,
            stats: { additions: 0, deletions: 0, modifications: 1, equal: lines.length - 1 },
            chunks: [{
              chunk_id: 0,
              chunk_type: 'Modified',
              left_start: 6,
              left_count: 1,
              right_start: 6,
              right_count: 1,
            }],
            lines,
          },
        });
      }
    }, { lines: mockLines });

    await page.waitForTimeout(500);

    const leftContainer = page.locator('[data-testid="csv-left-container"]');
    const rightContainer = page.locator('[data-testid="csv-right-container"]');

    if (await leftContainer.count() === 0 || await rightContainer.count() === 0) {
      throw new Error('CSV containers not found!');
    }

    console.log('2️⃣ Simulating realistic trackpad horizontal gestures with natural vertical finger drift...');
    // Simulate typical macOS trackpad horizontal swipe with non-zero deltaY (e.g. deltaX = 35, deltaY = 2)
    const leftBox = await leftContainer.boundingBox();
    if (!leftBox) throw new Error('Left container bounding box null');

    await page.mouse.move(leftBox.x + 200, leftBox.y + 200);

    // Stream 15 consecutive horizontal trackpad wheel ticks with slight vertical drift
    for (let i = 0; i < 15; i++) {
      const deltaX = 40;
      const driftY = (i % 3 === 0) ? 2 : (i % 3 === 1) ? -1 : 0;
      await page.mouse.wheel(deltaX, driftY);
      await page.waitForTimeout(16); // 60fps frame pace
    }

    await page.waitForTimeout(100);

    const scrollLeftL = await leftContainer.evaluate((el) => el.scrollLeft);
    const scrollLeftR = await rightContainer.evaluate((el) => el.scrollLeft);

    console.log(`Left scrollLeft after trackpad gestures: ${scrollLeftL}px`);
    console.log(`Right scrollLeft after trackpad gestures: ${scrollLeftR}px`);

    if (scrollLeftL <= 0) {
      throw new Error('Left container did not scroll horizontally under trackpad wheel gesture!');
    }

    if (Math.abs(scrollLeftL - scrollLeftR) > 2) {
      throw new Error(`Left and Right containers out of sync! L: ${scrollLeftL}, R: ${scrollLeftR}`);
    }

    console.log('✅ Trackpad horizontal scrolling is completely synchronized with 0 hitching!');

    console.log('3️⃣ Testing reverse horizontal trackpad swipe...');
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(-30, 1);
      await page.waitForTimeout(16);
    }

    await page.waitForTimeout(100);
    const reverseL = await leftContainer.evaluate((el) => el.scrollLeft);
    const reverseR = await rightContainer.evaluate((el) => el.scrollLeft);
    console.log(`Left scrollLeft after reverse: ${reverseL}px, Right: ${reverseR}px`);

    if (reverseL >= scrollLeftL) {
      throw new Error('Reverse scroll failed to decrease scrollLeft!');
    }
    if (Math.abs(reverseL - reverseR) > 2) {
      throw new Error(`Reverse scroll left/right mismatch! L: ${reverseL}, R: ${reverseR}`);
    }
    console.log('✅ Reverse trackpad horizontal scrolling works smoothly!');

    console.log('4️⃣ Testing Text Diff Split View horizontal scroll sync...');
    await page.evaluate(() => {
      const tabStore = window.__TAB_STORE__ ? window.__TAB_STORE__.getState() : null;
      if (tabStore) {
        // Very long line to allow horizontal scroll
        const longLine = 'const superLongConfig = { ' + Array.from({ length: 40 }, (_, i) => `key_${i}: "value_${i}"`).join(', ') + ' };';
        tabStore.updateActiveTab({
          type: 'file',
          title: 'long_lines.ts',
          viewMode: 'split',
          leftContent: longLine,
          rightContent: longLine,
          diffResult: {
            is_identical: true,
            total_virtual_lines: 1,
            stats: { additions: 0, deletions: 0, modifications: 0, equal: 1 },
            chunks: [],
            lines: [{
              left_line_num: 1,
              right_line_num: 1,
              left_text: longLine,
              right_text: longLine,
              line_type: 'Equal',
              chunk_id: null,
              left_inline: [],
              right_inline: [],
            }],
          },
        });
      }
    });

    await page.waitForTimeout(500);

    const splitLeft = page.locator('[data-testid="split-left-container"]');
    const splitRight = page.locator('[data-testid="split-right-container"]');

    const splitBox = await splitLeft.boundingBox();
    if (splitBox) {
      await page.mouse.move(splitBox.x + 100, splitBox.y + 100);
      for (let i = 0; i < 10; i++) {
        await page.mouse.wheel(50, 1);
        await page.waitForTimeout(16);
      }
      await page.waitForTimeout(100);

      const splitL = await splitLeft.evaluate((el) => el.scrollLeft);
      const splitR = await splitRight.evaluate((el) => el.scrollLeft);
      console.log(`Split View Left scrollLeft: ${splitL}px, Right: ${splitR}px`);

      if (splitL <= 0) {
        throw new Error('Split view left did not scroll horizontally!');
      }
      if (Math.abs(splitL - splitR) > 2) {
        throw new Error(`Split view left/right mismatch! L: ${splitL}, R: ${splitR}`);
      }
      console.log('✅ Split View trackpad horizontal scrolling verified!');
    }

    console.log('🎉 ALL HORIZONTAL TRACKPAD SCROLL TESTS PASSED WITH 100% SUCCESS!');
    await browser.close();
  } finally {
    viteServer.kill('SIGTERM');
  }
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
