import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-chat-icon',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chat-icon.component.html',
  styleUrls: ['./chat-icon.component.scss'],
})
export class ChatIconComponent {
  @Input() name!: string;
  @Input() width: number | string = 24;
  @Input() height: number | string = 24;

  get normalizedName(): string {
    const n = (this.name || '').toLowerCase().trim();
    if (n === 'pdf' || n === 'pdf-doc') return 'pdf-doc';
    if (n === 'docx' || n === 'doc' || n === 'word' || n === 'word-doc') return 'word-doc';
    if (n === 'xlsx' || n === 'xls' || n === 'excel' || n === 'spreadsheet' || n === 'csv') return 'spreadsheet';
    if (n === 'pptx' || n === 'ppt' || n === 'powerpoint' || n === 'presentation') return 'presentation';
    return n;
  }
}
