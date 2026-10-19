import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  HostListener,
  inject,
  Input,
  Output,
  PLATFORM_ID,
  computed,
  signal,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { AzureAdService } from '@core/auth/azure-ad.service';
import { SidenavLayoutBridgeService } from '@core/layout/sidenav-layout-bridge.service';
import { ConfigService } from '@core/services/config.service';
import {
  ColorTheme,
  FONT_FAMILIES,
  FontFamily,
  THEME_PALETTES,
  ThemeMode,
  ThemeService,
} from '@core/services/theme.service';
import { ToastService } from '@core/services/toast.service';
import { TokenService } from '@core/services/token.service';
import { SessionStorageService } from '@core/services/session-storage.service';
import { ChatHistoryStateService } from '@features/chatbot/services/chat-history-state.service';
import { ChatService } from '@features/chatbot/services/chat.service';
import { ChatContextMenuComponent } from '@features/sidenav/components/chat-context-menu/chat-context-menu.component';
import { SidenavIconComponent } from '@features/sidenav/components/sidenav-icon/sidenav-icon.component';
import { SidenavProfileComponent } from '@features/sidenav/components/sidenav-profile/sidenav-profile.component';
import { SidenavCacheService } from '@features/sidenav/sidenav-cache.service';
import { HrPermissionService } from '@features/hr-portal/hr-portal-services/hr-permission.service';
import { AgentService } from '@features/agents/services/agent.service';
import { AgentItem } from '@features/agents/models/agent.model';
import { ProjectStateService } from '@features/projects/services/project-state.service';
import { ProjectItem } from '@features/projects/models/project.model';
import { CreateProjectModalComponent } from '@features/projects/components/create-project-modal/create-project-modal.component';
import { MoveToProjectModalComponent } from '@features/projects/components/move-to-project-modal/move-to-project-modal.component';
import { TooltipDirective } from '@shared/directives/tooltip.directive';
import { IsRouteActivePipe } from '@shared/pipes/is-route-active.pipe';
import { isProjectChat } from '@shared/models';
import { Subject } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
} from 'rxjs/operators';
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-sidenav',
  standalone: true,
  imports: [
    FormsModule,
    SidenavProfileComponent,
    ChatContextMenuComponent,
    TooltipDirective,
    IsRouteActivePipe,
    SidenavIconComponent,
    CreateProjectModalComponent,
    MoveToProjectModalComponent,
  ],
  templateUrl: './sidenav.component.html',
  styleUrl: './sidenav.component.scss',
})
export class SidenavComponent {
  private readonly historyService = inject(ChatHistoryStateService);
  private readonly cdr = inject(ChangeDetectorRef);

  get chats() {
    return this.historyService.chats();
  }
  set chats(v) {
    const filtered = (v || []).filter((c: any) => !isProjectChat(c));
    this.historyService.chats.set(filtered);
  }
  get activeConversationID() {
    return this.historyService.activeConversationID();
  }
  set activeConversationID(v) {
    this.historyService.activeConversationID.set(v);
  }
  get activeTempId() {
    return this.historyService.activeTempId();
  }
  set activeTempId(v) {
    this.historyService.activeTempId.set(v);
  }
  get currentPage() {
    return this.historyService.currentPage();
  }
  set currentPage(v) {
    this.historyService.currentPage.set(v);
  }
  get totalPages() {
    return this.historyService.totalPages();
  }
  set totalPages(v) {
    this.historyService.totalPages.set(v);
  }
  get loadingChats() {
    return this.historyService.loadingChats();
  }
  set loadingChats(v) {
    this.historyService.loadingChats.set(v);
  }
  get hasMore() {
    return this.historyService.hasMore();
  }
  get searchText() {
    return this.historyService.searchText();
  }
  set searchText(v) {
    this.historyService.searchText.set(v);
  }
  get searchResults() {
    return this.historyService.searchResults();
  }
  set searchResults(v) {
    this.historyService.searchResults.set(v);
  }
  get isSearchLoading() {
    return this.historyService.isSearchLoading();
  }
  set isSearchLoading(v) {
    this.historyService.isSearchLoading.set(v);
  }
  get showHistorySection() {
    return this.historyService.showHistorySection();
  }
  set showHistorySection(v) {
    this.historyService.showHistorySection.set(v);
  }

  @Input()
  get generatingStates() {
    return this.historyService.generatingStates();
  }
  set generatingStates(v) {
    if (v && Object.keys(v).length > 0) {
      this.historyService.generatingStates.set(v);
    }
  }

  @Input()
  get conversationStatuses() {
    return this.historyService.conversationStatuses();
  }
  set conversationStatuses(v: any) {
    if (v && Object.keys(v).length > 0) {
      this.historyService.conversationStatuses.set(v);
    }
  }

  @Input()
  get streaming(): boolean {
    return this.historyService.streaming();
  }
  set streaming(v: boolean | null | undefined) {
    if (v !== null && v !== undefined) {
      this.historyService.streaming.set(v);
    }
  }

  userInfo: any;
  userInitial: string = '';
  popoverOpen = false;
  collapsed = false;
  showConfirm = false;
  showRenameModal = false;
  chatToDeleteIndex: number | null = null;
  chatToRenameIndex: number | null = null;
  renameValue = '';
  showShareModal = false;
  shareUrl = '';
  shareTitle = '';
  shareConversationPairs: { question: string; answer: string }[] = [];
  shareLoading = false;
  shareLinkCopied = false;
  popoverPosition: any = { top: '0px', left: '0px' };
  @Output() chatSelected = new EventEmitter<any>();
  @Output() newChatClicked = new EventEmitter<void>();
  @Output() invalidConversation = new EventEmitter<void>();
  @Output() closeMobileSidebar = new EventEmitter<void>();

  /**
   * When true, render the same sidenav UI but do NOT fetch / sync chat history.
   * Used on non-chat pages like HR Portal to keep sidebar static.
   */
  @Input() staticMode: boolean = false;
  /**
   * When true, the sidenav will emit the active chat automatically on init/load
   * (used by Chatbot page to load messages). Disable this on other routes (e.g. HR Portal)
   * to avoid unexpected navigation/blank states.
   */
  @Input() emitActiveChatOnInit: boolean = true;
  limit = 20;
  hoveredIndex: number | null = null;
  activeOptionsIndex: number | null = null;
  firstQuestion: string = '';
  showSearchModal = false;
  isAdmin = false;
  isHrAdmin = false;
  adminMenuExpanded = false;
  hrMenuExpanded = false;
  @Output() searchModalToggle = new EventEmitter<boolean>();
  @Output() contextMenuToggled = new EventEmitter<void>();
  @Output() streamingToggleEvt = new EventEmitter<boolean>();
  @Output() collapsedChange = new EventEmitter<boolean>();
  isMobile = false;
  private readonly MOBILE_BREAKPOINT = 767;
  private platformId = inject(PLATFORM_ID);
  menuPosition: any = {};
  hasAutoScrolled = false;
  @ViewChild('scrollContainer') scrollContainer!: ElementRef;
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;
  private hasInitializedChats = false;
  private readonly searchSubject = new Subject<string>();
  private azureAd = inject(AzureAdService);
  private chatService = inject(ChatService);
  private toastService = inject(ToastService);
  private storageService = inject(SessionStorageService);
  private readonly router = inject(Router);
  readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  private readonly cache = inject(SidenavCacheService);
  protected readonly layoutBridge = inject(SidenavLayoutBridgeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly tokenService = inject(TokenService);
  private readonly hrPermissionService = inject(HrPermissionService);
  private readonly themeService = inject(ThemeService);
  private readonly configService = inject(ConfigService);
  readonly agentService = inject(AgentService);

  readonly isHrAdminAccess = signal(false);
  readonly isResumeAccessible = signal(true);
  readonly isVisaAccessible = signal(true);
  readonly isAgentsAccessible = signal(
    this.storageService.getIsAgentsAccessible() || this.tokenService.hasAgentAccess()
  );

  // Agent State
  agentsMenuExpanded = false;
  privateAgentsExpanded = true;
  groupAgentsExpanded = true;
  publicAgentsExpanded = true;

  readonly agentCount = computed(() => this.agentService.totalCount());
  readonly privateAgents = computed(() => this.agentService.privateAgents());
  readonly groupAgents = computed(() => this.agentService.groupAgents());
  readonly publicAgents = computed(() => this.agentService.publicAgents());
  readonly selectedAgentId = computed(() => this.agentService.selectedAgent()?.id);

  showProductMenu = false;
  productMenuExpanded = false;

  toggleProductMenu(event?: MouseEvent) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    this.productMenuExpanded = !this.productMenuExpanded;
  }

  openProductSection() {
    this.safeNavigate('/product');
  }

  readonly projectState = inject(ProjectStateService);
  projectsMenuExpanded = false;
  readonly showCreateProjectModal = signal<boolean>(false);
  readonly displayedProjects = computed(() => {
    return this.projectState.filteredProjects().slice(0, 5);
  });

  onProjectsRowClick(event: MouseEvent) {
    if (this.collapsed && !this.isMobile) {
      this.safeNavigate('/projects');
      return;
    }
    this.toggleProjectsMenu(event);
  }

  toggleProjectsMenu(event?: MouseEvent) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    this.projectsMenuExpanded = !this.projectsMenuExpanded;
    if (this.projectsMenuExpanded && this.projectState.projects().length === 0) {
      this.projectState.loadProjects(1, true);
    }
  }

  openProject(project: ProjectItem) {
    this.projectState.activeProject.set(project);
    sessionStorage.setItem('kai_active_project_id', String(project.project_id));
    sessionStorage.setItem('kai_active_project_name', project.project_name);
    sessionStorage.removeItem('kai_active_project_conversation_id');
    this.safeNavigate(`/projects/${project.project_id}`);
  }

  openCreateProjectModal() {
    this.showCreateProjectModal.set(true);
  }

  closeCreateProjectModal() {
    this.showCreateProjectModal.set(false);
  }

  onProjectCreated(newProject: ProjectItem) {
    this.closeCreateProjectModal();
    if (newProject?.project_id) {
      this.openProject(newProject);
    }
  }

  readonly showMoveToProjectModal = signal<boolean>(false);
  readonly chatToMove = signal<any | null>(null);

  openMoveToProjectModal(index: number): void {
    const selectedChat = this.chats[index];
    this.activeOptionsIndex = null;
    if (!selectedChat?.conversationID) {
      this.toastService.show('Cannot move unsaved conversation', 'error');
      return;
    }
    this.chatToMove.set(selectedChat);
    this.showMoveToProjectModal.set(true);
  }

  closeMoveToProjectModal(): void {
    this.showMoveToProjectModal.set(false);
    this.chatToMove.set(null);
  }

  onConversationMoved(projectId: number): void {
    const moved = this.chatToMove();
    this.closeMoveToProjectModal();
    if (moved?.conversationID) {
      // Remove conversation from Recents list since it now belongs to a project
      const updated = (this.chats || []).filter(
        (c: any) => c.conversationID !== moved.conversationID
      );
      this.chats = updated;
      this.historyService.syncCache(this.userInfo?.email || '');

      const targetProject = this.projectState.projects().find((p) => p.project_id === projectId);
      const projName = targetProject?.project_name || '';

      sessionStorage.setItem('kai_active_project_id', String(projectId));
      if (projName) {
        sessionStorage.setItem('kai_active_project_name', projName);
      }
      sessionStorage.setItem('kai_active_project_conversation_id', moved.conversationID);
      this.storageService.setConversationId(moved.conversationID);
      this.storageService.setLastActiveConversationId(moved.conversationID);
      this.activeConversationID = moved.conversationID;

      // Navigate directly into the project conversation
      this.safeNavigate(`/projects/${projectId}/${moved.conversationID}`);
      this.cdr.markForCheck();
    }
  }

  onRequestCreateProjectFromMove(): void {
    this.closeMoveToProjectModal();
    this.openCreateProjectModal();
  }

  isProjectActive(projectId: number): boolean {
    try {
      const url = (this.router.url || '').split('?')[0];
      return url === `/projects/${projectId}` || url.startsWith(`/projects/${projectId}/`);
    } catch {
      return false;
    }
  }

  isProjectsTableActive(): boolean {
    try {
      const url = (this.router.url || '').split('?')[0];
      return url === '/projects' || url === '/projects/';
    } catch {
      return false;
    }
  }

  readonly selectedProjectForMenu = signal<ProjectItem | null>(null);
  readonly showProjectConfirm = signal<boolean>(false);
  readonly projectToDelete = signal<ProjectItem | null>(null);
  readonly showProjectRenameModal = signal<boolean>(false);
  readonly projectToRename = signal<ProjectItem | null>(null);
  projectRenameValue = '';
  projectMenuPosition: any = {};

  onProjectRightClick(project: ProjectItem, event: MouseEvent) {
    event.preventDefault();
    this.toggleProjectOptions(project, event);
  }

  toggleProjectOptions(project: ProjectItem, event: MouseEvent) {
    event.stopPropagation();
    this.popoverOpen = false;
    this.activeOptionsIndex = null;

    if (this.selectedProjectForMenu()?.project_id === project.project_id) {
      this.selectedProjectForMenu.set(null);
    } else {
      this.selectedProjectForMenu.set(project);
      this.calculateProjectMenuPosition(event);
      this.contextMenuToggled.emit();
    }
  }

  calculateProjectMenuPosition(event: MouseEvent) {
    const trigger = event.currentTarget as HTMLElement;
    const rect = trigger.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const menuHeight = 150;
    const menuWidth = 180;
    const margin = 8;

    let top: string | null = `${rect.bottom + margin}px`;
    let bottom: string | null = null;
    let right: string | null = `${viewportWidth - rect.right}px`;
    let left: string | null = null;
    let transformOrigin = 'top right';

    if (rect.bottom + menuHeight + margin > viewportHeight) {
      top = null;
      bottom = `${viewportHeight - rect.top + margin}px`;
      transformOrigin = 'bottom right';
    }

    if (rect.right - menuWidth < 0) {
      right = null;
      left = `${rect.left}px`;
      transformOrigin = top ? 'top left' : 'bottom left';
    }

    this.projectMenuPosition = {
      position: 'fixed',
      top,
      bottom,
      right,
      left,
      'transform-origin': transformOrigin,
      'z-index': '10001',
    };
  }

  onMenuPinProject() {
    const proj = this.selectedProjectForMenu();
    if (proj) {
      this.projectState.togglePin(proj);
    }
    this.selectedProjectForMenu.set(null);
  }

  onMenuRenameProject() {
    const proj = this.selectedProjectForMenu();
    if (proj) {
      this.projectToRename.set(proj);
      this.projectRenameValue = proj.project_name;
      this.showProjectRenameModal.set(true);
    }
    this.selectedProjectForMenu.set(null);
  }

  cancelProjectRename() {
    this.showProjectRenameModal.set(false);
    this.projectToRename.set(null);
    this.projectRenameValue = '';
  }

  async confirmProjectRename() {
    const proj = this.projectToRename();
    const newName = this.projectRenameValue.trim();
    if (!proj || !newName || newName === proj.project_name) {
      this.cancelProjectRename();
      return;
    }
    await this.projectState.renameProject(proj.project_id, newName);
    this.cancelProjectRename();
  }

  onMenuDeleteProject(event?: MouseEvent) {
    if (event) event.stopPropagation();
    const proj = this.selectedProjectForMenu();
    if (proj) {
      this.projectToDelete.set(proj);
      this.showProjectConfirm.set(true);
    }
    this.selectedProjectForMenu.set(null);
  }

  cancelProjectDelete() {
    this.showProjectConfirm.set(false);
    this.projectToDelete.set(null);
  }

  async confirmProjectDelete() {
    const proj = this.projectToDelete();
    if (proj) {
      const currentUrl = this.router.url || '';
      const isCurrentProjectRoute = currentUrl.includes(`/projects/${proj.project_id}`);
      const isProjectConversation =
        isCurrentProjectRoute &&
        (currentUrl.includes(`/projects/${proj.project_id}/`) ||
          !!sessionStorage.getItem('kai_active_project_conversation_id'));
      const isActiveConvInProject =
        sessionStorage.getItem('kai_active_project_id') === String(proj.project_id);

      await this.projectState.deleteProject(proj.project_id);

      const shouldClearAndSelectNext =
        isProjectConversation ||
        isActiveConvInProject ||
        (isCurrentProjectRoute && this.activeConversationID != null);

      if (shouldClearAndSelectNext) {
        this.invalidConversation.emit();
        this.layoutBridge.activeHost()?.onInvalidConversation?.();

        sessionStorage.removeItem('kai_active_project_id');
        sessionStorage.removeItem('kai_active_project_name');
        sessionStorage.removeItem('kai_project_active_conv');
        sessionStorage.removeItem('kai_active_project_conversation_id');

        if (this.chats && this.chats.length > 0) {
          this.openChat(0);
        } else {
          this.newChat();
        }
      } else if (isCurrentProjectRoute) {
        this.safeNavigate('/projects');
      }
    }
    this.cancelProjectDelete();
  }

  get isProductAdmin(): boolean {
    if (typeof this.tokenService?.isProductAdmin === 'function') {
      return this.tokenService.isProductAdmin();
    }
    const roles = typeof this.tokenService?.getRoles === 'function' ? this.tokenService.getRoles() : [];
    return roles.some(r => r && (r.toLowerCase().includes('is_product_admin') || r.toLowerCase().includes('admin')));
  }

  constructor() {
    this.showProductMenu = this.checkShowProductMenu();
    if (!this.showProductMenu) {
      this.configService.loadConfig().then(() => {
        this.showProductMenu = this.checkShowProductMenu();
        this.cdr.markForCheck();
      });
    }
  }

  private checkShowProductMenu(): boolean {
    try {
      const cfg = this.configService.getConfig();
      if (!cfg) return false;
      const configStr = JSON.stringify(cfg).toLowerCase();
      return (
        configStr.includes('dev') ||
        configStr.includes('uat') ||
        !!cfg.kafUrl ||
        !!cfg.kplatformUrl
      );
    } catch {
      return false;
    }
  }

  showSettingsModal = false;
  fontDropdownOpen = false;
  fontSearchQuery = '';

  /** Available color themes for the picker in settings */
  readonly colorThemes: { key: ColorTheme; label: string; accent: string }[] = (
    Object.keys(THEME_PALETTES) as ColorTheme[]
  ).map((key) => ({
    key,
    label: THEME_PALETTES[key].label,
    accent: THEME_PALETTES[key].accent,
  }));

  /** Available font families for the picker in settings */
  readonly fontFamilies = FONT_FAMILIES;

  @HostListener('window:resize')
  checkMobile() {
    if (isPlatformBrowser(this.platformId)) {
      this.isMobile = window.innerWidth <= this.MOBILE_BREAKPOINT;
    }
  }

  initializeChatHistory(forceFetch: boolean = false) {
    if (!this.shouldShowRecents()) return;
    if ((!forceFetch && this.chats?.length) || !this.userInfo) {
      if (this.chats?.length) {
        this.hasInitializedChats = true;
      }
      return;
    }

    this.hasInitializedChats = true;

    // Reuse cached "Recents" to avoid re-fetching on every route navigation.
    const cached = forceFetch ? null : this.cache.get();
    if (
      cached?.userEmail &&
      cached.userEmail === this.userInfo.email &&
      cached.chats?.length
    ) {
      this.chats = cached.chats;
      this.activeConversationID = cached.activeConversationID;
      this.currentPage = cached.currentPage;
      this.totalPages = cached.totalPages;
      this.showHistorySection = cached.showHistorySection;
      // If we already know an active chat, optionally emit it so Chatbot can load messages.
      if (this.emitActiveChatOnInit && this.activeConversationID) {
        const activeChatObj = this.chats.find(
          (c: any) => c.conversationID === this.activeConversationID,
        );
        if (activeChatObj) {
          setTimeout(() => this.chatSelected.emit(activeChatObj), 0);
        }
      }
      // Don't auto-scroll again for cached renders.
      this.hasAutoScrolled = true;
      return;
    }

    const existingCID =
      this.storageService.getLastActiveConversationId() ||
      this.storageService.getConversationId();
    if (existingCID) {
      this.activeConversationID = existingCID;
      this.activeTempId = null;
      this.storageService.setConversationId(existingCID);
      this.storageService.setLastActiveConversationId(existingCID);
      this.loadConversationByCID(existingCID);
    } else {
      this.resetChatsAndLoad();
    }
  }

  ngOnInit() {
    this.searchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.onSearch();
      });

    this.checkMobile();
    // Expand menus based on current route (must run even when using cached chats).
    try {
      const url = this.router.url || '';
      this.adminMenuExpanded = url.startsWith('/admin');
      this.hrMenuExpanded = url.startsWith('/hrportal');
      if (url.startsWith('/projects')) {
        this.projectsMenuExpanded = true;
      }
    } catch {
      this.adminMenuExpanded = false;
      this.hrMenuExpanded = false;
    }

    this.chatService.refreshChatHistory$.subscribe(() => {
      if (this.shouldShowRecents()) {
        this.resetChatsAndLoad(true);
      }
    });

    // Subscribe to active temp ID changes from ChatbotComponent
    this.chatService.activeTempId$.subscribe((tempId: string | null) => {
      this.activeTempId = tempId;
    });

    this.isAdmin = this.tokenService.isAdmin();
    this.isHrAdmin = this.tokenService.isHrAdmin();
    this.isHrAdminAccess.set(false);
    const hasAgentAccess = this.tokenService.hasAgentAccess() || this.storageService.getIsAgentsAccessible();
    this.isAgentsAccessible.set(hasAgentAccess);
    this.storageService.setIsAgentsAccessible(hasAgentAccess);
    if (this.isHrAdmin) {
      this.hrPermissionService.loadAccessControl().subscribe((access) => {
        this.isHrAdminAccess.set(!!access?.is_admin);
        this.isResumeAccessible.set(this.hrPermissionService.hasAnyResumeAccess());
        this.isVisaAccessible.set(this.hrPermissionService.hasAnyVisaAccess());
      });
    }

    this.userInfo = this.tokenService.getUserInfo();
    if (this.userInfo) {
      this.userInitial = this.getInitials(this.userInfo.name);
      this.layoutBridge.setUserInfo(this.userInfo);

      if (this.shouldShowRecents()) {
        this.initializeChatHistory();
      }

      if (this.projectState.projects().length === 0) {
        this.projectState.loadProjects(1, true);
      }
    }

    // Monitor router events to dynamically initialize chats when entering /chatbot,
    // and keep menus expanded correctly when routing
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((e) => {
        try {
          const url = e.urlAfterRedirects || this.router.url || '';
          this.adminMenuExpanded = url.startsWith('/admin');
          this.hrMenuExpanded = url.startsWith('/hrportal');
          if (url.startsWith('/projects')) {
            this.projectsMenuExpanded = true;
          }
        } catch {
          this.adminMenuExpanded = false;
          this.hrMenuExpanded = false;
        }

        if (this.shouldShowRecents()) {
          this.initializeChatHistory();
        } else {
          this.hasInitializedChats = false;
          this.showSettingsModal = false;
        }
      });
    this.chatService.firstQuestion$.subscribe((question) => {
      const isProject =
        (this.router.url && this.router.url.includes('projects')) ||
        !!sessionStorage.getItem('kai_active_project_id') ||
        !!sessionStorage.getItem('kai_pending_project_id');
      if (isProject) return;

      if (question) {
        // 1️⃣ Create a new chat with the first question at the top
        const newChat: any = {
          conversation: [{ question }], // mimic your existing structure
          isDraft: true,
          conversationID: this.storageService.getConversationId() || null,
          tempId: this.activeTempId || null,
          // Ensure grouping works immediately (API `startTime` arrives after refresh)
          startTime: new Date().toISOString(),
        };

        // 2️⃣ Add to top of chat history (only if not present already)
        // Check by tempId first (unique), then by conversationID
        const alreadyExists = this.chats.some((c: any) => {
          if (newChat.tempId && c.tempId === newChat.tempId) return true;
          if (
            newChat.conversationID &&
            c.conversationID === newChat.conversationID
          )
            return true;
          return false;
        });

        if (!alreadyExists) {
          this.chats.unshift(newChat);
        }

        // 3️⃣ Highlight the current chat — use conversationID if available, otherwise rely on tempId
        if (newChat.conversationID) {
          this.activeConversationID = newChat.conversationID;
          this.activeTempId = null;
        }
        // If no conversationID, activeTempId is already set via the service subscription
      }
    });

    this.chatService.draftConv$.subscribe((conv: any) => {
      if (!conv || !conv.messages || conv.messages.length === 0) return;

      const isProject =
        isProjectChat(conv) ||
        (this.router.url && this.router.url.includes('projects')) ||
        !!sessionStorage.getItem('kai_active_project_id') ||
        !!sessionStorage.getItem('kai_pending_project_id');
      if (isProject) return;

      // Convert messages (user/bot alternating) into [{question, response}, ...]
      const mapped: any[] = [];
      const msgs = conv.messages;
      for (let i = 0; i < msgs.length; i++) {
        if (msgs[i].sender === 'user') {
          const question = msgs[i].message;
          let response = '';
          let generated_image_ids;
          let cached_images;
          let generated_document_ids;
          let cached_documents;
          if (i + 1 < msgs.length && msgs[i + 1].sender === 'bot') {
            response = msgs[i + 1].message;
            generated_image_ids = msgs[i + 1].generated_image_ids;
            cached_images = msgs[i + 1].images;
            generated_document_ids = msgs[i + 1].generated_document_ids;
            cached_documents = msgs[i + 1].documents;
          }
          mapped.push({
            question,
            response,
            generated_image_ids,
            cached_images,
            generated_document_ids,
            cached_documents,
          });
        }
      }

      const convTempId = conv.tempId || null;

      // Try to match existing chat by conversationID first, then by tempId.
      // Never fall back to first-question text matching to avoid dual-active issue.
      let matchIndex = -1;
      if (conv.conversationID) {
        matchIndex = this.chats.findIndex(
          (c: any) => c.conversationID === conv.conversationID,
        );
      }
      if (matchIndex === -1 && convTempId) {
        matchIndex = this.chats.findIndex(
          (c: any) => c.tempId && c.tempId === convTempId,
        );
      }

      if (matchIndex !== -1) {
        // Update existing entry in place to avoid duplicates
        const existingChat = this.chats[matchIndex];
        this.chats[matchIndex] = {
          ...existingChat,
          conversation: mapped,
          greetings: existingChat.greetings || conv.title || 'New Chat',
          conversationID:
            conv.conversationID || existingChat.conversationID || null,
          // Preserve tempId until real ID arrives
          tempId: conv.conversationID
            ? null
            : existingChat.tempId || convTempId,
          // Preserve an existing startTime if present, otherwise set now so it buckets under Today
          startTime: existingChat.startTime || new Date().toISOString(),
        };

        // If a real conversationID just arrived, promote the active state
        if (conv.conversationID && existingChat.tempId) {
          this.activeConversationID = conv.conversationID;
          this.activeTempId = null;
        }
      } else {
        // Only add if no matching entry exists
        const newEntry: any = {
          conversation: mapped,
          conversationID: conv.conversationID || null,
          tempId: conv.conversationID ? null : convTempId,
          greetings: conv.title || 'New Chat',
          startTime: new Date().toISOString(),
        };
        this.chats.unshift(newEntry);

        // Highlight the new entry
        if (conv.conversationID) {
          this.activeConversationID = conv.conversationID;
          this.activeTempId = null;
        }
        // If no conversationID, activeTempId is already set via the service subscription
      }
    });

    // Menu expansion is synced at the top of ngOnInit (before any early returns).
  }

  /**
   * Navigate while protecting Chatbot from stale conversation state.
   * (Admin → Chatbot could land on a blank right pane if an old conversationID was restored.)
   */
  safeNavigate(route: string) {
    // Keep the relevant menu expanded when navigating within its section.
    // (Users expect the chevron state to stay open for the active section.)
    if (route.startsWith('/admin')) {
      this.adminMenuExpanded = true;
    }
    if (route.startsWith('/hrportal')) {
      this.hrMenuExpanded = true;
    }
    if (route.startsWith('/product')) {
      this.productMenuExpanded = true;
    }
    if (route.startsWith('/projects')) {
      this.projectsMenuExpanded = true;
    }

    if (route === '/chatbot') {
      this.clearStaleChatStateIfNecessary();
      sessionStorage.removeItem('kai_active_project_id');
      sessionStorage.removeItem('kai_active_project_name');
      sessionStorage.removeItem('kai_project_active_conv');
      sessionStorage.removeItem('kai_active_project_conversation_id');
    }
    this.router.navigate([route]);
    this.closeMobileSidebar.emit();
  }

  private clearStaleChatStateIfNecessary() {
    try {
      const forceNewChat = this.storageService.getForceNewChat();
      const isBlocked = this.tokenService.isBlocked();
      if (forceNewChat || isBlocked) {
        this.storageService.removeConversationId();
        this.storageService.removeLastActiveConversationId();

        // Reset active conversation indicators in Sidenav state immediately
        this.activeConversationID = null as any;
        this.activeTempId = null;
      }
    } catch (e) {
      console.warn('Failed to clear state storage:', e);
    }
  }

  isRouteActive(path: string) {
    try {
      return (this.router.url || '').startsWith(path);
    } catch {
      return false;
    }
  }

  isChatbotActive(): boolean {
    try {
      const url = this.router.url || '';
      const path = url.split('?')[0];
      return (
        path === '/chatbot' ||
        path.startsWith('/chatbot/') ||
        path === '/projects' ||
        path.startsWith('/projects/')
      );
    } catch {
      return false;
    }
  }

  /** Returns true when on /chatbot or /projects pages — used to show Recents in sidenav */
  shouldShowRecents(): boolean {
    try {
      const url = this.router.url || '';
      const path = url.split('?')[0];
      return path === '/chatbot' || path.startsWith('/chatbot/')
        || path === '/projects' || path.startsWith('/projects/');
    } catch {
      return false;
    }
  }

  toggleAdminMenu(event?: MouseEvent) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    this.adminMenuExpanded = !this.adminMenuExpanded;
  }

  toggleHrMenu(event?: MouseEvent) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    this.hrMenuExpanded = !this.hrMenuExpanded;
  }

  /** Main Admin row click: navigate to the Admin section (default child route). */
  openAdminSection() {
    this.safeNavigate('/admin');
  }

  /** Main HR Portal row click: navigate to the HR Portal (default child route). */
  openHrSection() {
    this.safeNavigate('/hrportal');
  }

  /** Main Agents row click: navigate to the Agents Hub (default child route). */
  openAgentsSection() {
    if (this.isAgentsAccessible()) {
      if (!this.agentService.isLoaded()) {
        this.agentService.getAgents().subscribe();
      }
    }
    this.safeNavigate('/agents');
  }

  toggleAgentsMenu(event: MouseEvent) {
    event.stopPropagation();
    if (this.isAgentsAccessible()) {
      if (!this.agentService.isLoaded() && !this.agentsMenuExpanded) {
        this.agentService.getAgents().subscribe();
      }
    }
    this.agentsMenuExpanded = !this.agentsMenuExpanded;
  }

  togglePrivateAgents(event: MouseEvent) {
    event.stopPropagation();
    this.privateAgentsExpanded = !this.privateAgentsExpanded;
  }

  toggleGroupAgents(event: MouseEvent) {
    event.stopPropagation();
    this.groupAgentsExpanded = !this.groupAgentsExpanded;
  }

  togglePublicAgents(event: MouseEvent) {
    event.stopPropagation();
    this.publicAgentsExpanded = !this.publicAgentsExpanded;
  }

  selectAgent(agent: AgentItem) {
    this.agentService.selectedAgent.set(agent);
    this.safeNavigate('/agents/' + agent.id);
  }

  openSearchModal() {
    this.showSearchModal = true;
    this.searchModalToggle.emit(true); // scroll overlay option disabled in chatbot component
    this.closeMobileSidebar.emit();
    setTimeout(() => {
      this.searchInput?.nativeElement?.focus();
    }, 0);
  }
  closeSearchModal() {
    this.showSearchModal = false;
    this.searchText = '';
    this.searchResults = [];
    // notify parent that modal is CLOSED
    this.searchModalToggle.emit(false);
  }

  @HostListener('window:keydown', ['$event'])
  handleGlobalShortcuts(event: KeyboardEvent): void {
    const isCtrlOrMeta = event.ctrlKey || event.metaKey;
    if (!isCtrlOrMeta) return;

    const key = event.key?.toLowerCase();

    // 1. Search History: Ctrl+K / Cmd+K
    if (key === 'k' && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      if (this.showSearchModal) {
        this.closeSearchModal();
      } else {
        this.openSearchModal();
      }
      return;
    }

    // 2. New Chat: Ctrl+Shift+O / Cmd+Shift+O or Ctrl+Shift+N / Cmd+Shift+N
    if ((key === 'o' || key === 'n') && event.shiftKey && !event.altKey) {
      event.preventDefault();
      this.newChat();
      return;
    }

    // 3. Settings: Ctrl+, / Cmd+ (Chatbot, Product, and Project pages only)
    if (event.key === ',' && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      if (!this.isSettingsSupportedPage) {
        return;
      }
      if (this.showSettingsModal) {
        this.closeSettingsModal();
      } else {
        this.openSettingsModal();
      }
      return;
    }
  }

  filterChats() {
    this.searchResults = this.chats.filter((x) => {
      const nameMatch = x.conversationName
        ?.toLowerCase()
        .includes(this.searchText.toLowerCase());
      const questionMatch = x.conversation?.[0]?.question
        ?.toLowerCase()
        .includes(this.searchText.toLowerCase());
      return nameMatch || questionMatch;
    });
  }

  openChatFromSearch(chat: any) {
    if (chat?.conversationID) {
      this.safeNavigate('/chatbot/' + chat.conversationID);
    } else {
      this.safeNavigate('/chatbot');
    }
    const payload = {
      conversationID: chat.conversationID,
      date_info: chat.date_info,
      user_string: chat.user_string,
      bot_type: 'kumaran',
    };
    this.chatService.getChatInformation(payload).subscribe({
      next: (res) => {
        if (chat.conversationID) {
          this.storageService.setLastActiveConversationId(
            chat.conversationID,
          );
        }

        const fullChatData = {
          ...res,
          scrollToQuestion: chat?.question || '',
        };

        // If navigating from another route (e.g. /admin), stash it for ngOnInit
        // if (!this.router.url.includes('/chatbot')) {
        //   sessionStorage.setItem('kai_pending_chat_selection', JSON.stringify(fullChatData));
        // }

        // Pass the clicked question along so ChatbotComponent can auto-scroll to it.
        // API doesn't provide message IDs, so we use the exact question text as the anchor.
        this.chatSelected.emit(fullChatData);
        this.searchResults = [];
        this.closeSearchModal();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.toastService.show('failed to fetch chat', 'error');
        this.sortChats();
        this.cdr.markForCheck();
      },
    });
  }

  onRightClick(i: number, event: MouseEvent) {
    event.preventDefault();
    console.log('Right click detected', event);
    this.toggleChatOptions(i, event);
    const x = event.clientX;
    const y = event.clientY;

    console.log('Position:', x, y);
  }

  toggleChatOptions(index: number, event: MouseEvent) {
    event.stopPropagation(); // prevent triggering openChat
    this.popoverOpen = false; // Close profile popover
    if (this.activeOptionsIndex === index) {
      this.activeOptionsIndex = null;
    } else {
      this.activeOptionsIndex = index;
      // ...
      this.calculateMenuPosition(event);
      this.contextMenuToggled.emit(); // Notify parent to close its popups
    }
  }

  private calculateMenuPosition(event: MouseEvent) {
    const trigger = event.currentTarget as HTMLElement;
    const rect = trigger.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // Estimated dimensions for the menu
    const menuHeight = 190;
    const menuWidth = 180;
    const margin = 8;

    // Default: Open below, aligned to the right of the trigger
    let top: string | null = `${rect.bottom + margin}px`;
    let bottom: string | null = null;
    let right: string | null = `${viewportWidth - rect.right}px`;
    let left: string | null = null;
    let transformOrigin = 'top right';

    // Check if there is enough space below
    if (rect.bottom + menuHeight + margin > viewportHeight) {
      // Not enough space below, open above
      top = null;
      bottom = `${viewportHeight - rect.top + margin}px`;
      transformOrigin = 'bottom right';
    }

    // Ensure it doesn't go off-screen horizontally (though in sidebar it's unlikely)
    if (rect.right - menuWidth < 0) {
      right = null;
      left = `${rect.left}px`;
      transformOrigin = top ? 'top left' : 'bottom left';
    }

    this.menuPosition = {
      position: 'fixed',
      top,
      bottom,
      right,
      left,
      'transform-origin': transformOrigin,
      'z-index': '10001',
    };
  }

  // perf-ignore
  isActionDisabled(chat: any): boolean {
    if (!chat.conversationID) return true;
    const status = this.conversationStatuses[chat.conversationID];
    // If we have a status, it must be 'saved' to allow actions.
    // If we don't have a status (it's an older chat from history), we allow actions.
    if (status && status !== 'saved') {
      return true;
    }
    return false;
  }

  // perf-ignore
  getDisabledTooltip(chat: any): string {
    if (!chat.conversationID) return 'Wait for conversation to initialize...';
    const status = this.conversationStatuses[chat.conversationID];
    switch (status) {
      case 'new':
      case 'generating':
        return 'Pin/Delete will be available after the response is generated.';
      case 'saving':
        return 'Pin/Delete will be available after the conversation is saved.';
      case 'failed':
        return 'Failed to save conversation.';
      default:
        return 'Options';
    }
  }

  // Pin/unpin chat
  pinChat(i: number): void {
    this.historyService.pinChat(i, this.userInfo?.email || '');
    this.activeOptionsIndex = null;
  }

  sortChats(): void {
    this.historyService.sortChats();
  }

  toggleCollapse() {
    this.collapsed = !this.collapsed;
    this.collapsedChange.emit(this.collapsed);
  }

  confirmDelete(index: number, event: MouseEvent) {
    event.stopPropagation(); // prevent triggering openChat()
    this.chatToDeleteIndex = index;
    this.showConfirm = true;
  }

  deleteChat() {
    if (this.chatToDeleteIndex !== null) {
      this.historyService.deleteChat(
        this.chatToDeleteIndex,
        this.userInfo?.email || '',
        () => {
          this.newChat();
        },
      );
      this.chatToDeleteIndex = null;
      this.showConfirm = false;
    }
  }

  confirmRename() {
    if (this.chatToRenameIndex !== null && this.renameValue.trim()) {
      this.historyService.renameChat(
        this.chatToRenameIndex,
        this.renameValue.trim(),
        this.userInfo?.email || '',
      );
      this.showRenameModal = false;
      this.chatToRenameIndex = null;
      this.renameValue = '';
    }
  }

  cancelDelete() {
    this.showConfirm = false;
    this.chatToDeleteIndex = null;
  }

  openRenameModal(index: number) {
    this.chatToRenameIndex = index;
    const chat = this.chats[index];
    this.renameValue =
      chat.conversationName || chat.conversation?.[0]?.question || '';
    this.showRenameModal = true;
    this.activeOptionsIndex = null;
  }

  cancelRename() {
    this.showRenameModal = false;
    this.chatToRenameIndex = null;
    this.renameValue = '';
  }

  // Share chat
  shareChat(index: number): void {
    const selectedChat = this.chats[index];
    this.activeOptionsIndex = null;

    if (!selectedChat?.conversationID) {
      this.toastService.show('Cannot share unsaved conversation', 'error');
      return;
    }

    // perf-ignore
    this.shareTitle = this.getDisplayTitle(selectedChat);
    // Build all Q&A pairs from the conversation
    this.shareConversationPairs = (selectedChat.conversation || [])
      .map((c: any) => {
        let answer = '';
        if (typeof c.response === 'string') {
          answer = c.response;
        } else if (c.response?.response) {
          answer = c.response.response;
        }
        return {
          question: c.question || '',
          answer: answer,
        };
      })
      .filter((p: any) => p.question);

    this.showShareModal = true;
    this.shareLoading = true;
    this.shareUrl = '';
    this.shareLinkCopied = false;

    const payload: any = {
      conversationID: selectedChat.conversationID,
      date_info: selectedChat.startTime || new Date().toISOString(),
      user_string: this.userInfo?.email || '',
      bot_type: 'kumaran',
    };
    if (selectedChat.project_id != null) {
      payload.project_id = selectedChat.project_id;
    }

    this.chatService.shareChat(payload).subscribe({
      next: (res: any) => {
        this.shareLoading = false;
        // Accept common response shapes: { url }, { share_link }, { link }, or string
        const rawUrl =
          res?.url ||
          res?.share_link ||
          res?.link ||
          res?.share_url ||
          (typeof res === 'string' ? res : '');
        if (rawUrl) {
          const urlParts = rawUrl.trim().split('/');
          const token = urlParts[urlParts.length - 1];
          this.shareUrl = `${window.location.origin}/chatbot/s/${token}`;
        } else {
          this.shareUrl = '';
          console.warn('Share API returned unexpected shape:', res);
        }
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        this.shareLoading = false;
        this.shareUrl = '';
        this.toastService.show('Failed to generate share link', 'error');
        console.error('Share API error:', err);
        this.cdr.markForCheck();
      },
    });
  }

  copyShareLink(): void {
    if (!this.shareUrl) return;
    navigator.clipboard.writeText(this.shareUrl).then(
      () => {
        this.shareLinkCopied = true;
        this.toastService.show('Link copied to clipboard!', 'success');
        this.cdr.markForCheck();
        setTimeout(() => {
          this.shareLinkCopied = false;
          this.cdr.markForCheck();
        }, 2000);
      },
      () => {
        this.toastService.show('Failed to copy link', 'error');
        this.cdr.markForCheck();
      },
    );
  }

  closeShareModal(): void {
    this.showShareModal = false;
    this.shareUrl = '';
    this.shareTitle = '';
    this.shareConversationPairs = [];
    this.shareLinkCopied = false;
    this.cdr.markForCheck();
  }

  openSocialShare(platform: string): void {
    if (!this.shareUrl) return;
    const encodedUrl = encodeURIComponent(this.shareUrl);
    const encodedTitle = encodeURIComponent(
      this.shareTitle || 'Shared from KAI',
    );
    let socialUrl = '';

    switch (platform) {
      case 'teams':
        socialUrl = `https://teams.microsoft.com/share?href=${encodedUrl}&msgText=${encodedTitle}`;
        break;
      case 'outlook':
        socialUrl = `https://outlook.office.com/mail/deeplink/compose?subject=${encodedTitle}&body=${encodedUrl}`;
        break;
    }

    if (socialUrl) {
      window.open(
        socialUrl,
        '_blank',
        'noopener,noreferrer,width=600,height=500',
      );
    }
  }

  /**
   * Determines the display title for a conversation.
   * Prioritizes the dedicated conversationName, falls back to the first message,
   * and defaults to 'New Chat' if neither exists.
   */
  getDisplayTitle(conversation: any): string {
    // 1. Primary: Use the new dedicated name field
    if (conversation?.conversationName?.trim()) {
      return conversation.conversationName;
    }

    // 2. Graceful Fallback: Truncate the first message for legacy chats
    if (conversation?.conversation?.length > 0) {
      const firstMsg = conversation.conversation[0].question || '';
      return firstMsg.length > 30
        ? `${firstMsg.substring(0, 30)}...`
        : firstMsg;
    }

    // 3. Final Fallback
    return 'New Chat';
  }

  /**
   * Determines a truncated minimal length version of the tooltip text
   * to avoid overflowing the screen on very long prompts.
   */
  getTooltipText(conversation: any): string {
    const rawTitle =
      conversation?.conversationName ||
      conversation?.conversation?.[0]?.question ||
      'New Chat';
    return rawTitle.length > 60 ? `${rawTitle.substring(0, 60)}...` : rawTitle;
  }

  getInitials(name: string): string {
    if (!name) return '';
    const parts = name.trim().split(' ');
    return parts.length > 1
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : parts[0][0].toUpperCase();
  }

  private handleActiveChatSelected(activeChatObj: any) {
    if (this.emitActiveChatOnInit && activeChatObj) {
      this.chatSelected.emit(activeChatObj);
    }
    // this.scrollActiveIntoView();
  }

  private scrollActiveIntoView() {
    if (!this.hasAutoScrolled) {
      setTimeout(() => {
        const activeEl =
          this.scrollContainer?.nativeElement?.querySelector(
            '.chat-item.active',
          );
        if (activeEl) {
          activeEl.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
          this.hasAutoScrolled = true;
        }
      }, 100);
    }
  }

  loadConversationByCID(conversationID: string) {
    this.storageService.setConversationId(conversationID);
    this.storageService.setLastActiveConversationId(conversationID);
    this.activeConversationID = conversationID;
    this.activeTempId = null;

    const email = this.userInfo?.email || '';

    // If there is an active project, pending prompt, or active project conversation,
    // this is a project chat or new chat - do not load from sidenav history!
    const activeProjectId = sessionStorage.getItem('kai_active_project_id');
    const pendingPrompt = sessionStorage.getItem('kai_pending_prompt');
    const projectConv = sessionStorage.getItem('kai_project_active_conv');
    if (activeProjectId || pendingPrompt || projectConv) {
      if (!this.chats?.length) {
        this.loadChats(false, true);
      }
      return;
    }

    // When on routed /chatbot/:convoId, ChatbotConversationComponent is responsible for loading messages.
    // Sidenav only loads the chats list to populate recents without duplicating the API call.
    const currentUrl = typeof window !== 'undefined' ? window.location.pathname : '';
    if (currentUrl.startsWith('/chatbot/') || currentUrl.startsWith('/projects')) {
      if (!this.chats?.length) {
        this.loadChats(false, true);
      }
      return;
    }

    if (typeof this.historyService.loadConversationByConversationID === 'function') {
      this.historyService.loadConversationByConversationID(
        email,
        conversationID,
        (activeChatObj) => this.handleActiveChatSelected(activeChatObj),
        () => {
          this.invalidConversation.emit();
        },
      );
    } else if (typeof this.historyService.loadSidebarPageByConversationID === 'function') {
      this.historyService.loadSidebarPageByConversationID(
        email,
        conversationID,
        (activeChatObj) => this.handleActiveChatSelected(activeChatObj),
        () => {
          this.invalidConversation.emit();
        },
      );
    }
  }

  loadSidebarPageByConversationID(conversationID: string) {
    this.loadConversationByCID(conversationID);
  }

  loadHistoryPagesUpTo(targetPage: number, preserveActive: boolean = true) {
    this.historyService.loadHistoryPagesUpTo(
      this.userInfo?.email || '',
      targetPage,
      preserveActive,
      (activeChatObj) => this.handleActiveChatSelected(activeChatObj),
    );
  }

  loadChats(isSilent: boolean = false, preserveActive: boolean = true) {
    this.historyService.loadChats(
      this.userInfo?.email || '',
      isSilent,
      preserveActive,
      (activeChatObj) => this.handleActiveChatSelected(activeChatObj),
    );
  }

  resetChatsAndLoad(isSilent: boolean = false) {
    if (this.scrollContainer) {
      this.scrollContainer.nativeElement.scrollTop = 0;
    }
    this.isScrollPaginating = false;
    this.historyService.resetChatsAndLoad(this.userInfo?.email || '', isSilent);
  }

  private syncCache() {
    this.historyService.syncCache(this.userInfo?.email || '');
  }

  // Infinite scroll trigger
  private isScrollPaginating = false;

  onScroll(event: any) {
    if (!this.shouldShowRecents()) return;
    const el = event.target;
    const buffer = 150;
    const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - buffer;

    if (!isAtBottom) {
      return;
    }

    if (this.loadingChats || this.isScrollPaginating) {
      return;
    }

    const canPageMore = this.totalPages === 0 || this.currentPage <= this.totalPages;
    if (!canPageMore) {
      return;
    }

    this.isScrollPaginating = true;
    this.loadMoreChats();
  }

  loadMoreChats() {
    this.historyService.loadChats(
      this.userInfo?.email || '',
      false,
      true,
      (activeChatObj) => this.handleActiveChatSelected(activeChatObj),
      this.currentPage,
      () => {
        setTimeout(() => {
          this.isScrollPaginating = false;
        }, 300);
      }
    );
  }

  togglePopover(event?: MouseEvent) {
    if (!event) {
      this.popoverOpen = false;
      return;
    }
    event.stopPropagation();
    this.popoverOpen = !this.popoverOpen;
    this.activeOptionsIndex = null; // Close chat context menu

    if (this.popoverOpen) {
      this.popoverPosition = {
        bottom: '51px',
        left: '100px',
        top: 'auto',
      };
    }
  }

  onStreamingToggle(value: boolean) {
    this.streamingToggleEvt.emit(value);
  }

  // Close when clicking anywhere else
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    // 1️⃣ Close user-profile popover if clicked outside
    if (!target.closest('.popover-fixed') && !target.closest('.user-profile')) {
      this.popoverOpen = false;
    }

    // 2️⃣ Close chat item options popover if clicked outside
    if (
      !target.closest('.popover-options') &&
      !target.closest('.options-menu button')
    ) {
      this.activeOptionsIndex = null;
    }

    // Close project context menu if clicked outside
    if (
      this.selectedProjectForMenu() &&
      !target.closest('app-chat-context-menu') &&
      !target.closest('.sub-action-item--project .options-menu button')
    ) {
      this.selectedProjectForMenu.set(null);
    }

    // 3️⃣ Close font custom dropdown if clicked outside
    if (this.fontDropdownOpen && !target.closest('.font-dropdown-custom')) {
      this.fontDropdownOpen = false;
      this.fontSearchQuery = '';
    }
  }

  logout() {
    this.closeMobileSidebar.emit();
    try {
      this.storageService.clear();
    } catch {
      // no-op
    }
    this.azureAd.logout();
    this.router.navigate(['/login']);
  }

  newChat() {
    // If new-chat is triggered from the search modal, close it first
    if (this.showSearchModal) {
      this.closeSearchModal();
    }
    sessionStorage.removeItem('kai_active_project_id');
    sessionStorage.removeItem('kai_active_project_name');
    sessionStorage.removeItem('kai_project_active_conv');
    sessionStorage.removeItem('kai_pending_prompt');
    this.safeNavigate('/chatbot');
    this.newChatClicked.emit(); // ✅ Notify ChatbotComponent to start fresh
    this.closeMobileSidebar.emit(); // ✅ Close mobile sidebar if open
    this.activeConversationID = null;
    this.activeTempId = null;
    this.activeOptionsIndex = null;
  }

  dashboard() {
    this.router.navigate(['/admin']);
  }

  /** Determines if a chat item should be highlighted as active in the sidebar */
  // perf-ignore
  isActiveChat(chat: any): boolean {
    try {
      const url = this.router.url || '';
      if (url.includes('/projects') || sessionStorage.getItem('kai_active_project_id')) {
        return false;
      }
    } catch {}

    // 1. If the chat has a real server-assigned conversationID, compare with activeConversationID
    if (chat.conversationID) {
      return chat.conversationID === this.activeConversationID;
    }
    // 2. If the chat only has a tempId (unsaved), compare with activeTempId
    if (chat.tempId) {
      return chat.tempId === this.activeTempId;
    }
    // 3. No ID at all — never mark as active (prevents null === null matches)
    return false;
  }

  /** Stable trackBy for the chat list — uses conversationID or tempId, never index */
  trackByChat(index: number, chat: any): string {
    return chat.conversationID || chat.tempId || `idx-${index}`;
  }

  /** Check if a specific chat is currently generating a response */
  isGenerating(chat: any, index: number): boolean {
    if (chat.conversationID === this.activeConversationID) return false;
    return (
      !!chat?.conversationID && !!this.generatingStates[chat.conversationID]
    );
  }

  openChat(i: number) {
    const selectedChat = this.chats[i];
    if (!selectedChat) return;

    this.activeConversationID = selectedChat.conversationID || null;
    this.activeTempId = null;
    this.chatService.setActiveTempId(null);

    if (selectedChat?.project_id || selectedChat?.project_name) {
      sessionStorage.setItem('kai_active_project_id', String(selectedChat.project_id));
      sessionStorage.setItem('kai_active_project_name', selectedChat.project_name);
    } else {
      sessionStorage.removeItem('kai_active_project_id');
      sessionStorage.removeItem('kai_active_project_name');
      sessionStorage.removeItem('kai_project_active_conv');
    }

    if (selectedChat.conversationID) {
      this.storageService.setConversationId(selectedChat.conversationID);
      this.storageService.setLastActiveConversationId(
        selectedChat.conversationID,
      );
      this.safeNavigate('/chatbot/' + selectedChat.conversationID);
    } else {
      this.safeNavigate('/chatbot');
    }

    this.chatSelected.emit(selectedChat);
    this.closeMobileSidebar.emit();
  }

  showHistory() {
    this.showHistorySection = !this.showHistorySection;
    this.syncCache();
  }

  navigateTo(path: string) {
    this.router.navigate([path]);
  }

  triggerSearch() {
    const query = (this.searchText || '').trim();
    if (!query) {
      // Clear remote results when query cleared
      this.searchResults = [];
      this.isSearchLoading = false;
      return;
    }
    this.isSearchLoading = true;
    this.searchSubject.next(query);
  }

  onSearch() {
    this.historyService.searchChat(this.userInfo?.email || '');
  }

  // ---- Search modal view-model helpers (for screenshot-matching UI) ----
  private parseChatDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    // API returns `startTime` like: "2026-04-27 13:25:27.905014+00:00"
    // Normalize to ISO 8601 so JS Date parses consistently across browsers.
    if (typeof value === 'string') {
      let s = value.trim();

      // Also support message timestamp format: "2026:04:27:13:25:37"
      if (/^\d{4}:\d{2}:\d{2}:\d{2}:\d{2}:\d{2}$/.test(s)) {
        const [y, mo, d, h, mi, se] = s.split(':').map((x) => Number(x));
        const local = new Date(
          y,
          (mo || 1) - 1,
          d || 1,
          h || 0,
          mi || 0,
          se || 0,
        );
        return Number.isNaN(local.getTime()) ? null : local;
      }

      // Convert "YYYY-MM-DD HH:mm:ss" -> "YYYY-MM-DDTHH:mm:ss"
      if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(s)) {
        s = s.replace(' ', 'T');
      }

      // Trim microseconds to milliseconds if present (keep first 3 digits)
      // ".905014+00:00" -> ".905+00:00"
      s = s.replace(/\.(\d{3})\d+([Z+\-])/, '.$1$2');

      // Some backends may omit colon in timezone or have other quirks; Date may still fail,
      // but this improves parsing for our known response formats.
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private toModalItemFromHistory(chat: any, index: number) {
    const title = chat?.conversation?.[0]?.question || chat?.displayTitle || '';
    const date =
      // Per requirement: bucket history using API `startTime`
      this.parseChatDate(chat?.startTime) ||
      // Fallback to first message timestamp for newly created drafts
      this.parseChatDate(chat?.conversation?.[0]?.timestamp) ||
      this.parseChatDate(chat?.date_info) ||
      null;
    return {
      source: 'history' as const,
      key: chat?.conversationID || index,
      index,
      title,
      date,
    };
  }

  private toModalItemFromSearchResult(r: any, index: number) {
    // For conversation results use conversationName (handle API typo 'conersationName');
    // for question results use the question text.
    const category: 'conversation' | 'question' =
      r?._searchCategory || 'question';
    const convName = r?.conversationName || r?.conersationName || '';
    const title =
      category === 'conversation'
        ? convName || r?.question || r?.displayTitle || ''
        : r?.question || r?.displayTitle || '';
    // For question results, also surface the conversation name as a subtitle
    const subtitle = category === 'question' ? convName : '';
    const date =
      this.parseChatDate(r?.startTime) ||
      this.parseChatDate(r?.date_info) ||
      null;
    return {
      source: 'search' as const,
      category,
      key: r?.conversationID || `s-${index}`,
      raw: r,
      title,
      subtitle,
      date,
    };
  }

  private startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  private getRelativeBucketLabel(date: Date | null): string {
    // Per UI requirement: only show two buckets in the modal
    // - Today
    // - Previous 7 days (includes anything older as well)
    if (!date) return 'Previous 7 days';
    const today = this.startOfDay(new Date());
    const day = this.startOfDay(date);
    const diffDays = Math.floor((today.getTime() - day.getTime()) / 86400000);
    if (diffDays <= 0) return 'Today';
    return 'Previous 7 days';
  }

  get searchModalSections(): Array<{ label: string; items: any[] }> {
    const query = (this.searchText || '').trim();

    if (query.length > 0) {
      // ── Search mode: group by category (Conversations / Questions) ──
      const allItems = (this.searchResults || []).map((r, i) =>
        this.toModalItemFromSearchResult(r, i),
      );
      const items = allItems.filter((x) => !!x.title);

      const categoryOrder = ['Conversations', 'Questions'];
      const categoryMap: Record<string, string> = {
        conversation: 'Conversations',
        question: 'Questions',
      };
      const groups = new Map<string, any[]>();
      for (const it of items) {
        const label = categoryMap[it.category] || 'Questions';
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label)!.push(it);
      }

      return categoryOrder
        .filter((label) => (groups.get(label) || []).length > 0)
        .map((label) => ({ label, items: groups.get(label)! }));
    }

    // ── Browse mode (no query): group by date ──
    const baseItems = (this.chats || []).map((c, i) =>
      this.toModalItemFromHistory(c, i),
    );
    const items = baseItems.filter((x) => !!x.title);

    const order = ['Today', 'Previous 7 days'];
    const groups = new Map<string, any[]>();
    for (const it of items) {
      const label = this.getRelativeBucketLabel(it.date);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(it);
    }

    return order
      .filter((label) => (groups.get(label) || []).length > 0)
      .map((label) => ({ label, items: groups.get(label)! }));
  }

  onSearchModalItemClick(item: any) {
    if (!item) return;
    if (item.source === 'history') {
      this.openChat(item.index);
      this.closeSearchModal();
      return;
    }
    if (item.source === 'search') {
      this.openChatFromSearch(item.raw);
    }
  }

  get isSettingsSupportedPage(): boolean {
    return this.themeService?.isThemeSupportedUrl ? this.themeService.isThemeSupportedUrl(this.router.url) : true;
  }

  openSettingsModal() {
    if (!this.isSettingsSupportedPage) {
      return;
    }
    this.showSettingsModal = true;
    this.closeMobileSidebar.emit();
  }

  closeSettingsModal() {
    this.showSettingsModal = false;
  }

  get theme(): ThemeMode {
    return this.themeService.themeSignal();
  }

  setTheme(next: ThemeMode) {
    this.themeService.setTheme(next);
  }

  get colorTheme(): ColorTheme {
    return this.themeService.colorThemeSignal();
  }

  setColorTheme(next: ColorTheme) {
    this.themeService.setColorTheme(next);
  }

  get fontFamily(): FontFamily {
    return this.themeService.fontFamilySignal();
  }

  setFontFamily(next: FontFamily) {
    this.themeService.setFontFamily(next);
  }

  get filteredFontFamilies() {
    const query = this.fontSearchQuery.trim().toLowerCase();
    if (!query) return this.fontFamilies;
    return this.fontFamilies.filter((f) =>
      f.label.toLowerCase().includes(query),
    );
  }

  toggleFontDropdown(event: Event) {
    event.stopPropagation();
    this.fontDropdownOpen = !this.fontDropdownOpen;
    if (this.fontDropdownOpen) {
      this.fontSearchQuery = '';
    }
  }

  selectFontFamily(fontKey: FontFamily) {
    this.setFontFamily(fontKey);
    this.fontDropdownOpen = false;
    this.fontSearchQuery = '';
  }

  getSelectedFontLabel(): string {
    const current = this.fontFamilies.find((f) => f.key === this.fontFamily);
    return current ? current.label : 'Inter';
  }

  getSelectedFontFamilyCSS(): string {
    const current = this.fontFamilies.find((f) => f.key === this.fontFamily);
    return current ? current.family : 'inherit';
  }

  onStreamingToggleInsideSettings(event: any) {
    const isChecked = event.target.checked;
    this.streaming = isChecked;
    this.streamingToggleEvt.emit(isChecked);
  }
}
