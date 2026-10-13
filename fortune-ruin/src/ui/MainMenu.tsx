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
              <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.8 }}>
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
                  '一座会自己运转的港口城市——灰港。你在这里工作、生活、交朋友，也可以走进灰港大赌场，在按公开规则运行的牌桌上试试手气。\n\n' +
                  '· 21 点、百家乐、欧式轮盘均按真实规则结算，不存在隐藏的胜率调整。\n' +
                  '· 财富会改变别人对你的看法，但每个人在意的东西不一样。\n' +
                  '· 赌博从来不是唯一的出路，也不是可靠的出路。\n\n' +
                  '操作：WASD / 方向键移动，Shift 奔跑，E / 空格 互动，鼠标点击可寻路。P 手机，F 资产，R 人际，M 地图，J 日志，I 物品，T 统计，Esc 菜单。',
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
