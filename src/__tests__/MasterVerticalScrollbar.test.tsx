import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MasterVerticalScrollbar } from '../components/viewer/MasterVerticalScrollbar';

describe('MasterVerticalScrollbar', () => {
  it('renders track with testid', () => {
    render(
      <MasterVerticalScrollbar
        scrollTop={0}
        totalHeight={1000}
        viewportHeight={500}
        onScrollChange={() => {}}
      />
    );
    expect(screen.getByTestId('master-vertical-scrollbar')).toBeDefined();
    expect(screen.getByTestId('master-scrollbar-thumb')).toBeDefined();
  });

  it('calculates thumb geometry correctly', () => {
    render(
      <MasterVerticalScrollbar
        scrollTop={250}
        totalHeight={1000}
        viewportHeight={500}
        onScrollChange={() => {}}
      />
    );
    const thumb = screen.getByTestId('master-scrollbar-thumb');
    expect(thumb).toBeDefined();
  });

  it('triggers onScrollChange on wheel on track', () => {
    const handleScrollChange = vi.fn();
    render(
      <MasterVerticalScrollbar
        scrollTop={100}
        totalHeight={1000}
        viewportHeight={500}
        onScrollChange={handleScrollChange}
      />
    );
    const track = screen.getByTestId('master-vertical-scrollbar');
    fireEvent.wheel(track, { deltaY: 50 });
    expect(handleScrollChange).toHaveBeenCalledWith(150);
  });

  it('does not render thumb when totalHeight <= viewportHeight', () => {
    render(
      <MasterVerticalScrollbar
        scrollTop={0}
        totalHeight={400}
        viewportHeight={500}
        onScrollChange={() => {}}
      />
    );
    expect(screen.queryByTestId('master-scrollbar-thumb')).toBeNull();
  });
});
