import { useEffect, useState } from "react";
import { fetchTickets } from "./api";
import { Inbox } from "./Inbox";
import { TicketDetail } from "./TicketDetail";
import type { Ticket } from "./types";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; tickets: readonly Ticket[] };

type Route = { view: "inbox" } | { view: "detail"; id: string };

function parseHash(hash: string): Route {
  const match = hash.match(/^#\/tickets\/([^/]+)$/);
  if (match !== null) {
    return { view: "detail", id: decodeURIComponent(match[1]) };
  }
  return { view: "inbox" };
}

function useHashRoute(): Route {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = (): void => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return parseHash(hash);
}

export default function App() {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const route = useHashRoute();

  useEffect(() => {
    let cancelled = false;
    fetchTickets()
      .then((tickets) => {
        if (!cancelled) setLoad({ status: "ready", tickets });
      })
      .catch(() => {
        if (!cancelled) {
          setLoad({
            status: "error",
            message:
              "Could not reach the claims-api service. Start it with `pnpm dev` inside claims-api, then reload.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  let body;
  if (load.status === "loading") {
    body = <p className="notice">Loading signals…</p>;
  } else if (load.status === "error") {
    body = <p className="notice notice--error">{load.message}</p>;
  } else if (route.view === "detail") {
    const ticket = load.tickets.find((entry) => entry.id === route.id);
    body = ticket === undefined ? <TicketNotFound /> : <TicketDetail ticket={ticket} />;
  } else {
    body = <Inbox tickets={load.tickets} />;
  }

  return (
    <div className="app">
      <header className="app__header">
        <a className="brand" href="#/">
          <span className="brand__mark" aria-hidden="true" />
          Ticketdroid
        </a>
        <span className="brand__sub">Revenue cycle on-call inbox</span>
      </header>
      <main className="app__main">{body}</main>
      <footer className="app__footer">Synthetic demo data only — no real patients or claims.</footer>
    </div>
  );
}

function TicketNotFound() {
  return (
    <section className="empty">
      <h1 className="empty__title">Ticket not found</h1>
      <p className="empty__hint">No ticket exists with that id.</p>
      <a className="back-link" href="#/">
        ← Back to inbox
      </a>
    </section>
  );
}
