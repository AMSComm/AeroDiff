import { describe, it, expect, beforeEach } from 'vitest';
import { useTabStore } from '../stores/tabStore';

describe('useTabStore Unit Tests', () => {
  beforeEach(() => {
    const defaultTab = useTabStore.getState().tabs[0];
    useTabStore.setState({
      tabs: [
        {
          id: 'test_tab_1',
          title: 'So sánh Mới',
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

  it('should open file compare tab', async () => {
    const store = useTabStore.getState();
    const tabId = await store.openFileCompareTab(
      '/path/to/a.txt',
      '/path/to/b.txt',
      'line 1',
      'line 2'
    );

    const active = useTabStore.getState().getActiveTab();
    expect(active?.id).toBe(tabId);
    expect(active?.type).toBe('file');
    expect(active?.title).toBe('a.txt ↔ b.txt');
    expect(active?.leftContent).toBe('line 1');
    expect(active?.rightContent).toBe('line 2');
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
});
