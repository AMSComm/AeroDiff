import { describe, it, expect, beforeEach } from 'vitest';
import { useTabStore } from '../stores/tabStore';

describe('useTabStore Unit Tests', () => {
  beforeEach(() => {
    useTabStore.setState({
      tabs: [
        {
          id: 'test_tab_1',
          title: 'New Comparison',
          type: 'welcome',
          leftPath: null,
          rightPath: null,
          leftContent: 'hello world',
          rightContent: 'hello brave world',
          isEditing: false,
          viewMode: 'split',
          diffResult: null,
          folderResult: null,
          csvResult: null,
          options: {
            ignore_whitespace: 'None',
            ignore_blank_lines: false,
            ignore_case: false,
            regex_filter: null,
          },
          activeChunkIndex: 0,
          history: [],
          future: [],
          isDirtyLeft: false,
          isDirtyRight: false,
          isComputing: false,
          computeTimeMs: 0,
        },
      ],
      activeTabId: 'test_tab_1',
    });
  });

  it('should initialize with welcome tab', () => {
    const active = useTabStore.getState().getActiveTab();
    expect(active).toBeDefined();
    expect(active?.type).toBe('welcome');
    expect(active?.title).toBe('New Comparison');
  });

  it('should create and switch to new tab', () => {
    const store = useTabStore.getState();
    const newId = store.createTab('file', { title: 'Custom Tab' });

    expect(useTabStore.getState().tabs.length).toBe(2);
    expect(useTabStore.getState().activeTabId).toBe(newId);
    expect(useTabStore.getState().getActiveTab()?.title).toBe('Custom Tab');
  });

  it('should close tab and activate remaining tab', () => {
    const store = useTabStore.getState();
    const tab2 = store.createTab('folder');
    expect(useTabStore.getState().tabs.length).toBe(2);

    store.closeTab(tab2);
    expect(useTabStore.getState().tabs.length).toBe(1);
    expect(useTabStore.getState().activeTabId).toBe('test_tab_1');
  });

  it('should start comparison in active tab without opening a new tab', async () => {
    const store = useTabStore.getState();
    expect(useTabStore.getState().tabs.length).toBe(1);

    await store.startCompareInActiveTab('/path/to/left.ts', '/path/to/right.ts', {
      leftContent: 'const a = 1;',
      rightContent: 'const a = 2;',
    });

    const tabs = useTabStore.getState().tabs;
    expect(tabs.length).toBe(1); // Crucial requirement: replaces current tab in-place!
    const active = useTabStore.getState().getActiveTab();
    expect(active?.type).toBe('file');
    expect(active?.title).toBe('left.ts ↔ right.ts');
    expect(active?.leftContent).toBe('const a = 1;');
    expect(active?.rightContent).toBe('const a = 2;');
    expect(active?.diffResult).toBeDefined();
  });

  it('should auto-detect CSV files and support table/text view toggle', async () => {
    const store = useTabStore.getState();

    await store.startCompareInActiveTab('/data/left.csv', '/data/right.csv', {
      leftContent: 'id,name\n1,Alice\n2,Bob',
      rightContent: 'id,name\n1,Alice\n2,Robert',
    });

    const active = useTabStore.getState().getActiveTab();
    expect(active?.type).toBe('csv');
    expect(active?.csvViewMode).toBe('table');
    expect(active?.csvResult).toBeDefined();

    // Toggle to text mode
    await store.toggleCsvViewMode();
    expect(useTabStore.getState().getActiveTab()?.csvViewMode).toBe('text');

    // Toggle back to table mode
    await store.toggleCsvViewMode();
    expect(useTabStore.getState().getActiveTab()?.csvViewMode).toBe('table');
  });

  it('should toggle live editing mode', () => {
    const store = useTabStore.getState();
    expect(store.getActiveTab()?.isEditing).toBe(false);

    store.toggleEditing();
    expect(useTabStore.getState().getActiveTab()?.isEditing).toBe(true);

    store.toggleEditing();
    expect(useTabStore.getState().getActiveTab()?.isEditing).toBe(false);
  });

  it('should cycle ignore whitespace and boolean options', () => {
    const store = useTabStore.getState();
    expect(store.getActiveTab()?.options.ignore_whitespace).toBe('None');

    store.toggleIgnoreWhitespace();
    expect(useTabStore.getState().getActiveTab()?.options.ignore_whitespace).toBe(
      'LeadingAndTrailing'
    );

    store.toggleIgnoreBlankLines();
    expect(useTabStore.getState().getActiveTab()?.options.ignore_blank_lines).toBe(true);

    store.toggleIgnoreCase();
    expect(useTabStore.getState().getActiveTab()?.options.ignore_case).toBe(true);
  });

  it('should swap sides correctly', () => {
    const store = useTabStore.getState();
    store.updateActiveTab({
      leftContent: 'AAA',
      rightContent: 'BBB',
      leftPath: '/a',
      rightPath: '/b',
    });

    store.swapSides();
    const active = useTabStore.getState().getActiveTab();
    expect(active?.leftContent).toBe('BBB');
    expect(active?.rightContent).toBe('AAA');
    expect(active?.leftPath).toBe('/b');
    expect(active?.rightPath).toBe('/a');
  });

  it('should update line content and support undo', async () => {
    const store = useTabStore.getState();
    store.updateActiveTab({
      leftContent: 'line 1\nline 2\nline 3',
      rightContent: 'line 1\nline 2 mod\nline 3',
      diffResult: {
        total_left_lines: 3,
        total_right_lines: 3,
        added_chunks: 0,
        deleted_chunks: 0,
        modified_chunks: 1,
        is_identical: false,
        hash_matched: false,
        lines: [],
        chunks: [],
      },
    });

    // Update line 2 in leftContent
    await store.updateLineContent('left', 2, 'line 2 updated');
    expect(useTabStore.getState().getActiveTab()?.leftContent).toBe('line 1\nline 2 updated\nline 3');
    expect(useTabStore.getState().getActiveTab()?.isDirtyLeft).toBe(true);

    // Insert line at position 2 in leftContent
    await store.updateLineContent('left', 2, 'inserted line', true);
    expect(useTabStore.getState().getActiveTab()?.leftContent).toBe('line 1\ninserted line\nline 2 updated\nline 3');

    // Undo should restore previous state
    store.undoAction();
    expect(useTabStore.getState().getActiveTab()?.leftContent).toBe('line 1\nline 2 updated\nline 3');
  });

  it('should navigate chunks position-aware relative to current viewport line (row 500, 7000, 20000)', () => {
    const store = useTabStore.getState();
    store.updateActiveTab({
      diffResult: {
        total_left_lines: 25000,
        total_right_lines: 25000,
        added_chunks: 0,
        deleted_chunks: 0,
        modified_chunks: 3,
        is_identical: false,
        hash_matched: false,
        lines: [],
        chunks: [
          {
            chunk_id: 1,
            left_start: 501,
            left_count: 5,
            right_start: 501,
            right_count: 5,
            chunk_type: 'Modification',
            left_lines: [],
            right_lines: [],
          },
          {
            chunk_id: 2,
            left_start: 7001,
            left_count: 5,
            right_start: 7001,
            right_count: 5,
            chunk_type: 'Modification',
            left_lines: [],
            right_lines: [],
          },
          {
            chunk_id: 3,
            left_start: 20001,
            left_count: 5,
            right_start: 20001,
            right_count: 5,
            chunk_type: 'Modification',
            left_lines: [],
            right_lines: [],
          },
        ],
      },
      activeChunkIndex: 0,
      chunkJumpNonce: 0,
    });

    // 1. When user is at row 10000:
    // Next chunk should be chunk 2 (row 20000)
    store.nextChunk(10000);
    expect(useTabStore.getState().getActiveTab()?.activeChunkIndex).toBe(2);
    expect(useTabStore.getState().getActiveTab()?.chunkJumpNonce).toBe(1);

    // Prev chunk from row 10000 should be chunk 1 (row 7000)
    store.prevChunk(10000);
    expect(useTabStore.getState().getActiveTab()?.activeChunkIndex).toBe(1);
    expect(useTabStore.getState().getActiveTab()?.chunkJumpNonce).toBe(2);

    // 2. When user is at row 7000 (chunk 1):
    // Next chunk should be chunk 2 (row 20000)
    store.nextChunk(7000);
    expect(useTabStore.getState().getActiveTab()?.activeChunkIndex).toBe(2);

    // Prev chunk from row 7000 should be chunk 0 (row 500)
    store.prevChunk(7000);
    expect(useTabStore.getState().getActiveTab()?.activeChunkIndex).toBe(0);

    // 3. Wrap around:
    // Prev chunk from row 500 wraps to chunk 2 (row 20000)
    store.prevChunk(500);
    expect(useTabStore.getState().getActiveTab()?.activeChunkIndex).toBe(2);

    // Next chunk from row 20000 wraps to chunk 0 (row 500)
    store.nextChunk(20000);
    expect(useTabStore.getState().getActiveTab()?.activeChunkIndex).toBe(0);

    // 4. Passive scroll synchronization (updates activeChunkIndex WITHOUT incrementing chunkJumpNonce)
    const nonceBefore = useTabStore.getState().getActiveTab()?.chunkJumpNonce;

    store.syncActiveChunkFromLine(10000);
    expect(useTabStore.getState().getActiveTab()?.activeChunkIndex).toBe(1);
    expect(useTabStore.getState().getActiveTab()?.chunkJumpNonce).toBe(nonceBefore); // NO nonce change!

    store.syncActiveChunkFromLine(22000);
    expect(useTabStore.getState().getActiveTab()?.activeChunkIndex).toBe(2);
    expect(useTabStore.getState().getActiveTab()?.chunkJumpNonce).toBe(nonceBefore); // NO nonce change!

    store.syncActiveChunkFromLine(100);
    expect(useTabStore.getState().getActiveTab()?.activeChunkIndex).toBe(0);
    expect(useTabStore.getState().getActiveTab()?.chunkJumpNonce).toBe(nonceBefore); // NO nonce change!
  });
});
