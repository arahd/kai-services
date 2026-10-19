import { Directive, HostListener, Output, EventEmitter } from '@angular/core';

@Directive({
  selector: '[appFileDragDrop]',
  standalone: true,
})
export class FileDragDropDirective {
  private dragCounter = 0;
  private isDragOverPage = false;

  @Output() readonly filesDropped = new EventEmitter<FileList>();
  @Output() readonly dragOverState = new EventEmitter<boolean>();

  private resetPageDragState() {
    this.dragCounter = 0;
    this.isDragOverPage = false;
    this.dragOverState.emit(false);
  }

  private isFileDrag(event: DragEvent): boolean {
    const types: any = event.dataTransfer?.types;
    if (!types) return false;
    try {
      return typeof types.includes === 'function'
        ? types.includes('Files')
        : Array.from(types).includes('Files');
    } catch {
      return false;
    }
  }

  @HostListener('document:dragend', ['$event'])
  onDocumentDragEnd(event: DragEvent) {
    if (!this.isDragOverPage) return;
    this.resetPageDragState();
  }

  @HostListener('document:drop', ['$event'])
  onDocumentDrop(event: DragEvent) {
    if (!this.isDragOverPage) return;
    this.resetPageDragState();
  }

  @HostListener('window:blur')
  onWindowBlur() {
    if (!this.isDragOverPage) return;
    this.resetPageDragState();
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    if (!this.isDragOverPage) return;
    this.resetPageDragState();
  }

  @HostListener('dragenter', ['$event'])
  onPageDragEnter(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.isFileDrag(event)) return;
    this.dragCounter++;
    this.isDragOverPage = true;
    this.dragOverState.emit(true);
  }

  @HostListener('dragover', ['$event'])
  onPageDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.isDragOverPage && this.isFileDrag(event)) {
      this.isDragOverPage = true;
      this.dragOverState.emit(true);
      this.dragCounter = Math.max(1, this.dragCounter);
    }
  }

  @HostListener('dragleave', ['$event'])
  onPageDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.isFileDrag(event)) return;

    const leftWindow = event.clientX === 0 && event.clientY === 0;
    if (leftWindow) {
      this.resetPageDragState();
      return;
    }

    this.dragCounter = Math.max(0, this.dragCounter - 1);
    if (this.dragCounter === 0) {
      this.isDragOverPage = false;
      this.dragOverState.emit(false);
    }
  }

  @HostListener('drop', ['$event'])
  onPageDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.resetPageDragState();

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.filesDropped.emit(files);
    }
  }
}
