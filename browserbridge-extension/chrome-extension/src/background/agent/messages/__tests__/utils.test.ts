import { describe, it, expect } from 'vitest';
import { extractJsonFromModelOutput } from '../utils';

describe('extractJsonFromModelOutput', () => {
  it('parses plain JSON', () => {
    expect(extractJsonFromModelOutput('{"action": "click", "index": 1}')).toEqual({ action: 'click', index: 1 });
  });

  it('parses JSON wrapped in a fenced code block', () => {
    const content = '```json\n{"action": "click", "index": 1}\n```';
    expect(extractJsonFromModelOutput(content)).toEqual({ action: 'click', index: 1 });
  });

  it('parses JSON wrapped in an unlabeled fenced code block', () => {
    const content = '```\n{"action": "click", "index": 1}\n```';
    expect(extractJsonFromModelOutput(content)).toEqual({ action: 'click', index: 1 });
  });

  it('picks the JSON block when multiple fenced code blocks are present', () => {
    const content = 'Here is my plan:\n```text\nfirst click, then type\n```\n```json\n{"action": "click"}\n```';
    expect(extractJsonFromModelOutput(content)).toEqual({ action: 'click' });
  });

  it('extracts JSON with leading and trailing prose', () => {
    const content = 'Sure, here is the result: {"action": "click", "index": 2} Let me know if you need more.';
    expect(extractJsonFromModelOutput(content)).toEqual({ action: 'click', index: 2 });
  });

  it('extracts JSON when there is trailing garbage after a balanced object', () => {
    const content = '{"thought": "clicking the button", "action": {"click": {"index": 3}}} some trailing garb';
    expect(extractJsonFromModelOutput(content)).toEqual({
      thought: 'clicking the button',
      action: { click: { index: 3 } },
    });
  });

  it('recovers JSON truncated mid-string by a max_tokens cutoff', () => {
    const content = '{"thought": "clicking the submit button because the user wants to sub';
    expect(extractJsonFromModelOutput(content)).toEqual({
      thought: 'clicking the submit button because the user wants to sub',
    });
  });

  it('recovers JSON truncated right after a comma', () => {
    const content = '{"thought": "done", "action": {"click": {"index": 3}},';
    expect(extractJsonFromModelOutput(content)).toEqual({
      thought: 'done',
      action: { click: { index: 3 } },
    });
  });

  it('recovers JSON truncated mid-key with no value yet', () => {
    const content = '{"thought": "done", "acti';
    expect(extractJsonFromModelOutput(content)).toEqual({ thought: 'done' });
  });

  it('strips trailing commas before parsing', () => {
    const content = '{"action": "click", "index": 1,}';
    expect(extractJsonFromModelOutput(content)).toEqual({ action: 'click', index: 1 });
  });

  it('normalizes smart quotes', () => {
    const content = '{“action”: “click”}';
    expect(extractJsonFromModelOutput(content)).toEqual({ action: 'click' });
  });

  it('parses the Llama tool-call format (regression)', () => {
    const content = '<|tool_call_start_id|>{"parameters": "{\\"action\\": \\"click\\"}"}<|tool_call_end_id|>';
    expect(extractJsonFromModelOutput(content)).toEqual({ action: 'click' });
  });

  it('parses the Llama python-tag format (regression)', () => {
    const content = '<|python_tag|>{"parameters": {"output": "{\\"action\\": \\"click\\"}"}}<|/python_tag|>';
    expect(extractJsonFromModelOutput(content)).toEqual({ action: 'click' });
  });

  it('throws ResponseParseError when the content is not recoverable', () => {
    expect(() => extractJsonFromModelOutput('I cannot help with that request.')).toThrow();
  });
});
