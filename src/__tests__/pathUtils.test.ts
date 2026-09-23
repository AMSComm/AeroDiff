import { describe, it, expect } from 'vitest';
import { cleanPath } from '../utils/pathUtils';

describe('cleanPath utility', () => {
  it('should trim surrounding whitespace', () => {
    expect(cleanPath('   /Users/huy/file.txt   ')).toBe('/Users/huy/file.txt');
  });

  it('should strip single and double quotes', () => {
    expect(cleanPath('"/Users/huy/file.txt"')).toBe('/Users/huy/file.txt');
    expect(cleanPath("'/Users/huy/file.txt'")).toBe('/Users/huy/file.txt');
    expect(cleanPath('  "\'/Users/huy/file.txt\'"  ')).toBe('/Users/huy/file.txt');
  });

  it('should strip file:// scheme', () => {
    expect(cleanPath('file:///Users/huy/file.txt')).toBe('/Users/huy/file.txt');
    expect(cleanPath('file://Users/huy/file.txt')).toBe('/Users/huy/file.txt');
  });

  it('should decode URL percent encoding', () => {
    expect(cleanPath('file:///Users/huy/My%20Documents/test%20file.txt')).toBe(
      '/Users/huy/My Documents/test file.txt'
    );
  });

  it('should unescape backslash-escaped spaces from terminal paste', () => {
    expect(cleanPath('/Users/huy/My\\ Documents/test\\ file.txt')).toBe(
      '/Users/huy/My Documents/test file.txt'
    );
  });
});
