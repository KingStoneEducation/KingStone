import { store, type Panel } from './store';
import { useKey, useStore } from './hooks';
import { MainMenu } from './MainMenu';
import { CharacterCreate } from './CharacterCreate';
import { Hud, Toasts } from './Hud';
import { DialogueModal } from './modals/DialogueModal';
import { BusModal, CollapseModal, EventModal, EventResultModal, IntroModal, KitchenModal, ReadModal, ShiftModal, SleepModal, TextModal, WardrobeModal, WorkModal } from './modals/LifeModals';
import { ShopModal } from './modals/ShopModal';
import { AtmModal, BankModal, CashierModal } from './modals/MoneyModals';
import { CasinoMemberModal } from './modals/ComputerModal';
import { SavesModal, SettingsModal } from './modals/SystemModals';
import { PhonePanel } from './panels/PhonePanel';
import { FinancePanel } from './panels/FinancePanel';
import { SocialPanel } from './panels/SocialPanel';
import { MapPanel } from './panels/MapPanel';
import { JournalPanel } from './panels/JournalPanel';
import { InventoryPanel } from './panels/InventoryPanel';
import { StatsPanel } from './panels/StatsPanel';
import { HelpPanel, MenuPanel } from './panels/MenuPanel';
import { BusinessPanel } from './panels/BusinessPanel';
import { TableUI } from './table/TableUI';
import { ConciergeModal } from './modals/ConciergeModal';
import { Desktop } from './computer/Desktop';
import { CharityModal, FortuneModal, LaborModal, PawnModal } from './modals/OldTownModals';
import { AuctionModal } from './modals/AuctionModal';
import { CruiseModal, MarinaModal } from './modals/MarinaModal';
import { BeachModal, CrossingModal, FerryModal, FishingModal, LodgingModal } from './modals/IsleModals';
import { venueTheme } from './theme';

function ModalHost(): JSX.Element | null {
  const m = store.modal;
  if (!m) return null;
  switch (m.type) {
    case 'dialogue':
      return <DialogueModal view={m.view} />;
    case 'shop':
      return <ShopModal shopId={m.shopId} consume={!!m.consume} />;
    case 'cashier':
      return <CashierModal />;
    case 'atm':
      return <AtmModal where={m.where} />;
    case 'bank':
      return <BankModal tab={m.tab ?? 'account'} />;
    case 'sleep':
      return <SleepModal />;
    case 'kitchen':
      return <KitchenModal />;
    case 'wardrobe':
      return <WardrobeModal />;
    case 'computer':
      return <Desktop />;
    case 'housing':
      return <Desktop open="housing" />;
    case 'jobs':
      return <Desktop open="jobs" />;
    case 'work':
      return <WorkModal jobId={m.jobId} />;
    case 'shift':
      return <ShiftModal report={m.report} title={m.title} />;
    case 'bus':
      return <BusModal stop={m.stop} />;
    case 'read':
      return <ReadModal />;
    case 'text':
      return <TextModal title={m.title} text={m.text} tone={m.tone} />;
    case 'event':
      return <EventModal prompt={m.prompt} />;
    case 'eventResult':
      return <EventResultModal title={m.title} text={m.text} />;
    case 'casino_member':
      return <CasinoMemberModal />;
    case 'collapse':
      return <CollapseModal text={m.text} />;
    case 'intro':
      return <IntroModal />;
    case 'settings':
      return <SettingsModal />;
    case 'saves':
      return <SavesModal mode={m.mode} />;
    case 'concierge':
      return <ConciergeModal tab={m.tab} lobby={!!m.lobby} />;
    case 'pawn':
      return <PawnModal tab={m.tab} />;
    case 'charity':
      return <CharityModal tab={m.tab} />;
    case 'labor':
      return <LaborModal />;
    case 'fortune':
      return <FortuneModal />;
    case 'auction':
      return <AuctionModal tab={m.tab} lot={m.lot} />;
    case 'marina':
      return <MarinaModal tab={m.tab} />;
    case 'cruise':
      return <CruiseModal report={m.report} />;
    case 'ferry':
      return <FerryModal />;
    case 'crossing':
      return <CrossingModal report={m.report} />;
    case 'beach':
      return <BeachModal tab={m.tab} />;
    case 'fishing':
      return <FishingModal />;
    case 'lodging':
      return <LodgingModal place={m.place} />;
  }
}

/** The floor display inside the lift while the car moves. */
function LiftDisplay(): JSX.Element | null {
  const l = store.lift;
  if (!l) return null;
  return (
    <div className="lift-display">
      <div className="lift-panel">
        <span className="lift-arrow">{l.up ? '▲' : '▼'}</span>
        <span className="lift-floor">{l.floor}</span>
      </div>
    </div>
  );
}

function PanelHost(): JSX.Element | null {
  switch (store.panel) {
    case 'phone':
      return <PhonePanel />;
    case 'finance':
      return <FinancePanel />;
    case 'social':
      return <SocialPanel />;
    case 'map':
      return <MapPanel />;
    case 'journal':
      return <JournalPanel />;
    case 'inventory':
      return <InventoryPanel />;
    case 'stats':
      return <StatsPanel />;
    case 'help':
      return <HelpPanel />;
    case 'business':
      return <BusinessPanel />;
    case 'menu':
      return <MenuPanel />;
    default:
      return null;
  }
}

const PANEL_KEYS: Record<string, Exclude<Panel, null>> = {
  KeyP: 'phone',
  KeyF: 'finance',
  KeyR: 'social',
  KeyM: 'map',
  KeyJ: 'journal',
  KeyI: 'inventory',
  KeyT: 'stats',
  KeyH: 'help',
  KeyB: 'business',
};

function GameUI(): JSX.Element {
  useStore();
  useKey(
    (e) => {
      if (store.screen !== 'game') return;
      if (e.code === 'Escape') {
        if (store.modal) {
          if (store.modal.type !== 'collapse' && store.modal.type !== 'event') store.closeModal();
        } else if (store.panel) store.closePanel();
        else if (!store.table) store.openPanel('menu');
        e.preventDefault();
        return;
      }
      if (store.modal || store.table || store.fade) return;
      const p = PANEL_KEYS[e.code];
      if (p && !e.ctrlKey && !e.metaKey && !e.altKey) {
        store.openPanel(p);
        e.preventDefault();
      }
    },
    [],
  );
  if (!store.core) return <></>;
  return (
    <>
      <Hud />
      {store.table && <TableUI />}
      <PanelHost />
      <ModalHost />
      {store.fade && <div className="fade" style={{ opacity: 0 }} />}
      <LiftDisplay />
    </>
  );
}

export function App(): JSX.Element {
  useStore();
  if (store.screen === 'game' && store.core) {
    return (
      <div className={`ui-theme ${venueTheme(store.core)}`}>
        <GameUI />
        <Toasts />
      </div>
    );
  }
  return (
    <>
      {store.screen === 'menu' && <MainMenu />}
      {store.screen === 'create' && <CharacterCreate />}
      <ModalHost />
      <Toasts />
    </>
  );
}
