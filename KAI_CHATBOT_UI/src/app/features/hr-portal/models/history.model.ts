export interface HistoryItem {
  id: string;
  candidateName: string;
  timestamp: number;
  score: number;
  mode: 'jd' | 'linkedin';
  data: any;
}
