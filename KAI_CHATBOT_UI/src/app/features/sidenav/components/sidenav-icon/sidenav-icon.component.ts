import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-sidenav-icon',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sidenav-icon.component.html',
  styleUrls: ['./sidenav-icon.component.scss'],
})
export class SidenavIconComponent {
  @Input() name!: string;
  @Input() width: number | string = 24;
  @Input() height: number | string = 24;
}
