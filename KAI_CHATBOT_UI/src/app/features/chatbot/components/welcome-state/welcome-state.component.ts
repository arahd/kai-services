import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatIconComponent } from '@features/chatbot/components/chat-icon/chat-icon.component';

export interface PromptTemplate {
  title: string;
  desc: string;
  prompt: string;
  icon: string;
  tag: string;
  color?: string;
}

export interface PromptCategory {
  id: string;
  name: string;
  templates: PromptTemplate[];
}

@Component({
  selector: 'app-welcome-state',
  standalone: true,
  imports: [CommonModule, ChatIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './welcome-state.component.html',
  styleUrls: ['./welcome-state.component.scss'],
})
export class WelcomeStateComponent {
  @Input() userName = '';
  @Input() avatarUrl: string | null = null;
  @Input() cards: Array<{
    title: string;
    text: string;
    prompt: string;
  }> = [];
  @Output() cardClicked = new EventEmitter<any>();
  @Output() categoryPillClicked = new EventEmitter<PromptCategory>();

  categories: PromptCategory[] = [
    {
      id: 'hr',
      name: 'HR',
      templates: [
        {
          title: 'Resume Analyzer',
          desc: 'Analyze resumes and identify top candidates',
          prompt:
            'Analyze the following resume text for a software engineer role. Detail their top 3 strengths, any potential warning signs, and provide 5 tailored interview questions based on their experience:\n\n[Paste Resume Text Here]',
          icon: 'document',
          tag: 'Screening',
          color: 'purple',
        },
        {
          title: 'Write Job Description',
          desc: 'Create detailed job descriptions',
          prompt:
            'Write a comprehensive job description for a Senior Angular Developer, including key responsibilities, required skills (Angular, TypeScript, RxJS), and nice-to-have qualifications.',
          icon: 'document',
          tag: 'Recruiting',
          color: 'blue',
        },
        {
          title: 'Interview Invite',
          desc: 'Send professional invitation emails',
          prompt:
            'Write a warm and professional email to invite a candidate for a technical interview, providing 3 scheduling options and explaining the format (60 mins, live coding).',
          icon: 'outlook',
          tag: 'Communication',
          color: 'magenta',
        },
      ],
    },
    {
      id: 'writing',
      name: 'Copy Writing',
      templates: [
        {
          title: 'Bug Report Draft',
          desc: 'Create a structured bug report for development teams.',
          prompt:
            'Draft a structured bug report for a UI layout overflow issue. Include sections for: Steps to Reproduce, Expected Behavior, Actual Behavior, and System Details.',
          icon: 'bug',
          tag: 'Technical',
          color: 'blue',
        },
        {
          title: 'Release Notes',
          desc: 'Write clear and engaging product release announcements.',
          prompt:
            'Write an engaging release announcement email for KAI Chatbot UI version 2.0, highlighting the new responsive sidebar, dark mode, and improved page load speeds.',
          icon: 'document',
          tag: 'Marketing',
          color: 'purple',
        },
        {
          title: 'Refine E-mail Tone',
          desc: 'Adjust drafts to sound professional and constructive.',
          prompt:
            'Rewrite the following email to sound highly professional, polite, and constructive:\n\n"Hey, the feature is delayed by 2 days because we have bugs in the integration test. I need more time. Sorry." ',
          icon: 'outlook',
          tag: 'Editing',
          color: 'magenta',
        },
      ],
    },
    {
      id: 'technical',
      name: 'Development',
      templates: [
        {
          title: 'Angular API Service',
          desc: 'Generate a clean HttpClient service with RxJS operators.',
          prompt:
            'Write an Angular service class using HttpClient to fetch a list of items from a REST API. Include proper TypeScript interfaces, error handling with RxJS catchError, and clean code comments.',
          icon: 'write-code',
          tag: 'Angular',
          color: 'blue',
        },
        {
          title: 'Git Conflict Guide',
          desc: 'Provide step-by-step commands to resolve merges.',
          prompt:
            'Provide a step-by-step git cheat sheet showing how to fetch updates, merge the origin/main branch into a local feature branch, and resolve conflicts using git stash.',
          icon: 'document',
          tag: 'Git',
          color: 'purple',
        },
        {
          title: 'Regex Generator',
          desc: 'Build custom regular expressions with explanations.',
          prompt:
            'Create a regular expression to validate a complex password (must contain at least 8 characters, one uppercase letter, one lowercase letter, one number, and one special character) and explain how it works.',
          icon: 'write-code',
          tag: 'Regex',
          color: 'magenta',
        },
      ],
    },
    {
      id: 'productivity',
      name: 'Productivity',
      templates: [
        {
          title: 'Meeting Summarizer',
          desc: 'Extract key takeaways and action items from transcripts.',
          prompt:
            'Summarize the key decisions, main discussion points, and action items from this meeting notes transcript in a structured list:\n\n[Paste Transcript Here]',
          icon: 'document',
          tag: 'Meeting',
          color: 'blue',
        },
        {
          title: 'Explain Complex Topics',
          desc: 'Break down complex concepts into simple explanations.',
          prompt:
            'Explain the concept of WebSockets and how it differs from standard HTTP polling. Use an analogy suitable for a non-technical manager.',
          icon: 'document',
          tag: 'Education',
          color: 'purple',
        },
        {
          title: 'SWOT Analysis Creator',
          desc: 'Outline Strengths, Weaknesses, Opportunities, Threats.',
          prompt:
            'Perform a SWOT analysis for launching a new internal AI assistant tool for a 500-person enterprise software development company.',
          icon: 'document',
          tag: 'Strategy',
          color: 'magenta',
        },
      ],
    },
  ];

  selectedCategoryId = 'hr';

  get displayName(): string {
    const raw = this.userName || 'Maxim';
    return raw.split('.')[0];
  }

  get activeTemplates(): PromptTemplate[] {
    const category = this.categories.find(
      (c) => c.id === this.selectedCategoryId,
    );
    return category ? category.templates : [];
  }

  selectCategory(id: string) {
    this.selectedCategoryId = id;
  }

  templateClicked(template: PromptTemplate) {
    this.cardClicked.emit({ prompt: template.prompt });
  }

  onMobileCategoryClick(category: PromptCategory) {
    this.selectedCategoryId = category.id;
    this.categoryPillClicked.emit(category);
  }
}
