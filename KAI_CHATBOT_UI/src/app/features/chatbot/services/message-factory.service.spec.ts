import { TestBed } from '@angular/core/testing';
import { MessageFactoryService } from './message-factory.service';

describe('MessageFactoryService', () => {
  let service: MessageFactoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MessageFactoryService]
    });
    service = TestBed.inject(MessageFactoryService);
  });

  // --- createUserMessage ---

  it('should create user message with timestamp and default status', () => {
    const msg = service.createUserMessage('What is the weather?');
    expect(msg.sender).toBe('user');
    expect(msg.message).toBe('What is the weather?');
    expect(msg.timestamp).toBeDefined();
    expect(msg.status).toBe('completed');
    expect(msg.botResponseComplete).toBeFalse();
    expect(msg.responseType).toBe('');
  });

  it('should create user message with empty attachments by default', () => {
    const msg = service.createUserMessage('Test');
    expect(msg.attachments).toEqual([]);
  });

  it('should create user message with provided attachments', () => {
    const attachments = [{ file: new File([], 'doc.pdf'), name: 'doc.pdf', size: 100, uploading: false, progress: 100, uploaded: true }];
    const msg = service.createUserMessage('With files', attachments as any);
    expect(msg.attachments?.length).toBe(1);
    expect(msg.attachments?.[0].name).toBe('doc.pdf');
  });

  it('should set canCollapse and collapsed for long messages (>300 chars)', () => {
    const longText = 'A'.repeat(350);
    const msg = service.createUserMessage(longText);
    expect(msg.canCollapse).toBeTrue();
    expect(msg.collapsed).toBeTrue();
  });

  it('should not collapse short messages', () => {
    const msg = service.createUserMessage('Short message');
    expect(msg.canCollapse).toBeFalse();
    expect(msg.collapsed).toBeFalse();
  });

  it('should not collapse messages exactly 300 chars', () => {
    const text300 = 'A'.repeat(300);
    const msg = service.createUserMessage(text300);
    expect(msg.canCollapse).toBeFalse();
    expect(msg.collapsed).toBeFalse();
  });

  // --- createBotPlaceholder ---

  it('should create bot placeholder message with pending status', () => {
    const msg = service.createBotPlaceholder();
    expect(msg.sender).toBe('bot');
    expect(msg.role).toBe('assistant');
    expect(msg.type).toBe('text');
    expect(msg.content).toBe('');
    expect(msg.message).toBe('');
    expect(msg.html).toBe('');
    expect(msg.isPlaceholder).toBeTrue();
    expect(msg.status).toBe('pending');
    expect(msg.timestamp).toBeDefined();
  });

  // --- createErrorMessage ---

  it('should create error message with custom text', () => {
    const msg = service.createErrorMessage('Custom Error');
    expect(msg.sender).toBe('bot');
    expect(msg.content).toBe('Custom Error');
    expect(msg.message).toBe('Custom Error');
    expect(msg.html).toBe('<p>Custom Error</p>');
    expect(msg.status).toBe('failed');
    expect(msg.isPlaceholder).toBeFalse();
  });

  it('should create error message with default text when no custom message', () => {
    const msg = service.createErrorMessage();
    expect(msg.message).toContain('unable to generate a response');
    expect(msg.status).toBe('failed');
  });

  it('should create error message with empty string uses default', () => {
    const msg = service.createErrorMessage('');
    expect(msg.message).toContain('unable to generate a response');
  });

  // --- createCancelledMessage ---

  it('should create cancelled message with correct status and text', () => {
    const msg = service.createCancelledMessage();
    expect(msg.sender).toBe('bot');
    expect(msg.role).toBe('assistant');
    expect(msg.message).toBe('Response generation canceled.');
    expect(msg.status).toBe('failed');
    expect(msg.isPlaceholder).toBeFalse();
    expect(msg.timestamp).toBeDefined();
  });
});
