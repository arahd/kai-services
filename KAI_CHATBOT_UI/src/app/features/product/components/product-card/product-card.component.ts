import {
  Component,
  input,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { Router } from '@angular/router';
import { ToastService } from '@core/services/toast.service';
import { LocalStorageService } from '@core/services/local-storage.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-product-card',
  standalone: true,
  templateUrl: './product-card.component.html',
  styleUrl: './product-card.component.scss',
})
export class ProductCardComponent {
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);
  private readonly storageService = inject(LocalStorageService);

  readonly title = input.required<string>();
  readonly description = input.required<string>();
  readonly badgeText = input<string>('ACTIVE'); // e.g. ACTIVE, BETA
  readonly status = input<'ACTIVE' | 'BETA'>('ACTIVE');
  readonly iconType = input<string>('platform');
  readonly actionType = input<'launch' | 'request'>('request');
  readonly redirectUrl = input<string>();
  readonly disabled = input<boolean>(false);

  readonly showDetailsModal = signal<boolean>(false);

  onDetails() {
    this.showDetailsModal.set(true);
  }

  closeDetails() {
    this.showDetailsModal.set(false);
  }

  getProjectDescription(): string {
    const t = this.title().toLowerCase();
    if (t.includes('agent flow') || t.includes('kaf')) {
      return 'Kumaran Agent Flow (KAF) is an advanced multi-agent workflow orchestration system. It enables teams to design, connect, and execute autonomous AI agents in parallel streams, sequential pipelines, or pattern-driven loops (Planner-Executor-Validator).';
    }
    if (
      t.includes('k-agent') ||
      t.includes('kagent') ||
      t.includes('k-platform') ||
      t.includes('platform')
    ) {
      return 'K-Agent is the unified developer administration portal and central identity management hub for the Kumaran AI suite. It manages user authentication, role-based access control (RBAC), Single Sign-On (SSO), agent lifecycle configurations, and global service deployments.';
    }
    if (t.includes('docspec')) {
      return 'DocSpec is an AI-powered document specification generator and intelligent parser. It transforms unstructured documents, requirement specifications, and business documentation into structured technical schemas and actionable engineering specs.';
    }
    if (t.includes('sdd')) {
      return 'SDD (Spec Driven Development) is an AI-assisted development framework that generates application code, test suites, and software architecture directly from formalized software specifications and design blueprints.';
    }
    if (t.includes('mainframe') || t.includes('spring batch')) {
      return 'Mainframe - Spring Batch App is an automated modernization and migration platform that transforms legacy Mainframe batch jobs (JCL, COBOL) into scalable, cloud-native Spring Batch applications.';
    }
    return (
      this.description() ||
      'Specialized AI capability designed to automate enterprise workflows, streamline technical processes, and enhance overall development productivity.'
    );
  }

  getProjectWhyUsed(): string {
    const t = this.title().toLowerCase();
    if (t.includes('agent flow') || t.includes('kaf')) {
      return 'It is used to automate complex, multi-step software engineering and business operations that require coordinated decision-making across specialized LLM agents with continuous verification and zero manual intervention.';
    }
    if (
      t.includes('k-agent') ||
      t.includes('kagent') ||
      t.includes('k-platform') ||
      t.includes('platform')
    ) {
      return 'It is used to streamline administrative control across enterprise teams by providing seamless Single Sign-On (SSO), secure secret rotation, and a centralized management dashboard for tracking all active agents and services.';
    }
    if (t.includes('docspec')) {
      return 'It is used to eliminate manual requirement parsing, speed up project discovery, prevent specification drift, and automatically generate machine-readable inputs for downstream build tools.';
    }
    if (t.includes('sdd')) {
      return 'It is used to accelerate software delivery cycles, enforce architectural standards, and ensure that built software strictly matches validated business requirements.';
    }
    if (t.includes('mainframe') || t.includes('spring batch')) {
      return 'It is used to accelerate mainframe modernization, reduce high MIPS and infrastructure costs, eliminate legacy technical debt, and seamlessly transition mission-critical batch processing to open-source, cloud-ready architectures.';
    }
    return 'It is used to reduce manual operational overhead, improve delivery speed, and maintain consistency across complex enterprise projects.';
  }

  onPrimaryAction() {
    if (this.disabled()) {
      return;
    }

    const originalUrl = this.redirectUrl();
    if (originalUrl) {
      this.toastService.show(`Launching ${this.title()}...`, 'success');
      window.open(originalUrl, '_blank', 'noopener');
    } else if (this.actionType() === 'request') {
      this.router.navigate(['/request-access']);
    } else {
      this.toastService.show(
        `Launching "${this.title()}" portal...`,
        'success',
      );
    }
  }
}
