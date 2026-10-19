import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RequestAccessComponent } from '@features/request-access/request-access.component';

describe('RequestAccessComponent', () => {
  let component: RequestAccessComponent;
  let fixture: ComponentFixture<RequestAccessComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RequestAccessComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([])
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(RequestAccessComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
