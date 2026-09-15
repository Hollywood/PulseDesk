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

interface TimelineDetailLine {
  label?: string;
  value: string;
}

function fallbackTimelineDetail(detail: string): TimelineDetailLine[] {
  return detail.split(/\r?\n/).map((value) => ({ label: "Evidence", value }));
}

function timelineDetailLines(step: RunStep): TimelineDetailLine[] {
  if (step.id === "intake") {
    const match =
      /^Read the ticket fixture: (\S+) \(([^,]+),\s*([^,]+),\s*service\s+([^)]+)\) — (.+?)\. (.+)$/.exec(step.detail);
    if (match !== null) {
      const [, ticket, source, severity, service, title, summary] = match;
      return [
        { label: "Ticket", value: ticket },
        { label: "Source", value: source },
        { label: "Severity", value: severity },
        { label: "Service", value: service },
        { label: "Title", value: title },
        { label: "Summary", value: summary },
      ];
    }
  }

  if (step.id === "code_search") {
    const match =
      /^Scanned claims-api\/src: found (.+)\. The production binding in (.+) is ACTIVE_STRATEGY = ([^;]+); idempotency (.+)\. The planted regression lives in (.+)\.$/.exec(
        step.detail,
      );
    if (match !== null) {
      const [, files, bindingPath, binding, idempotency, regression] = match;
      return [
        ...files.split(", ").map((file) => ({ label: "File", value: file })),
        { label: "Production binding", value: `${bindingPath}: ACTIVE_STRATEGY = ${binding}` },
        { label: "Idempotency", value: idempotency },
        { label: "Regression", value: regression },
      ];
    }
  }

  if (step.id === "hypothesis") {
    const match =
      /^Baseline suite certified ([^:]+): (.+?)\.\s+Hypothesis: (.+?); the fix is (.+)\.$/.exec(step.detail);
    if (match !== null) {
      const [, certification, failure, hypothesis, fix] = match;
      return [
        { label: "Baseline", value: certification },
        { label: "Failure", value: failure },
        { label: "Hypothesis", value: hypothesis },
        { label: "Fix", value: fix },
      ];
    }
  }

  if (step.id === "patch") {
    const match =
      /^Applied the real fix: (.+) \((\d+ added, \d+ removed lines)\)\. Suite certified ([^:]+): (.+)\.$/.exec(
        step.detail,
      );
    if (match !== null) {
      const [, change, diff, certification, tests] = match;
      return [
        { label: "Change", value: change },
        { label: "Diff", value: diff },
        { label: "Tests", value: `${certification}: ${tests}` },
      ];
    }
  }

  return fallbackTimelineDetail(step.detail);
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
        <div className="timeline__detail">
          {timelineDetailLines(step).map((line, lineIndex) => (
            <div
              key={`${line.label ?? "detail"}-${lineIndex}`}
              className={`timeline__line${line.label === undefined ? " timeline__line--plain" : ""}`}
            >
              {line.label !== undefined && <span className="timeline__label">{line.label}</span>}
              <span className="timeline__value">{line.value}</span>
            </div>
          ))}
        </div>
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
        <hr className="diff__separator" />
      </section>

      <section className="detail__section pr">
        <div className="pr__heading">
          <h2>Pull Request</h2>
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
        <div className="pr__field">
          <h3 className="pr__field-label">Title</h3>
          <p className="pr__title">{run.pr.title}</p>
        </div>
        <div className="pr__field">
          <h3 className="pr__field-label">Body</h3>
          <p className="pr__why">{run.pr.why}</p>
          <div className="pr__block">
            <h4>What changed</h4>
            <ul className="pr__list">
              {run.pr.whatChanged.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          </div>
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
        </div>
        <div className="pr__approval" role="status">
          Ready for human review. Requires human approval before merge — Ticketdroid never merges or deploys on its own.
        </div>
      </section>

      <section className="detail__section ci">
        <h2>Recommended CI tests</h2>
        <ul className="ci__list">
          <li className="ci__item">
            <strong>Run</strong>
            <code>pnpm --dir claims-api test</code>
            <span>Exercise the duplicate-claim regression and the full claims-api suite after the patch.</span>
          </li>
          <li className="ci__item">
            <strong>Run</strong>
            <code>pnpm --dir claims-api run typecheck</code>
            <span>Catch type errors in the patched service before merge.</span>
          </li>
          <li className="ci__item">
            <strong>Run</strong>
            <code>pnpm --dir web test</code>
            <span>Verify the timeline, diff, Pull Request, and CI recommendation views.</span>
          </li>
          <li className="ci__item">
            <strong>Run</strong>
            <code>pnpm --dir web run build</code>
            <span>Confirm the web app still compiles as a production bundle.</span>
          </li>
          <li className="ci__item">
            <strong>Create</strong>
            <span>Add a cross-app smoke test that resets the demo, runs TICKET-1042, and verifies the patched result reaches the Pull Request view.</span>
          </li>
        </ul>
      </section>
    </section>
  );
}
