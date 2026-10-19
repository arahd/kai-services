import {
  Component,
  ChangeDetectionStrategy,
  ViewChild,
  ElementRef,
  inject,
  HostListener,
  ChangeDetectorRef,
  Input,
  Output,
  EventEmitter,
  effect,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TooltipDirective } from '@shared/directives/tooltip.directive';
import { ChatIconComponent } from '@features/chatbot/components/chat-icon/chat-icon.component';
import { ChatFacadeService } from '@features/chatbot/services/chat-facade.service';
import { ChatStateService } from '@features/chatbot/services/chat-state.service';
import { ChatModelService } from '@features/chatbot/services/chat-model.service';
import { ChatScrollService } from '@features/chatbot/services/chat-scroll.service';
import { Router } from '@angular/router';
import { SidenavLayoutBridgeService } from '@core/layout/sidenav-layout-bridge.service';
import { ToastService } from '@core/services/toast.service';
import { FileUtils } from '@shared/utils/file.utils';

export interface QueuedPrompt {
  id: string;
  message: string;
  files?: any[];
  editing?: boolean;
  editDraft?: string;
  addedAt: number;
}

@Component({
  selector: 'app-prompt-composer',
  standalone: true,
  imports: [CommonModule, FormsModule, TooltipDirective, ChatIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './prompt-composer.component.html',
  styleUrls: ['./prompt-composer.component.scss'],
})
export class PromptComposerComponent implements OnInit, OnDestroy {
  public readonly chatFacade = inject(ChatFacadeService);
  public readonly chatState = inject(ChatStateService);
  public readonly chatModelService = inject(ChatModelService);
  public readonly chatScrollService = inject(ChatScrollService);
  private readonly router = inject(Router, { optional: true });
  private readonly layoutBridge = inject(SidenavLayoutBridgeService, { optional: true });
  private readonly toastService = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);

  /* ── Local States ── */
  inputMessage = '';
  isExpanded = false;
  isMultiLine = false;
  modelDropdownOpen = false;
  showExpandToggle = false;
  private baseVoiceMessage = '';

  /* ── Prompt Queue ── */
  promptQueue: QueuedPrompt[] = [];
  isQueueCollapsed: boolean = true;
  private queueProcessing = false;
  private previousGenerating = false;
  private lastConversationKey = '';

  /* ── Drag-and-Drop Reorder ── */
  draggedIndex: number = -1;
  dragOverIndex: number = -1;

  historyIndex = -1;
  tempHistoryDraft = '';
  private readonly localFallbackState = new Map<
    string,
    { inputMessage: string; files: any[]; promptQueue: QueuedPrompt[] }
  >();

  get currentConvKey(): string {
    const conv =
      typeof this.chatState?.currentConversation === 'function'
        ? this.chatState.currentConversation()
        : null;
    if (conv) {
      const key =
        conv.conversationID || conv.tempId || (conv.id ? conv.id.toString() : '');
      if (key) return key;
    }
    if (this.isWelcomePage) {
      return 'welcome';
    }
    const activeId =
      typeof this.chatFacade?.history?.activeConversationID === 'function'
        ? this.chatFacade.history.activeConversationID()
        : null;
    if (activeId) return activeId;
    const tempId =
      typeof this.chatFacade?.history?.activeTempId === 'function'
        ? this.chatFacade.history.activeTempId()
        : null;
    if (tempId) return tempId;
    return 'welcome';
  }

  get conversationQueries(): string[] {
    const conv =
      typeof this.chatState?.currentConversation === 'function'
        ? this.chatState.currentConversation()
        : null;
    if (!conv || !Array.isArray(conv.messages)) return [];
    const queries: string[] = [];
    for (const m of conv.messages) {
      if (
        m.sender === 'user' &&
        !m.isPlaceholder &&
        typeof m.message === 'string' &&
        m.message.trim().length > 0
      ) {
        queries.push(m.message.trim());
      }
    }
    return queries;
  }

  saveCurrentState(targetKey?: string): void {
    const key = targetKey || this.lastConversationKey || this.currentConvKey;
    if (!key) return;

    const files = Array.isArray(this.filePreviews) ? [...this.filePreviews] : [];
    const queue = Array.isArray(this.promptQueue) ? [...this.promptQueue] : [];

    if (typeof this.chatState?.saveConversationInputState === 'function') {
      this.chatState.saveConversationInputState(key, {
        inputMessage: this.inputMessage,
        files,
        promptQueue: queue,
      });
    } else {
      this.localFallbackState.set(key, {
        inputMessage: this.inputMessage,
        files,
        promptQueue: queue,
      });
    }
  }

  restoreStateFor(key: string): void {
    if (!key) return;

    let savedState: {
      inputMessage: string;
      files?: any[];
      promptQueue?: any[];
    } | null = null;

    if (typeof this.chatState?.getConversationInputState === 'function') {
      savedState = this.chatState.getConversationInputState(key);
    } else {
      savedState = this.localFallbackState.get(key) || null;
    }

    this.inputMessage = savedState?.inputMessage || '';
    if (this.textArea?.nativeElement) {
      this.textArea.nativeElement.value = this.inputMessage;
    }

    if (typeof this.chatFacade?.attachment?.filePreviews?.set === 'function') {
      this.chatFacade.attachment.filePreviews.set(
        savedState?.files && Array.isArray(savedState.files)
          ? [...savedState.files]
          : []
      );
    }

    this.promptQueue =
      savedState?.promptQueue && Array.isArray(savedState.promptQueue)
        ? [...savedState.promptQueue]
        : [];

    this.historyIndex = -1;
    this.tempHistoryDraft = '';
    this.autoResize();
    this.cdr.markForCheck();
  }

  ngOnInit(): void {
    const key = this.currentConvKey;
    this.lastConversationKey = key;
    this.restoreStateFor(key);
  }

  ngOnDestroy(): void {
    this.saveCurrentState();
  }

  constructor() {
    effect(() => {
      const listening = this.chatFacade.voice.isListening();
      const liveText = this.chatFacade.voice.tempTranscript();

      if (listening && liveText !== undefined) {
        const prefix = this.baseVoiceMessage;
        const separator = prefix && liveText && !/\s$/.test(prefix) ? ' ' : '';
        this.inputMessage = `${prefix}${separator}${liveText}`;
        const el = this.textArea?.nativeElement;
        if (el) {
          el.value = this.inputMessage;
        }
        this.cdr.markForCheck();
        setTimeout(() => this.autoResize(), 0);
      }
    });

    effect(() => {
      // Re-trigger change detection and sync input state when conversation or generating states change
      if (typeof this.chatState?.currentConversation === 'function') {
        const newKey = this.currentConvKey;
        if (this.lastConversationKey && this.lastConversationKey !== newKey) {
          this.saveCurrentState(this.lastConversationKey);
          this.restoreStateFor(newKey);
          this.lastConversationKey = newKey;
        } else if (!this.lastConversationKey && newKey) {
          this.lastConversationKey = newKey;
          this.restoreStateFor(newKey);
        }
      }
      if (typeof this.chatFacade?.history?.generatingStates === 'function') {
        this.chatFacade.history.generatingStates();
      }
      this.cdr.markForCheck();

      // Auto-process queue when generation completes
      const currentlyGenerating = this.isGenerating;
      if (this.previousGenerating && !currentlyGenerating && this.promptQueue.length > 0) {
        setTimeout(() => this.processNextInQueue(), 400);
      }
      this.previousGenerating = currentlyGenerating;
    });
  }

  @ViewChild('fileScrollContainer') fileScrollContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('textArea') textArea!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('hiddenFileInput') hiddenFileInput!: ElementRef<HTMLInputElement>;

  // Getters resolving states from services

  @Input() isWelcomePage = false;
  @Input() dropdownDirection?: 'up' | 'down';
  @Input() disableModelLock = false;
  @Input() placeholder = 'Start your request, and let KAI handle everything';
  @Output() messageSent = new EventEmitter<{ message: string; files?: any[] }>();

  get isModelLocked(): boolean {
    if (this.disableModelLock) {
      return false;
    }
    return this.chatModelService.modelLocked();
  }

  get isGenerating(): boolean {
    if (this.isWelcomePage) {
      const conv = this.chatState.currentConversation();
      if (!conv || !conv.messages || conv.messages.length === 0) {
        return false;
      }
    }
    const conv = this.chatState.currentConversation();
    if (!conv) return false;
    const key = conv.conversationID || conv.tempId || conv.id.toString();
    return this.chatState.isChatGenerating(key);
  }

  get isUploading(): boolean {
    return this.chatFacade.attachment.isFileUploading();
  }

  get isListening(): boolean {
    return this.chatFacade.voice.isListening();
  }

  get isVoiceConfirming(): boolean {
    return this.chatFacade.voice.isVoiceConfirming();
  }

  get filePreviews(): any[] {
    return this.chatFacade.attachment.filePreviews();
  }

  get uploadedCount(): number {
    return this.chatFacade.attachment.uploadedCount();
  }

  get showLeftScroll(): boolean {
    return this.chatFacade.attachment.showLeftScroll();
  }

  get showRightScroll(): boolean {
    return this.chatFacade.attachment.showRightScroll();
  }

  get models() {
    return this.chatModelService.models();
  }

  get selectedModel() {
    return this.chatModelService.selectedModel();
  }

  get selectedModelLabel() {
    return this.chatModelService.getSelectedModelLabel();
  }

  get waveHeights() {
    return this.chatFacade.voice.waveHeights();
  }

  get tempTranscript(): string {
    return this.chatFacade.voice.tempTranscript();
  }

  get isChatConversationRoute(): boolean {
    if (!this.router) return true;
    const url = (this.router.url || '').split('?')[0].split('#')[0];
    const isChatbotConvo = url.startsWith('/chatbot/') && url !== '/chatbot';
    const isProjectConvo = /^\/projects\/[^/]+\/[^/]+/.test(url);
    return isChatbotConvo || isProjectConvo;
  }

  get scrollAtBottom(): boolean {
    if (this.isWelcomePage || !this.hasMessages || !this.isChatConversationRoute) {
      return true;
    }
    return this.chatScrollService.scrollAtBottom();
  }

  get showScrollToBottom(): boolean {
    if (this.isWelcomePage || !this.hasMessages || !this.isChatConversationRoute) {
      return false;
    }
    return !this.chatScrollService.scrollAtBottom();
  }

  get isSingleLine(): boolean {
    return (
      this.filePreviews.length === 0 &&
      !this.isMultiLine
    );
  }

  get hasMessages(): boolean {
    const conv = this.chatState.currentConversation();
    return conv ? conv.messages.length > 0 : false;
  }

  get fileInputAccept(): string {
    if (this.chatModelService.isImageUploadRestricted()) {
      return '.pdf, .doc, .docx, .xls, .xlsx, .txt, .csv, .pptx, .ppt';
    }
    return 'image/*, .pdf, .doc, .docx, .xls, .xlsx, .txt, .csv, .pptx, .ppt';
  }

  // Keep waveform compact like Figma: show a fixed number of bars
  get visibleWaveHeights(): number[] {
    const src = Array.isArray(this.waveHeights) ? this.waveHeights : [];
    const BAR_COUNT = 22; // compact width so tick/cross always visible
    if (src.length <= BAR_COUNT) return src;
    // take the middle slice for a stable look
    const start = Math.floor((src.length - BAR_COUNT) / 2);
    return src.slice(start, start + BAR_COUNT);
  }

  onInputChange(val: string) {
    this.inputMessage = val;
    this.historyIndex = -1;
    this.saveCurrentState();
  }

  setInputMessage(msg: string) {
    this.inputMessage = msg;
    const el = this.textArea?.nativeElement;
    if (el) {
      el.value = msg;
    }
    this.historyIndex = -1;
    this.saveCurrentState();
    this.autoResize();
    this.cdr.detectChanges();
    this.autoResize();
  }

  focus() {
    const el = this.textArea?.nativeElement;
    if (el) {
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }

  handleEnter(event: any) {
    if (!event.shiftKey && !this.isUploading) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  private applyHistoryMessage(msg: string, caretPosition: 'start' | 'end' = 'start'): void {
    this.inputMessage = msg;
    const el = this.textArea?.nativeElement;
    if (el) {
      el.value = msg;
      const pos = caretPosition === 'start' ? 0 : msg.length;
      el.setSelectionRange(pos, pos);
    }
    this.saveCurrentState();
    this.autoResize();
    this.cdr.detectChanges();
    this.autoResize();
  }

  handleTextareaKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.handleEnter(event);
      return;
    }

    if (event.key === 'ArrowUp') {
      const textarea = this.textArea?.nativeElement;
      const isAtBeginning = !textarea || textarea.selectionStart === 0;
      const queries = this.conversationQueries;

      if (isAtBeginning && queries.length > 0) {
        event.preventDefault();
        if (this.historyIndex === -1) {
          this.tempHistoryDraft = this.inputMessage;
          this.historyIndex = queries.length - 1;
        } else if (this.historyIndex > 0) {
          this.historyIndex--;
        }
        this.applyHistoryMessage(queries[this.historyIndex], 'start');
      }
    } else if (event.key === 'ArrowDown') {
      const textarea = this.textArea?.nativeElement;
      const isAtEnd =
        !textarea || textarea.selectionEnd === textarea.value.length;
      const queries = this.conversationQueries;

      if (this.historyIndex !== -1 && (isAtEnd || !this.inputMessage)) {
        event.preventDefault();
        if (this.historyIndex < queries.length - 1) {
          this.historyIndex++;
          this.applyHistoryMessage(queries[this.historyIndex], 'end');
        } else {
          this.historyIndex = -1;
          this.applyHistoryMessage(this.tempHistoryDraft, 'end');
        }
      }
    }
  }

  isImageFile(name: string): boolean {
    return /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(name || '');
  }

  getFileTypeLabel(name: string): string {
    return this.chatFacade.attachment.getFileType(name);
  }

  getFileIconName(name: string): string {
    return FileUtils.getFileIconName(name);
  }

  getFileTypeClass(name: string): string {
    if (!name) return 'other';
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (['doc', 'docx'].includes(ext || '') || name.toLowerCase().includes('doc')) return 'word';
    if (['xls', 'xlsx', 'csv'].includes(ext || '') || name.toLowerCase().includes('xls') || name.toLowerCase().includes('csv')) return 'excel';
    if (['ppt', 'pptx'].includes(ext || '')) return 'powerpoint';
    return 'other';
  }

  autoResize(event?: Event) {
    const textarea = this.textArea?.nativeElement;
    if (!textarea) return;

    // Reset to auto to measure true scrollHeight
    textarea.style.height = 'auto';
    const savedMinHeight = textarea.style.minHeight;
    textarea.style.minHeight = '0px';

    const computedStyle = getComputedStyle(textarea);
    const lineHeight = parseFloat(computedStyle.lineHeight) || 24;
    const contentHeight = textarea.scrollHeight;

    textarea.style.minHeight = savedMinHeight;
    const newHeight = Math.min(contentHeight, 250);
    textarea.style.height = `${newHeight}px`;

    const exceedsThreshold = contentHeight > lineHeight * 2;
    const oldIsMultiLine = this.isMultiLine;
    if (textarea.value.trim().length === 0) {
      this.isMultiLine = false;
    } else if (this.isMultiLine) {
      // Hysteresis
    } else {
      this.isMultiLine = exceedsThreshold;
    }

    this.showExpandToggle = contentHeight > 204; // 200 max px + 4
    this.cdr.markForCheck();

    
    if (this.isMultiLine !== oldIsMultiLine) {
      this.cdr.detectChanges();
      this.autoResize();
    }
  }

  sendMessage() {
    if (!this.inputMessage.trim() || this.isUploading) {
      return;
    }
    this.autoResize();
    if (this.isListening) {
      this.chatFacade.stopVoice();
    }

    if (this.messageSent.observed) {
      this.messageSent.emit({
        message: this.inputMessage,
        files: [...this.filePreviews],
      });
      if (typeof this.chatState?.clearConversationInputState === 'function') {
        this.chatState.clearConversationInputState(this.currentConvKey);
      }
      this.localFallbackState.delete(this.currentConvKey);
      this.reset();
      return;
    }

    // If currently generating, queue the prompt instead of sending
    if (this.isGenerating) {
      this.addToQueue(this.inputMessage, [...this.filePreviews]);
      if (typeof this.chatState?.clearConversationInputState === 'function') {
        this.chatState.clearConversationInputState(this.currentConvKey);
      }
      this.reset();
      this.saveCurrentState();
      return;
    }

    const previews = this.filePreviews;
    const messageToSend = this.inputMessage;
    if (typeof this.chatState?.clearConversationInputState === 'function') {
      this.chatState.clearConversationInputState(this.currentConvKey);
    }
    this.localFallbackState.delete(this.currentConvKey);
    this.chatState.sendMessage(messageToSend, previews);
    this.reset();

    // Ensure chat scrolls to bottom after sending a message
    this.chatScrollService.scrollToBottom();
  }

  cancelGeneration() {
    this.chatState.cancelGeneration();
  }

  openFilePicker() {
    this.hiddenFileInput?.nativeElement?.click();
  }

  onFileSelected(event: any) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const conv = this.chatState.currentConversation();
    this.chatFacade.addFiles(input.files, conv?.conversationID || '');
    input.value = '';
    setTimeout(() => {
      this.updateScrollIndicators();
      this.saveCurrentState();
    }, 100);
  }

  onFileScroll() {
    this.updateScrollIndicators();
  }

  scrollFiles(direction: 'left' | 'right') {
    const el = this.fileScrollContainer?.nativeElement;
    if (!el) return;
    const scrollAmount = 200;
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  }

  updateScrollIndicators() {
    if (!this.fileScrollContainer) return;
    const el = this.fileScrollContainer.nativeElement;
    this.chatFacade.attachment.showLeftScroll.set(el.scrollLeft > 5);
    this.chatFacade.attachment.showRightScroll.set(el.scrollLeft + el.clientWidth < el.scrollWidth - 5);
  }

  removeFile(index: number) {
    this.chatFacade.removeFile(index);
    this.saveCurrentState();
  }

  previewFile(fp: any, index: number) {
    this.chatFacade.attachment.activePreviewFile.set(fp);
  }

  toggleModelDropdown(event: Event) {
    if (this.isModelLocked) {
      this.toastService.show(
        'Model is locked for this conversation. Start a new chat to switch models.',
        'info'
      );
      return;
    }
    event.stopPropagation();
    this.modelDropdownOpen = !this.modelDropdownOpen;
    if (this.layoutBridge) {
      const sidenav = this.layoutBridge.getSidenavInstance();
      if (sidenav) {
        sidenav.activeOptionsIndex = null;
      }
    }
  }

  selectModel(model: any, event?: Event) {
    if (event) event.stopPropagation();
    if (this.isModelLocked) {
      this.toastService.show(
        'Model is locked for this conversation. Start a new chat to switch models.',
        'info'
      );
      this.modelDropdownOpen = false;
      return;
    }
    const email = this.chatState.userInfo?.email || this.chatState.user?.email;
    const changed = this.chatModelService.selectModel(model.value, email);
    if (changed && this.chatModelService.isModelImageRestricted(model.value)) {
      const removedCount = this.chatFacade.attachment.removeImageFiles();
      if (removedCount > 0) {
        this.toastService.show(
          `Image attachment${removedCount > 1 ? 's were' : ' was'} removed because ${model.label || model.value} does not support image uploads.`,
          'info'
        );
      }
    }
    this.modelDropdownOpen = false;
  }

  startVoice() {
    this.chatFacade.startVoice((err: any) => {
      this.toastService.show('Enable mic access to dictate!', 'error');
    });
  }

  stopVoice() {
    this.chatFacade.stopVoice();
  }

  cancelVoiceMode() {
    this.chatFacade.cancelVoiceMode();
  }

  confirmVoiceInput() {
    const transcript = this.chatFacade.confirmVoiceInput();
    const textarea = this.textArea?.nativeElement;
    if (!transcript) {
      if (textarea) textarea.focus();
      return;
    }

    const currentText = this.inputMessage || '';
    if (textarea) {
      const start = textarea.selectionStart ?? currentText.length;
      const end = textarea.selectionEnd ?? currentText.length;
      const before = currentText.slice(0, start);
      const after = currentText.slice(end);

      const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
      const insertText = `${needsLeadingSpace ? ' ' : ''}${transcript}`;
      this.inputMessage = `${before}${insertText}${after}`;

      const caretPos = start + insertText.length;
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(caretPos, caretPos);
        this.autoResize({ target: textarea } as any);
      }, 0);
    } else {
      this.inputMessage = `${currentText}${transcript}`;
    }
  }

  toggleExpand() {
    this.isExpanded = !this.isExpanded;
    setTimeout(() => {
      this.autoResize();
      this.textArea?.nativeElement?.focus();
    }, 0);
  }

  @HostListener('document:click', ['$event'])
  clickOutside(event: Event) {
    const target = event.target as HTMLElement;
    if (!target.closest('.model-selector-pill')) {
      this.modelDropdownOpen = false;
    }
  }

  @HostListener('document:keydown', ['$event'])
  handleGlobalTypeToFocus(event: KeyboardEvent): void {
    // 1. Ignore if modifier keys are pressed (e.g. Ctrl+C, Ctrl+V, Alt+Tab, Cmd+K)
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    // 2. Ignore if the user is already inside an input, textarea, select, or contenteditable element
    const target = event.target as HTMLElement | null;
    const activeEl = document.activeElement as HTMLElement | null;

    const isInteractive = (el: any): boolean => {
      if (!el || typeof el.getAttribute !== 'function') return false;
      const tagName = el.tagName?.toLowerCase();
      return (
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        !!el.isContentEditable ||
        el.getAttribute('role') === 'textbox'
      );
    };

    if (isInteractive(target) || isInteractive(activeEl)) {
      return;
    }

    // 3. Ignore if any modal/popup, tour, or overlay is currently open
    const isModalOpen =
      (typeof this.chatState?.showLimitPopup === 'function' && this.chatState.showLimitPopup()) ||
      (typeof this.chatState?.showSessionExpiredPopup === 'function' && this.chatState.showSessionExpiredPopup()) ||
      (typeof this.chatFacade?.attachment?.activePreviewFile === 'function' && !!this.chatFacade.attachment.activePreviewFile()) ||
      (typeof document !== 'undefined' &&
        document.querySelector(
          '.confirm-overlay, .search-modal-overlay, .share-modal-overlay, ' +
          '.help-modal-overlay, .settings-modal-overlay, .limit-popup-overlay, ' +
          '.preview-modal-overlay, .popup-overlay, .popover-fixed, ' +
          '.shepherd-modal-overlay-container, .chat-context-menu'
        ) !== null);

    if (isModalOpen) {
      return;
    }

    // 4. Ignore if user is currently selecting/highlighting text on the screen
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      return;
    }

    // 5. Only trigger for single printable characters (letters, numbers, symbols, spaces)
    if (event.key && event.key.length === 1) {
      const textarea = this.textArea?.nativeElement;
      if (textarea) {
        event.preventDefault();
        this.inputMessage = (this.inputMessage || '') + event.key;
        textarea.value = this.inputMessage;
        textarea.focus();
        const len = textarea.value.length;
        textarea.setSelectionRange(len, len);
        this.autoResize();
        this.cdr.markForCheck();
      }
    }
  }

  @HostListener('keydown.escape')
  handleEscape(): void {
    const textarea = this.textArea?.nativeElement;
    if (document.activeElement === textarea) {
      textarea.blur();
    }
  }

  reset() {
    this.inputMessage = '';
    this.historyIndex = -1;
    this.tempHistoryDraft = '';
    this.isMultiLine = false;
    this.isExpanded = false;
    if (typeof this.chatFacade?.attachment?.filePreviews?.set === 'function') {
      this.chatFacade.attachment.filePreviews.set([]);
    }
    if (typeof this.chatFacade?.attachment?.showLeftScroll?.set === 'function') {
      this.chatFacade.attachment.showLeftScroll.set(false);
    }
    if (typeof this.chatFacade?.attachment?.showRightScroll?.set === 'function') {
      this.chatFacade.attachment.showRightScroll.set(false);
    }
    const el = this.textArea?.nativeElement;
    if (el) {
      el.value = '';
      el.style.height = 'auto';
      setTimeout(() => this.autoResize(), 0);
    }
  }

  /* ── Prompt Queue Methods ── */

  private generateQueueId(): string {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  addToQueue(message: string, files?: any[]) {
    this.promptQueue = [
      ...this.promptQueue,
      {
        id: this.generateQueueId(),
        message: message.trim(),
        files: files && files.length > 0 ? files : undefined,
        addedAt: Date.now(),
      },
    ];
    this.saveCurrentState();
    this.cdr.markForCheck();
  }

  startEditQueueItem(id: string) {
    this.isQueueCollapsed = false;
    const item = this.promptQueue.find((q) => q.id === id);
    if (item) {
      item.editing = true;
      item.editDraft = item.message;
      this.promptQueue = [...this.promptQueue];
      this.cdr.markForCheck();
      setTimeout(() => {
        const el = document.querySelector('.queue-edit-textarea') as HTMLTextAreaElement;
        if (el) {
          el.focus();
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
      }, 50);
    }
  }

  confirmEditQueueItem(id: string) {
    const item = this.promptQueue.find((q) => q.id === id);
    if (!item) return;

    const trimmed = (item.editDraft ?? '').trim();
    if (!trimmed) {
      // Empty edit = delete
      this.deleteQueueItem(id);
      return;
    }

    item.message = trimmed;
    item.editing = false;
    item.editDraft = undefined;
    this.promptQueue = [...this.promptQueue];
    this.saveCurrentState();
    this.cdr.markForCheck();
  }

  cancelEditQueueItem(id: string) {
    const item = this.promptQueue.find((q) => q.id === id);
    if (item) {
      item.editing = false;
      item.editDraft = undefined;
      this.promptQueue = [...this.promptQueue];
      this.cdr.markForCheck();
    }
  }

  deleteQueueItem(id: string) {
    this.promptQueue = this.promptQueue.filter((q) => q.id !== id);
    if (this.promptQueue.length === 0) {
      this.isQueueCollapsed = true;
    }
    this.saveCurrentState();
    this.cdr.markForCheck();
  }

  clearQueue() {
    this.promptQueue = [];
    this.isQueueCollapsed = true;
    this.saveCurrentState();
    this.cdr.markForCheck();
  }

  toggleQueueCollapse(event?: MouseEvent) {
    if (event) {
      event.stopPropagation();
    }
    this.isQueueCollapsed = !this.isQueueCollapsed;
    this.cdr.markForCheck();
  }

  processNextInQueue() {
    if (this.promptQueue.length === 0 || this.isGenerating || this.queueProcessing) {
      return;
    }
    this.queueProcessing = true;
    const next = this.promptQueue[0];
    this.promptQueue = this.promptQueue.slice(1);
    this.cdr.markForCheck();

    this.chatState.sendMessage(next.message, next.files || []);
    this.chatScrollService.scrollToBottom();

    // Reset processing flag after a tick
    setTimeout(() => {
      this.queueProcessing = false;
    }, 100);
  }

  onQueueEditInput(id: string, event: Event) {
    const target = event.target as HTMLTextAreaElement;
    const item = this.promptQueue.find((q) => q.id === id);
    if (item) {
      item.editDraft = target.value;
    }
  }

  handleQueueEditKeydown(id: string, event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.confirmEditQueueItem(id);
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelEditQueueItem(id);
    }
  }

  /* ── Drag-and-Drop Reorder ── */

  onDragStart(event: DragEvent, index: number) {
    this.draggedIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    }
  }

  onDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    if (this.dragOverIndex !== index) {
      this.dragOverIndex = index;
      this.cdr.markForCheck();
    }
  }

  onDrop(event: DragEvent, dropIndex: number) {
    event.preventDefault();
    const fromIndex = this.draggedIndex;
    if (fromIndex < 0 || fromIndex === dropIndex) {
      this.draggedIndex = -1;
      this.dragOverIndex = -1;
      this.cdr.markForCheck();
      return;
    }
    const updated = [...this.promptQueue];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(dropIndex, 0, moved);
    this.promptQueue = updated;
    this.draggedIndex = -1;
    this.dragOverIndex = -1;
    this.saveCurrentState();
    this.cdr.markForCheck();
  }

  onDragEnd() {
    this.draggedIndex = -1;
    this.dragOverIndex = -1;
    this.cdr.markForCheck();
  }

  moveQueueItemUp(index: number) {
    if (index <= 0) return;
    const updated = [...this.promptQueue];
    const [moved] = updated.splice(index, 1);
    updated.splice(index - 1, 0, moved);
    this.promptQueue = updated;
    this.cdr.markForCheck();
  }

  moveQueueItemDown(index: number) {
    if (index >= this.promptQueue.length - 1) return;
    const updated = [...this.promptQueue];
    const [moved] = updated.splice(index, 1);
    updated.splice(index + 1, 0, moved);
    this.promptQueue = updated;
    this.cdr.markForCheck();
  }

  handlePaste(event: ClipboardEvent) {
    const cd = event.clipboardData;
    if (!cd) return;

    const plainText = cd.getData('text/plain');
    const htmlData = cd.getData('text/html');
    const tableText = this.extractTableTextFromHtml(htmlData);

    if (tableText) {
      event.preventDefault();
      this.insertTextAtCaret(tableText);
      return;
    }

    if (plainText && plainText.trim().length > 0) {
      event.preventDefault();
      this.insertTextAtCaret(plainText);
      return;
    }

    let files: File[] = [];
    const items = cd.items ? Array.from(cd.items) : [];
    for (const item of items) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }

    if (files.length > 0) {
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      const conv = this.chatState.currentConversation();
      this.chatFacade.addFiles(dt.files, conv?.conversationID || '');
      event.preventDefault();
      return;
    }
  }

  private static readonly COLUMN_SEPARATOR = ' | ';

  private normalizePastedCell(text: string): string {
    return (text ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private formatTableRows(rows: string[][]): string {
    let cleaned = rows
      .map((cells) => cells.map((cell) => this.normalizePastedCell(cell)))
      .filter((cells) => cells.some((cell) => cell.length > 0));

    while (cleaned.length > 0 && !cleaned[0].some((cell) => cell.length > 0)) {
      cleaned.shift();
    }
    while (
      cleaned.length > 0 &&
      !cleaned[cleaned.length - 1].some((cell) => cell.length > 0)
    ) {
      cleaned.pop();
    }

    if (cleaned.length === 0) return '';

    const columnCount = Math.max(...cleaned.map((cells) => cells.length));
    return cleaned
      .map((cells) =>
        Array.from({ length: columnCount }, (_, index) => cells[index] ?? '').join(
          PromptComposerComponent.COLUMN_SEPARATOR,
        ),
      )
      .join('\n');
  }

  private extractTableTextFromHtml(html: string): string {
    if (!html || !/<table[\s>]/i.test(html)) return '';

    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const table = doc.querySelector('table');
      if (!table) return '';

      const rows = Array.from(table.querySelectorAll('tr')).map((row) =>
        Array.from(row.querySelectorAll('th, td')).map(
          (cell) => cell.textContent ?? '',
        ),
      );

      return this.formatTableRows(rows);
    } catch {
      return '';
    }
  }

  private insertTextAtCaret(text: string) {
    const el = this.textArea?.nativeElement;
    if (!el) {
      this.inputMessage += text;
      return;
    }

    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const newText = el.value.slice(0, start) + text + el.value.slice(end);

    this.inputMessage = newText;
    el.value = newText;

    setTimeout(() => {
      const pos = start + text.length;
      el.focus();
      el.setSelectionRange(pos, pos);
      this.autoResize();
    }, 0);
  }
}

