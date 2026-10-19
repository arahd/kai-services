import { CommonModule } from '@angular/common';
import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-hr-loader',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './hr-loader.component.html',
  styleUrl: './hr-loader.component.scss',
})
export class HrLoaderComponent {
  @Input() message: string = 'Analyzing profiles...';
  @Input() subMessage: string = 'Checking consistency and identifying patterns';
}
