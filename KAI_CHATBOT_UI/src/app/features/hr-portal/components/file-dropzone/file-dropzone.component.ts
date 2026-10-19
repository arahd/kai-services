import { Component, ElementRef, EventEmitter, Input, Output, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HrIconComponent } from '@features/hr-portal/components/hr-icon/hr-icon.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-file-dropzone',
  standalone: true,
  imports: [CommonModule, HrIconComponent],
  templateUrl: './file-dropzone.component.html',
  styleUrls: ['./file-dropzone.component.scss']
})
export class FileDropzoneComponent {
  readonly defaultHelperText = 'Drag & drop or browse files from your computer';

  @Input() label: string = 'File';
  @Input() accept: string = '.pdf';
  @Input() file: File | null = null;
  @Input() files: File[] = [];
  @Input() maxFiles = 5;
  @Input() errorMessage: string = '';
  @Input() buttonText: string = '';
  @Input() helperText: string = this.defaultHelperText;
  @Input() uploading = false;
  @Input() progress = 0;
  /** JD Analysis: pill + “File Uploaded” banner after attach completes */
  @Input() uploadedLayout = false;
  @Input() multiple = false;

  @Output() fileSelected = new EventEmitter<File | null>();
  @Output() previewFile = new EventEmitter<File>();
  @Output() filesSelected = new EventEmitter<File[]>();
  @Output() removeFileAtIndex = new EventEmitter<number>();

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  dragOver = false;

  get isDefaultHelperText() {
    return this.helperText === this.defaultHelperText;
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.dragOver = true;
  }

  onDragLeave(event: DragEvent) {
    this.dragOver = false;
  }

  onFileDrop(event: DragEvent) {
    event.preventDefault();
    this.dragOver = false;
    if (this.multiple) {
      const droppedFiles = event.dataTransfer?.files;
      if (droppedFiles && droppedFiles.length > 0) {
        const filesArray: File[] = [];
        for (let i = 0; i < droppedFiles.length; i++) {
          filesArray.push(droppedFiles[i]);
        }
        this.filesSelected.emit(filesArray);
      }
    } else {
      const droppedFile = event.dataTransfer?.files[0];
      if (droppedFile) {
        this.handleFile(droppedFile);
      }
    }
  }

  onFileSelect(event: any) {
    if (this.multiple) {
      const selectedFiles = event.target.files;
      if (selectedFiles && selectedFiles.length > 0) {
        const filesArray: File[] = [];
        for (let i = 0; i < selectedFiles.length; i++) {
          filesArray.push(selectedFiles[i]);
        }
        this.filesSelected.emit(filesArray);
      }
    } else {
      const selectedFile = event.target.files[0];
      if (selectedFile) {
        this.handleFile(selectedFile);
      }
    }
  }

  handleFile(file: File) {
    this.fileSelected.emit(file);
    // Reset input so the same file could be selected again if removed
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
  }

  removeFile() {
    this.fileSelected.emit(null);
  }

  // perf-ignore
  getFileSize(size: number): string {
    if (size === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(size) / Math.log(k));
    return parseFloat((size / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
