import {
  Directive,
  Input,
  ElementRef,
  Renderer2,
  OnDestroy,
  HostListener,
  OnChanges,
  SimpleChanges,
  inject,
} from '@angular/core';

export type TooltipPosition = 'top' | 'right' | 'bottom' | 'left';

@Directive({
  selector: '[appTooltip]',
  standalone: true,
})
export class TooltipDirective implements OnDestroy, OnChanges {
  @Input('appTooltip') tooltipText = '';
  @Input() tooltipPosition: TooltipPosition = 'top';

  private readonly el = inject(ElementRef);
  private readonly renderer = inject(Renderer2);

  private tooltipEl: HTMLElement | null = null;
  private showTimeout: any;
  private hideTimeout: any;

  ngOnChanges(changes: SimpleChanges) {
    // Update text live if the tooltip is currently visible
    if (changes['tooltipText'] && this.tooltipEl) {
      const textSpan = this.tooltipEl.querySelector('.app-tooltip-text');
      if (textSpan) {
        textSpan.textContent = this.tooltipText;
      }
    }
  }

  @HostListener('mouseenter')
  onMouseEnter() {
    if (!this.tooltipText) return;
    clearTimeout(this.hideTimeout);
    this.showTimeout = setTimeout(() => this.show(), 300);
  }

  @HostListener('mouseleave')
  onMouseLeave() {
    clearTimeout(this.showTimeout);
    this.hideTimeout = setTimeout(() => this.hide(), 100);
  }

  @HostListener('click')
  onClick() {
    // Hide tooltip on click (e.g. button actions)
    clearTimeout(this.showTimeout);
    this.hide();
  }

  private show() {
    if (this.tooltipEl) return;

    // Create tooltip container
    this.tooltipEl = this.renderer.createElement('div');
    this.renderer.addClass(this.tooltipEl, 'app-tooltip');
    this.renderer.addClass(this.tooltipEl, `app-tooltip--${this.tooltipPosition}`);

    // Text span
    const textSpan = this.renderer.createElement('span');
    this.renderer.addClass(textSpan, 'app-tooltip-text');
    this.renderer.setProperty(textSpan, 'textContent', this.tooltipText);
    this.renderer.appendChild(this.tooltipEl, textSpan);

    // Arrow
    const arrow = this.renderer.createElement('span');
    this.renderer.addClass(arrow, 'app-tooltip-arrow');
    this.renderer.appendChild(this.tooltipEl, arrow);

    // Append to body to avoid overflow clipping
    this.renderer.appendChild(document.body, this.tooltipEl);

    // Position
    this.positionTooltip();

    // Trigger entrance animation on next frame
    requestAnimationFrame(() => {
      if (this.tooltipEl) {
        this.renderer.addClass(this.tooltipEl, 'app-tooltip--visible');
      }
    });
  }

  private hide() {
    if (!this.tooltipEl) return;

    this.renderer.removeClass(this.tooltipEl, 'app-tooltip--visible');

    // Wait for fade-out animation, then remove
    const el = this.tooltipEl;
    this.tooltipEl = null;
    setTimeout(() => {
      if (el.parentNode) {
        this.renderer.removeChild(document.body, el);
      }
    }, 150);
  }

  private positionTooltip() {
    if (!this.tooltipEl) return;

    const hostRect = this.el.nativeElement.getBoundingClientRect();
    const tooltipRect = this.tooltipEl.getBoundingClientRect();
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const scrollX = window.scrollX || document.documentElement.scrollLeft;
    const gap = 8;

    let top = 0;
    let left = 0;

    switch (this.tooltipPosition) {
      case 'top':
        top = hostRect.top + scrollY - tooltipRect.height - gap;
        left = hostRect.left + scrollX + hostRect.width / 2 - tooltipRect.width / 2;
        break;
      case 'bottom':
        top = hostRect.bottom + scrollY + gap;
        left = hostRect.left + scrollX + hostRect.width / 2 - tooltipRect.width / 2;
        break;
      case 'left':
        top = hostRect.top + scrollY + hostRect.height / 2 - tooltipRect.height / 2;
        left = hostRect.left + scrollX - tooltipRect.width - gap;
        break;
      case 'right':
        top = hostRect.top + scrollY + hostRect.height / 2 - tooltipRect.height / 2;
        left = hostRect.right + scrollX + gap;
        break;
    }

    // --- Screen-edge clamping ---
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;

    // Horizontal clamp
    if (left < margin) left = margin;
    if (left + tooltipRect.width > vw - margin) {
      left = vw - margin - tooltipRect.width;
    }

    // Vertical: if tooltip would go above viewport, flip to bottom
    if (this.tooltipPosition === 'top' && top - scrollY < margin) {
      top = hostRect.bottom + scrollY + gap;
      this.renderer.removeClass(this.tooltipEl, 'app-tooltip--top');
      this.renderer.addClass(this.tooltipEl, 'app-tooltip--bottom');
    }

    // Vertical: if tooltip would go below viewport, flip to top
    if (this.tooltipPosition === 'bottom' && top - scrollY + tooltipRect.height > vh - margin) {
      top = hostRect.top + scrollY - tooltipRect.height - gap;
      this.renderer.removeClass(this.tooltipEl, 'app-tooltip--bottom');
      this.renderer.addClass(this.tooltipEl, 'app-tooltip--top');
    }

    this.renderer.setStyle(this.tooltipEl, 'top', `${top}px`);
    this.renderer.setStyle(this.tooltipEl, 'left', `${left}px`);
  }

  ngOnDestroy() {
    clearTimeout(this.showTimeout);
    clearTimeout(this.hideTimeout);
    this.hide();
  }
}
