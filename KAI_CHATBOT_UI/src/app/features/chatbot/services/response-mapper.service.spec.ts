import { TestBed } from '@angular/core/testing';
import { ResponseMapperService } from './response-mapper.service';
import { MarkdownService } from '@shared/services/markdown.service';

describe('ResponseMapperService', () => {
  let service: ResponseMapperService;
  let mockMarkdownService: any;

  beforeEach(() => {
    mockMarkdownService = {
      formatMessage: jasmine.createSpy('formatMessage').and.callFake((txt: string) => Promise.resolve(`<p>${txt}</p>`))
    };

    TestBed.configureTestingModule({
      providers: [
        ResponseMapperService,
        { provide: MarkdownService, useValue: mockMarkdownService }
      ]
    });

    service = TestBed.inject(ResponseMapperService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should identify mapped response types and return mapped text', () => {
    expect(service.isMappedResponseType('PII')).toBeTrue();
    expect(service.isMappedResponseType('sensitive-question')).toBeTrue();
    expect(service.isMappedResponseType('normal')).toBeFalse();

    expect(service.getMappedResponseText('PII')).toContain('PII');
    expect(service.getMappedResponseText('invalid')).toBe('');
  });

  it('should extract images from response payloads', () => {
    const payload = {
      image_responses: [
        { image_bytes: 'ABC123Base64', image_name: 'test.png', extension: 'png' }
      ]
    };
    const images = service.extractImages(payload);

    expect(images.length).toBe(1);
    expect(images[0].url).toBe('data:image/png;base64,ABC123Base64');
    expect(images[0].name).toBe('test.png');
  });

  it('should extract documents from response payloads', () => {
    const payload = {
      generated_documents: [
        { generated_document_bytes: 'XYZ789Base64', generated_document_name: 'slides.pptx' }
      ]
    };
    const docs = service.extractDocuments(payload);

    expect(docs.length).toBe(1);
    expect(docs[0].url).toContain('data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,XYZ789Base64');
    expect(docs[0].name).toBe('slides.pptx');
    expect(docs[0].extension).toBe('pptx');
  });

  it('should clean system tags from text', () => {
    const raw = '<KUMARAN_GENERATED_IMAGE>img_123</KUMARAN_GENERATED_IMAGE> Hello world <KUMARAN_GENERATED_DOCUMENT>doc_123</KUMARAN_GENERATED_DOCUMENT>';
    const cleaned = service.cleanSystemTags(raw);
    expect(cleaned).toBe('Hello world');
  });

  it('should format message using MarkdownService', async () => {
    const res = { response: 'Sample markdown text' };
    const result = await service.formatMessage(res, 'text');

    expect(result.finalText).toBe('Sample markdown text');
    expect(result.formattedMessage).toBe('<p>Sample markdown text</p>');
    expect(mockMarkdownService.formatMessage).toHaveBeenCalledWith('Sample markdown text');
  });

  it('should format message for mapped response types like PII', async () => {
    const res = { response: 'PII Text' };
    const result = await service.formatMessage(res, 'PII');

    expect(result.finalText).toContain('PII');
    expect(result.formattedMessage).toContain('PII');
  });
});
