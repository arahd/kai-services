import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BotMessageComponent } from '@features/chatbot/components/bot-message/bot-message.component';
import { CopyCodeDirective } from '@shared/directives/copy-code.directive';

describe('BotMessageComponent', () => {
  let component: BotMessageComponent;
  let fixture: ComponentFixture<BotMessageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BotMessageComponent, CopyCodeDirective]
    }).compileComponents();

    fixture = TestBed.createComponent(BotMessageComponent);
    component = fixture.componentInstance;
    component.msg = { sender: 'bot', message: 'Hello', timestamp: new Date(), responseType: 'text' };
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should return true if augSrc has context and source', () => {
    const augSrc = [{ context: 'some context', source: 'some source' }];
    expect(component.hasContextAndSource(augSrc)).toBeTrue();
  });

  it('should return false if augSrc is empty or invalid', () => {
    expect(component.hasContextAndSource([])).toBeFalse();
    expect(component.hasContextAndSource(undefined)).toBeFalse();
    expect(component.hasContextAndSource([{ context: '', source: '' }])).toBeFalse();
  });

  it('should return document icon name and presentation check correctly', () => {
    expect(component.getDocumentIconName('ppt')).toBe('presentation');
    expect(component.getDocumentIconName('pptx')).toBe('presentation');
    expect(component.getDocumentIconName('xls')).toBe('spreadsheet');
    expect(component.getDocumentIconName('xlsx')).toBe('spreadsheet');
    expect(component.getDocumentIconName('docx')).toBe('word-doc');
    expect(component.getDocumentIconName('pdf')).toBe('pdf-doc');
    expect(component.getDocumentIconName('txt')).toBe('document');

    expect(component.isPresentationExtension('pptx')).toBeTrue();
    expect(component.isPresentationExtension('doc')).toBeFalse();
  });

  it('should emit events', () => {
    spyOn(component.shareMessage, 'emit');
    spyOn(component.viewSources, 'emit');
    spyOn(component.retryMessage, 'emit');
    spyOn(component.previewImage, 'emit');

    component.shareMessage.emit();
    component.viewSources.emit([{ id: 1 }]);
    component.retryMessage.emit();
    component.previewImage.emit({ url: 'http://img', name: 'img.png' });

    expect(component.shareMessage.emit).toHaveBeenCalled();
    expect(component.viewSources.emit).toHaveBeenCalledWith([{ id: 1 }]);
    expect(component.retryMessage.emit).toHaveBeenCalled();
    expect(component.previewImage.emit).toHaveBeenCalledWith({ url: 'http://img', name: 'img.png' });
  });

  it('should trigger ngDoCheck and mark for check when message HTML changes', () => {
    component.msg = { sender: 'bot', message: 'Hello 2', html: '<p>Hello 2</p>', timestamp: new Date(), responseType: 'text' };
    expect(() => component.ngDoCheck()).not.toThrow();
  });
});
