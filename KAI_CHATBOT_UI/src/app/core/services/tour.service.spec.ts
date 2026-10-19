import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { TourService } from './tour.service';
import { LocalStorageService } from './local-storage.service';
import { PLATFORM_ID } from '@angular/core';

describe('TourService', () => {
  let service: TourService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        TourService,
        LocalStorageService,
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });
    service = TestBed.inject(TourService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create and initialize Shepherd tour', () => {
    expect(service).toBeTruthy();
    service.initTour();
    expect((service as any).tour).not.toBeNull();
  });

  it('should start tour if not previously seen', fakeAsync(() => {
    spyOn(service, 'startTour');
    service.startTourIfNotSeen();
    tick(600);
    expect(service.startTour).toHaveBeenCalled();
  }));

  it('should not start tour if previously seen', fakeAsync(() => {
    localStorage.setItem('has_seen_chatbot_tour', 'true');
    spyOn(service, 'startTour');
    service.startTourIfNotSeen();
    tick(600);
    expect(service.startTour).not.toHaveBeenCalled();
  }));

  it('should initialize and start tour when startTour is called directly', () => {
    service.startTour();
    const tour = (service as any).tour;
    expect(tour).not.toBeNull();
  });

  it('should build step dots and buttons correctly', () => {
    (service as any).totalSteps = 3;
    const dotsHtml = (service as any).buildStepDots(1);
    expect(dotsHtml).toContain('tour-step-dots');
    expect(dotsHtml).toContain('completed');
    expect(dotsHtml).toContain('active');

    const firstStepButtons = (service as any).buildButtons(0);
    expect(firstStepButtons.length).toBe(2);
    expect(firstStepButtons[0].text).toBe('Skip');
    expect(firstStepButtons[1].text).toBe('Next ›');

    (service as any).totalSteps = 11;
    const lastStepButtons = (service as any).buildButtons(10);
    expect(lastStepButtons.length).toBe(1);
    expect(lastStepButtons[0].text).toBe('Finish ✓');
  });

  it('should skip init if platform is server', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        TourService,
        LocalStorageService,
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });
    const serverService = TestBed.inject(TourService);
    serverService.initTour();
    expect((serverService as any).tour).toBeNull();

    serverService.startTourIfNotSeen();
    expect((serverService as any).tour).toBeNull();
  });
});
