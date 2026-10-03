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

    console.log('1️⃣ Setting up CSV Table mode with 500 lines and 2 diff chunks in active tab...');
    // Mock diff with 500 lines, chunk 0 at line 10, chunk 1 at line 50
    const mockLines = Array.from({ length: 500 }, (_, i) => ({
      left_line_num: i + 1,
      right_line_num: i + 1,
      left_text: `User_${i + 1},${1000 + i},Active,Tokyo,Standard`,
      right_text:
        i === 10
          ? `User_${i + 1},${1000 + i},INACTIVE,Tokyo,Standard`
          : i === 50
          ? `User_${i + 1},${1000 + i},Active,Tokyo,Premium`
          : `User_${i + 1},${1000 + i},Active,Tokyo,Standard`,
      line_type: i === 10 || i === 50 ? 'Modified' : 'Equal',
      chunk_id: i === 10 ? 0 : i === 50 ? 1 : null,
      left_inline: null,
      right_inline: null,
    }));

    const mockDiffResult = {
      is_identical: false,
      total_virtual_lines: 500,
      stats: { additions: 0, deletions: 0, modifications: 2, equal: 498 },
      chunks: [
        {
          chunk_id: 0,
          chunk_type: 'Modified',
          left_start: 11,
          left_count: 1,
          right_start: 11,
          right_count: 1,
        },
        {
          chunk_id: 1,
          chunk_type: 'Modified',
          left_start: 51,
          left_count: 1,
          right_start: 51,
          right_count: 1,
        },
      ],
      lines: mockLines,
    };

    await page.evaluate((diff) => {
      const state = window.__TAB_STORE__ ? window.__TAB_STORE__.getState() : null;
      if (state) {
        state.updateActiveTab({
          type: 'csv',
          title: 'data.csv',
          diffResult: diff,
          leftContent: diff.lines.map((l) => l.left_text).join('\n'),
          rightContent: diff.lines.map((l) => l.right_text).join('\n'),
          csvViewMode: 'table',
          activeChunkIndex: 0,
        });
      }
    }, mockDiffResult);

    await page.waitForTimeout(500);

    // 2. Test Cell Selection
    console.log('2️⃣ Testing cell click selection...');
    const firstCell = page.locator('[data-testid="csv-cell"]').first();
    await firstCell.waitFor({ state: 'visible', timeout: 5000 });
    await firstCell.click();
    await page.waitForTimeout(100);

    const isSelected = await firstCell.evaluate(
      (el) => el.classList.contains('ring-2') && el.classList.contains('ring-emerald-400')
    );
    console.log(`   Cell selected with emerald ring: ${isSelected ? '✅ PASSED' : '❌ FAILED'}`);
    if (!isSelected) throw new Error('First cell was not selected on click');

    // 3. Test Keyboard Navigation
    console.log('3️⃣ Testing ArrowDown / ArrowRight navigation...');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    const selectedCellInfo = await page.evaluate(() => {
      const el = document.querySelector('.ring-2.ring-emerald-400');
      return el ? el.textContent.trim() : null;
    });
    console.log(`   Selected cell after Down+Right: "${selectedCellInfo}"`);
    if (!selectedCellInfo) throw new Error('Cell selection lost after arrow navigation');
    console.log('   ✅ Keyboard arrow navigation works!');

    // 4. Test Seek to Top
    console.log('4️⃣ Testing Seek to diff chunks (must align directly to top of viewport)...');
    // First seek from line 0 -> jumps to chunk 0 at line 10 (10 * 26 = 260px)
    await page.evaluate(() => {
      window.__TAB_STORE__.getState().nextChunk();
    });
    await page.waitForTimeout(400);

    let scrollPos = await page.evaluate(() => {
      const right = document.querySelector('[data-testid="csv-right-container"]');
      return right ? right.scrollTop : 0;
    });
    console.log(`   Scroll position after seek to chunk 0: ${scrollPos}px (Expected 260px)`);
    if (Math.abs(scrollPos - 260) > 30) {
      throw new Error(`Seek to chunk 0 did not align to top! Expected ~260px, got ${scrollPos}px`);
    }
    console.log('   ✅ Chunk 0 top alignment verified (260px)!');

    // Second seek from chunk 0 -> jumps to chunk 1 at line 50 (50 * 26 = 1300px)
    await page.evaluate(() => {
      window.__TAB_STORE__.getState().nextChunk();
    });
    await page.waitForTimeout(400);

    scrollPos = await page.evaluate(() => {
      const right = document.querySelector('[data-testid="csv-right-container"]');
      return right ? right.scrollTop : 0;
    });
    console.log(`   Scroll position after seek to chunk 1: ${scrollPos}px (Expected 1300px)`);
    if (Math.abs(scrollPos - 1300) > 30) {
      throw new Error(`Seek to chunk 1 did not align to top! Expected ~1300px, got ${scrollPos}px`);
    } else {
      console.log('   ✅ Chunk 1 top alignment verified (1300px)!');
    }

    // 5. Test Trackpad Wheel on table
    console.log('5️⃣ Testing Wheel event on table...');
    const initialScroll = scrollPos;
    await page.mouse.move(700, 400);
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(200);

    const afterWheelScroll = await page.evaluate(() => {
      const right = document.querySelector('[data-testid="csv-right-container"]');
      return right ? right.scrollTop : 0;
    });
    console.log(`   Scroll position after wheel: ${afterWheelScroll}px (delta: ${afterWheelScroll - initialScroll}px)`);
    if (afterWheelScroll === initialScroll) {
      throw new Error('Trackpad/Wheel event failed to scroll the table!');
    }
    console.log('   ✅ Trackpad wheel scrolling verified in Table mode!');

    // 6. Test Master Scrollbar Dragging
    console.log('6️⃣ Testing Master Vertical Scrollbar Dragging...');
    const scrollbarThumb = page.locator('[data-testid="master-scrollbar-thumb"]');
    await scrollbarThumb.waitFor({ state: 'visible', timeout: 5000 });
    const thumbBox = await scrollbarThumb.boundingBox();
    if (!thumbBox) throw new Error('Scrollbar thumb not visible');

    // Drag thumb down by 100px
    await page.mouse.move(thumbBox.x + thumbBox.width / 2, thumbBox.y + thumbBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      thumbBox.x + thumbBox.width / 2,
      thumbBox.y + thumbBox.height / 2 + 100,
      { steps: 5 }
    );
    await page.waitForTimeout(100);

    // Verify while still holding down, thumb position moved down and did not snap back
    const midDragThumbBox = await scrollbarThumb.boundingBox();
    console.log(`   Thumb Y before: ${thumbBox.y}px, during drag: ${midDragThumbBox.y}px`);
    if (midDragThumbBox.y <= thumbBox.y + 50) {
      throw new Error('Thumb jumped back up while dragging!');
    }
    await page.mouse.up();
    console.log('   ✅ Master Scrollbar drag stability verified (no jumping back up)!');

    // 7. Test Position-Aware Diff Navigation (500, 7000, 20000)
    console.log('7️⃣ Testing Position-Aware Diff Navigation (chunks at row 500, 7000, 20000)...');
    await page.evaluate(() => {
      const state = window.__TAB_STORE__ ? window.__TAB_STORE__.getState() : null;
      if (state) {
        state.updateActiveTab({
          diffResult: {
            is_identical: false,
            total_virtual_lines: 25000,
            stats: { additions: 0, deletions: 0, modifications: 3, equal: 24997 },
            chunks: [
              {
                chunk_id: 1,
                chunk_type: 'Modified',
                left_start: 501,
                left_count: 1,
                right_start: 501,
                right_count: 1,
              },
              {
                chunk_id: 2,
                chunk_type: 'Modified',
                left_start: 7001,
                left_count: 1,
                right_start: 7001,
                right_count: 1,
              },
              {
                chunk_id: 3,
                chunk_type: 'Modified',
                left_start: 20001,
                left_count: 1,
                right_start: 20001,
                right_count: 1,
              },
            ],
            lines: [],
          },
          activeChunkIndex: 0,
          chunkJumpNonce: 0,
        });
      }
    });
    await page.waitForTimeout(300);

    // Test prevChunk from row 10000
    console.log('   Triggering prevChunk(10000) -> Expected target: row 7000 (182000px, chunk 1)...');
    await page.evaluate(() => {
      window.__TAB_STORE__.getState().prevChunk(10000);
    });
    await page.waitForTimeout(400);

    let scrollPosTarget = await page.evaluate(() => {
      const right = document.querySelector('[data-testid="csv-right-container"]');
      return right ? right.scrollTop : 0;
    });
    let activeChunk = await page.evaluate(() => {
      return window.__TAB_STORE__.getState().getActiveTab()?.activeChunkIndex;
    });
    console.log(`   Scroll position after prevChunk(10000): ${scrollPosTarget}px (Expected: 182000px), activeChunkIndex: ${activeChunk}`);
    if (Math.abs(scrollPosTarget - 7000 * 26) > 50 || activeChunk !== 1) {
      throw new Error(`prevChunk(10000) failed! Expected 182000px and index 1, got ${scrollPosTarget}px, index ${activeChunk}`);
    }
    console.log('   ✅ prevChunk from row 10000 jumped back to row 7000 (chunk 1)!');

    // Test nextChunk from row 10000
    console.log('   Triggering nextChunk(10000) -> Expected target: row 20000 (520000px, chunk 2)...');
    await page.evaluate(() => {
      window.__TAB_STORE__.getState().nextChunk(10000);
    });
    await page.waitForTimeout(400);

    scrollPosTarget = await page.evaluate(() => {
      const right = document.querySelector('[data-testid="csv-right-container"]');
      return right ? right.scrollTop : 0;
    });
    activeChunk = await page.evaluate(() => {
      return window.__TAB_STORE__.getState().getActiveTab()?.activeChunkIndex;
    });
    console.log(`   Scroll position after nextChunk(10000): ${scrollPosTarget}px (Expected: 520000px), activeChunkIndex: ${activeChunk}`);
    if (Math.abs(scrollPosTarget - 20000 * 26) > 50 || activeChunk !== 2) {
      throw new Error(`nextChunk(10000) failed! Expected 520000px and index 2, got ${scrollPosTarget}px, index ${activeChunk}`);
    }
    console.log('   ✅ nextChunk from row 10000 jumped forward to row 20000 (chunk 2)!');

    // Test wrap arounds
    console.log('   Testing wrap around: nextChunk from row 20000 -> row 500 (13000px, chunk 0)...');
    await page.evaluate(() => {
      window.__TAB_STORE__.getState().nextChunk(20000);
    });
    await page.waitForTimeout(400);

    scrollPosTarget = await page.evaluate(() => {
      const right = document.querySelector('[data-testid="csv-right-container"]');
      return right ? right.scrollTop : 0;
    });
    activeChunk = await page.evaluate(() => {
      return window.__TAB_STORE__.getState().getActiveTab()?.activeChunkIndex;
    });
    console.log(`   Scroll position after wrap: ${scrollPosTarget}px (Expected: 13000px), activeChunkIndex: ${activeChunk}`);
    if (Math.abs(scrollPosTarget - 500 * 26) > 50 || activeChunk !== 0) {
      throw new Error(`wrap around failed! Expected 13000px and index 0, got ${scrollPosTarget}px, index ${activeChunk}`);
    }
    console.log('   ✅ Wrap around forward to row 500 verified!');

    console.log('\n🎉 ALL FIXES AND SCENARIOS VERIFIED AND PASSED WITH 100% SUCCESS!');
    await browser.close();
  } finally {
    viteServer.kill();
  }
}

runTest().catch((err) => {
  console.error('❌ Verification script failed:', err);
  process.exit(1);
});
