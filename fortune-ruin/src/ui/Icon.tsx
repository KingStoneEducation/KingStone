/**
 * Small pixel icons (10 × 10), drawn as crisp SVG so they scale with the
 * interface like the pixel font. Used instead of emoji, which render in each
 * platform's own colour style and clash with the pixel look.
 */

const INK = '#3b2516';

const COLORS: Record<string, string> = {
  k: INK,
  r: '#c4553a',
  R: '#8a2f1f',
  w: '#fbefd2',
  y: '#e8b44c',
  b: '#4f7fbf',
  g: '#6f9a52',
  s: '#b8915a',
  c: '#d6dde4',
  G: '#8f99a6',
};

const ICONS: Record<string, string[]> = {
  pin: ['...kkkk...', '..krrrrk..', '.krrwwrrk.', '.krrwwrrk.', '.krrrrrrk.', '..krrrrk..', '..krrrrk..', '...krrk...', '....kk....', '..........'],
  home: ['....kk....', '...krrk...', '..krrrrk..', '.krrrrrrk.', 'kkkkkkkkkk', '.kwwwwwwk.', '.kwkkwwbk.', '.kwkskwwk.', '.kwkskwwk.', '.kkkkkkkk.'],
  bus: ['.kkkkkkkk.', '.kbbbbbbk.', '.kbwwwwbk.', '.kbbbbbbk.', '.kkkkkkkk.', '....kk....', '....kk....', '....kk....', '...kkkk...', '..........'],
  car: ['..........', '...kkkkk..', '..kbwkwbk.', '.kbbbbbbbk', 'krrrrrrrrk', 'krwrrrrwrk', 'kkkkkkkkkk', '.kk....kk.', '.kk....kk.', '..........'],
  clock: ['..kkkkkk..', '.kwwwwwwk.', 'kwwwkwwwwk', 'kwwwkwwwwk', 'kwwwkkkwwk', 'kwwwwwwwwk', 'kwwwwwwwwk', '.kwwwwwwk.', '..kkkkkk..', '..........'],
  calendar: ['.k..kk..k.', 'kkkkkkkkkk', 'krrrrrrrrk', 'kkkkkkkkkk', 'kwwwwwwwwk', 'kwkwkwkwwk', 'kwwwwwwwwk', 'kwkwkwwwwk', 'kkkkkkkkkk', '..........'],
  coin: ['..kkkkkk..', '.kyyyyyyk.', 'kyywyyyyyk', 'kywyykyyyk', 'kyyykkyyyk', 'kyyyykyyyk', 'kyyykkkyyk', '.kyyyyyyk.', '..kkkkkk..', '..........'],
  // the weather
  sun: ['....yy....', '.y......y.', '...kkkk...', '..kyyyyk..', 'y.kywyyk.y', 'y.kyyyyk.y', '..kyyyyk..', '...kkkk...', '.y......y.', '....yy....'],
  moon: ['.....kkk..', '....kyyyk.', '...kyykk..', '...kyk....', '..kyyk....', '..kyyk....', '...kyk....', '...kyykk..', '....kyyyk.', '.....kkk..'],
  cloud: ['..........', '..........', '...kkk....', '..kccck...', '.kccccccck.', 'kcccccccck', 'kccccccGck', '.kkkkkkkk.', '..........', '..........'],
  rain: ['...kkk....', '..kccck...', '.kcccccck.', 'kccccccGck', '.kkkkkkkk.', '..........', '.b...b..b.', 'b...b..b..', '..........', '..b...b...'],
  storm: ['...kkk....', '..kGGGk...', '.kGGGGGkk.', 'kGGGGGGGGk', '.kkkkykkk.', '....yy....', '...yy.....', '..yyyyy...', '....yy....', '...y......'],
  fog: ['..........', '.GGGGGG...', '..........', '...GGGGGGG', '..........', 'GGGGGGG...', '..........', '..GGGGGGG.', '..........', '..........'],
};

export type IconName = keyof typeof ICONS;

export function Icon(props: { name: IconName; size?: number; title?: string }): JSX.Element {
  const rows = ICONS[props.name];
  const rects: JSX.Element[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = COLORS[row[x]];
      if (c) rects.push(<rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={c} />);
    }
  });
  const size = props.size ?? 10;
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 10 10" shapeRendering="crispEdges" aria-hidden={props.title ? undefined : true}>
      {props.title && <title>{props.title}</title>}
      {rects}
    </svg>
  );
}
