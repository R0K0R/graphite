const WORDS = [
  // nature
  'rain','snow','wind','cloud','storm','frost','mist','dusk','dawn','moon',
  'star','sun','tide','wave','reef','cliff','cave','stone','sand','dust',
  'ember','flame','spark','smoke','ash','ice','hail','sleet','fog','gloom',
  // animals
  'fox','owl','crow','bear','wolf','deer','hawk','frog','crab','duck',
  'goat','hare','lion','mole','moth','seal','swan','toad','wasp','wren',
  'elk','lynx','mink','puma','ram','bat','bee','eel','jay','newt',
  'bison','cobra','crane','dingo','finch','gecko','heron','hyena','iguana','jackal',
  'koala','lemur','llama','moose','okapi','otter','panda','quail','raven','shrew',
  'skunk','sloth','snail','stoat','tapir','viper','vole','weasel','zebra','bison',
  // food / plants
  'plum','pear','lime','fig','mint','melon','grape','mango','peach','prune',
  'jam','rice','oat','rye','corn','bean','pea','kelp','moss','fern',
  'basil','clove','cumin','dill','thyme','cacao','maple','cedar','birch','elder',
  // objects
  'lamp','bell','drum','horn','harp','rope','hook','nail','bolt','lock',
  'lens','dial','knob','wire','coil','pipe','gear','cog','axe','anvil',
  'flask','lathe','forge','anvil','chisel','clamp','mallet','rivet','wedge','prism',
  // places / landforms
  'lake','pond','glen','vale','hill','ridge','cove','bay','moor','fen',
  'isle','cape','bluff','dell','grove','ford','marsh','peak','dune','fjord',
  // colors used as nouns
  'jade','rose','gold','amber','coal','ivory','rust','indigo','ochre','scarlet',
  // short vivid nouns
  'drift','glow','hum','pulse','vault','glide','flare','surge','bloom','crest',
  'shale','flint','cobalt','quartz','chalk','basalt','slate','obsidian','pumice','garnet',
  'bridge','cabin','tower','harbor','cellar','turret','lantern','beacon','anchor','rudder',
];

// deduplicate in case of copy-paste accidents
const WORDLIST = [...new Set(WORDS)];

export function generateRoomCode() {
  const pick = () => WORDLIST[Math.floor(Math.random() * WORDLIST.length)];
  return `${pick()}-${pick()}-${pick()}-${pick()}`;
}

// Deterministic 4-word code from a path string (djb2 hash, no async needed).
export function roomCodeForPath(path) {
  let h = 5381;
  for (let i = 0; i < path.length; i++) h = ((h << 5) + h + path.charCodeAt(i)) >>> 0;
  const n = WORDLIST.length;
  const w = (seed) => { const s = (seed * 1664525 + 1013904223) >>> 0; return WORDLIST[s % n]; };
  return `${w(h)}-${w(h^0xdeadbeef)}-${w(h^0xcafe1234)}-${w(h^0xf00dbabe)}`;
}
