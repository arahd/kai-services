import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FileDragDropDirective } from './file-drag-drop.directive';

@Component({
  template: `
    <div appFileDragDrop (filesDropped)="onDrop($event)" (dragOverState)="onDragState($event)">
      Drop Target
    </div>
  `,
  imports: [FileDragDropDirective],
  standalone: true
})
class TestHostComponent {
  droppedFiles: FileList | null = null;
  isDragOver = false;

  onDrop(files: FileList) {
    this.droppedFiles = files;
  }

  onDragState(state: boolean) {
    this.isDragOver = state;
  }
}

describe('FileDragDropDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let hostComponent: TestHostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    hostComponent = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should update drag state on dragenter and dragleave', () => {
    const div = fixture.nativeElement.querySelector('div');
    const dragEnterEvent = new Event('dragenter') as any;
    dragEnterEvent.dataTransfer = { types: ['Files'] };

    div.dispatchEvent(dragEnterEvent);
    expect(hostComponent.isDragOver).toBeTrue();

    const dragLeaveEvent = new Event('dragleave') as any;
    dragLeaveEvent.dataTransfer = { types: ['Files'] };
    dragLeaveEvent.clientX = 10;
    dragLeaveEvent.clientY = 10;

    div.dispatchEvent(dragLeaveEvent);
    expect(hostComponent.isDragOver).toBeFalse();
  });

  it('should emit filesDropped when files are dropped', () => {
    const div = fixture.nativeElement.querySelector('div');
    const dropEvent = new Event('drop') as any;
    const fileList = [new File(['content'], 'test.txt')] as any;
    dropEvent.dataTransfer = { files: fileList };

    div.dispatchEvent(dropEvent);
    expect(hostComponent.droppedFiles).toEqual(fileList);
  });

  it('should reset drag state on Escape key or document drop/dragend', () => {
    const div = fixture.nativeElement.querySelector('div');
    const dragEnterEvent = new Event('dragenter') as any;
    dragEnterEvent.dataTransfer = { types: ['Files'] };
    div.dispatchEvent(dragEnterEvent);
    expect(hostComponent.isDragOver).toBeTrue();

    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(escapeEvent);
    expect(hostComponent.isDragOver).toBeFalse();
  });
});
