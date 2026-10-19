import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SidenavIconComponent } from './sidenav-icon.component';

describe('SidenavIconComponent', () => {
  let component: SidenavIconComponent;
  let fixture: ComponentFixture<SidenavIconComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SidenavIconComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SidenavIconComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    component.name = 'close';
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should render an SVG for a known icon name', () => {
    component.name = 'close';
    component.width = 20;
    component.height = 20;
    fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg.getAttribute('width')).toBe('20');
  });

  it('should not render an SVG for an unknown icon name', () => {
    component.name = 'unknown-icon-xyz';
    fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('svg');
    expect(svg).toBeNull();
  });
});
