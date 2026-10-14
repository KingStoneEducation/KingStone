import { store } from '../store';
import { useCore } from '../hooks';
import { Modal } from '../components';
import { quitToMenu, saveGame } from '../../game/session';

export function MenuPanel(): JSX.Element {
  const core = useCore();
  return (
    <Modal title="暂停" sub={`${core.state.player.name} · 游玩 ${(core.state.meta.playMs / 3600000).toFixed(1)} 小时`} onClose={() => store.closePanel()}>
      <div className="menu-buttons" style={{ width: '100%' }}>
        <button className="primary" onClick={() => store.closePanel()}>
          继续
        </button>
        <button
          onClick={() => {
            store.closePanel();
            store.openModal({ type: 'saves', mode: 'save' });
          }}
        >
          保存游戏
        </button>
        <button
          onClick={() => {
            store.closePanel();
            store.openModal({ type: 'saves', mode: 'load' });
          }}
        >
          读取存档
        </button>
        <button
          onClick={() => {
            store.closePanel();
            store.openModal({ type: 'settings' });
          }}
        >
          设置
        </button>
        <button onClick={() => store.openPanel('help')}>操作说明</button>
        <button
          className="danger"
          onClick={() => {
            const err = saveGame('auto', '退出前自动保存');
            if (err) store.toast(err, 'warn');
            quitToMenu();
          }}
        >
          保存并返回主菜单
        </button>
      </div>
    </Modal>
  );
}

export function HelpPanel(): JSX.Element {
  return (
    <Modal title="操作说明" wide onClose={() => store.closePanel()}>
      <div className="grid2">
        <div className="card">
          <h3>移动与互动</h3>
          <div style={{ fontSize: 12, lineHeight: 1.9 }}>
            <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd> / 方向键 移动，按住 <kbd>Shift</kbd> 奔跑
            <br />
            <kbd>E</kbd> / <kbd>空格</kbd> 与面前的人或物体互动
            <br />
            鼠标左键点击地面自动寻路；点击人物或物体会走过去互动
            <br />
            走进门口进入建筑，走到出口离开
          </div>
        </div>
        <div className="card">
          <h3>界面</h3>
          <div style={{ fontSize: 12, lineHeight: 1.9 }}>
            <kbd>P</kbd> 手机（消息、日程、联系人）
            <br />
            <kbd>F</kbd> 资产与财务　<kbd>R</kbd> 人际关系
            <br />
            <kbd>M</kbd> 地图与交通　<kbd>J</kbd> 日志
            <br />
            <kbd>I</kbd> 物品　<kbd>T</kbd> 个人统计　<kbd>Esc</kbd> 菜单 / 关闭
          </div>
        </div>
        <div className="card">
          <h3>生活</h3>
          <div style={{ fontSize: 12 }}>
            按时上班领工资。房租水电月初自动扣款，可以在网上银行关掉。饿了吃饭，困了回家睡觉；体力或睡眠耗尽会晕倒。
          </div>
        </div>
        <div className="card">
          <h3>赌场</h3>
          <div style={{ fontSize: 12 }}>
            在兑换台把现金换成筹码，走到赌桌前按 <kbd>E</kbd> 入座。每张桌子的规则写在桌上，也能在赌桌左上角查看；结果只取决于洗牌和随机数。
          </div>
        </div>
      </div>
    </Modal>
  );
}
