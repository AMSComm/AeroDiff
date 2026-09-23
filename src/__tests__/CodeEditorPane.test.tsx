import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { CodeEditorPane } from '../components/viewer/CodeEditorPane';

describe('CodeEditorPane', () => {
  it('renders title and line numbers corresponding to content', () => {
    const handleChange = vi.fn();
    const content = 'line 1\nline 2\nline 3';

    render(
      <CodeEditorPane
        title="Left Editor"
        content={content}
        onChange={handleChange}
        placeholder="Type here..."
      />
    );

    // Check title and line count
    expect(screen.getByText('Left Editor')).toBeDefined();
    expect(screen.getByText('3 lines')).toBeDefined();

    // Line numbers in gutter
    expect(screen.getByText('1')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getByText('3')).toBeDefined();
  });

  it('displays unsaved badge when isDirty is true', () => {
    render(
      <CodeEditorPane
        title="Right Editor"
        content="single line"
        onChange={() => {}}
        isDirty={true}
      />
    );

    expect(screen.getByText('(Unsaved)')).toBeDefined();
    expect(screen.getByText('1 line')).toBeDefined();
  });

  it('triggers onChange callback when textarea input changes', () => {
    const handleChange = vi.fn();
    render(
      <CodeEditorPane
        title="Test Editor"
        content=""
        onChange={handleChange}
        placeholder="Type here..."
      />
    );

    const textarea = screen.getByPlaceholderText('Type here...');
    fireEvent.change(textarea, { target: { value: 'const x = 10;' } });

    expect(handleChange).toHaveBeenCalledWith('const x = 10;');
  });

  it('updates gutter scroll position on textarea scroll', () => {
    const { container } = render(
      <CodeEditorPane
        title="Scroll Editor"
        content={'test\n'.repeat(50)}
        onChange={() => {}}
      />
    );

    const textarea = container.querySelector('textarea')!;
    const gutter = container.querySelector('.select-none.text-\\[11px\\].leading-5')!;

    // Simulate scroll on textarea
    fireEvent.scroll(textarea, { target: { scrollTop: 120 } });
    expect(gutter.scrollTop).toBe(120);
  });
});
