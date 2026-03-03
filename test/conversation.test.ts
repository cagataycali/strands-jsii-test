/**
 * Integration tests for conversation managers.
 */
import {
  NullConversationManager,
  SlidingWindowConversationManager,
  SummarizingConversationManager,
} from '../src/index';

describe('NullConversationManager', () => {
  it('returns messages unchanged', () => {
    const mgr = new NullConversationManager();
    const json = JSON.stringify([{ role: 'user', content: [{ text: 'hi' }] }]);
    expect(mgr.apply(json)).toBe(json);
  });

  it('returns correct manager type', () => {
    expect(new NullConversationManager().managerType).toBe('null');
  });
});

describe('SlidingWindowConversationManager', () => {
  it('defaults window size to 20', () => {
    expect(new SlidingWindowConversationManager().windowSize).toBe(20);
  });

  it('accepts custom window size', () => {
    expect(new SlidingWindowConversationManager(10).windowSize).toBe(10);
  });

  it('passes through when under window', () => {
    const mgr = new SlidingWindowConversationManager(5);
    const msgs = [
      { role: 'user', content: [{ text: 'a' }] },
      { role: 'assistant', content: [{ text: 'b' }] },
    ];
    const result = JSON.parse(mgr.apply(JSON.stringify(msgs)));
    expect(result).toHaveLength(2);
  });

  it('trims to window size preserving first message', () => {
    const mgr = new SlidingWindowConversationManager(3);
    const msgs = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: [{ text: `msg-${i}` }],
    }));
    const result = JSON.parse(mgr.apply(JSON.stringify(msgs)));
    expect(result).toHaveLength(3);
    // First message preserved
    expect(result[0].content[0].text).toBe('msg-0');
    // Last messages kept
    expect(result[result.length - 1].content[0].text).toBe('msg-9');
  });

  it('returns correct manager type', () => {
    expect(new SlidingWindowConversationManager().managerType).toBe('sliding_window');
  });
});

describe('SummarizingConversationManager', () => {
  it('defaults config', () => {
    const mgr = new SummarizingConversationManager();
    expect(mgr.summaryRatio).toBeCloseTo(0.3);
    expect(mgr.preserveRecentMessages).toBe(10);
    expect(mgr.maxMessages).toBe(40);
    expect(mgr.summarizationPrompt).toContain('Summarize');
  });

  it('accepts config', () => {
    const mgr = new SummarizingConversationManager({
      summaryRatio: 0.5,
      maxMessages: 20,
      preserveRecentMessages: 5,
    });
    expect(mgr.summaryRatio).toBeCloseTo(0.5);
    expect(mgr.maxMessages).toBe(20);
    expect(mgr.preserveRecentMessages).toBe(5);
  });

  it('clamps summary ratio to 0.1-0.8', () => {
    expect(new SummarizingConversationManager({ summaryRatio: 0.01 }).summaryRatio).toBeCloseTo(0.1);
    expect(new SummarizingConversationManager({ summaryRatio: 0.99 }).summaryRatio).toBeCloseTo(0.8);
  });

  it('passes through when under threshold', () => {
    const mgr = new SummarizingConversationManager({ maxMessages: 10 });
    const msgs = Array.from({ length: 5 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: [{ text: `msg-${i}` }],
    }));
    expect(JSON.parse(mgr.apply(JSON.stringify(msgs)))).toHaveLength(5);
  });

  it('summarizes when over threshold', () => {
    const mgr = new SummarizingConversationManager({
      maxMessages: 5,
      summaryRatio: 0.5,
      preserveRecentMessages: 2,
    });
    const msgs = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: [{ text: `msg-${i}` }],
    }));
    const result = JSON.parse(mgr.apply(JSON.stringify(msgs)));
    expect(result.length).toBeLessThan(10);
    expect(result[0].content[0].text).toContain('[Conversation Summary]');
  });

  it('returns correct manager type', () => {
    expect(new SummarizingConversationManager().managerType).toBe('summarizing');
  });
});
