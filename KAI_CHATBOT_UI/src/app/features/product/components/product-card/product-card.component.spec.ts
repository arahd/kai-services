import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProductCardComponent } from './product-card.component';
import { provideRouter } from '@angular/router';
import { ToastService } from '@core/services/toast.service';
import { TokenService } from '@core/services/token.service';

describe('ProductCardComponent', () => {
  let component: ProductCardComponent;
  let fixture: ComponentFixture<ProductCardComponent>;
  let toastServiceMock: jasmine.SpyObj<ToastService>;
  let tokenServiceMock: jasmine.SpyObj<TokenService>;

  beforeEach(async () => {
    toastServiceMock = jasmine.createSpyObj('ToastService', ['show']);
    tokenServiceMock = jasmine.createSpyObj('TokenService', ['getToken', 'getRoles']);

    await TestBed.configureTestingModule({
      imports: [ProductCardComponent],
      providers: [
        provideRouter([]),
        { provide: ToastService, useValue: toastServiceMock },
        { provide: TokenService, useValue: tokenServiceMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ProductCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('title', 'K-Agent');
    fixture.componentRef.setInput('description', 'Platform description');
    fixture.detectChanges();
  });

  it('should create product card component', () => {
    expect(component).toBeTruthy();
  });

  it('should open and close details modal', () => {
    component.onDetails();
    expect(component.showDetailsModal()).toBeTrue();

    component.closeDetails();
    expect(component.showDetailsModal()).toBeFalse();
  });

  it('should return descriptions for project titles', () => {
    expect(component.getProjectDescription()).toContain('K-Agent');
    expect(component.getProjectWhyUsed()).toContain('Single Sign-On');

    fixture.componentRef.setInput('title', 'Mainframe - Spring Batch App');
    expect(component.getProjectDescription()).toContain('Mainframe - Spring Batch App');
    expect(component.getProjectDescription()).toContain('Spring Batch applications');
    expect(component.getProjectWhyUsed()).toContain('mainframe modernization');
  });
});
