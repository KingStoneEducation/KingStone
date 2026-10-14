import { describe, expect, it } from 'vitest';
import { PAIR_LOG_MAX } from '../src/systems/EncounterSystem';
import { momentText, tieBand, tieKey } from '../src/systems/SocialSystem';
import { CITY_SPOTS } from '../src/world/maps/cityLayout';
import { newCore } from './helpers';

function know(core: ReturnType<typeof newCore>, ...ids: string[]): void {
  for (const id of ids) {
    const r = core.social.rel(id);
    r.met = true;
    r.knowsName = true;
  }
}

describe('what the player sees between other people', () => {
  it('a conversation in the room where you are is remembered; one somewhere else is not', () => {
    const c = newCore();
    c.state.world.location = 'bar';
    c.encounters.start('marco', 'tommy', 'bar', c.now(), 'toast');
    c.encounters.start('daniel', 'eileen', 'cafe', c.now(), 'chat');
    const seen = c.state.social.seenPairs!;
    expect(seen[tieKey('marco', 'tommy')]).toMatchObject({ kind: 'toast', location: 'bar', times: 1 });
    expect(seen[tieKey('daniel', 'eileen')]).toBeUndefined();
    expect(c.state.social.pairLog!.map((m) => m.kind)).toEqual(['toast']);
    c.encounters.start('tommy', 'marco', 'bar', c.now() + 60, 'chat');
    expect(seen[tieKey('marco', 'tommy')]).toMatchObject({ kind: 'chat', times: 2 });
  });

  it('outdoors only within sight', () => {
    const c = newCore();
    const spot = 'park_bench1';
    const p = CITY_SPOTS[spot];
    c.state.world.location = 'city';
    c.state.npcs.daniel.spot = spot;
    c.state.world.x = p.x + 3;
    c.state.world.y = p.y + 2;
    c.encounters.start('daniel', 'tommy', 'city', c.now(), 'chat');
    expect(c.state.social.seenPairs![tieKey('daniel', 'tommy')]).toBeDefined();
    c.state.npcs.eileen.spot = spot;
    c.state.npcs.oldzhou.spot = spot;
    c.state.world.x = p.x + 40;
    c.encounters.start('eileen', 'oldzhou', 'city', c.now(), 'chat');
    expect(c.state.social.seenPairs![tieKey('eileen', 'oldzhou')]).toBeUndefined();
  });

  it('the web shows only pairs you have seen, among people whose names you know, as close as they looked then', () => {
    const c = newCore();
    c.state.world.location = 'bar';
    know(c, 'marco', 'tommy');
    // (a new game already knows Eileen, Daniel, Margaret, Raymond and Kiki; not Isabella)
    expect(c.state.social.rel.isabella?.knowsName).toBeFalsy();
    c.encounters.start('marco', 'tommy', 'bar', c.now(), 'chat');
    c.encounters.start('isabella', 'tommy', 'bar', c.now(), 'chat');
    let web = c.social.knownWeb();
    expect(web.edges.map((e) => tieKey(e.a, e.b))).toEqual([tieKey('marco', 'tommy')]);
    expect(web.nodes.sort()).toEqual(['marco', 'tommy']);
    const then = web.edges[0].tie;
    expect(then).toBe(c.social.tie('marco', 'tommy'));
    // what happens between them out of your sight does not change what you saw
    c.social.adjustTie('marco', 'tommy', 30);
    expect(c.social.knownWeb().edges[0].tie).toBe(then);
    // learn Isabella's name and her pair appears
    know(c, 'isabella');
    web = c.social.knownWeb();
    expect(web.edges.length).toBe(2);
    expect(web.nodes).toContain('isabella');
  });

  it('an argument between people who were never close shows as a falling-out', () => {
    expect(tieBand(70)).toBe('close');
    expect(tieBand(40)).toBe('friendly');
    expect(tieBand(20)).toBe('acquainted');
    expect(tieBand(8)).toBe('strained');
    expect(tieBand(20, 'argue')).toBe('strained');
    expect(tieBand(50, 'argue')).toBe('friendly');
    const c = newCore();
    c.state.world.location = 'bar';
    know(c, 'marco', 'natasha');
    c.encounters.start('marco', 'natasha', 'bar', c.now(), 'argue');
    expect(c.social.knownWeb().edges[0].band).toBe('strained');
  });

  it('remembers the last few dozen moments, and says each one plainly', () => {
    const c = newCore();
    c.state.world.location = 'bar';
    for (let i = 0; i < PAIR_LOG_MAX + 15; i++) c.encounters.start('marco', 'tommy', 'bar', c.now() + i * 60, 'chat');
    expect(c.state.social.pairLog!.length).toBe(PAIR_LOG_MAX);
    const name = (id: string) => ({ marco: '马可', tommy: '汤米' })[id] ?? id;
    expect(momentText({ a: 'marco', b: 'tommy', kind: 'argue' }, name)).toBe('马可和汤米吵了一架');
    expect(momentText({ a: 'marco', b: 'tommy', kind: 'comfort' }, name)).toBe('马可在安慰汤米');
    expect(momentText({ a: 'marco', b: 'tommy', kind: 'toast' }, name)).toBe('马可和汤米碰了杯');
  });

  it('old saves start with nothing seen', async () => {
    const { migrate } = await import('../src/systems/SaveManager');
    const c = newCore();
    const st = JSON.parse(JSON.stringify(c.state));
    delete st.social.seenPairs;
    delete st.social.pairLog;
    const m = migrate(st);
    expect(m.social.seenPairs).toEqual({});
    expect(m.social.pairLog).toEqual([]);
  });
});
