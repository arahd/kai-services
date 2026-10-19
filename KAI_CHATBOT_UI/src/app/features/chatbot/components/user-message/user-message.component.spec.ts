import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UserMessageComponent } from '@features/chatbot/components/user-message/user-message.component';

describe('UserMessageComponent', () => {
  let component: UserMessageComponent;
  let fixture: ComponentFixture<UserMessageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserMessageComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(UserMessageComponent);
    component = fixture.componentInstance;
    component.msg = { sender: 'user', message: 'Hello', timestamp: new Date(), responseType: 'text' };
    component.userName = 'Maxim';
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should return correct user initial', () => {
    expect(component.userInitial).toBe('M');
  });

  it('should identify image files correctly', () => {
    expect(component.isImageFile('test.png')).toBeTrue();
    expect(component.isImageFile('test.pdf')).toBeFalse();
  });

  it('should identify PDF files correctly', () => {
    expect(component.isPdfFile('test.pdf')).toBeTrue();
    expect(component.isPdfFile('test.png')).toBeFalse();
  });

  it('should get correct file type extension', () => {
    expect(component.getFileType('document.docx')).toBe('DOCX');
    expect(component.getFileType('notes.txt')).toBe('TXT');
    expect(component.getFileType('unknown')).toBe('UNKNOWN');
  });
});
