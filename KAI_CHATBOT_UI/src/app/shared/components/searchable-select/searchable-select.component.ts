import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  computed,
  signal,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-searchable-select',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './searchable-select.component.html',
  styleUrls: ['./searchable-select.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchableSelectComponent {
  @Input() options: string[] = [];
  @Input() selected: string = '';
  @Input() placeholder: string = 'Select...';
  @Input() allOptionLabel: string = 'All';
  @Input() allOptionValue: string = 'all';
  @Input() dropdownAlign: 'left' | 'right' = 'left';

  @Output() selectionChange = new EventEmitter<string>();

  isOpen = signal(false);
  searchQuery = signal('');

  filteredOptions = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) {
      return this.options;
    }
    return this.options.filter((opt) => opt.toLowerCase().includes(query));
  });

  private readonly elementRef = inject(ElementRef);

  get displayValue(): string {
    if (this.selected === this.allOptionValue || !this.selected) {
      return this.allOptionLabel;
    }
    return this.selected;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.close();
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey() {
    this.close();
  }

  toggleOpen() {
    this.isOpen.update((v) => !v);
    if (this.isOpen()) {
      this.searchQuery.set('');
    }
  }

  close() {
    this.isOpen.set(false);
    this.searchQuery.set('');
  }

  selectOption(value: string) {
    this.selected = value;
    this.selectionChange.emit(value);
    this.close();
  }

  onSearch(event: Event) {
    const target = event.target as HTMLInputElement;
    this.searchQuery.set(target.value);
  }

  clearSearch() {
    this.searchQuery.set('');
  }
}
