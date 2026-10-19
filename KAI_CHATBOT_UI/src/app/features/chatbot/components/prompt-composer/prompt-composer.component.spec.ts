import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { PromptComposerComponent } from '@features/chatbot/components/prompt-composer/prompt-composer.component';
import { FormsModule } from '@angular/forms';
import { ChatFacadeService } from '@features/chatbot/services/chat-facade.service';
import { ChatStateService } from '@features/chatbot/services/chat-state.service';
import { ChatModelService } from '@features/chatbot/services/chat-model.service';
import { ChatScrollService } from '@features/chatbot/services/chat-scroll.service';
import { ToastService } from '@core/services/toast.service';
import { signal } from '@angular/core';

describe('PromptComposerComponent', () => {
  let component: PromptComposerComponent;
  let fixture: ComponentFixture<PromptComposerComponent>;
  let mockFacade: any;
  let mockState: any;
  let mockModel: any;
  let mockScroll: any;
  let mockToast: any;

  beforeEach(async () => {
    mockFacade = {
      attachment: {
        filePreviews: signal<any[]>([]),
        isFileUploading: signal<boolean>(false),
        showLeftScroll: signal<boolean>(false),
        showRightScroll: signal<boolean>(false),
        uploadedCount: signal<number>(0),
        activePreviewFile: signal<any>(null),
        getFileType: jasmine.createSpy('getFileType').and.returnValue('PDF'),
        removeImageFiles: jasmine.createSpy('removeImageFiles').and.returnValue(0),
      },
      voice: {
        waveHeights: signal<number[]>([10, 20, 30, 40]),
        isListening: signal<boolean>(false),
        isVoiceConfirming: signal<boolean>(false),
        tempTranscript: signal<string>(''),
      },
      stopVoice: jasmine.createSpy('stopVoice'),
      addFiles: jasmine.createSpy('addFiles'),
      removeFile: jasmine.createSpy('removeFile'),
    };

    const inputStates = new Map<string, any>();
    mockState = {
      currentConversation: signal<any>({ conversationID: 'conv-123', messages: [] }),
      isChatGenerating: jasmine.createSpy('isChatGenerating').and.returnValue(false),
      sendMessage: jasmine.createSpy('sendMessage'),
      cancelGeneration: jasmine.createSpy('cancelGeneration'),
      getConversationInputState: jasmine.createSpy('getConversationInputState').and.callFake((key: string) => inputStates.get(key) || null),
      saveConversationInputState: jasmine.createSpy('saveConversationInputState').and.callFake((key: string, state: any) => inputStates.set(key, state)),
      clearConversationInputState: jasmine.createSpy('clearConversationInputState').and.callFake((key: string) => inputStates.delete(key)),
    };

    mockModel = {
      models: signal<any[]>([{ model_id: 'gpt-4', label: 'GPT-4' }]),
      selectedModel: signal<string>('gpt-4'),
      modelLocked: signal<boolean>(false),
      isImageUploadRestricted: jasmine.createSpy('isImageUploadRestricted').and.returnValue(false),
      isModelImageRestricted: jasmine.createSpy('isModelImageRestricted').and.returnValue(false),
      getSelectedModelLabel: jasmine.createSpy('getSelectedModelLabel').and.returnValue('GPT-4'),
      selectModel: jasmine.createSpy('selectModel').and.returnValue(true),
    };

    mockScroll = {
      scrollToBottom: jasmine.createSpy('scrollToBottom'),
      scrollAtBottom: signal(true),
    };

    mockToast = {
      show: jasmine.createSpy('show'),
    };

    await TestBed.configureTestingModule({
      imports: [PromptComposerComponent, FormsModule],
      providers: [
        { provide: ChatFacadeService, useValue: mockFacade },
        { provide: ChatStateService, useValue: mockState },
        { provide: ChatModelService, useValue: mockModel },
        { provide: ChatScrollService, useValue: mockScroll },
        { provide: ToastService, useValue: mockToast },
      ],
    }).compileComponents();

    // Ensure clean DOM before mounting fixture so previous test suites don't leave stray overlays
    document.querySelectorAll(
      '.confirm-overlay, .search-modal-overlay, .share-modal-overlay, ' +
      '.help-modal-overlay, .settings-modal-overlay, .limit-popup-overlay, ' +
      '.preview-modal-overlay, .popup-overlay, .popover-fixed, ' +
      '.shepherd-modal-overlay-container, .chat-context-menu'
    ).forEach(el => el.remove());

    fixture = TestBed.createComponent(PromptComposerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    document.querySelectorAll(
      '.confirm-overlay, .search-modal-overlay, .share-modal-overlay, ' +
      '.help-modal-overlay, .settings-modal-overlay, .limit-popup-overlay, ' +
      '.preview-modal-overlay, .popup-overlay, .popover-fixed, ' +
      '.shepherd-modal-overlay-container, .chat-context-menu'
    ).forEach(el => el.remove());
  });

  it('should create and resolve basic service getters', () => {
    expect(component).toBeTruthy();
    expect(component.isGenerating).toBeFalse();
    expect(component.isUploading).toBeFalse();
    expect(component.isListening).toBeFalse();
    expect(component.isVoiceConfirming).toBeFalse();
    expect(component.filePreviews).toEqual([]);
    expect(component.uploadedCount).toBe(0);
    expect(component.showLeftScroll).toBeFalse();
    expect(component.showRightScroll).toBeFalse();
    expect(component.models.length).toBe(1);
    expect(component.selectedModel).toBe('gpt-4');
    expect(component.selectedModelLabel).toBe('GPT-4');
    expect(component.waveHeights).toEqual([10, 20, 30, 40]);
    expect(component.scrollAtBottom).toBeTrue();
    expect(component.isSingleLine).toBeTrue();
    expect(component.hasMessages).toBeFalse();
    expect(component.fileInputAccept).toContain('pdf');
    expect(component.visibleWaveHeights).toEqual([10, 20, 30, 40]);
  });

  it('should update inputMessage', () => {
    component.onInputChange('New message');
    expect(component.inputMessage).toBe('New message');
  });

  it('should reset input message', () => {
    component.inputMessage = 'Test message';
    component.reset();
    expect(component.inputMessage).toBe('');
  });

  it('should identify image files and file type classes', () => {
    expect(component.isImageFile('pic.jpg')).toBeTrue();
    expect(component.isImageFile('doc.pdf')).toBeFalse();
    expect(component.getFileTypeLabel('doc.pdf')).toBe('PDF');

    expect(component.getFileTypeClass('')).toBe('other');
    expect(component.getFileTypeClass('file.pdf')).toBe('pdf');
    expect(component.getFileTypeClass('file.doc')).toBe('word');
    expect(component.getFileTypeClass('file.xlsx')).toBe('excel');
    expect(component.getFileTypeClass('file.pptx')).toBe('powerpoint');
    expect(component.getFileTypeClass('file.unknown')).toBe('other');
  });

  it('should handle Enter key to send message', () => {
    component.inputMessage = 'Hello world';
    const event = { shiftKey: false, preventDefault: jasmine.createSpy('preventDefault') };
    component.handleEnter(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(mockState.sendMessage).toHaveBeenCalledWith('Hello world', []);
    expect(mockScroll.scrollToBottom).toHaveBeenCalled();
  });

  it('should not send message on Enter if shift is pressed or input is empty', () => {
    component.inputMessage = '   ';
    const event = { shiftKey: false, preventDefault: jasmine.createSpy('preventDefault') };
    component.handleEnter(event);

    expect(mockState.sendMessage).not.toHaveBeenCalled();
  });

  it('should cancel generation', () => {
    component.cancelGeneration();
    expect(mockState.cancelGeneration).toHaveBeenCalled();
  });

  it('should toggle model dropdown when model is not locked', () => {
    const event = { stopPropagation: jasmine.createSpy('stopPropagation') };
    component.toggleModelDropdown(event as any);

    expect(event.stopPropagation).toHaveBeenCalled();
    expect(component.modelDropdownOpen).toBeTrue();
  });

  it('should show toast when toggling model dropdown if model is locked', () => {
    mockModel.modelLocked.set(true);
    const event = { stopPropagation: jasmine.createSpy('stopPropagation') };
    component.toggleModelDropdown(event as any);

    expect(mockToast.show).toHaveBeenCalledWith(
      'Model is locked for this conversation. Start a new chat to switch models.',
      'info'
    );
    expect(component.modelDropdownOpen).toBeFalse();
  });

  it('should allow toggling model dropdown even if model is locked when disableModelLock is true', () => {
    mockModel.modelLocked.set(true);
    component.disableModelLock = true;
    const event = { stopPropagation: jasmine.createSpy('stopPropagation') };
    component.toggleModelDropdown(event as any);

    expect(component.isModelLocked).toBeFalse();
    expect(component.modelDropdownOpen).toBeTrue();
    expect(mockToast.show).not.toHaveBeenCalled();
  });

  it('should remove and preview files', () => {
    component.removeFile(0);
    expect(mockFacade.removeFile).toHaveBeenCalledWith(0);

    const file = { name: 'test.pdf' };
    component.previewFile(file, 0);
    expect(mockFacade.attachment.activePreviewFile()).toBe(file);
  });

  it('should handle file selection from input', fakeAsync(() => {
    const mockFile = new File(['content'], 'test.txt', { type: 'text/plain' });
    const event = {
      target: {
        files: [mockFile],
        value: 'C:\\fake\\test.txt'
      }
    };

    component.onFileSelected(event);
    tick(150);

    expect(mockFacade.addFiles).toHaveBeenCalled();
    expect(event.target.value).toBe('');
  }));

  it('should set input message programmatically', () => {
    component.setInputMessage('Direct message');
    expect(component.inputMessage).toBe('Direct message');
  });

  it('should trigger click on hidden file input on openFilePicker', () => {
    const fakeInput = { click: jasmine.createSpy('click') };
    component.hiddenFileInput = { nativeElement: fakeInput } as any;
    component.openFilePicker();
    expect(fakeInput.click).toHaveBeenCalled();
  });

  describe('Image upload restrictions in PromptComposer', () => {
    it('should exclude image/* from fileInputAccept when model restricts images', () => {
      mockModel.isImageUploadRestricted.and.returnValue(false);
      expect(component.fileInputAccept).toContain('image/*');

      mockModel.isImageUploadRestricted.and.returnValue(true);
      expect(component.fileInputAccept).not.toContain('image/*');
      expect(component.fileInputAccept).toContain('.pdf');
    });

    it('should clean up image attachments and show toast when switching to image-restricted model', () => {
      mockModel.selectModel.and.returnValue(true);
      mockModel.isModelImageRestricted.and.returnValue(true);
      mockFacade.attachment.removeImageFiles.and.returnValue(2);

      const model = { value: 'FW-Kimi-K3', label: 'FW-Kimi-K3' };
      component.selectModel(model);

      expect(mockModel.selectModel).toHaveBeenCalledWith('FW-Kimi-K3', undefined);
      expect(mockFacade.attachment.removeImageFiles).toHaveBeenCalled();
      expect(mockToast.show).toHaveBeenCalledWith(
        'Image attachments were removed because FW-Kimi-K3 does not support image uploads.',
        'info'
      );
    });

    it('should not show toast when switching to image-restricted model if no images were removed', () => {
      mockModel.selectModel.and.returnValue(true);
      mockModel.isModelImageRestricted.and.returnValue(true);
      mockFacade.attachment.removeImageFiles.and.returnValue(0);

      const model = { value: 'Kimi-K2.6', label: 'Kimi-K2.6' };
      component.selectModel(model);

      expect(mockFacade.attachment.removeImageFiles).toHaveBeenCalled();
      expect(mockToast.show).not.toHaveBeenCalled();
    });
  });

  describe('Type-to-focus and Escape listener behavior', () => {
    it('should focus textarea when a printable key is pressed on document', () => {
      const textarea = component.textArea.nativeElement;
      spyOn(textarea, 'focus').and.callThrough();

      const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true });
      document.dispatchEvent(event);

      expect(textarea.focus).toHaveBeenCalled();
    });

    it('should not focus textarea when modifier keys are pressed', () => {
      const textarea = component.textArea.nativeElement;
      spyOn(textarea, 'focus').and.callThrough();

      const ctrlEvent = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true });
      document.dispatchEvent(ctrlEvent);
      expect(textarea.focus).not.toHaveBeenCalled();

      const altEvent = new KeyboardEvent('keydown', { key: 'Tab', altKey: true, bubbles: true });
      document.dispatchEvent(altEvent);
      expect(textarea.focus).not.toHaveBeenCalled();

      const metaEvent = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true });
      document.dispatchEvent(metaEvent);
      expect(textarea.focus).not.toHaveBeenCalled();
    });

    it('should not focus textarea when a modal or overlay is open in the DOM', () => {
      const modalEl = document.createElement('div');
      modalEl.className = 'confirm-overlay';
      document.body.appendChild(modalEl);

      const textarea = component.textArea.nativeElement;
      spyOn(textarea, 'focus').and.callThrough();

      const event = new KeyboardEvent('keydown', { key: 'h', bubbles: true });
      document.dispatchEvent(event);

      expect(textarea.focus).not.toHaveBeenCalled();
      document.body.removeChild(modalEl);
    });

    it('should blur textarea on escape key', () => {
      const textarea = component.textArea.nativeElement;
      textarea.focus();
      spyOn(textarea, 'blur').and.callThrough();

      component.handleEscape();
      expect(textarea.blur).toHaveBeenCalled();
    });
  });

  describe('Per-conversation input state and prompt history isolation', () => {
    it('should save outgoing draft and restore incoming draft when switching conversations', () => {
      // Start in conv-123
      component.onInputChange('Draft for conv-123');
      expect(mockState.saveConversationInputState).toHaveBeenCalledWith(
        'conv-123',
        jasmine.objectContaining({ inputMessage: 'Draft for conv-123' })
      );

      // Switch to conv-456 (no existing draft)
      mockState.currentConversation.set({ conversationID: 'conv-456', messages: [] });
      fixture.detectChanges();

      expect(component.inputMessage).toBe('');

      // Type draft in conv-456
      component.onInputChange('Draft for conv-456');

      // Switch back to conv-123
      mockState.currentConversation.set({ conversationID: 'conv-123', messages: [] });
      fixture.detectChanges();

      expect(component.inputMessage).toBe('Draft for conv-123');
    });

    it('should navigate prompt history isolated to the active conversation', () => {
      // Set conv-123 with two user messages
      mockState.currentConversation.set({
        conversationID: 'conv-123',
        messages: [
          { sender: 'user', message: 'First query for conv 1' },
          { sender: 'bot', message: 'Bot reply' },
          { sender: 'user', message: 'Second query for conv 1' },
        ],
      });
      fixture.detectChanges();

      const upEvent = new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true });
      component.handleTextareaKeydown(upEvent);
      expect(component.inputMessage).toBe('Second query for conv 1');

      component.handleTextareaKeydown(upEvent);
      expect(component.inputMessage).toBe('First query for conv 1');

      // Now switch to conv-456 with different user messages
      mockState.currentConversation.set({
        conversationID: 'conv-456',
        messages: [
          { sender: 'user', message: 'Query for conv 2' },
          { sender: 'bot', message: 'Bot reply' },
        ],
      });
      fixture.detectChanges();

      // Press ArrowUp in conv-456 - should strictly access conv-456 queries
      component.handleTextareaKeydown(upEvent);
      expect(component.inputMessage).toBe('Query for conv 2');
    });

    it('should clear input state and queue when sendMessage is invoked', () => {
      component.onInputChange('Message to send');
      component.sendMessage();

      expect(mockState.sendMessage).toHaveBeenCalledWith('Message to send', jasmine.any(Array));
      expect(mockState.clearConversationInputState).toHaveBeenCalledWith('conv-123');
      expect(component.inputMessage).toBe('');
    });
  });
});

