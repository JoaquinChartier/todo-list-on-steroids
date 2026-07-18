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

  if (!ai) {
    return <p className="ai-line empty">No AI notes.</p>;
  }

  const hasSubtasks = ai.subtasks.length > 0;

  return (
    <div className="ai-wrap">
      {hasSubtasks ? (
        <ol className="subtask-list">
          {ai.subtasks.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      ) : (
        <p className="ai-line empty">No subtasks inferred.</p>
      )}
    </div>
  );
}
