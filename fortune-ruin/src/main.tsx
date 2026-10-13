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
import { LOCATIONS } from './data/locations';
import { daylight } from './core/calendar';
import './ui/styles.css';

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

/** Music and ambience follow the screen, location and time of day. */
function updateSoundscape(): void {
  const s = store.settings;
  audio.applyVolumes({ music: s.musicVolume, sfx: s.sfxVolume, ambience: s.ambienceVolume });
  const core = store.core;
  if (store.screen !== 'game' || !core) {
    audio.setMusic(store.screen === 'boot' ? null : 'menu');
    audio.setAmbience('city', true);
    return;
  }
  const loc = core.state.world.location;
  const def = LOCATIONS[loc];
  const night = daylight(core.now()) < 0.35;
  audio.setAmbience(def?.ambience ?? 'quiet', night);
  if (loc === 'casino') audio.setMusic('casino');
  else if (def?.ambience === 'home') audio.setMusic('home');
  else if (def?.ambience === 'bar' || def?.ambience === 'club' || def?.ambience === 'restaurant') audio.setMusic('lounge');
  else if (loc === 'city') audio.setMusic(night ? 'night' : 'day');
  else audio.setMusic(null);
}

// browsers only allow audio after a user gesture
const unlock = () => audio.unlock();
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);
// soft click on UI buttons
document.addEventListener('click', (e) => {
  if ((e.target as HTMLElement)?.closest?.('button')) sfx('click');
});

createRoot(document.getElementById('ui-root')!).render(<App />);

// handy for debugging and automated play-tests
(window as unknown as Record<string, unknown>).__fr = { game, store };
