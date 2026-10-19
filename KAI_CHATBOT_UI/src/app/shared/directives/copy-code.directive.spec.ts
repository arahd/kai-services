import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { CopyCodeDirective } from './copy-code.directive';

@Component({
  template: `
    <div [appCopyCode]="content" [isStreaming]="streaming">
      <div class="code-block-wrapper">
        <div class="code-header-copy-placeholder"></div>
        <pre><code>const a = 10;</code></pre>
      </div>
      <pre><code>const b = 20;</code></pre>
      <table>
        <tr><th>Col1</th><th>Col2</th></tr>
        <tr><td>Val1</td><td>Val2</td></tr>
      </table>
    </div>
  `,
  imports: [CopyCodeDirective],
  standalone: true
})
class TestHostComponent {
  content = '<div>code</div>';
  streaming = false;
}

describe('CopyCodeDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;

  beforeEach(async () => {
    spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());
    await TestBed.configureTestingModule({
      imports: [TestHostComponent]
    }).compileComponents();
  });

  it('should add copy button to placeholders and click to copy', fakeAsync(() => {
    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    tick(10);
    fixture.detectChanges();

    const copyBtn = fixture.nativeElement.querySelector('.code-copy-btn');
    expect(copyBtn).not.toBeNull();

    copyBtn.click();
    tick(1600);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('const a = 10;');
  }));

  it('should add legacy copy button and copy code', fakeAsync(() => {
    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    tick(10);

    const legacyBtn = fixture.nativeElement.querySelector('.copy-btn');
    expect(legacyBtn).not.toBeNull();

    legacyBtn.click();
    tick(1100);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('const b = 20;');
  }));

  it('should add table copy button and copy table content', fakeAsync(() => {
    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    tick(10);

    const tableBtn = fixture.nativeElement.querySelector('.table-copy-btn');
    expect(tableBtn).not.toBeNull();

    tableBtn.click();
    tick(1600);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Col1\tCol2\nVal1\tVal2');
  }));

  it('should not add copy buttons while streaming', fakeAsync(() => {
    fixture = TestBed.createComponent(TestHostComponent);
    fixture.componentInstance.streaming = true;
    fixture.detectChanges();
    tick(10);

    const copyBtn = fixture.nativeElement.querySelector('.code-copy-btn');
    expect(copyBtn).toBeNull();
  }));
});
