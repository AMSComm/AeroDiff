import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { SplitDiffViewer } from '../components/viewer/SplitDiffViewer';
import { useTabStore } from '../stores/tabStore';
import { DiffResult, DiffLine } from '../types/diff';

vi.mock('@tanstack/react-virtual', async () => {
  const actual = await vi.importActual<any>('@tanstack/react-virtual');
  return {
    ...actual,
    useVirtualizer: (options: any) => {
      const count = options.count;
      return {
        getTotalSize: () => count * 20,
        getVirtualItems: () =>
          Array.from({ length: count }, (_, i) => ({
            index: i,
            start: i * 20,
            size: 20,
            key: i,
          })),
        scrollToOffset: vi.fn(),
      };
    },
  };
});

describe('DiffBlockHighlight in SplitDiffViewer', () => {
  beforeEach(() => {
    // Reset tab store state
    useTabStore.setState({
      tabs: [],
      activeTabId: '',
    });
  });

  it('renders consecutive changed lines as a unified block without per-line dividing rings', () => {
    const lines: DiffLine[] = [
      {
        left_line_num: 1,
        right_line_num: 1,
        left_text: 'unchanged start',
        right_text: 'unchanged start',
        line_type: 'Unchanged',
        left_inline: [],
        right_inline: [],
        chunk_id: null,
      },
      // Chunk 0: 3 consecutive modified lines
      {
        left_line_num: 2,
        right_line_num: 2,
        left_text: 'block line 1 old',
        right_text: 'block line 1 new',
        line_type: 'Modified',
        left_inline: [],
        right_inline: [],
        chunk_id: 0,
      },
      {
        left_line_num: 3,
        right_line_num: 3,
        left_text: 'block line 2 old',
        right_text: 'block line 2 new',
        line_type: 'Modified',
        left_inline: [],
        right_inline: [],
        chunk_id: 0,
      },
      {
        left_line_num: 4,
        right_line_num: 4,
        left_text: 'block line 3 old',
        right_text: 'block line 3 new',
        line_type: 'Modified',
        left_inline: [],
        right_inline: [],
        chunk_id: 0,
      },
      {
        left_line_num: 5,
        right_line_num: 5,
        left_text: 'unchanged end',
        right_text: 'unchanged end',
        line_type: 'Unchanged',
        left_inline: [],
        right_inline: [],
        chunk_id: null,
      },
    ];

    const diffResult: DiffResult = {
      lines,
      chunks: [
        {
          chunk_id: 0,
          left_start: 2,
          left_count: 3,
          right_start: 2,
          right_count: 3,
          chunk_type: 'Modification',
          left_lines: ['block line 1 old', 'block line 2 old', 'block line 3 old'],
          right_lines: ['block line 1 new', 'block line 2 new', 'block line 3 new'],
        },
      ],
      total_left_lines: 5,
      total_right_lines: 5,
      added_chunks: 0,
      deleted_chunks: 0,
      modified_chunks: 1,
      is_identical: false,
      hash_matched: false,
    };

    const testTab = {
      id: 'tab_test_block',
      type: 'file' as const,
      title: 'compare-test.txt',
      leftPath: '/path/left.txt',
      rightPath: '/path/right.txt',
      leftContent: 'test',
      rightContent: 'test',
      isEditing: false,
      viewMode: 'split' as const,
      diffResult,
      folderResult: null,
      csvResult: null,
      options: {
        ignore_whitespace: 'None' as const,
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
    };

    useTabStore.setState({
      tabs: [testTab],
      activeTabId: 'tab_test_block',
    });

    const { container } = render(<SplitDiffViewer />);

    // Query left pane rows
    const leftContainer = container.querySelector('[data-testid="split-left-container"]');
    expect(leftContainer).not.toBeNull();

    // In virtualized container, find rows
    const rows = leftContainer!.querySelectorAll(':scope > div > div');
    expect(rows.length).toBeGreaterThanOrEqual(5);

    // Row 0: Unchanged
    const unchangedRow = rows[0];
    expect(unchangedRow.className).toContain('border-b');
    expect(unchangedRow.className).toContain('border-neutral-900/40');
    expect(unchangedRow.className).not.toContain('ring-1');

    // Row 1: Chunk start (first line of diff block)
    const blockStartRow = rows[1];
    expect(blockStartRow.className).toContain('border-t');
    expect(blockStartRow.className).toContain('border-emerald-500/70');
    // Block start must NOT have border-b dividing it from next line in the same block!
    expect(blockStartRow.className).not.toContain('border-b');
    // Must NOT have individual line ring
    expect(blockStartRow.className).not.toContain('ring-1');

    // Row 2: Chunk middle (second line of diff block)
    const blockMiddleRow = rows[2];
    // Middle row must NOT have border-t or border-b dividing lines!
    expect(blockMiddleRow.className).not.toContain('border-t');
    expect(blockMiddleRow.className).not.toContain('border-b');
    expect(blockMiddleRow.className).not.toContain('ring-1');
    // Seamless background
    expect(blockMiddleRow.className).toContain('bg-amber-500/20');

    // Row 3: Chunk end (third/last line of diff block)
    const blockEndRow = rows[3];
    expect(blockEndRow.className).toContain('border-b');
    expect(blockEndRow.className).toContain('border-emerald-500/70');
    // Block end must NOT have border-t dividing it from previous line in the same block!
    expect(blockEndRow.className).not.toContain('border-t');
    expect(blockEndRow.className).not.toContain('ring-1');

    // Row 4: Unchanged line after block
    const afterBlockRow = rows[4];
    expect(afterBlockRow.className).toContain('border-b');
    expect(afterBlockRow.className).toContain('border-neutral-900/40');
  });
});
