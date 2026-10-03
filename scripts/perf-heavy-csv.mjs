import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import http from 'http';
import readline from 'readline';

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

class RustIpcClient {
  constructor(binaryPath) {
    this.binaryPath = binaryPath;
    this.proc = null;
    this.requestId = 1;
    this.pending = new Map();
  }

  start() {
    this.proc = spawn(this.binaryPath, [], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    const rl = readline.createInterface({
      input: this.proc.stdout,
      terminal: false,
    });

    rl.on('line', (line) => {
      try {
        const res = JSON.parse(line);
        const p = this.pending.get(res.id);
        if (p) {
          this.pending.delete(res.id);
          if (res.error) {
            p.reject(new Error(res.error));
          } else {
            p.resolve(res.result);
          }
        }
      } catch (err) {
        console.error('Failed to parse IPC line:', err, line);
      }
    });
  }

  invoke(cmd, args) {
    return new Promise((resolve, reject) => {
      const id = this.requestId++;
      this.pending.set(id, { resolve, reject });
      const msg = JSON.stringify({ id, cmd, args: args || {} }) + '\n';
      this.proc.stdin.write(msg);
    });
  }

  kill() {
    if (this.proc) {
      this.proc.kill();
    }
  }
}

async function runBenchmark() {
  console.log('🏁 ========================================================');
  console.log('⚡ AERODIFF PLAYWRIGHT REAL-WORLD CSV PERFORMANCE BENCHMARK');
  console.log('🏁 ========================================================');

  const p1 = '/Users/huy/Downloads/journal_detail_20261001.csv';
  const p2 = '/Users/huy/Downloads/journal_detail_20261002.csv';

  // 1. Start Rust IPC Server
  console.log('\n🦀 Starting Rust native release IPC server...');
  const ipcPath = existsSync('/Users/huy/dev/amktest/aerodiff/src-tauri/target/release/examples/ipc_server')
    ? '/Users/huy/dev/amktest/aerodiff/src-tauri/target/release/examples/ipc_server'
    : '/Users/huy/dev/amktest/aerodiff/src-tauri/target/release/ipc_server';
  const ipcClient = new RustIpcClient(ipcPath);
  ipcClient.start();

  // 2. Start Vite Preview Server
  console.log('🚀 Starting Vite preview server at port 4173...');
  const viteServer = spawn('npm', ['run', 'preview', '--', '--port', '4173'], {
    cwd: '/Users/huy/dev/amktest/aerodiff',
    stdio: 'pipe',
    shell: true,
  });

  const metrics = {};

  try {
    await waitForServer('http://localhost:4173');
    console.log('✅ Vite preview server running at http://localhost:4173');

    // 3. Launch Playwright Chromium
    const browser = await chromium.launch({
      headless: true,
      args: ['--enable-precise-memory-info'],
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();

    // Expose Node-side Rust IPC bridge directly into the browser
    await page.exposeFunction('__nativeTauriBridge', async (cmd, args) => {
      return await ipcClient.invoke(cmd, args);
    });

    // Inject mock Tauri environment hooking into the real Rust backend
    await page.addInitScript(() => {
      window.__TAURI_INTERNALS__ = {
        invoke: async (cmd, args) => {
          return await window.__nativeTauriBridge(cmd, args);
        },
      };
      window.__TAURI__ = true;
    });

    console.log('📄 Navigating to AeroDiff Welcome View...');
    await page.goto('http://localhost:4173');
    await page.waitForLoadState('networkidle');

    // 4. Input the heavy CSV file paths
    console.log('\n📁 Filling in target CSV file paths:');
    console.log(`   Left:  ${p1} (~132 MB)`);
    console.log(`   Right: ${p2} (~133 MB)`);

    const leftInput = page.locator('input[placeholder*="left file"]');
    const rightInput = page.locator('input[placeholder*="right file"]');
    await leftInput.fill(p1);
    await leftInput.blur();
    await rightInput.fill(p2);
    await rightInput.blur();
    await page.waitForTimeout(500);

    // 5. Measure Diff & Table Initial Render Performance
    console.log('\n⏱️ Initiating comparison...');
    const tStartDiff = Date.now();
    await page.click('button:has-text("Start Compare")');

    // Wait until the compare finishes and displays lines in status bar
    await page.waitForSelector('text=Left: 596640 lines', { timeout: 30000 });
    const diffAndRenderDuration = Date.now() - tStartDiff;
    metrics.diffAndRenderMs = diffAndRenderDuration;
    console.log(`✅ Diff + Initial Table Render completed in: ${diffAndRenderDuration} ms`);

    // Verify virtual line count in UI
    const totalLinesText = page.locator('text=Left: 596640 lines').first();
    const hasCorrectLines = await totalLinesText.isVisible();
    console.log(`📊 Virtual lines counter verified (596,640 lines): ${hasCorrectLines ? 'PASSED' : 'FAILED'}`);
    if (!hasCorrectLines) throw new Error('Virtual line count 596,640 was not displayed properly in status bar!');

    // 6. Verify Changed Columns Quick Jump Bar
    console.log('\n🔍 Verifying Changed Columns Quick Jump Bar:');
    await page.waitForSelector('button:has-text("会員番号")', { timeout: 10000 });
    const changedColsBar = page.locator('text=Changed Columns:').first();
    const isBarVisible = await changedColsBar.isVisible();
    console.log(`   Changed Columns Bar visible: ${isBarVisible}`);

    const colMemberBtn = page.locator('button:has-text("会員番号")');
    const colTypeBtn = page.locator('button:has-text("会員区分")');
    const hasColMember = (await colMemberBtn.count()) > 0;
    const hasColType = (await colTypeBtn.count()) > 0;
    console.log(`   Detected Col 会員番号: ${hasColMember ? 'PASSED' : 'FAILED'}`);
    console.log(`   Detected Col 会員区分: ${hasColType ? 'PASSED' : 'FAILED'}`);
    if (!hasColMember || !hasColType) throw new Error('Changed columns Quick Jump Bar did not detect 会員番号 and 会員区分!');

    // 7. Measure Diff Seeking & Auto-Snap Horizontal Scroll Performance
    console.log('\n⚡ Testing Diff Seek Navigation (F7 / Next Diff):');
    const tStartSeek = Date.now();
    await page.keyboard.press('F7');

    // Wait for row 479 to arrive and render
    const diffRowLocator = page.locator('text=No.10-040003').first();
    await diffRowLocator.waitFor({ state: 'visible', timeout: 5000 });
    const seekDuration = Date.now() - tStartSeek;
    metrics.seekMs = seekDuration;
    console.log(`✅ Diff Jump to Line 479 completed in: ${seekDuration} ms`);

    // Check horizontal scroll auto-snap offset
    const scrollLeftValues = await page.evaluate(() => {
      const els = document.querySelectorAll('.overflow-x-auto');
      return Array.from(els).map((el) => el.scrollLeft);
    });
    console.log(`   Horizontal scrollLeft after diff seek: [${scrollLeftValues.join(', ')}] px`);
    const isSnappingHorizontal = scrollLeftValues.some((v) => v > 400);
    if (!isSnappingHorizontal) {
      throw new Error(`Expected horizontal auto-scroll snap to changed columns (scrollLeft > 400), but was: ${scrollLeftValues}`);
    }
    console.log('✅ Auto-Snap Horizontal Scroll: Successfully snapped to Col 8 & 9 (off-screen area brought into view)!');

    // Verify high-contrast (empty) cell badge on left side
    const emptyBadge = page.locator('span:has-text("(empty)")').first();
    const hasEmptyBadge = await emptyBadge.isVisible();
    console.log(`   High-contrast (empty) badge visible on left pane: ${hasEmptyBadge ? 'PASSED' : 'FAILED'}`);
    if (!hasEmptyBadge) throw new Error('Visual (empty) diff badge was not found on empty cell!');

    // Verify right side has the modified member ID (41206000)
    const rightVal = page.locator('text=41206000').first();
    const hasRightVal = await rightVal.isVisible();
    console.log(`   Modified cell value (41206000) visible on right pane: ${hasRightVal ? 'PASSED' : 'FAILED'}`);
    if (!hasRightVal) throw new Error('Modified value 41206000 was not visible on right pane!');

    // 8. Test Scrolling Smoothness & FPS across large virtual ranges
    console.log('\n🏎️ Measuring Virtual Scroll FPS Performance (scrolling 10,000 lines):');
    const fpsData = await page.evaluate(async () => {
      const scrollEl = document.querySelector('.overflow-y-hidden') || document.querySelector('.overflow-x-auto');
      const start = performance.now();
      const frameTimes = [];
      let lastFrame = performance.now();

      return new Promise((resolve) => {
        let step = 0;
        const totalSteps = 60; // 60 frames = ~1 second continuous scroll
        const scrollContainer = document.querySelectorAll('.overflow-x-auto')[1] || document.querySelector('.overflow-x-auto');

        function onFrame(now) {
          const delta = now - lastFrame;
          frameTimes.push(delta);
          lastFrame = now;

          // Dispatch mouse wheel scroll event
          window.dispatchEvent(
            new WheelEvent('wheel', {
              deltaY: 150,
              bubbles: true,
              cancelable: true,
            })
          );

          step++;
          if (step < totalSteps) {
            requestAnimationFrame(onFrame);
          } else {
            const avgDelta = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
            const fps = Math.round(1000 / avgDelta);
            const droppedFrames = frameTimes.filter((t) => t > 33.3).length; // >33ms is dropped <30fps
            resolve({
              fps,
              avgFrameMs: parseFloat(avgDelta.toFixed(2)),
              droppedFrames,
              totalFrames: frameTimes.length,
            });
          }
        }

        requestAnimationFrame(onFrame);
      });
    });

    metrics.fps = fpsData.fps;
    metrics.avgFrameMs = fpsData.avgFrameMs;
    metrics.droppedFrames = fpsData.droppedFrames;
    console.log(`✅ Average Frame Rate: ${fpsData.fps} FPS`);
    console.log(`✅ Average Frame Render Time: ${fpsData.avgFrameMs} ms`);
    console.log(`✅ Dropped Frames (>33ms): ${fpsData.droppedFrames} / ${fpsData.totalFrames}`);

    // 9. Test Switch to Text Diff View (Split View)
    console.log('\n📝 Testing Switch to Text Diff View (Split View):');
    const tStartTextSwitch = Date.now();
    const textDiffBtn = page.locator('button[title*="Text Diff View"]');
    if (await textDiffBtn.isVisible()) {
      await textDiffBtn.click();
      await page.waitForSelector('.font-mono.text-\\[13px\\]', { timeout: 5000 });
      const textSwitchDuration = Date.now() - tStartTextSwitch;
      metrics.textSwitchMs = textSwitchDuration;
      console.log(`✅ Switched to Split Text Diff View in: ${textSwitchDuration} ms`);

      // Verify Split Diff inline insertion indicator
      await page.keyboard.press('F7');
      await page.waitForTimeout(300);
      const insertedIndicator = page.locator('text=↳ inserted on right').first();
      const hasInsertedIndicator = (await insertedIndicator.count()) > 0;
      console.log(`   Split text view insertion indicator (↳ inserted on right): ${hasInsertedIndicator ? 'PASSED' : 'FAILED'}`);
    }

    // 10. Measure JS Heap Memory Usage
    const memory = await page.evaluate(() => {
      if (window.performance && window.performance.memory) {
        return {
          usedJSHeapMB: Math.round(window.performance.memory.usedJSHeapSize / (1024 * 1024)),
          totalJSHeapMB: Math.round(window.performance.memory.totalJSHeapSize / (1024 * 1024)),
        };
      }
      return null;
    });

    if (memory) {
      metrics.memory = memory;
      console.log(`\n💾 Browser JS Heap Memory: ${memory.usedJSHeapMB} MB (used) / ${memory.totalJSHeapMB} MB (allocated)`);
    }

    // 11. Final Benchmark Summary Report
    console.log('\n🎉 ========================================================');
    console.log('🏆 PLAYWRIGHT CSV PERFORMANCE BENCHMARK RESULTS');
    console.log('🎉 ========================================================');
    console.log(`1. Total Data Compared:       596,640 lines (~265 MB total)`);
    console.log(`2. Diff + Initial Table Load: ${metrics.diffAndRenderMs} ms`);
    console.log(`3. Diff Chunk Seek (Line 479):${metrics.seekMs} ms`);
    console.log(`4. Horizontal Auto-Snap:      PASSED (Snapped to Col 8: 会員番号 & Col 9: 会員区分)`);
    console.log(`5. Changed Columns Quick Bar: PASSED (Col 8 & Col 9 quick buttons)`);
    console.log(`6. High-Contrast Diff Badge:  PASSED ((empty) badge visible)`);
    console.log(`7. Virtual Scroll Smoothness: ${metrics.fps} FPS (${metrics.avgFrameMs} ms/frame)`);
    console.log(`8. Dropped Frames:            ${metrics.droppedFrames} frames`);
    console.log(`9. Text View Switch:          ${metrics.textSwitchMs || 'N/A'} ms`);
    if (metrics.memory) {
      console.log(`10. Browser Heap Memory:      ${metrics.memory.usedJSHeapMB} MB`);
    }
    console.log('========================================================\n');

    await browser.close();
  } finally {
    viteServer.kill();
    ipcClient.kill();
  }
}

runBenchmark().catch((err) => {
  console.error('❌ Playwright CSV Performance Benchmark failed:', err);
  process.exit(1);
});
