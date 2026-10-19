import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { VoiceRecognitionService } from './voice-recognition.service';

describe('VoiceRecognitionService', () => {
  let service: VoiceRecognitionService;
  let mockSpeechRecognition: any;
  let mockStream: any;
  let mockAudioContext: any;

  beforeEach(() => {
    mockSpeechRecognition = jasmine.createSpy().and.callFake(function (this: any) {
      this.start = jasmine.createSpy('start');
      this.stop = jasmine.createSpy('stop');
      this.lang = '';
      this.continuous = false;
      this.interimResults = false;
      this.maxAlternatives = 1;
      this.onresult = null;
      this.onerror = null;
      this.onend = null;
    });

    (window as any).SpeechRecognition = mockSpeechRecognition;

    mockStream = {
      getTracks: () => [{ stop: jasmine.createSpy('trackStop') }]
    };

    spyOn(navigator.mediaDevices, 'getUserMedia').and.returnValue(Promise.resolve(mockStream as any));

    mockAudioContext = jasmine.createSpy().and.callFake(function (this: any) {
      this.createAnalyser = () => ({
        fftSize: 256,
        smoothingTimeConstant: 0.8,
        frequencyBinCount: 16,
        getByteFrequencyData: (arr: Uint8Array) => arr.fill(100)
      });
      this.createMediaStreamSource = () => ({
        connect: jasmine.createSpy('connect')
      });
      this.close = jasmine.createSpy('close').and.returnValue(Promise.resolve());
    });

    (window as any).AudioContext = mockAudioContext;

    TestBed.configureTestingModule({
      providers: [VoiceRecognitionService]
    });

    service = TestBed.inject(VoiceRecognitionService);
  });

  afterEach(() => {
    delete (window as any).SpeechRecognition;
    delete (window as any).AudioContext;
  });

  it('should be created and in initial inactive state', () => {
    expect(service).toBeTruthy();
    expect(service.isListening()).toBeFalse();
    expect(service.tempTranscript()).toBe('');
  });

  it('should start voice recognition and wave animation', async () => {
    const errCb = jasmine.createSpy('errCb');
    await service.startVoice(errCb);

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(service.isListening()).toBeTrue();
  });

  it('should handle mic access errors', async () => {
    (navigator.mediaDevices.getUserMedia as jasmine.Spy).and.returnValue(Promise.reject('Permission denied'));
    const errCb = jasmine.createSpy('errCb');

    await service.startVoice(errCb);

    expect(errCb).toHaveBeenCalledWith('Permission denied');
    expect(service.isListening()).toBeFalse();
  });

  it('should stop voice mode and cleanup wave animation', async () => {
    const errCb = jasmine.createSpy('errCb');
    await service.startVoice(errCb);
    service.stopVoice();

    expect(service.isListening()).toBeFalse();
  });

  it('should cancel voice mode and clear transcript', async () => {
    service.tempTranscript.set('Hello Speech');
    service.cancelVoiceMode();

    expect(service.isListening()).toBeFalse();
    expect(service.tempTranscript()).toBe('');
  });

  it('should confirm voice input and return trimmed transcript', fakeAsync(() => {
    service.tempTranscript.set('   Hello Voice Test   ');
    const result = service.confirmVoiceInput();

    expect(result).toBe('Hello Voice Test');
    expect(service.isVoiceConfirming()).toBeTrue();
    tick(60);
    expect(service.isVoiceConfirming()).toBeFalse();
  }));
});
