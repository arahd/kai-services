import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-hr-icon',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './hr-icon.component.html',
  styleUrls: ['./hr-icon.component.scss']
})
export class HrIconComponent {
  @Input() name!: string;
  @Input() width: number | string = 12;
  @Input() height: number | string = 12;
}
