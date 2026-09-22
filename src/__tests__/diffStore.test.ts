import { describe, it, expect, beforeEach } from 'vitest';
import { useDiffStore } from '../stores/diffStore';

describe('useDiffStore Unit Tests', () => {
  beforeEach(() => {
    useDiffStore.setState({
      compareMode: 'file',
      viewMode: 'split',
      leftContent: 'line 1\nline 2',
      rightContent: 'line 1\nline 2 mod',
      leftPath: null,
      rightPath: null,
      diffResult: null,
      activeChunkIndex: 0,
      history: [],
      future: [],
    });
  });

  it('should initialize with default state', () => {
    const state = useDiffStore.getState();
    expect(state.compareMode).toBe('file');
    expect(state.viewMode).toBe('split');
    expect(state.options.ignore_whitespace).toBe('None');
  });

  it('should switch compare modes properly', () => {
    const store = useDiffStore.getState();
    store.setCompareMode('folder');
    expect(useDiffStore.getState().compareMode).toBe('folder');

    store.setCompareMode('csv');
    expect(useDiffStore.getState().compareMode).toBe('csv');
  });

  it('should switch view mode between split and unified', () => {
    const store = useDiffStore.getState();
    store.setViewMode('unified');
    expect(useDiffStore.getState().viewMode).toBe('unified');

    store.setViewMode('split');
    expect(useDiffStore.getState().viewMode).toBe('split');
  });

  it('should calculate diff and produce chunks', async () => {
    const store = useDiffStore.getState();
    await store.runDiff();

    const diff = useDiffStore.getState().diffResult;
    expect(diff).not.toBeNull();
    expect(diff!.chunks.length).toBeGreaterThan(0);
    expect(diff!.lines.length).toBe(2);
  });

  it('should swap left and right sides', () => {
    const store = useDiffStore.getState();
    const origLeft = store.leftContent;
    const origRight = store.rightContent;

    store.swapSides();

    expect(useDiffStore.getState().leftContent).toBe(origRight);
    expect(useDiffStore.getState().rightContent).toBe(origLeft);
  });

  it('should merge chunk and allow undo/redo', async () => {
    const store = useDiffStore.getState();
    await store.runDiff();

    const diff = useDiffStore.getState().diffResult!;
    expect(diff.chunks.length).toBe(1);

    // Merge chunk 0 left to right
    await store.mergeChunkAction(0, 'left_to_right');

    // Right content should now match left content
    expect(useDiffStore.getState().rightContent).toBe('line 1\nline 2');
    expect(useDiffStore.getState().history.length).toBe(1);

    // Undo merge
    useDiffStore.getState().undo();
    expect(useDiffStore.getState().rightContent).toBe('line 1\nline 2 mod');
    expect(useDiffStore.getState().future.length).toBe(1);

    // Redo merge
    useDiffStore.getState().redo();
    expect(useDiffStore.getState().rightContent).toBe('line 1\nline 2');
  });

  it('should cycle nextChunk and prevChunk correctly', async () => {
    useDiffStore.setState({
      diffResult: {
        lines: [],
        chunks: [
          {
            chunk_id: 0,
            left_start: 1,
            left_count: 1,
            right_start: 1,
            right_count: 1,
            chunk_type: 'Modification',
            left_lines: [],
            right_lines: [],
          },
          {
            chunk_id: 1,
            left_start: 2,
            left_count: 1,
            right_start: 2,
            right_count: 1,
            chunk_type: 'Modification',
            left_lines: [],
            right_lines: [],
          },
        ],
        total_left_lines: 2,
        total_right_lines: 2,
        added_chunks: 0,
        deleted_chunks: 0,
        modified_chunks: 2,
        is_identical: false,
        hash_matched: false,
      },
      activeChunkIndex: 0,
    });

    const store = useDiffStore.getState();
    store.nextChunk();
    expect(useDiffStore.getState().activeChunkIndex).toBe(1);

    store.nextChunk(); // wrap around
    expect(useDiffStore.getState().activeChunkIndex).toBe(0);

    store.prevChunk(); // wrap around backwards
    expect(useDiffStore.getState().activeChunkIndex).toBe(1);
  });
});
