import type { Ticket } from "./types";
import { inboxOrder, formattedDate } from "./presenters";
import { SeverityBadge, StatusBadge } from "./ui/badges";
import { SourceLabel } from "./ui/metadata";

export function Inbox({ tickets }: { tickets: readonly Ticket[] }) {
  const rows = [...tickets].sort(inboxOrder);
  return (
    <section className="inbox" aria-label="Ticket inbox">
      <div className="inbox__head">
        <h1>Inbox</h1>
        <span className="inbox__count">{rows.length} signals</span>
      </div>
      <ul className="ticket-list">
        {rows.map((ticket) => (
          <li key={ticket.id}>
            <a className="ticket-row" href={`#/tickets/${ticket.id}`}>
              <div className="ticket-row__main">
                <span className="ticket-id">{ticket.id}</span>
                <span className="ticket-title">{ticket.title}</span>
                <span className="ticket-summary">{ticket.summary}</span>
              </div>
              <div className="ticket-row__side">
                <span className="ticket-meta">
                  <SeverityBadge severity={ticket.severity} />
                  <StatusBadge status={ticket.status} />
                  <SourceLabel source={ticket.source} />
                </span>
                <span className="ticket-subline">
                  <span className="ticket-service">{ticket.service}</span>
                  <span className="ticket-date">{formattedDate(ticket.created_at)}</span>
                </span>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
