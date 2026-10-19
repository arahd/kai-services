import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HrLoaderComponent } from './hr-loader.component';

describe('HrLoaderComponent', () => {
  let component: HrLoaderComponent;
  let fixture: ComponentFixture<HrLoaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HrLoaderComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(HrLoaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create loader component', () => {
    expect(component).toBeTruthy();
  });
});
