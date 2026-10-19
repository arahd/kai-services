import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatService } from '@features/chatbot/services/chat.service';
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-request-access',
  imports: [FormsModule],
  templateUrl: './request-access.component.html',
  styleUrl: './request-access.component.scss',
})
export class RequestAccessComponent {

  chatservice = inject(ChatService);
  status = signal<'form' | 'sent' | 'approved'>('form');
  models = signal<string[]>([]);
  selectedModels = signal<string[]>([]);
  userName = signal('');
  userModel = signal('');
  isSubmitting = signal(false);

  ngOnInit() {
    this.getModels();
  }

  getModels() {
    this.chatservice.getAvailableModels().subscribe({ // perf-ignore
      next: (res: any) => {
        console.log('Available models:', res);
        this.models.set(res.models);
      },
      error: (err) => {
        console.error('Failed to fetch models:', err);
        this.models.set([]);
      }
    });
  }

  /** Toggle checkbox selection */
  toggleModel(model: string) {
    const current = this.selectedModels();

    if (current.includes(model)) {
      this.selectedModels.set(current.filter(m => m !== model));
    } else {
      this.selectedModels.set([...current, model]);
    }
  }


  submitRequest() {
    if (!this.userName() || this.selectedModels().length === 0) return;
    this.isSubmitting.set(true);
    this.chatservice.requestAccess({
      email: this.userName(),
      models: this.selectedModels()
    }).subscribe({ // perf-ignore
      next: () => {
        this.status.set('sent');
         this.isSubmitting.set(false);
      },
      error: (err) => {
         this.isSubmitting.set(false);
        console.error('Failed to request access:', err);
      }
    });
  }
}
