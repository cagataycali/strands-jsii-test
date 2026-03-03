/**
 * Integration tests for types: enums, content blocks, messages, responses.
 */
import {
  MessageRole, StopReason, ToolResultStatus,
  ContentBlock, TextContent, ToolUseContent, ToolResultContent, ReasoningContent,
  AgentMessage, AgentResponse,
} from '../src/index';

// ── Enums ────────────────────────────────────────────────

describe('MessageRole', () => {
  it('has USER and ASSISTANT values', () => {
    expect(MessageRole.USER).toBe('user');
    expect(MessageRole.ASSISTANT).toBe('assistant');
  });
});

describe('StopReason', () => {
  it('has all stop reasons', () => {
    expect(StopReason.END_TURN).toBe('end_turn');
    expect(StopReason.TOOL_USE).toBe('tool_use');
    expect(StopReason.MAX_TOKENS).toBe('max_tokens');
    expect(StopReason.STOP_SEQUENCE).toBe('stop_sequence');
    expect(StopReason.CONTENT_FILTERED).toBe('content_filtered');
    expect(StopReason.GUARDRAIL_INTERVENED).toBe('guardrail_intervened');
  });
});

describe('ToolResultStatus', () => {
  it('has SUCCESS and ERROR', () => {
    expect(ToolResultStatus.SUCCESS).toBe('success');
    expect(ToolResultStatus.ERROR).toBe('error');
  });
});

// ── ContentBlock ─────────────────────────────────────────

describe('ContentBlock', () => {
  describe('text', () => {
    it('creates text block', () => {
      const block = ContentBlock.fromText('hello');
      expect(block.isText).toBe(true);
      expect(block.isToolUse).toBe(false);
      expect(block.isToolResult).toBe(false);
      expect(block.isReasoning).toBe(false);
      expect(block.asText?.text).toBe('hello');
      expect(block.blockType).toBe('text');
    });

    it('handles empty text', () => {
      const block = ContentBlock.fromText('');
      expect(block.isText).toBe(true);
      expect(block.asText?.text).toBe('');
    });

    it('returns undefined for wrong accessors', () => {
      const block = ContentBlock.fromText('x');
      expect(block.asToolUse).toBeUndefined();
      expect(block.asToolResult).toBeUndefined();
      expect(block.asReasoning).toBeUndefined();
    });
  });

  describe('toolUse', () => {
    it('creates tool use block', () => {
      const block = ContentBlock.fromToolUse('calc', 'tu-1', '{"expr":"2+2"}');
      expect(block.isToolUse).toBe(true);
      expect(block.isText).toBe(false);
      expect(block.asToolUse?.name).toBe('calc');
      expect(block.asToolUse?.toolUseId).toBe('tu-1');
      expect(block.asToolUse?.inputJson).toBe('{"expr":"2+2"}');
      expect(block.blockType).toBe('toolUse');
    });
  });

  describe('toolResult', () => {
    it('creates success result', () => {
      const block = ContentBlock.fromToolResult('tu-1', 'success', '{"r":4}');
      expect(block.isToolResult).toBe(true);
      expect(block.asToolResult?.toolUseId).toBe('tu-1');
      expect(block.asToolResult?.status).toBe('success');
      expect(block.asToolResult?.contentJson).toBe('{"r":4}');
      expect(block.blockType).toBe('toolResult');
    });

    it('creates error result', () => {
      const block = ContentBlock.fromToolResult('tu-2', 'error', '{"error":"fail"}');
      expect(block.asToolResult?.status).toBe('error');
    });
  });

  describe('reasoning', () => {
    it('creates reasoning block with signature', () => {
      const block = ContentBlock.fromReasoning('Let me think...', 'sig');
      expect(block.isReasoning).toBe(true);
      expect(block.asReasoning?.text).toBe('Let me think...');
      expect(block.asReasoning?.signature).toBe('sig');
      expect(block.blockType).toBe('reasoning');
    });

    it('defaults signature to empty', () => {
      const block = ContentBlock.fromReasoning('thinking');
      expect(block.asReasoning?.signature).toBe('');
    });
  });
});

// ── Value classes ────────────────────────────────────────

describe('TextContent', () => {
  it('stores text', () => {
    expect(new TextContent('hello').text).toBe('hello');
  });
});

describe('ToolUseContent', () => {
  it('stores all fields', () => {
    const c = new ToolUseContent('search', 'id-1', '{"q":"test"}');
    expect(c.name).toBe('search');
    expect(c.toolUseId).toBe('id-1');
    expect(c.inputJson).toBe('{"q":"test"}');
  });
});

describe('ToolResultContent', () => {
  it('stores all fields', () => {
    const c = new ToolResultContent('id-1', 'success', '{"data":42}');
    expect(c.toolUseId).toBe('id-1');
    expect(c.status).toBe('success');
    expect(c.contentJson).toBe('{"data":42}');
  });
});

describe('ReasoningContent', () => {
  it('stores text and signature', () => {
    const c = new ReasoningContent('thinking', 'abc');
    expect(c.text).toBe('thinking');
    expect(c.signature).toBe('abc');
  });
  it('defaults signature', () => {
    expect(new ReasoningContent('x').signature).toBe('');
  });
});

// ── AgentMessage ─────────────────────────────────────────

describe('AgentMessage', () => {
  it('creates with role and content', () => {
    const msg = new AgentMessage(MessageRole.USER, [ContentBlock.fromText('hi')]);
    expect(msg.role).toBe('user');
    expect(msg.content).toHaveLength(1);
  });

  it('userMessage factory', () => {
    const msg = AgentMessage.userMessage('Hello');
    expect(msg.role).toBe('user');
    expect(msg.firstText).toBe('Hello');
  });

  it('assistantMessage factory', () => {
    const msg = AgentMessage.assistantMessage('Hi');
    expect(msg.role).toBe('assistant');
    expect(msg.firstText).toBe('Hi');
  });

  it('firstText skips non-text blocks', () => {
    const msg = new AgentMessage(MessageRole.ASSISTANT, [
      ContentBlock.fromToolUse('calc', 'id', '{}'),
      ContentBlock.fromText('result'),
    ]);
    expect(msg.firstText).toBe('result');
  });

  it('firstText returns undefined when no text', () => {
    const msg = new AgentMessage(MessageRole.ASSISTANT, [
      ContentBlock.fromToolUse('calc', 'id', '{}'),
    ]);
    expect(msg.firstText).toBeUndefined();
  });

  it('fullText concatenates all text blocks', () => {
    const msg = new AgentMessage(MessageRole.ASSISTANT, [
      ContentBlock.fromText('Hello '),
      ContentBlock.fromToolUse('calc', 'id', '{}'),
      ContentBlock.fromText('World'),
    ]);
    expect(msg.fullText).toBe('Hello World');
  });

  it('fullText returns empty for no text', () => {
    expect(new AgentMessage(MessageRole.ASSISTANT, []).fullText).toBe('');
  });
});

// ── AgentResponse ────────────────────────────────────────

describe('AgentResponse', () => {
  it('provides all accessors', () => {
    const msg = AgentMessage.assistantMessage('Answer');
    const resp = new AgentResponse(msg, 'end_turn', [msg], 10, 5);
    expect(resp.text).toBe('Answer');
    expect(resp.stopReason).toBe('end_turn');
    expect(resp.inputTokens).toBe(10);
    expect(resp.outputTokens).toBe(5);
    expect(resp.totalTokens).toBe(15);
    expect(resp.message).toBe(msg);
    expect(resp.messages).toHaveLength(1);
  });
});
