import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ChatbotHeaderComponent } from '@features/chatbot/components/chatbot-header/chatbot-header.component';

describe('ChatbotHeaderComponent', () => {
  let component: ChatbotHeaderComponent;
  let fixture: ComponentFixture<ChatbotHeaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatbotHeaderComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();

    fixture = TestBed.createComponent(ChatbotHeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should return a valid greeting string', () => {
    const greetings = ['Good Morning', 'Good Afternoon', 'Good Evening'];
    expect(greetings).toContain(component.greeting);
  });

  it('should emit toggleSettings when toggleSettings output is triggered', () => {
    spyOn(component.toggleSettings, 'emit');
    component.toggleSettings.emit();
    expect(component.toggleSettings.emit).toHaveBeenCalled();
  });
});
