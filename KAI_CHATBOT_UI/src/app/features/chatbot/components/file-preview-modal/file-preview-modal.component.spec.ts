import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FilePreviewModalComponent } from './file-preview-modal.component';
import { AttachmentService } from '@features/chatbot/services/attachment.service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

describe('FilePreviewModalComponent', () => {
  let component: FilePreviewModalComponent;
  let fixture: ComponentFixture<FilePreviewModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FilePreviewModalComponent],
      providers: [
        AttachmentService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(FilePreviewModalComponent);
    component = fixture.componentInstance;
    component.file = { name: 'sample.png' };
    fixture.detectChanges();
  });

  it('should create component', () => {
    expect(component).toBeTruthy();
  });

  it('should identify image, pdf, and text file extensions correctly', () => {
    component.file = { name: 'image.png' };
    expect(component.isPreviewImage).toBeTrue();

    component.file = { name: 'document.pdf' };
    expect(component.isPreviewPdf).toBeTrue();

    component.file = { name: 'code.ts' };
    expect(component.isPreviewText).toBeTrue();
  });
});
