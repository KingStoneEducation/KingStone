import { useMemo } from 'react';
import { store } from './store';
import { useStore } from './hooks';
import { loadGame, saves } from '../game/session';

export function MainMenu(): JSX.Element {
  useStore();
  const list = useMemo(() => saves.list(), [store.modal]);
  const latest = list
    .filter((s): s is NonNullable<typeof s> => !!s)
    .sort((a, b) => b.savedReal - a.savedReal)[0];
  return (
    <div className="menu-screen">
      <div>
        <div className="title-block">
          <h1>夜色筹码</h1>
          <div className="en">FORTUNE &amp; RUIN</div>
        </div>
        <div className="menu-buttons">
          {latest && (
            <button
              className="primary"
              onClick={() => {
                const err = loadGame(latest.slot);
                if (err) store.openModal({ type: 'text', title: '无法继续', text: err, tone: 'bad' });
              }}
            >
              继续游戏
              <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.8 }}>
                {latest.name} · {latest.gameTime} · 净资产 {latest.netWorth}
              </div>
            </button>
          )}
          <button
            className={latest ? '' : 'primary'}
            onClick={() => {
              store.screen = 'create';
              store.notify();
            }}
          >
            新的人生
          </button>
          <button onClick={() => store.openModal({ type: 'saves', mode: 'load' })}>读取存档</button>
          <button onClick={() => store.openModal({ type: 'settings' })}>设置</button>
          <button
            onClick={() =>
              store.openModal({
                type: 'text',
                title: '关于《夜色筹码》',
                text:
                  '灰港是一座港口城市。你有一份普通的工作、一间出租公寓和几个朋友；城北的灰港大赌场二十四小时营业。\n\n' +
                  '赌桌按公开的规则发牌和转盘，结果只取决于洗牌和随机数，会员等级不改变概率。\n\n' +
                  '操作：WASD 或方向键移动，按住 Shift 奔跑，E 或空格互动，鼠标点地面寻路。\n' +
                  'P 手机　F 资产　R 人际　M 地图　J 日志　I 物品　T 统计　Esc 菜单',
              })
            }
          >
            关于与操作
          </button>
        </div>
        <div className="disclaimer">
          本作中所有赌注、筹码与财富均为纯虚拟游戏货币，不提供任何真钱投注、充值、兑换或提现。游戏内容不构成任何投资或博彩建议。
        </div>
      </div>
    </div>
  );
}
