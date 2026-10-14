import type { GameCore } from '../core/GameCore';

/**
 * The interface's look follows the place: red velvet and gold in the casino,
 * night blue and brass on its members' floor, cool marble at the bank, cream
 * and green in the café, dark wood in the bar, black and gold where the money
 * is, grey at the office. Everywhere else it is the usual parchment.
 */
export function venueTheme(core: GameCore): string {
  const loc = core.state.world.location;
  if (loc === 'casino') return core.sky.upstairs() ? 'theme-sky' : 'theme-casino';
  if (loc === 'hotel') return 'theme-casino';
  switch (loc) {
    case 'bank':
    case 'finance_office':
      return 'theme-bank';
    case 'cafe':
    case 'restaurant':
    case 'community_kitchen':
      return 'theme-cafe';
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
