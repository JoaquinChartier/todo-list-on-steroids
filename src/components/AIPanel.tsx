import { useState } from "react";
import type { AIOutput } from "../ai/types";

type Props = {
  ai?: AIOutput;
  loading: boolean;
};

export function AIPanel({ ai, loading }: Props) {
  const [metaOpen, setMetaOpen] = useState(false);

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
  const summary = hasSubtasks
    ? `${ai.subtasks.length} subtasks`
    : "Simple item — no subtasks needed";

  return (
    <div className="ai-wrap">
      {!metaOpen && (
        <p
          className="ai-line"
          title={summary}
          onClick={() => setMetaOpen(true)}
        >
          {summary}
        </p>
      )}
      {metaOpen && (
        <div className="ai-detail">
          <div className="ai-list" onClick={() => setMetaOpen(false)}>
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
          <div className="ai-meta">
            <span>{new Date(ai.generatedAt).toLocaleDateString("en-GB", { year: "2-digit", month: "2-digit", day: "2-digit" })}</span>
            <span className="ai-model">{ai.model}</span>
          </div>
        </div>
      )}
    </div>
  );
}
