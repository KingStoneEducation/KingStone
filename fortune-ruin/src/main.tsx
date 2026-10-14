import Phaser from 'phaser';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { store } from './ui/store';
import { BootScene } from './world/BootScene';
import { WorldScene } from './world/WorldScene';
import { BlackjackScene } from './tables/BlackjackScene';
import { BaccaratScene } from './tables/BaccaratScene';
import { RouletteScene } from './tables/RouletteScene';
import { PokerScene } from './tables/PokerScene';
import { setGame } from './game/session';
import { audio, sfx } from './audio/Audio';
import { ambienceFor, musicFor, type SoundContext } from './audio/soundscape';
import { LOCATIONS } from './data/locations';
import { TABLE_BY_ID } from './casino/tables';
import { daylight, toDate } from './core/calendar';
import './ui/styles.css';
import { applyUiScale } from './ui/uiScale';

// canvas text does not re-render when a web font arrives later: load the pixel font before any scene draws text
await Promise.race([document.fonts.load('12px "Fusion Pixel"'), new Promise((r) => setTimeout(r, 2500))]);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-root',
  backgroundColor: '#0b0912',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  scene: [BootScene, WorldScene, BlackjackScene, BaccaratScene, RouletteScene, PokerScene],
  input: { mouse: { preventDefaultWheel: false } },
  disableContextMenu: true,
  fps: { target: 60 },
  render: { antialias: false, powerPreference: 'high-performance' },
});
setGame(game);

let lastMinute = -1;
let lastAudioCheck = 0;
game.events.on(Phaser.Core.Events.STEP, (time: number, delta: number) => {
  const core = store.core;
  if (core && store.screen === 'game') {
    core.update(delta);
    if (core.now() !== lastMinute) {
      lastMinute = core.now();
      core.touch();
    }
  }
  store.pollCore();
  if (time - lastAudioCheck > 500) {
    lastAudioCheck = time;
    updateSoundscape();
  }
});

/** Music and ambience follow the screen, the place, the casino room, the table and the time of day. */
function updateSoundscape(): void {
  const s = store.settings;
  audio.applyVolumes({ music: s.musicVolume, sfx: s.sfxVolume, ambience: s.ambienceVolume });
  const core = store.core;
  const inGame = store.screen === 'game' && !!core;
  const loc = inGame ? core!.state.world.location : null;
  const table = store.table ? TABLE_BY_ID[store.table.tableId] : null;
  const ctx: SoundContext = {
    screen: inGame ? 'game' : store.screen === 'game' ? 'menu' : store.screen,
    location: loc,
    ambience: loc ? (LOCATIONS[loc]?.ambience ?? null) : null,
    hour: inGame ? toDate(core!.now()).hour : 21,
    night: inGame ? daylight(core!.now()) < 0.35 : true,
    casinoArea: inGame ? (store.world?.casinoArea() ?? null) : null,
    table: table ? { game: table.game, area: table.area } : null,
  };
  audio.setMusic(musicFor(ctx));
  audio.setAmbience(ambienceFor(ctx));
}

// browsers only allow audio after a user gesture
const unlock = () => audio.unlock();
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);
// soft click on UI buttons
document.addEventListener('click', (e) => {
  if ((e.target as HTMLElement)?.closest?.('button')) sfx('click');
});

const uiRoot = document.getElementById('ui-root')!;
applyUiScale(uiRoot);
window.addEventListener('resize', () => applyUiScale(uiRoot));
createRoot(uiRoot).render(<App />);

// handy for debugging and automated play-tests
(window as unknown as Record<string, unknown>).__fr = { game, store, audio };
