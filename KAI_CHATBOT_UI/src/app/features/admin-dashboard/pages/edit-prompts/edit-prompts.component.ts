import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, HostListener, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatService } from '@features/chatbot/services/chat.service';
import { ToastService } from '@core/services/toast.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-edit-prompts',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './edit-prompts.component.html',
  styleUrl: './edit-prompts.component.scss',
})
export class EditPromptsComponent implements OnInit {
  private readonly chatService = inject(ChatService);
  private readonly toastService = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);

  @Output() closed = new EventEmitter<void>();

  isEditing = false;
  isLoadingPrompt = false;
  isSavingPrompt = false;
  promptLoadError: string | null = null;
  private loadingPromptById: Record<string, boolean> = {};

  readonly promptTypes: Array<{
    id: string;
    label: string;
    fileName: string;
  }> = [
    {
      id: 'general',
      label: 'General Chat',
      fileName: 'general_chat',
    },
    {
      id: 'followup',
      label: 'Followup Questions',
      fileName: 'suggested_follow_ups',
    },
    // {
    //   id: 'rephrase',
    //   label: 'Rephrase Query',
    //   fileName: 'repharse_user_query',
    // },
  ];

  selectedPromptTypeId = this.promptTypes[0]?.id ?? 'general';

  /** Text shown in the textarea (may contain unsaved edits). */
  editedSystemPrompt = '';

  /** Draft (possibly unsaved) prompt text per type. */
  draftSystemPromptById: Record<string, string | null> = this.promptTypes.reduce((acc, pt) => {
    acc[pt.id] = null; // null => not yet initialized from API
    return acc;
  }, {} as Record<string, string | null>);

  /** Last saved text for the selected prompt type. */
  savedSystemPromptById: Record<string, string | null> = this.promptTypes.reduce((acc, pt) => {
    acc[pt.id] = null; // null => not loaded yet from API
    return acc;
  }, {} as Record<string, string | null>);

  ngOnInit(): void {
    this.loadAllPromptsFromApi();
  }

  get selectedPromptType() {
    return this.promptTypes.find((p) => p.id === this.selectedPromptTypeId) ?? this.promptTypes[0];
  }

  hasUnsavedChangesFor(id: string): boolean {
    const draft = this.draftSystemPromptById[id] ?? '';
    const saved = this.savedSystemPromptById[id] ?? '';
    return draft !== saved;
  }

  get isLoadingSelectedPrompt(): boolean {
    return (
      this.loadingPromptById[this.selectedPromptTypeId] === true ||
      this.savedSystemPromptById[this.selectedPromptTypeId] === null
    );
  }

  selectPromptType(id: string): void {
    this.selectedPromptTypeId = id;
    this.editedSystemPrompt = this.draftSystemPromptById[id] ?? this.savedSystemPromptById[id] ?? '';
    this.isEditing = false;
    this.promptLoadError = null;
    this.ensurePromptLoaded(id);
  }

  onEditedSystemPromptChange(value: string): void {
    this.editedSystemPrompt = value;
    this.draftSystemPromptById[this.selectedPromptTypeId] = value;
  }

  private loadAllPromptsFromApi(): void {
    this.isLoadingPrompt = true;
    this.promptLoadError = null;

    let remaining = this.promptTypes.length;
    const done = () => {
      remaining -= 1;
      if (remaining <= 0) {
        this.isLoadingPrompt = false;
      }
    };

    for (const pt of this.promptTypes) {
      this.fetchAndStorePrompt(pt.id, pt.fileName, done);
    }
  }

  private ensurePromptLoaded(id: string): void {
    const pt = this.promptTypes.find((p) => p.id === id);
    if (!pt) return;
    if (this.savedSystemPromptById[id] !== null) return; // already loaded
    if (this.loadingPromptById[id]) return;

    this.isLoadingPrompt = true;
    this.fetchAndStorePrompt(pt.id, pt.fileName, () => {
      // keep global spinner on only when at least one request is pending
      this.isLoadingPrompt = Object.values(this.loadingPromptById).some(Boolean);
    });
  }

  private fetchAndStorePrompt(id: string, fileName: string, done: () => void): void {
    this.loadingPromptById[id] = true;
    this.chatService.fetchPrompt({ prompt_name: fileName }).subscribe({
 // perf-ignore
      next: (res) => {
        const content = typeof res?.content === 'string' ? res.content : '';
        this.savedSystemPromptById[id] = content;

        // Initialize/refresh draft only if user hasn't modified it.
        const existingDraft = this.draftSystemPromptById[id];
        const shouldReplaceDraft = existingDraft == null || existingDraft === '' || existingDraft === (this.savedSystemPromptById[id] ?? '');
        if (shouldReplaceDraft) {
          this.draftSystemPromptById[id] = content;
        }

        if (this.selectedPromptTypeId === id && !this.isEditing && !this.hasUnsavedChangesFor(id)) {
          this.editedSystemPrompt = this.draftSystemPromptById[id] ?? content;
        }
        this.loadingPromptById[id] = false;
        done();
        this.cdr.markForCheck();
      },
      error: () => {
        this.promptLoadError = 'Failed to fetch prompt';
        this.savedSystemPromptById[id] = '';
        if (this.draftSystemPromptById[id] == null) {
          this.draftSystemPromptById[id] = '';
        }
        this.loadingPromptById[id] = false;
        done();
        this.cdr.markForCheck();
      },
    });
  }

  enterEditMode(): void {
    this.isEditing = true;
  }

  cancelChanges(): void {
    const saved = this.savedSystemPromptById[this.selectedPromptTypeId] ?? '';
    this.draftSystemPromptById[this.selectedPromptTypeId] = saved;
    this.editedSystemPrompt = saved;
    this.isEditing = false;
  }

  saveChanges(): void {
    const pt = this.selectedPromptType;
    if (!pt || this.isSavingPrompt) return;

    this.isSavingPrompt = true;
    this.promptLoadError = null;

    this.chatService
      .updatePrompt({
        prompt_name: pt.fileName,
        content: this.editedSystemPrompt,
      })
      .subscribe({
 // perf-ignore
        next: () => {
          this.savedSystemPromptById[this.selectedPromptTypeId] = this.editedSystemPrompt;
          this.draftSystemPromptById[this.selectedPromptTypeId] = this.editedSystemPrompt;
          this.isEditing = false;
          this.isSavingPrompt = false;
          this.toastService.show('Prompt saved successfully', 'success');
          this.cdr.markForCheck();
        },
        error: () => {
          this.isSavingPrompt = false;
          this.promptLoadError = 'Failed to save prompt';
          this.toastService.show('Failed to save prompt', 'error');
          this.cdr.markForCheck();
        },
      });
  }

  onRequestClose(): void {
    this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.onRequestClose();
  }
}


