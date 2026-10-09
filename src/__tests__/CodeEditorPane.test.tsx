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

  it('renders language badge and syntax highlighted backdrop when filePath is provided', () => {
    const { container } = render(
      <CodeEditorPane
        title="TypeScript Editor"
        content="const greeting = 'hello world';"
        onChange={() => {}}
        filePath="example.ts"
      />
    );

    // Checks language badge in header
    expect(screen.getByText('TYPESCRIPT')).toBeDefined();

    // Backdrop <pre><code> should be present and contain token classes
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    const token = container.querySelector('.token');
    expect(token).not.toBeNull();
  });

  it('indents with 2 spaces on Tab key press', () => {
    const handleChange = vi.fn();
    const { container } = render(
      <CodeEditorPane
        title="Indent Editor"
        content="line1"
        onChange={handleChange}
      />
    );

    const textarea = container.querySelector('textarea')!;
    textarea.selectionStart = 0;
    textarea.selectionEnd = 0;
    fireEvent.keyDown(textarea, { key: 'Tab' });

    expect(handleChange).toHaveBeenCalledWith('  line1');
  });
});
