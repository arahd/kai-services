import { Routes } from '@angular/router';
import { LoginComponent } from './features/login/login.component';
import { AuthGuard } from '@core/auth/auth.guard';
import {
  hrAdminGuard,
  hrResumeGuard,
  hrVisaGuard,
} from './features/hr-portal/guards/hr-admin.guard';
import { productAdminGuard } from './features/product/guards/product-admin.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },

  { path: 'login', component: LoginComponent },

  {
    path: 'chatbot/s/:token',
    loadComponent: () =>
      import('./features/shared-chat/shared-chat.component').then(
        (m) => m.SharedChatComponent
      ),
  },

  {
    path: 'chatbot',
    loadComponent: () =>
      import('./features/chatbot/chatbot.component').then(
        (m) => m.ChatbotComponent
      ),
    canActivate: [AuthGuard],
    data: { roles: ['kai_chatbot_dev_user', 'kai_chatbot_dev_admin'] },
    children: [
      {
        path: '',
        title: 'New Chat - KAI',
        loadComponent: () =>
          import(
            './features/chatbot/pages/chatbot-welcome/chatbot-welcome.component'
          ).then((m) => m.ChatbotWelcomeComponent),
      },
      {
        path: ':convoId',
        title: 'Chat - KAI',
        loadComponent: () =>
          import(
            './features/chatbot/pages/chatbot-conversation/chatbot-conversation.component'
          ).then((m) => m.ChatbotConversationComponent),
      },
    ],
  },

  {
    path: 'projects',
    loadComponent: () =>
      import('./features/projects/projects.component').then(
        (m) => m.ProjectsComponent
      ),
    canActivate: [AuthGuard],
    data: { roles: ['kai_chatbot_dev_user', 'kai_chatbot_dev_admin'] },
    children: [
      {
        path: '',
        loadComponent: () =>
          import(
            './features/projects/pages/project-list/project-list.component'
          ).then((m) => m.ProjectListComponent),
      },
      {
        path: ':projectId',
        loadComponent: () =>
          import(
            './features/projects/pages/project-detail/project-detail.component'
          ).then((m) => m.ProjectDetailComponent),
      },
      {
        path: ':projectId/:conversationId',
        loadComponent: () =>
          import(
            './features/chatbot/pages/chatbot-conversation/chatbot-conversation.component'
          ).then((m) => m.ChatbotConversationComponent),
      },
    ],
  },

  {
    path: 'product',
    loadComponent: () =>
      import('./features/product/product.component').then(
        (m) => m.ProductComponent
      ),
    canActivate: [AuthGuard],
    data: { roles: ['kai_chatbot_dev_user', 'kai_chatbot_dev_admin'] },
  },
  {
    path: 'product/admin',
    loadComponent: () =>
      import(
        './features/product/pages/product-admin/product-admin.component'
      ).then((m) => m.ProductAdminComponent),
    canActivate: [AuthGuard, productAdminGuard],
    data: { roles: ['kai_chatbot_dev_user', 'kai_chatbot_dev_admin'] },
  },
  {
    path: 'product/products-admin',
    redirectTo: 'product/admin',
    pathMatch: 'full',
  },
  {
    path: 'products-admin',
    redirectTo: 'product/admin',
    pathMatch: 'full',
  },
  {
    path: 'user-management',
    redirectTo: 'admin/user-management',
    pathMatch: 'full',
  },

  {
    path: 'admin',
    loadComponent: () =>
      import('./features/admin-dashboard/admin-dashboard.component').then(
        (m) => m.AdminDashboardComponent
      ),
    canActivate: [AuthGuard],
    data: { roles: ['kai_chatbot_dev_admin'] },
    children: [
      {
        path: 'analytics',
        loadComponent: () =>
          import(
            './features/admin-dashboard/pages/analytics/analytics.component'
          ).then((m) => m.AnalyticsComponent),
      },
      {
        path: 'user-management',
        loadComponent: () =>
          import(
            './features/admin-dashboard/pages/user-management/user-management.component'
          ).then((m) => m.UserManagementComponent),
      },
      {
        path: 'service-user-analytics',
        loadComponent: () =>
          import(
            './features/admin-dashboard/pages/service-user-analytics/service-user-analytics.component'
          ).then((m) => m.ServiceUserAnalyticsComponent),
      },
      {
        path: 'bug-reports',
        loadComponent: () =>
          import(
            './features/admin-dashboard/pages/bug-reports/bug-reports.component'
          ).then((m) => m.BugReportsComponent),
      },
      { path: 'approvals', redirectTo: 'service-user-analytics', pathMatch: 'full' },
      { path: 'secrets', redirectTo: 'service-user-analytics', pathMatch: 'full' },
      { path: '', redirectTo: 'analytics', pathMatch: 'full' },
    ],
  },

  {
    path: 'hrportal',
    loadComponent: () =>
      import('./features/hr-portal/hr-portal.component').then(
        (m) => m.HrPortalComponent
      ),
    canActivate: [AuthGuard],
    data: { roles: ['kai_chatbot_dev_hr'] },
    children: [
      {
        path: 'jd',
        loadComponent: () =>
          import(
            './features/hr-portal/pages/resume-dashboard/resume-dashboard.component'
          ).then((m) => m.ResumeDashboardComponent),
      },
      {
        path: 'linkedin',
        loadComponent: () =>
          import(
            './features/hr-portal/pages/linked-in-checker/linked-in-checker.component'
          ).then((m) => m.LinkedInCheckerComponent),
      },
      {
        path: 'resume-standardizer',
        canActivate: [hrResumeGuard],
        loadComponent: () =>
          import(
            './features/hr-portal/pages/resume-standardizer/resume-standardizer.component'
          ).then((m) => m.ResumeStandardizerComponent),
      },
      {
        path: 'visa-process',
        canActivate: [hrVisaGuard],
        loadComponent: () =>
          import(
            './features/hr-portal/pages/visa-process/visa-process.component'
          ).then((m) => m.VisaProcessComponent),
      },
      {
        path: 'analytics',
        canActivate: [hrAdminGuard],
        loadComponent: () =>
          import(
            './features/hr-portal/pages/hr-analytics/hr-analytics.component'
          ).then((m) => m.HrAnalyticsComponent),
      },
      {
        path: 'recent-activity',
        loadComponent: () =>
          import(
            './features/hr-portal/pages/recent-activity/recent-activity.component'
          ).then((m) => m.RecentActivityComponent),
      },
      {
        path: 'history',
        canActivate: [hrAdminGuard],
        loadComponent: () =>
          import(
            './features/hr-portal/pages/hr-history/hr-history.component'
          ).then((m) => m.HrHistoryComponent),
      },
      {
        path: 'admin-control',
        canActivate: [hrAdminGuard],
        loadComponent: () =>
          import(
            './features/hr-portal/pages/hr-admin-control/hr-admin-control.component'
          ).then((m) => m.HrAdminControlComponent),
      },
      { path: '', redirectTo: 'jd', pathMatch: 'full' },
    ],
  },

  {
    path: 'agents',
    loadComponent: () =>
      import('./features/agents/agents.component').then(
        (m) => m.AgentsComponent
      ),
    canActivate: [AuthGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/agents/pages/agent-hub/agent-hub.component').then(
            (m) => m.AgentHubComponent
          ),
      },
      {
        path: ':agentId',
        loadComponent: () =>
          import('./features/agents/pages/agent-chat/agent-chat.component').then(
            (m) => m.AgentChatComponent
          ),
      },
    ],
  },

  {
    path: 'request-access',
    loadComponent: () =>
      import('./features/request-access/request-access.component').then(
        (m) => m.RequestAccessComponent
      ),
  },

  {
    path: 'privacy-policy',
    title: 'Privacy Policy - KAI',
    loadComponent: () =>
      import(
        './features/chatbot/pages/privacy-policy/privacy-policy.component'
      ).then((m) => m.PrivacyPolicyComponent),
    canActivate: [AuthGuard],
  },

  { path: '**', redirectTo: 'login' },
];
