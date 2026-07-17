export type AIOutput = {
  suggestion: string;
  followup: string;
  question: string;
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
};

export type NewItemInput = {
  text: string;
  done?: boolean;
};
