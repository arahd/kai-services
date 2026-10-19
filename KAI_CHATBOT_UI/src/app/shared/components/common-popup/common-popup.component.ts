import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-common-popup',
  imports: [],
  templateUrl: './common-popup.component.html',
  styleUrl: './common-popup.component.scss',
})
export class CommonPopupComponent {

  @Input() show = false; // show/hide popup
  @Input() title = 'Popup';
  @Input() message?: string;
  @Input() htmlContent?: string;
  @Input() items: any[] = []; // for augurls etc.
  @Input() type: string = 'info'; // custom type if needed
  @Output() closePopup = new EventEmitter<void>();

  close() {
    this.closePopup.emit();
  }

  objectKeys(obj: any): string[] {
  return obj ? Object.keys(obj) : [];
}

}
