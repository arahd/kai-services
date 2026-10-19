import { parseStreamLine, MarkdownStreamBuffer } from './stream.utils';

describe('StreamUtils', () => {
  describe('parseStreamLine', () => {
    it('should parse data: JSON lines', () => {
      const line = 'data: {"text": "hello"}';
      const parsed = parseStreamLine(line);
      expect(parsed).toEqual({ text: 'hello' });
    });

    it('should return null for invalid lines, comments, and event headers', () => {
      expect(parseStreamLine('')).toBeNull();
      expect(parseStreamLine('event: message')).toBeNull();
      expect(parseStreamLine(': sse keepalive')).toBeNull();
      expect(parseStreamLine('invalid json')).toBeNull();
    });
  });

  describe('MarkdownStreamBuffer', () => {
    let buffer: MarkdownStreamBuffer;

    beforeEach(() => {
      buffer = new MarkdownStreamBuffer();
    });

    it('should append raw text', () => {
      buffer.append('Hello');
      buffer.append(' World');
      expect(buffer.getRaw()).toBe('Hello World');
    });

    it('should track code fence open/close states', () => {
      expect(buffer.isInsideFence()).toBeFalse();
      buffer.append('```typescript\nconst x = 1;\n');
      expect(buffer.isInsideFence()).toBeTrue();
      buffer.append('```\n');
      expect(buffer.isInsideFence()).toBeFalse();
    });

    it('should evaluate shouldRender based on boundaries and timing', () => {
      buffer.append('Hello world.\n\n');
      expect(buffer.shouldRender(200, true)).toBeTrue();
    });
  });
});
