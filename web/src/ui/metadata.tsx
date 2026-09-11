import type { ReactNode } from "react";
import type { Ticket } from "../types";
import { formattedDate } from "../presenters";

export function SourceLabel({ source }: { source: Ticket["source"] }) {
  return (
    <span className={source === "pagerduty" ? "src-pagerduty" : "src-sentry"}>
      {source}
    </span>
  );
}

export function MetadataRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="meta-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function DetailMetadata({ ticket }: { ticket: Ticket }) {
  return (
    <dl className="meta-grid">
      <MetadataRow label="Ticket" value={ticket.id} />
      <MetadataRow label="Service" value={ticket.service} />
      <MetadataRow label="Source" value={<SourceLabel source={ticket.source} />} />
      <MetadataRow label="Opened" value={formattedDate(ticket.created_at)} />
    </dl>
  );
}
