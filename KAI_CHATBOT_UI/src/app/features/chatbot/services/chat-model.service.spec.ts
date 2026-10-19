import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ChatModelService, ModelOption } from './chat-model.service';
import { ChatService } from '@features/chatbot/services/chat.service';
import { SidenavLayoutBridgeService } from '@core/layout/sidenav-layout-bridge.service';

describe('ChatModelService', () => {
  let service: ChatModelService;
  let mockChatService: any;
  let mockLayoutBridge: any;

  const mockModelsFromApi: ModelOption[] = [
    { value: 'gpt-4o', label: 'GPT-4o', isDefault: false },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini', isDefault: true }
  ];

  beforeEach(() => {
    mockChatService = {
      getReportingModels: jasmine.createSpy('getReportingModels').and.returnValue(of({ report_gpt_model: mockModelsFromApi })),
      fetchUserLatestModel: jasmine.createSpy('fetchUserLatestModel').and.returnValue(of({
        latest_model: 'gpt-4o',
        conversations: [{ conversation_id: 'conv-123', model_name: 'gpt-4o' }]
      })),
      updateUserLatestModel: jasmine.createSpy('updateUserLatestModel').and.returnValue(of({ success: true }))
    };

    mockLayoutBridge = {
      setModels: jasmine.createSpy('setModels')
    };

    TestBed.configureTestingModule({
      providers: [
        ChatModelService,
        { provide: ChatService, useValue: mockChatService },
        { provide: SidenavLayoutBridgeService, useValue: mockLayoutBridge }
      ]
    });

    service = TestBed.inject(ChatModelService);
  });

  it('should create with initial empty states', () => {
    expect(service).toBeTruthy();
    expect(service.models()).toEqual([]);
    expect(service.selectedModel()).toBe('');
    expect(service.modelLocked()).toBeFalse();
    expect(service.getSelectedModelLabel()).toBe('');
  });

  it('should load models and set default model', () => {
    service.loadModels('user@test.com');

    expect(mockChatService.getReportingModels).toHaveBeenCalledWith({ bot_type: 'kumaran' });
    expect(mockLayoutBridge.setModels).toHaveBeenCalled();
    expect(service.models().length).toBe(2);
    expect(service.selectedModel()).toBe('gpt-4o');
  });

  it('should load user latest model and map conversation models', () => {
    service.loadUserLatestModel('user@test.com');

    expect(mockChatService.fetchUserLatestModel).toHaveBeenCalledWith('user@test.com');
    expect(service.persistedLatestModel()).toBe('gpt-4o');
    expect(service.getModelForConversation('conv-123')).toBe('gpt-4o');
    expect(service.getModelForConversation('non-existing')).toBeNull();
  });

  it('should allow selecting model when unlocked and persist to backend', () => {
    service.models.set(mockModelsFromApi);
    const result = service.selectModel('gpt-4o', 'user@test.com');

    expect(result).toBeTrue();
    expect(service.selectedModel()).toBe('gpt-4o');
    expect(mockChatService.updateUserLatestModel).toHaveBeenCalledWith({
      userId: 'user@test.com',
      default_model: 'gpt-4o-mini',
      latest_model: 'gpt-4o'
    });
  });

  it('should prevent model selection when model is locked', () => {
    service.lockModel('gpt-4o');

    expect(service.modelLocked()).toBeTrue();
    expect(service.selectedModel()).toBe('gpt-4o');

    const result = service.selectModel('gpt-4o-mini', 'user@test.com');
    expect(result).toBeFalse();
    expect(service.selectedModel()).toBe('gpt-4o');
  });

  it('should unlock model and restore default/persisted model', () => {
    service.models.set(mockModelsFromApi);
    service.persistedLatestModel.set('gpt-4o');
    service.lockModel('custom-model');

    service.unlockModel();
    expect(service.modelLocked()).toBeFalse();
    expect(service.selectedModel()).toBe('gpt-4o');
  });

  it('should manually register and lookup model for conversation', () => {
    service.setModelForConversation('conv-999', 'gpt-4-turbo');
    expect(service.getModelForConversation('conv-999')).toBe('gpt-4-turbo');
  });

  it('should not call API again if models are already loaded for the same email', () => {
    service.loadModels('user@test.com');
    expect(mockChatService.getReportingModels).toHaveBeenCalledTimes(1);

    // Call again with the same email
    service.loadModels('user@test.com');
    expect(mockChatService.getReportingModels).toHaveBeenCalledTimes(1);
  });

  it('should not trigger multiple API requests if loadModels is called while already loading', () => {
    // Simulate loading state
    service.isLoadingModels.set(true);

    service.loadModels('user@test.com');
    expect(mockChatService.getReportingModels).not.toHaveBeenCalled();
  });

  describe('Image upload restrictions', () => {
    it('should correctly identify restricted models containing "kimi" partially', () => {
      expect(service.isModelImageRestricted('FW-Kimi-K3')).toBeTrue();
      expect(service.isModelImageRestricted('fw-kimi-k3')).toBeTrue();
      expect(service.isModelImageRestricted('Kimi-K2.6')).toBeTrue();
      expect(service.isModelImageRestricted('kimi-k2.6')).toBeTrue();
      expect(service.isModelImageRestricted('KIMI-MODEL-ADVANCED')).toBeTrue();
      expect(service.isModelImageRestricted('custom_kimi_v2')).toBeTrue();
      expect(service.isModelImageRestricted('gpt-4o')).toBeFalse();
      expect(service.isModelImageRestricted('gpt-4o-mini')).toBeFalse();
      expect(service.isModelImageRestricted('claude-3-5-sonnet')).toBeFalse();
      expect(service.isModelImageRestricted(null)).toBeFalse();
      expect(service.isModelImageRestricted('')).toBeFalse();
    });

    it('should update isImageUploadRestricted signal when model changes', () => {
      expect(service.isImageUploadRestricted()).toBeFalse();

      service.selectedModel.set('FW-Kimi-K3');
      expect(service.isImageUploadRestricted()).toBeTrue();

      service.selectedModel.set('Kimi-K2.6');
      expect(service.isImageUploadRestricted()).toBeTrue();

      service.selectedModel.set('gpt-4o');
      expect(service.isImageUploadRestricted()).toBeFalse();
    });
  });
});
