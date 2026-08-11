"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createDeckAction } from "@/app/decks/actions";
import type { ClientOption } from "@/lib/data/decks";

export default function CreateDeckForm({ clients }: { clients: ClientOption[] }) {
  const [state, action, pending] = useActionState(createDeckAction, null);

  return (
    <form action={action} className="form-card">
      <div className="field">
        <label htmlFor="title">Deck title</label>
        <input id="title" name="title" required autoFocus placeholder="2026 Partnership Proposal" />
      </div>

      <fieldset>
        <legend>Client</legend>
        <div className="field">
          <label htmlFor="clientId">Choose an existing client</label>
          <select id="clientId" name="clientId" defaultValue="">
            <option value="">Select a client</option>
            {clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}
          </select>
        </div>
        <p className="form-divider"><span>or</span></p>
        <div className="field">
          <label htmlFor="newClientName">Create a new client</label>
          <input id="newClientName" name="newClientName" placeholder="Client name" />
          <small>Leave this blank when choosing an existing client.</small>
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="eventName">Event name <span>(optional)</span></label>
        <input id="eventName" name="eventName" placeholder="Catalina Nights" />
        <small>A new reusable event will be added to this client.</small>
      </div>

      <fieldset>
        <legend>Default slide theme</legend>
        <div className="radio-row">
          <label><input type="radio" name="themeDefault" value="light" defaultChecked /> Light</label>
          <label><input type="radio" name="themeDefault" value="dark" /> Dark</label>
        </div>
      </fieldset>

      {state?.error && <p className="form-error" role="alert">{state.error}</p>}

      <div className="form-actions">
        <Link className="button button-secondary" href="/decks">Cancel</Link>
        <button className="button button-primary" type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create deck"}
        </button>
      </div>
    </form>
  );
}
