import { TestBed } from '@angular/core/testing';
import { MermaidService } from './mermaid.service';

describe('MermaidService', () => {
  let service: MermaidService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MermaidService],
    });
    service = TestBed.inject(MermaidService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should return error for empty diagram code', async () => {
    const res = await service.render('');
    expect(res.success).toBeFalse();
    expect(res.error).toBe('Empty diagram definition');
  });

  it('should render a valid flowchart diagram into SVG', async () => {
    const validCode = `graph TD
    A[Start] --> B[End]`;

    const res = await service.render(validCode);
    expect(res.success).toBeTrue();
    expect(res.svg).toBeTruthy();
    expect(res.svg).toContain('<svg');
  });

  it('should gracefully handle invalid syntax and return error', async () => {
    const invalidCode = `graph INVALID_SYNTAX ??? >>>`;

    const res = await service.render(invalidCode);
    expect(res.success).toBeFalse();
    expect(res.error).toBeTruthy();
  });

  it('should render diagram 1 (system architecture)', async () => {
    const diag1 = `graph TB
    subgraph "Presentation Layer"
        UI[User Interface]
        subgraph "UI Components"
            Dashboard[Dashboard View]
            RecordList[Record List View]
            AddForm[Add Record Form]
            EditForm[Edit Record Form]
            DeleteConfirm[Delete Confirmation Dialog]
        end
    end

    subgraph "Business Logic Layer"
        AppController[Application Controller]
        subgraph "Services"
            RecordService[Record Service]
            ValidationService[Validation Service]
            FileService[File Management Service]
        end
        subgraph "Operations"
            CreateOp[Create Operation]
            ReadOp[Read Operation]
            UpdateOp[Update Operation]
            DeleteOp[Delete Operation]
        end
    end

    subgraph "Data Access Layer"
        DataManager[Data Manager]
        CSVParser[CSV Parser/Writer]
        CacheManager[In-Memory Cache]
    end

    subgraph "Storage Layer"
        File1[(transactions.csv)]
        File2[(categories.csv)]
        File3[(budgets.csv)]
        Backup[Backup Storage]
    end

    subgraph "Utilities"
        Logger[Logger]
        ErrorHandler[Error Handler]
        Validator[Data Validator]
    end

    UI --> AppController
    Dashboard --> AppController
    RecordList --> AppController
    AddForm --> AppController
    EditForm --> AppController
    DeleteConfirm --> AppController

    AppController --> RecordService
    AppController --> ValidationService
    AppController --> FileService

    RecordService --> CreateOp
    RecordService --> ReadOp
    RecordService --> UpdateOp
    RecordService --> DeleteOp

    CreateOp --> DataManager
    ReadOp --> DataManager
    UpdateOp --> DataManager
    DeleteOp --> DataManager

    ValidationService --> Validator
    FileService --> Backup

    DataManager --> CSVParser
    DataManager --> CacheManager
    
    CSVParser --> File1
    CSVParser --> File2
    CSVParser --> File3

    RecordService --> Logger
    RecordService --> ErrorHandler
    DataManager --> Logger
    DataManager --> ErrorHandler

    style UI fill:#e1f5ff
    style AppController fill:#fff4e1
    style DataManager fill:#ffe1f5
    style File1 fill:#e1ffe1
    style File2 fill:#e1ffe1
    style File3 fill:#e1ffe1`;

    const res = await service.render(diag1);
    console.log('DIAG 1 RESULT:', res.success, res.error ? 'ERROR: ' + res.error : 'SVG LEN: ' + res.svg?.length);
    expect(res.success).toBeTrue();
    expect(res.svg).toContain('<svg');
  });

  it('should render diagram 2 (UI flow)', async () => {
    const diag2 = `graph TD
    Start([User Opens App]) --> LoadData{Load CSV Files}
    LoadData -->|Success| MainDash[Main Dashboard]
    LoadData -->|Error| ErrorScreen[Error Screen]
    ErrorScreen --> Retry{Retry?}
    Retry -->|Yes| LoadData
    Retry -->|No| Exit([Exit App])

    MainDash --> UserChoice{User Action}

    UserChoice -->|View Records| ViewFlow[Display Records List]
    UserChoice -->|Add Record| AddFlow[Show Add Form]
    UserChoice -->|Search/Filter| SearchFlow[Apply Filters]
    UserChoice -->|Exit| SaveExit[Auto-save & Exit]

    ViewFlow --> RecordAction{Select Action}
    RecordAction -->|Edit| EditFlow[Show Edit Form]
    RecordAction -->|Delete| DeleteFlow[Show Delete Confirmation]
    RecordAction -->|Back| MainDash

    SearchFlow --> ViewFlow

    AddFlow --> FillAdd[User Fills Form]
    FillAdd --> ValidateAdd{Validate Input}
    ValidateAdd -->|Invalid| ShowError1[Show Error Message]
    ShowError1 --> FillAdd
    ValidateAdd -->|Valid| SaveAdd[Save to CSV]
    SaveAdd --> UpdateCache[Update Cache]
    UpdateCache --> ShowSuccess1[Show Success Message]
    ShowSuccess1 --> MainDash

    EditFlow --> FillEdit[User Modifies Data]
    FillEdit --> ValidateEdit{Validate Changes}
    ValidateEdit -->|Invalid| ShowError2[Show Error Message]
    ShowError2 --> FillEdit
    ValidateEdit -->|Valid| SaveEdit[Update CSV File]
    SaveEdit --> UpdateCache2[Update Cache]
    UpdateCache2 --> ShowSuccess2[Show Success Message]
    ShowSuccess2 --> ViewFlow

    DeleteFlow --> ConfirmDelete{Confirm Delete?}
    ConfirmDelete -->|No| ViewFlow
    ConfirmDelete -->|Yes| RemoveRecord[Delete from CSV]
    RemoveRecord --> UpdateCache3[Update Cache]
    UpdateCache3 --> ShowSuccess3[Show Success Message]
    ShowSuccess3 --> ViewFlow

    SaveExit --> Backup[Create Backup]
    Backup --> Exit

    style Start fill:#90EE90
    style Exit fill:#FFB6C1
    style MainDash fill:#87CEEB
    style SaveAdd fill:#FFD700
    style SaveEdit fill:#FFD700
    style RemoveRecord fill:#FF6347
    style ErrorScreen fill:#FF6347`;

    const res = await service.render(diag2);
    console.log('DIAG 2 RESULT:', res.success, res.error ? 'ERROR: ' + res.error : 'SVG LEN: ' + res.svg?.length);
    expect(res.success).toBeTrue();
    expect(res.svg).toContain('<svg');
  });

  it('should serialize SVG with required namespaces', () => {
    const dummySvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    dummySvg.setAttribute('viewBox', '0 0 100 100');
    const serialized = service.serializeSvg(dummySvg);

    expect(serialized).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('should copy SVG markup to clipboard', async () => {
    spyOn(navigator.clipboard, 'writeText').and.resolveTo();
    const dummySvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const success = await service.copySvg(dummySvg);

    expect(success).toBeTrue();
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });
});

