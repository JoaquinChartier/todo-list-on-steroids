export type Priority = "low" | "medium" | "high" | "urgent";

export const PRIORITY_ORDER: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export type AIOutput = {
  suggestion: string;
  followup: string;
  question: string;
  priority: Priority;
  generatedAt: number;
  model: string;
};

export type Item = {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  updatedAt: number;
  ai?: AIOutput;
  aiSignature?: string;
  priority?: Priority;
};

export type NewItemInput = {
  text: string;
  done?: boolean;
};
