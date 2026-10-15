import { describe, it, expect } from 'vitest';
import { alignCsvHeaders } from '../components/views/CsvCompareView';

describe('Schema-Aware CSV Header & Column Alignment', () => {
  it('detects added columns at the end of File B without shifting common columns', () => {
    const leftH = ['id', 'name', 'age'];
    const rightH = ['id', 'name', 'age', 'email', 'city'];

    const columns = alignCsvHeaders(leftH, rightH);

    expect(columns).toHaveLength(5);
    expect(columns.map((c) => c.name)).toEqual(['id', 'name', 'age', 'email', 'city']);

    expect(columns[0]).toEqual({ name: 'id', leftIndex: 0, rightIndex: 0, status: 'common' });
    expect(columns[1]).toEqual({ name: 'name', leftIndex: 1, rightIndex: 1, status: 'common' });
    expect(columns[2]).toEqual({ name: 'age', leftIndex: 2, rightIndex: 2, status: 'common' });
    expect(columns[3]).toEqual({ name: 'email', leftIndex: -1, rightIndex: 3, status: 'added' });
    expect(columns[4]).toEqual({ name: 'city', leftIndex: -1, rightIndex: 4, status: 'added' });
  });

  it('detects columns inserted in the middle of File B and maintains correct column mapping', () => {
    const leftH = ['id', 'name', 'age'];
    const rightH = ['id', 'department', 'name', 'age'];

    const columns = alignCsvHeaders(leftH, rightH);

    expect(columns).toHaveLength(4);
    expect(columns.map((c) => c.name)).toEqual(['id', 'department', 'name', 'age']);

    expect(columns[0]).toEqual({ name: 'id', leftIndex: 0, rightIndex: 0, status: 'common' });
    expect(columns[1]).toEqual({ name: 'department', leftIndex: -1, rightIndex: 1, status: 'added' });
    expect(columns[2]).toEqual({ name: 'name', leftIndex: 1, rightIndex: 2, status: 'common' });
    expect(columns[3]).toEqual({ name: 'age', leftIndex: 2, rightIndex: 3, status: 'common' });
  });

  it('detects deleted columns present only in File A', () => {
    const leftH = ['id', 'dept', 'name'];
    const rightH = ['id', 'name'];

    const columns = alignCsvHeaders(leftH, rightH);

    expect(columns).toHaveLength(3);
    expect(columns[0]).toEqual({ name: 'id', leftIndex: 0, rightIndex: 0, status: 'common' });
    expect(columns[1]).toEqual({ name: 'dept', leftIndex: 1, rightIndex: -1, status: 'deleted' });
    expect(columns[2]).toEqual({ name: 'name', leftIndex: 2, rightIndex: 1, status: 'common' });
  });

  it('handles reordered columns between files correctly', () => {
    const leftH = ['id', 'name', 'age'];
    const rightH = ['id', 'age', 'name'];

    const columns = alignCsvHeaders(leftH, rightH);

    expect(columns).toHaveLength(3);
    expect(columns[0]).toEqual({ name: 'id', leftIndex: 0, rightIndex: 0, status: 'common' });
    expect(columns[1]).toEqual({ name: 'name', leftIndex: 1, rightIndex: 2, status: 'common' });
    expect(columns[2]).toEqual({ name: 'age', leftIndex: 2, rightIndex: 1, status: 'common' });
  });

  it('handles case-insensitive and trimmed header matching', () => {
    const leftH = [' ID ', 'Name '];
    const rightH = ['id', 'NAME', 'Salary'];

    const columns = alignCsvHeaders(leftH, rightH);

    expect(columns).toHaveLength(3);
    expect(columns[0].status).toBe('common');
    expect(columns[1].status).toBe('common');
    expect(columns[2]).toEqual({ name: 'Salary', leftIndex: -1, rightIndex: 2, status: 'added' });
  });

  it('falls back to positional alignment when no headers match', () => {
    const leftH = ['100', '200'];
    const rightH = ['300', '400', '500'];

    const columns = alignCsvHeaders(leftH, rightH);

    expect(columns).toHaveLength(3);
    expect(columns[0]).toEqual({ name: '100', leftIndex: 0, rightIndex: 0, status: 'common' });
    expect(columns[1]).toEqual({ name: '200', leftIndex: 1, rightIndex: 1, status: 'common' });
    expect(columns[2]).toEqual({ name: '500', leftIndex: -1, rightIndex: 2, status: 'added' });
  });

  it('handles empty header lists gracefully', () => {
    expect(alignCsvHeaders([], [])).toEqual([
      { name: 'Col 1', leftIndex: 0, rightIndex: 0, status: 'common' },
    ]);

    expect(alignCsvHeaders([], ['newCol'])).toEqual([
      { name: 'newCol', leftIndex: -1, rightIndex: 0, status: 'added' },
    ]);

    expect(alignCsvHeaders(['oldCol'], [])).toEqual([
      { name: 'oldCol', leftIndex: 0, rightIndex: -1, status: 'deleted' },
    ]);
  });
});
