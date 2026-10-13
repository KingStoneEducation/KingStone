import type { GameCore } from '../core/GameCore';
import type { JournalCat, PhoneAction, PhoneMessage } from '../core/state';

export class PhoneSystem {
  constructor(private core: GameCore) {}

  private get p() {
    return this.core.state.phone;
  }

  send(from: string, fromName: string, body: string, actions?: PhoneAction[], ref?: string): PhoneMessage {
    const msg: PhoneMessage = { id: ++this.p.seq, t: this.core.now(), from, fromName, body, read: false, actions, ref };
    this.p.messages.push(msg);
    if (this.p.messages.length > 300) this.p.messages.splice(0, this.p.messages.length - 300);
    this.core.bus.emit('phone:message', { message: msg });
    this.core.touch();
    return msg;
  }

  hasRef(ref: string): boolean {
    return this.p.messages.some((m) => m.ref === ref);
  }

  unread(): number {
    return this.p.messages.filter((m) => !m.read).length;
  }

  markRead(id: number): void {
    const m = this.p.messages.find((x) => x.id === id);
    if (m && !m.read) {
      m.read = true;
      this.core.touch();
    }
  }

  markAllRead(): void {
    for (const m of this.p.messages) m.read = true;
    this.core.touch();
  }

  /** Player picks a reply action on a message. */
  respond(id: number, actionId: string): string {
    const m = this.p.messages.find((x) => x.id === id);
    if (!m || m.resolved) return '这条消息已经处理过了';
    const result = this.core.events.handleAction(actionId, m);
    if (result.resolve !== false) m.resolved = actionId;
    m.read = true;
    this.core.touch();
    return result.text;
  }

  threads(): { from: string; fromName: string; last: PhoneMessage; unread: number }[] {
    const map = new Map<string, { from: string; fromName: string; last: PhoneMessage; unread: number }>();
    for (const m of this.p.messages) {
      const cur = map.get(m.from);
      if (!cur) map.set(m.from, { from: m.from, fromName: m.fromName, last: m, unread: m.read ? 0 : 1 });
      else {
        cur.last = m;
        cur.fromName = m.fromName;
        if (!m.read) cur.unread += 1;
      }
    }
    return [...map.values()].sort((a, b) => b.last.t - a.last.t);
  }
}

export class JournalSystem {
  constructor(private core: GameCore) {}

  add(cat: JournalCat, text: string, important = false): void {
    const j = this.core.state.journal;
    const entry = { id: ++j.seq, t: this.core.now(), cat, text, important };
    j.entries.push(entry);
    if (j.entries.length > 800) {
      // keep important entries longer
      const drop = j.entries.findIndex((e) => !e.important);
      j.entries.splice(drop >= 0 ? drop : 0, 1);
    }
    if (important) {
      this.core.state.stats.lifeEvents.push({ t: entry.t, text });
      if (this.core.state.stats.lifeEvents.length > 300) this.core.state.stats.lifeEvents.shift();
    }
    this.core.bus.emit('journal', { entry });
    this.core.touch();
  }
}
