/** Read-only reports belong to a selected source and one output channel. */
export class ModelReports {
  constructor(context) {
    this.context = context;
    this.channels = new Map();
  }
  abortUnowned(tickets) {
    const retained = new Set(this.channels.values());
    for (const ticket of tickets) if (ticket && !retained.has(ticket)) ticket.controller.abort();
  }
  invalidate(channel) {
    const removed = channel === undefined ? new Set(this.channels.values()) : [this.channels.get(channel)];
    if (channel === undefined) this.channels.clear();
    else this.channels.delete(channel);
    // Revoke publication before cancellation can notify any listeners. A job
    // shared by analysis and validation remains useful while either owns it.
    this.abortUnowned(removed);
  }
  begin(channels, { getTarget = () => null } = {}) {
    const c = this.context,
      project = c.getProject(),
      document = c.getDocument(),
      state = c.getState(),
      model = state?.model;
    if (!model || !document) throw Error('Choose a model before checking geometry.');
    const controller = new AbortController();
    const ticket = {
      project,
      document,
      state,
      model,
      signature: JSON.stringify(model),
      getTarget,
      target: JSON.stringify(getTarget()),
      controller,
      signal: controller.signal,
    };
    const replaced = new Set(channels.map((channel) => this.channels.get(channel)));
    for (const channel of channels) this.channels.set(channel, ticket);
    this.abortUnowned(replaced);
    return ticket;
  }
  owns(ticket, channel) {
    return this.channels.get(channel) === ticket;
  }
  current(ticket, channel) {
    const c = this.context;
    return (
      this.owns(ticket, channel) &&
      c.getProject() === ticket.project &&
      c.getDocument() === ticket.document &&
      c.getState() === ticket.state &&
      ticket.state.model === ticket.model &&
      JSON.stringify(ticket.model) === ticket.signature &&
      JSON.stringify(ticket.getTarget()) === ticket.target
    );
  }
}
