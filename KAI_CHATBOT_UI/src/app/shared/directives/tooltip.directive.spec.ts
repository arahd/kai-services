import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { TooltipDirective } from './tooltip.directive';

@Component({
  template: `<button [appTooltip]="text" [tooltipPosition]="pos">Hover Me</button>`,
  imports: [TooltipDirective],
  standalone: true
})
class TestHostComponent {
  text = 'Sample Tooltip';
  pos: 'top' | 'right' | 'bottom' | 'left' = 'top';
}

describe('TooltipDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    // Clean up created tooltips in document body if any remain
    const tooltips = document.querySelectorAll('.app-tooltip');
    tooltips.forEach(t => t.remove());
  });

  it('should show tooltip on mouseenter after 300ms', fakeAsync(() => {
    const button = fixture.nativeElement.querySelector('button');
    button.dispatchEvent(new MouseEvent('mouseenter'));
    tick(300);

    const tooltip = document.querySelector('.app-tooltip');
    expect(tooltip).not.toBeNull();
    expect(tooltip?.textContent).toContain('Sample Tooltip');

    button.dispatchEvent(new MouseEvent('mouseleave'));
    tick(100);
    tick(150);
  }));

  it('should hide tooltip on mouseleave', fakeAsync(() => {
    const button = fixture.nativeElement.querySelector('button');
    button.dispatchEvent(new MouseEvent('mouseenter'));
    tick(300);
    expect(document.querySelector('.app-tooltip')).not.toBeNull();

    button.dispatchEvent(new MouseEvent('mouseleave'));
    tick(100);
    tick(150);
    expect(document.querySelector('.app-tooltip')).toBeNull();
  }));

  it('should hide tooltip on click', fakeAsync(() => {
    const button = fixture.nativeElement.querySelector('button');
    button.dispatchEvent(new MouseEvent('mouseenter'));
    tick(300);
    button.dispatchEvent(new MouseEvent('click'));
    tick(150);

    expect(document.querySelector('.app-tooltip')).toBeNull();
  }));
});
