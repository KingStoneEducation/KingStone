import { useMemo } from 'react';
import { store, type Panel } from '../store';
import { useCore, useKey } from '../hooks';
import { Bust, BACKDROPS } from '../Bust';
import type { DialogueView } from '../../systems/DialogueEngine';
import { NPC_BY_ID } from '../../data/npcs';
import { faceFor } from '../../data/faces';
import { LOCATIONS } from '../../data/locations';
import { toDate } from '../../core/calendar';

const DIM_NAMES: [keyof import('../../core/state').RelDims, string][] = [
  ['affection', '好感'],
  ['trust', '信任'],
  ['respect', '尊重'],
  ['familiarity', '熟悉'],
];

export function DialogueModal(props: { view: DialogueView }): JSX.Element {
  const core = useCore();
  const v = props.view;
  const def = NPC_BY_ID[v.npcId];
  const rel = core.social.rel(v.npcId);
  const face = useMemo(() => (def ? faceFor(def.id, def.look) : null), [def]);
  const amb = LOCATIONS[core.state.world.location]?.ambience ?? 'city';
  const hour = toDate(core.now()).hour;
  const bg = amb === 'city' && (hour >= 19 || hour < 6) ? '#3a4466' : BACKDROPS[amb];
  const choose = (id: string) => {
    const next = core.dialogue.choose(id);
    if (next.ended) {
      store.closeModal();
      if (next.openPanel) store.openPanel(next.openPanel as Panel);
      if (next.lines.length) store.toast(`${next.name}：${next.lines[next.lines.length - 1]}`, 'info');
      return;
    }
    store.replaceModal({ type: 'dialogue', view: next });
  };
  useKey(
    (e) => {
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= v.options.length) {
        const o = v.options[n - 1];
        if (!o.disabled) choose(o.id);
      }
    },
    [v],
  );
  return (
    <div className="backdrop" style={{ background: 'rgba(5,3,10,0.25)', alignItems: 'flex-end' }}>
      <div className="dialogue">
        <div className="portrait">{def && face && <Bust look={def.look} face={face} expr={v.mood} scale={2} bg={bg} talkKey={v.lines.join('|')} />}</div>
        <div>
          <div className="dlg-name">
            <span className="n">{v.name}</span>
            <span className="s">{v.subtitle}</span>
          </div>
          <div className="rel-mini">
            <span>{core.social.statusName(rel.status)}</span>
            {DIM_NAMES.map(([k, l]) => (
              <span key={k}>
                {l} {Math.round(rel[k])}
              </span>
            ))}
          </div>
          <div className="dlg-lines">
            {v.lines.map((l, i) => (
              <p key={i} className={l.startsWith('（') ? 'aside' : ''}>
                {l}
              </p>
            ))}
          </div>
          <div className="dlg-options">
            {v.options.map((o, i) => (
              <button key={o.id} className={`small ${o.tone ?? ''}`} disabled={!!o.disabled} title={o.disabled} onClick={() => choose(o.id)}>
                <span className="dim" style={{ marginRight: 4 }}>
                  {i + 1}
                </span>
                {o.label}
                {o.disabled && <span className="dim"> （{o.disabled}）</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
