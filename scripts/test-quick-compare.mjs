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

    console.log('1️⃣ Activating File Compare Tab via __TAB_STORE__...');
    await page.evaluate(() => {
      const tabStore = window.__TAB_STORE__ ? window.__TAB_STORE__.getState() : null;
      if (tabStore) {
        tabStore.updateActiveTab({
          type: 'file',
          title: 'file_left.txt ↔ file_right.txt',
          leftPath: '/Users/test/file_left.txt',
          rightPath: '/Users/test/file_right.txt',
          leftContent: 'hello left world\nline 2\nline 3',
          rightContent: 'hello right world\nline 2\nline 3',
          viewMode: 'split',
          diffResult: {
            is_identical: false,
            total_virtual_lines: 3,
            stats: { additions: 0, deletions: 0, modifications: 1, equal: 2 },
            chunks: [{
              chunk_id: 0,
              chunk_type: 'Modified',
              left_start: 1,
              left_count: 1,
              right_start: 1,
              right_count: 1,
            }],
            lines: [
              {
                left_line_num: 1,
                right_line_num: 1,
                left_text: 'hello left world',
                right_text: 'hello right world',
                line_type: 'Modified',
                chunk_id: 0,
                left_inline: [],
                right_inline: [],
              },
              {
                left_line_num: 2,
                right_line_num: 2,
                left_text: 'line 2',
                right_text: 'line 2',
                line_type: 'Equal',
                chunk_id: null,
                left_inline: [],
                right_inline: [],
              },
            ],
          },
        });
      }
    });

    await page.waitForTimeout(500);

    // Verify Change Left File button and Change Right File button
    console.log('2️⃣ Verifying Change Left File and Change Right File buttons...');
    const changeLeftBtn = page.locator('button[title*="Change Left File"]');
    const changeRightBtn = page.locator('button[title*="Change Right File"]');

    const hasLeftBtn = (await changeLeftBtn.count()) > 0;
    const hasRightBtn = (await changeRightBtn.count()) > 0;
    console.log(`Found Change Left File button: ${hasLeftBtn}`);
    console.log(`Found Change Right File button: ${hasRightBtn}`);

    if (!hasLeftBtn || !hasRightBtn) {
      throw new Error('Change Left/Right File button not found in FileCompareView!');
    }

    // Test Right-Click on Left Path to open Context Menu
    console.log('3️⃣ Right-clicking Left Path to open ContextMenu...');
    const leftPathContainer = page.locator('span.text-neutral-500:text-is("Left:")').first().locator('..');
    await leftPathContainer.click({ button: 'right' });
    await page.waitForTimeout(300);

    const contextMenuItem = page.locator('button:has-text("Select as Left for Quick Compare")');
    console.log(`Context menu option "Select as Left for Quick Compare" visible: ${await contextMenuItem.count() > 0}`);
    if ((await contextMenuItem.count()) === 0) {
      throw new Error('Context Menu did not open on right-clicking Left path!');
    }

    // Click "Select as Left for Quick Compare"
    console.log('4️⃣ Selecting item as Left for Quick Compare...');
    await contextMenuItem.click();
    await page.waitForTimeout(300);

    // Verify QuickCompareHUD is rendered!
    const hud = page.locator('[data-testid="quick-compare-hud"]');
    const hudVisible = (await hud.count()) > 0;
    console.log(`QuickCompareHUD displayed: ${hudVisible}`);
    if (!hudVisible) {
      throw new Error('QuickCompareHUD did not display after selecting Left item!');
    }

    const hudText = await hud.innerText();
    console.log(`HUD Content:\n${hudText}`);

    // Verify HUD Choose Right button and Cancel button
    const chooseRightBtn = hud.locator('button:has-text("Choose Right...")');
    console.log(`Choose Right button present in HUD: ${await chooseRightBtn.count() > 0}`);

    // Test FolderCompareView: Change Folder buttons and multi-select context menu
    console.log('5️⃣ Testing FolderCompareView: Change Folder buttons & Context Menu...');
    await page.evaluate(() => {
      const tabStore = window.__TAB_STORE__ ? window.__TAB_STORE__.getState() : null;
      if (tabStore) {
        tabStore.updateActiveTab({
          type: 'folder',
          title: '📁 test_a ↔ test_b',
          leftPath: '/Users/test/dir_a',
          rightPath: '/Users/test/dir_b',
          folderResult: {
            left_dir: '/Users/test/dir_a',
            right_dir: '/Users/test/dir_b',
            total_files: 3,
            total_identical: 1,
            total_modified: 1,
            total_only_left: 1,
            total_only_right: 0,
            scan_time_ms: 12,
            entries: [
              {
                relative_path: 'subfolder_1',
                status: 'Modified',
                is_dir: true,
                left_size: null,
                right_size: null,
              },
              {
                relative_path: 'subfolder_2',
                status: 'Modified',
                is_dir: true,
                left_size: null,
                right_size: null,
              },
              {
                relative_path: 'file_data.txt',
                status: 'OnlyInLeft',
                is_dir: false,
                left_size: 1024,
                right_size: null,
              },
            ],
          },
        });
      }
    });

    await page.waitForTimeout(500);

    const changeLeftFolderBtn = page.locator('button[title*="Change Left Folder"]');
    const changeRightFolderBtn = page.locator('button[title*="Change Right Folder"]');
    console.log(`Found Change Left Folder button: ${await changeLeftFolderBtn.count() > 0}`);
    console.log(`Found Change Right Folder button: ${await changeRightFolderBtn.count() > 0}`);

    if (await changeLeftFolderBtn.count() === 0) {
      throw new Error('Change Left Folder button not found in FolderCompareView!');
    }

    // Test Multi-Selection and Context Menu in FolderCompareView
    console.log('6️⃣ Selecting multiple rows in FolderCompareView...');
    const rows = page.locator('table tbody tr');
    console.log(`Found rows in Folder table: ${await rows.count()}`);

    // Click 1st row
    await rows.nth(0).click();
    // Shift-click 2nd row to select both
    await rows.nth(1).click({ modifiers: ['Shift'] });
    await page.waitForTimeout(200);

    // Right-click on selection
    await rows.nth(1).click({ button: 'right' });
    await page.waitForTimeout(300);

    const compareMultiOption = page.locator('button:has-text("Compare Selected Items (2)")');
    console.log(`Multi-selection context menu visible: ${await compareMultiOption.count() > 0}`);
    if (await compareMultiOption.count() === 0) {
      throw new Error('Multi-selection context menu option not displayed!');
    }

    console.log('🎉 ALL PLAYWRIGHT UI TESTS PASSED SUCCESSFULLY!');

    await browser.close();
  } finally {
    viteServer.kill('SIGTERM');
  }
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
