import type { RunStep, TicketRunResult } from "./types";

function durationMs(from: number, to: number): string {
  const ms = Math.max(0, to - from);
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

function totalDuration(run: TicketRunResult): string {
  return durationMs(run.startedAt, run.finishedAt);
}

function timeToFirstHypothesis(run: TicketRunResult): string {
  const hypothesis = run.steps.find((step) => step.id === "hypothesis");
  return hypothesis === undefined ? "—" : durationMs(run.startedAt, hypothesis.finishedAt);
}

function filesTouched(run: TicketRunResult): number {
  return new Set([run.diff.path]).size;
}

function DiffLines({ text }: { text: string }) {
  return (
    <pre className="diff" data-testid="diff">
      {text.split("\n").map((line, index) => {
        let className = "diff__line";
        if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("@@")) {
          className = `${className} diff__line--meta`;
        } else if (line.startsWith("+")) {
          className = `${className} diff__line--add`;
        } else if (line.startsWith("-")) {
          className = `${className} diff__line--remove`;
        }
        return (
          <span key={index} className={className}>
            {line}
          </span>
        );
      })}
    </pre>
  );
}

function TestCard({ label, evidence }: { label: string; evidence: TicketRunResult["testsBefore"] }) {
  const failedText =
    evidence.regression.actual === null
      ? "regression passed"
      : `regression failed: ${evidence.regression.name} expected ${evidence.regression.expected}, actual ${evidence.regression.actual}`;
  return (
    <div className={`test-card ${evidence.regressionPassed ? "test-card--green" : "test-card--red"}`}>
      <div className="test-card__label">{label}</div>
      <div className="test-card__count">
        {evidence.passed} passed / {evidence.failed} failed / {evidence.total} total
      </div>
      <div className="test-card__note">{failedText}</div>
    </div>
  );
}

function StepRow({ step, index }: { step: RunStep; index: number }) {
  return (
    <li className="timeline__step">
      <span className="timeline__index">{index + 1}</span>
      <div className="timeline__body">
        <div className="timeline__head">
          <span className="timeline__title">{step.title}</span>
          <span className="timeline__duration">{durationMs(step.startedAt, step.finishedAt)}</span>
        </div>
        <p className="timeline__detail">{step.detail}</p>
      </div>
    </li>
  );
}

/** The post-run PR view: 4-step timeline, RCA, test flip, real diff, and PR summary. */
export function RunResultView({ run }: { run: TicketRunResult }) {
  return (
    <section className="run-view">
      <header className="run-view__header">
        <div className="run-view__chips">
          <span className="chip chip--ok">Run complete</span>
          <span className="chip">Gate {run.workspaceBefore} → {run.workspaceAfter}</span>
          <span className="chip">
            {run.diff.added} added / {run.diff.removed} removed
          </span>
          {run.branchName === undefined ? null : <span className="chip">Local branch {run.branchName}</span>}
          <span className="chip">{totalDuration(run)}</span>
        </div>
      </header>

      <section className="detail__section">
        <h2>Timeline</h2>
        <ol className="timeline" aria-label="Run timeline">
          {run.steps.map((step, index) => (
            <StepRow key={step.id} step={step} index={index} />
          ))}
        </ol>
      </section>

      <section className="detail__section">
        <h2>Root cause analysis</h2>
        <dl className="rca">
          <div className="rca__row">
            <dt>Signal</dt>
            <dd>{run.rca.signal}</dd>
          </div>
          <div className="rca__row">
            <dt>Customer impact</dt>
            <dd>{run.rca.customerImpact}</dd>
          </div>
          <div className="rca__row">
            <dt>Hypothesis</dt>
            <dd>{run.rca.hypothesis}</dd>
          </div>
          <div className="rca__row">
            <dt>Files to inspect</dt>
            <dd>
              <ul className="rca__list">
                {run.rca.filesToInspect.map((file) => (
                  <li key={file}>{file}</li>
                ))}
              </ul>
            </dd>
          </div>
          <div className="rca__row">
            <dt>Blast radius</dt>
            <dd>{run.rca.blastRadius}</dd>
          </div>
          <div className="rca__row">
            <dt>Tests that must pass</dt>
            <dd>
              <ul className="rca__list">
                {run.rca.testsThatMustPass.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </dd>
          </div>
          <div className="rca__row">
            <dt>What a human must verify before merge</dt>
            <dd>
              <ul className="rca__list">
                {run.rca.humanVerification.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>
      </section>

      <section className="detail__section">
        <h2>Tests</h2>
        <div className="test-row">
          <TestCard label="Before patch" evidence={run.testsBefore} />
          <span className="test-row__arrow">→</span>
          <TestCard label="After patch" evidence={run.testsAfter} />
        </div>
      </section>

      <section className="detail__section">
        <h2>Diff</h2>
        <p className="diff__path">{run.diff.path}</p>
        <DiffLines text={run.diff.text} />
      </section>

      <section className="detail__section pr">
        <div className="pr__heading">
          <h2>Pull request</h2>
          <span className="chip chip--ok">Ready for human review</span>
        </div>
        <dl className="metrics-strip" aria-label="Pull request metrics">
          <div className="metric">
            <dt>Time-to-first-hypothesis</dt>
            <dd>{timeToFirstHypothesis(run)}</dd>
          </div>
          <div className="metric">
            <dt>Files touched</dt>
            <dd>{filesTouched(run)}</dd>
          </div>
          <div className="metric">
            <dt>Tests added / updated</dt>
            <dd>{run.pr.tests.length}</dd>
          </div>
          <div className="metric">
            <dt>Human review remaining</dt>
            <dd>Required</dd>
          </div>
        </dl>
        <h3 className="pr__title">{run.pr.title}</h3>
        <p className="pr__why">{run.pr.why}</p>
        <ul className="pr__list">
          {run.pr.whatChanged.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
        <div className="pr__block">
          <h4>Tests added or updated</h4>
          <ul className="pr__list">
            {run.pr.tests.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </div>
        <div className="pr__block">
          <h4>Risk / rollback</h4>
          <p className="pr__text">{run.pr.riskAndRollback}</p>
        </div>
        <div className="pr__block">
          <h4>Human verification checklist</h4>
          <ul className="pr__list">
            {run.pr.humanVerification.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </div>
        <div className="pr__approval" role="status">
          Ready for human review. Requires human approval before merge — Ticketdroid never merges or deploys on its own.
        </div>
      </section>
    </section>
  );
}
