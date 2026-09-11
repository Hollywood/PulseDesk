/** Semantics: SEV-1/SEV-2 are the pages; 3/4 are lower urgency. */
const SEVERITY_TONES: Record<string, string> = {
  "SEV-1": "sev-critical",
  "SEV-2": "sev-high",
  "SEV-3": "sev-medium",
  "SEV-4": "sev-low",
};

const STATUS_TONES: Record<string, string> = {
  triggered: "ok-triggered",
  acknowledged: "warn-acknowledged",
  resolved: "green-resolved",
};

export function severityTone(severity: string): string {
  return SEVERITY_TONES[severity] ?? "sev-medium";
}

export function statusTone(status: string): string {
  return STATUS_TONES[status] ?? "neutral";
}

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={`badge ${severityTone(severity)}`} data-testid="severity">
      {severity}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${statusTone(status)}`} data-testid="status">
      {status}
    </span>
  );
}
