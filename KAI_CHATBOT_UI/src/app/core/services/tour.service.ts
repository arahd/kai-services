import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import Shepherd from 'shepherd.js';
import { LocalStorageService, LocalStorageKeys } from './local-storage.service';

@Injectable({
  providedIn: 'root'
})
export class TourService {
  private tour: any = null;
  private readonly TOUR_KEY = LocalStorageKeys.HAS_SEEN_CHATBOT_TOUR;
  private totalSteps = 0;
  private storageService = inject(LocalStorageService);
  private readonly platformId = inject<object>(PLATFORM_ID);

  public initTour(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.tour = new Shepherd.Tour({
      useModalOverlay: true,
      defaultStepOptions: {
        cancelIcon: {
          enabled: true
        },
        classes: 'premium-shepherd-theme',
        scrollTo: { behavior: 'smooth', block: 'center' }
      }
    });

    this.addSteps();

    // Persist completion when tour ends or is cancelled
    this.tour.on('complete', () => this.markTourAsSeen());
    this.tour.on('cancel', () => this.markTourAsSeen());
  }

  public startTourIfNotSeen(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    
    const hasSeenTour = this.storageService.getHasSeenTour();
    if (!hasSeenTour) {
      // Small timeout ensures the DOM has fully rendered before targeting
      setTimeout(() => {
        this.startTour();
      }, 500);
    }
  }

  public startTour(): void {
    if (!this.tour) {
      this.initTour();
    }
    this.tour?.start();
  }

  private markTourAsSeen(): void {
    this.storageService.setHasSeenTour(true);
  }

  /** Generates the step-dots HTML for the footer */
  private buildStepDots(currentIndex: number): string {
    let dots = '';
    for (let i = 0; i < this.totalSteps; i++) {
      let cls = 'dot';
      if (i === currentIndex) cls += ' active';
      else if (i < currentIndex) cls += ' completed';
      dots += `<span class="${cls}"></span>`;
    }
    return `<div class="tour-step-dots">${dots}</div>`;
  }

  /** Builds buttons for a given step index */
  private buildButtons(stepIndex: number): any[] {
    const isFirst = stepIndex === 0;
    const isLast = stepIndex === this.totalSteps - 1;

    const buttons: any[] = [];

    if (!isLast) {
      buttons.push({
        classes: 'shepherd-button-secondary',
        text: 'Skip',
        action: () => this.tour?.cancel()
      });
    }

    if (isLast) {
      buttons.push({
        classes: 'shepherd-button-primary',
        text: 'Finish ✓',
        action: () => this.tour?.cancel()
      });
    } else {
      buttons.push({
        classes: 'shepherd-button-primary',
        text: 'Next ›',
        action: () => this.tour?.next()
      });
    }

    return buttons;
  }

  // --- TOUR CONFIGURATION ---
  private addSteps(): void {
    const steps = [
      {
        id: 'welcome-step',
        title: 'Welcome to KAI Chatbot ✨',
        text: 'Let me show you around so you can make the most out of your experience.',
        attachTo: { element: '#tour-welcome', on: 'bottom' },
      },
      {
        id: 'sidenav-toggle',
        title: 'Toggle Sidebar',
        text: 'Click here to expand or collapse the sidebar for more screen space.',
        attachTo: { element: '#tour-sidenav-toggle', on: 'right' },
      },
      {
        id: 'new-chat',
        title: 'Start a New Chat',
        text: 'Click here to clear the current context and start a brand new conversation.',
        attachTo: { element: '#tour-new-chat', on: 'right' },
      },
      {
        id: 'search-chats',
        title: 'Search Chats',
        text: 'Quickly find specific messages from your past conversations using this search feature.',
        attachTo: { element: '#tour-search-chats', on: 'right' },
      },
      {
        id: 'recent-chats',
        title: 'Recent Conversations',
        text: 'Access your history here to pick up exactly where you left off.',
        attachTo: { element: '#tour-recent-chats', on: 'right' },
      },
      {
        id: 'pin-delete',
        title: 'Manage Your Chats',
        text: 'Click here to access chat options like pin or delete.',
        attachTo: { element: '#tour-pin-delete', on: 'right' },
      },
      {
        id: 'model-selector',
        title: 'Choose AI Model',
        text: 'Select the AI model you want to use for generating responses.',
        attachTo: { element: '#tour-model-selector', on: 'top' },
      },
      {
        id: 'chat-input',
        title: 'Ask Anything',
        text: 'Type your questions or prompts here. The AI is ready to help.',
        attachTo: { element: '#chatInput', on: 'top' },
      },
      {
        id: 'file-upload',
        title: 'Upload Documents',
        text: 'Need to analyze a file? Click here to upload documents or images.',
        attachTo: { element: '#tour-file-upload', on: 'top' },
      },
      {
        id: 'mic-input',
        title: 'Voice Input',
        text: 'Use your microphone to speak your prompt hands-free.',
        attachTo: { element: '#tour-mic-input', on: 'top' },
      },
      {
        id: 'user-profile',
        title: 'User Profile',
        text: 'Access your profile here to log out or toggle the streaming option.',
        attachTo: { element: '#tour-user-profile', on: 'top' },
      }
    ];

    this.totalSteps = steps.length;

    // Build each step with dots + buttons
    const configuredSteps = steps.map((step, index) => ({
      ...step,
      buttons: this.buildButtons(index),
      when: {
        show: () => {
          // Inject step dots into the footer
          const currentStep = this.tour?.getCurrentStep();
          if (!currentStep) return;
          const footer = currentStep.el?.querySelector('.shepherd-footer');
          if (footer) {
            // Remove existing dots if re-shown
            const existingDots = footer.querySelector('.tour-step-dots');
            if (existingDots) existingDots.remove();

            // Insert dots before buttons
            const dotsHtml = this.buildStepDots(index);
            footer.insertAdjacentHTML('afterbegin', dotsHtml);

            // Wrap buttons in a container for layout
            if (!footer.querySelector('.tour-footer-actions')) {
              const buttons = footer.querySelectorAll('.shepherd-button');
              const wrapper = document.createElement('div');
              wrapper.className = 'tour-footer-actions';
              buttons.forEach((btn: Element) => wrapper.appendChild(btn));
              footer.appendChild(wrapper);
            }
          }
        }
      }
    }));

    this.tour?.addSteps(configuredSteps);
  }
}
