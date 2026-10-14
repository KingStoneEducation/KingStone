import { useState } from 'react';
import { store } from '../store';
import { useCore } from '../hooks';
import { Modal } from '../components';
import { formatClock, formatDate, toDate } from '../../core/calendar';
import type { JournalCat } from '../../core/state';

const CATS: { id: JournalCat | 'all' | 'important'; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'important', label: '重要' },
  { id: 'life', label: '生活' },
  { id: 'money', label: '财务' },
  { id: 'social', label: '人际' },
  { id: 'casino', label: '赌场' },
  { id: 'work', label: '工作' },
  { id: 'event', label: '事件' },
  { id: 'milestone', label: '里程碑' },
];

export function JournalPanel(): JSX.Element {
  const core = useCore();
  const [cat, setCat] = useState<(typeof CATS)[number]['id']>('all');
  const entries = core.state.journal.entries
    .filter((e) => cat === 'all' || (cat === 'important' ? e.important : e.cat === cat))
    .slice(-200)
    .reverse();
  let lastDay = -1;
  return (
    <Modal title="日志" wide onClose={() => store.closePanel()}>
      <div className="row wrap" style={{ marginBottom: 10 }}>
        {CATS.map((c) => (
          <button key={c.id} className={`small ${cat === c.id ? 'primary' : 'ghost'}`} onClick={() => setCat(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      {core.stories.summaries().length > 0 && (
        <div className="item" style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>进行中的故事</div>
          {core.stories.summaries().map((x) => (
            <div key={x.arc} style={{ fontSize: 12, lineHeight: 1.6 }}>
              <span style={{ color: 'var(--gold-light)' }}>【{x.title}】</span>
              {x.status}
              <span className="dim" style={{ fontSize: 12 }}> · 第 {x.days + 1} 天</span>
            </div>
          ))}
        </div>
      )}
      {entries.length === 0 && <div className="muted">还没有记录。</div>}
      {entries.map((e) => {
        const d = toDate(e.t);
        const head = d.dayIndex !== lastDay;
        lastDay = d.dayIndex;
        return (
          <div key={e.id}>
            {head && (
              <div className="dim" style={{ fontSize: 12, margin: '10px 0 4px', borderBottom: '1px solid var(--line-soft)' }}>
                {formatDate(d, true)}
              </div>
            )}
            <div className="row" style={{ alignItems: 'baseline', padding: '2px 0' }}>
              <span className="dim num" style={{ fontSize: 12, width: 40 }}>
                {formatClock(d.minuteOfDay)}
              </span>
              <span style={{ fontWeight: e.important ? 700 : 400, color: e.important ? 'var(--gold-light)' : undefined }}>{e.text}</span>
            </div>
          </div>
        );
      })}
    </Modal>
  );
}
