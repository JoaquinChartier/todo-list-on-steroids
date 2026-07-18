import type { AIOutput } from "../ai/types";

type Props = {
  ai?: AIOutput;
  loading: boolean;
};

export function AIPanel({ ai, loading }: Props) {
  if (loading) {
    return (
      <div className="ai-line loading" aria-busy="true">
        <span className="ai-shimmer" />
      </div>
    );
  }

  if (!ai || ai.subtasks.length === 0) return null;

  return (
    <ol className="subtask-list">
      {ai.subtasks.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ol>
  );
}

