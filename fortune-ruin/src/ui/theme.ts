import type { GameCore } from '../core/GameCore';
import { FERRY_PIER, MARINA } from '../world/maps/cityLayout';

/**
 * The interface's look follows the place: red velvet and gold in the casino,
 * night blue and brass on its members' floor, cool marble at the bank, cream
 * and green in the café, dark wood in the bar, black and gold where the money
 * is, grey at the office, navy and white sailcloth on the marina's pontoon
 * and the ferry pier; the island's diner and guesthouse are the café's, its
 * resort the luxury black and gold.
 * Everywhere else it is the usual parchment.
 */
export function venueTheme(core: GameCore): string {
  const loc = core.state.world.location;
  if (loc === 'city') {
    // the marina's pontoon and the ferry pier south of it
    const { x, y } = core.state.world;
    return x >= MARINA.x0 - 1 && y >= MARINA.y0 - 1 && y <= FERRY_PIER.y1 + 1 ? 'theme-marina' : '';
  }
  if (loc === 'casino') return core.sky.upstairs() ? 'theme-sky' : 'theme-casino';
  if (loc === 'hotel') return 'theme-casino';
  switch (loc) {
    case 'bank':
    case 'finance_office':
      return 'theme-bank';
    case 'cafe':
    case 'restaurant':
    case 'community_kitchen':
    case 'isle_diner':
    case 'isle_guesthouse':
      return 'theme-cafe';
    case 'isle_resort':
      return 'theme-luxe';
    case 'bar':
    case 'pawn':
      return 'theme-bar';
    case 'club':
    case 'fine_dining':
    case 'luxury':
    case 'home_penthouse':
    case 'home_estate':
      return 'theme-luxe';
    case 'office':
      return 'theme-office';
    default:
      return '';
  }
}
