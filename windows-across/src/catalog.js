// 8-floor, 24-apartment (72-window) urban residential roster & 100+ procedural behaviors catalog.
// Zero external assets — designed for calm, believable distant observation with rare dramatic peaks.

export const ROOM_TYPES = {
  kitchen:  { wall: '#3e352c', floor: '#261f1a', spots: { stove: 0.22, counter: 0.50, fridge: 0.80, center: 0.50, door: 0.12 } },
  living:   { wall: '#36323b', floor: '#221e26', spots: { couch: 0.34, tv: 0.82, window: 0.56, center: 0.48, table: 0.50, door: 0.14 } },
  bedroom:  { wall: '#2c303d', floor: '#1c1e28', spots: { bed: 0.66, dresser: 0.22, window: 0.44, center: 0.46, door: 0.14 } },
  office:   { wall: '#28333a', floor: '#192127', spots: { desk: 0.72, shelf: 0.22, window: 0.46, center: 0.48, door: 0.14 } },
  sewing:   { wall: '#3e3239', floor: '#261e23', spots: { sewing: 0.36, plant: 0.78, chair: 0.62, window: 0.54, center: 0.50, door: 0.14 } },
  studio:   { wall: '#38362e', floor: '#23211b', spots: { easel: 0.32, shelf: 0.76, window: 0.54, center: 0.50, door: 0.14 } },
  dining:   { wall: '#3b322a', floor: '#241d18', spots: { table: 0.50, plant: 0.20, window: 0.78, center: 0.50, door: 0.14 } },
  kids:     { wall: '#313647', floor: '#1f2230', spots: { bed: 0.70, desk: 0.26, center: 0.48, window: 0.46, door: 0.14 } }
};

// 100+ distinct named behaviors categorized across 4 tiers (used by the procedural utility planner & inspector)
export const BEHAVIOR_CATALOG = {
  solo: [
    // Kitchen & food (12)
    { id: 'cook_stove', room: 'kitchen', spot: 'stove', pose: 'cook', label: 'Simmering dinner at stove', dur: [420, 760], carryAfter: 'plate' },
    { id: 'chop_prep', room: 'kitchen', spot: 'counter', pose: 'cook', label: 'Chopping vegetables at counter', dur: [260, 480] },
    { id: 'raid_fridge', room: 'kitchen', spot: 'fridge', pose: 'reach', label: 'Raiding the refrigerator', dur: [140, 240], fridge: true },
    { id: 'wash_dishes', room: 'kitchen', spot: 'counter', pose: 'cook', label: 'Washing late-night dishes', dur: [280, 520] },
    { id: 'brew_tea', room: 'kitchen', spot: 'counter', pose: 'cook', label: 'Brewing hot tea', dur: [180, 320], carryAfter: 'mug' },
    { id: 'make_coffee', room: 'kitchen', spot: 'counter', pose: 'cook', label: 'Making late-night coffee', dur: [160, 280], carryAfter: 'mug' },
    { id: 'midnight_snack', room: 'kitchen', spot: 'fridge', pose: 'reach', label: 'Grabbing a midnight snack', dur: [150, 260], fridge: true, carryAfter: 'plate' },
    { id: 'pour_water', room: 'kitchen', spot: 'counter', pose: 'reach', label: 'Pouring a glass of water', dur: [110, 200], carryAfter: 'mug' },
    { id: 'wipe_counters', room: 'kitchen', spot: 'counter', pose: 'clean', label: 'Wiping down kitchen counters', dur: [220, 380] },
    { id: 'bake_treat', room: 'kitchen', spot: 'stove', pose: 'cook', label: 'Checking something in the oven', dur: [260, 420] },
    { id: 'unpack_groceries', room: 'kitchen', spot: 'counter', pose: 'reach', label: 'Putting away groceries', dur: [240, 420] },
    { id: 'sort_trash', room: 'kitchen', spot: 'door', pose: 'reach', label: 'Tying up the kitchen trash', dur: [140, 240] },
    // Living & leisure (16)
    { id: 'watch_tv', room: 'living', spot: 'couch', pose: 'sit', label: 'Watching late-night TV', dur: [820, 1500], tv: true },
    { id: 'game_console', room: 'living', spot: 'couch', pose: 'sit', label: 'Playing console games', dur: [760, 1400], tv: true },
    { id: 'read_couch', room: 'living', spot: 'couch', pose: 'read', label: 'Reading a novel on the sofa', dur: [700, 1300] },
    { id: 'doze_couch', room: 'living', spot: 'couch', pose: 'slump', label: 'Falling asleep on the couch', dur: [860, 1500], tv: true },
    { id: 'pace_phone', room: 'living', spot: 'center', pose: 'phone', label: 'Pacing on a quiet phone call', dur: [320, 580] },
    { id: 'stare_window', room: 'living', spot: 'window', pose: 'window', label: 'Staring quietly down at the street', dur: [360, 720] },
    { id: 'home_yoga', room: 'living', spot: 'center', pose: 'yoga', label: 'Stretching on a yoga mat', dur: [420, 740] },
    { id: 'light_workout', room: 'living', spot: 'center', pose: 'workout', label: 'Doing evening calisthenics', dur: [320, 560] },
    { id: 'vacuum_rug', room: 'living', spot: 'center', pose: 'clean', label: 'Vacuuming the living room', dur: [260, 460] },
    { id: 'sweep_floor', room: 'living', spot: 'center', pose: 'clean', label: 'Sweeping across the floorboards', dur: [240, 400] },
    { id: 'fold_laundry', room: 'living', spot: 'couch', pose: 'sew', label: 'Folding laundry in front of TV', dur: [460, 820], tv: true },
    { id: 'play_guitar', room: 'living', spot: 'couch', pose: 'instrument', label: 'Strumming an acoustic guitar', dur: [480, 860] },
    { id: 'listen_records', room: 'living', spot: 'window', pose: 'sway', label: 'Listening to vinyl records', dur: [420, 760] },
    { id: 'adjust_blinds', room: 'living', spot: 'window', pose: 'reach', label: 'Adjusting the window blinds', dur: [120, 200], toggleBlinds: true },
    { id: 'tend_pet', room: 'living', spot: 'center', pose: 'crouch', label: 'Petting the apartment cat', dur: [220, 380] },
    { id: 'search_keys', room: 'living', spot: 'table', pose: 'reach', label: 'Looking around for misplaced keys', dur: [180, 300] },
    // Work, study & hobbies (12)
    { id: 'work_monitor', room: 'office', spot: 'desk', pose: 'type', label: 'Working late at dual monitors', dur: [900, 1600], monitor: true },
    { id: 'code_night', room: 'office', spot: 'desk', pose: 'type', label: 'Debugging code by monitor glow', dur: [850, 1500], monitor: true },
    { id: 'browse_shelf', room: 'office', spot: 'shelf', pose: 'reach', label: 'Browsing bookshelf for a book', dur: [200, 340] },
    { id: 'sort_mail', room: 'office', spot: 'desk', pose: 'read', label: 'Sorting bills and mail at desk', dur: [340, 620] },
    { id: 'video_call', room: 'office', spot: 'desk', pose: 'phone', label: 'Quiet late-night video call', dur: [420, 760], monitor: true },
    { id: 'sew_table', room: 'sewing', spot: 'sewing', pose: 'sew', label: 'Sewing fabric under task lamp', dur: [820, 1450] },
    { id: 'knit_chair', room: 'sewing', spot: 'chair', pose: 'sew', label: 'Knitting a wool scarf', dur: [760, 1320] },
    { id: 'water_plants', room: 'sewing', spot: 'plant', pose: 'reach', label: 'Watering windowsill houseplants', dur: [220, 380] },
    { id: 'iron_clothes', room: 'sewing', spot: 'sewing', pose: 'clean', label: 'Ironing a shirt for tomorrow', dur: [280, 480] },
    { id: 'paint_easel', room: 'studio', spot: 'easel', pose: 'paint', label: 'Painting quietly on canvas', dur: [820, 1450] },
    { id: 'mix_paints', room: 'studio', spot: 'shelf', pose: 'reach', label: 'Mixing pigments at supply shelf', dur: [220, 360] },
    { id: 'admire_canvas', room: 'studio', spot: 'window', pose: 'window', label: 'Stepping back to study canvas', dur: [240, 420] },
    // Dining, bedroom & kids (12)
    { id: 'eat_dining', room: 'dining', spot: 'table', pose: 'sit', label: 'Eating dinner at dining table', dur: [540, 920] },
    { id: 'journal_dining', room: 'dining', spot: 'table', pose: 'read', label: 'Writing in a notebook at table', dur: [480, 840] },
    { id: 'sleep_bed', room: 'bedroom', spot: 'bed', pose: 'sleep', label: 'Sleeping quietly', dur: [1200, 2200], dimRoom: true },
    { id: 'read_bed', room: 'bedroom', spot: 'bed', pose: 'sleep', label: 'Reading by bedside lamp', dur: [540, 900] },
    { id: 'get_dressed', room: 'bedroom', spot: 'dresser', pose: 'reach', label: 'Picking out clothes at dresser', dur: [200, 340] },
    { id: 'insomniac_win', room: 'bedroom', spot: 'window', pose: 'window', label: 'Awake late gazing at the night', dur: [360, 680], dimRoom: true },
    { id: 'pack_bag', room: 'bedroom', spot: 'dresser', pose: 'reach', label: 'Packing an overnight bag', dur: [280, 480] },
    { id: 'kid_homework', room: 'kids', spot: 'desk', pose: 'type', label: 'Finishing homework at desk', dur: [520, 920] },
    { id: 'kid_sleep', room: 'kids', spot: 'bed', pose: 'sleep', label: 'Asleep in bunk bed', dur: [1400, 2400], dimRoom: true },
    { id: 'kid_window', room: 'kids', spot: 'window', pose: 'window', label: 'Watching cars pass below', dur: [260, 460] },
    { id: 'light_menorah', room: 'living', spot: 'window', pose: 'reach', label: 'Lighting the Hanukkah menorah', dur: [320, 560], winterMenorahOnly: true },
    { id: 'admire_tree', room: 'living', spot: 'window', pose: 'window', label: 'Admiring the lit holiday tree', dur: [300, 540], winterTreeOnly: true }
  ],
  social: [
    'Cooking dinner together', 'Sharing a meal at the table', 'Cuddling on the sofa',
    'Slow-dancing in the living room', 'Watching a movie together', 'Playing a board game',
    'Quiet late-night talk over tea', 'Reading side by side', 'Looking out at the weather together',
    'Folding laundry together', 'Helping tuck child into bed', 'Helping child with homework',
    'Unpacking boxes together', 'Mild bickering over TV remote', 'Comforting partner after long shift',
    'Toasting drinks in living room', 'Checking in on sleeping child', 'Sharing leftovers at the fridge',
    'Admiring painting together', 'Planning trip at dining table', 'Showing off a new delivery',
    'Practicing dance steps', 'Listening to music together', 'Working quietly in separate rooms',
    'Warm embrace by the window', 'Waving down to the street', 'Reviewing finances at desk',
    'Cleaning up kitchen together', 'Reconciling after a disagreement', 'Hosting a quiet dinner guest'
  ],
  quirky: [
    'Solo midnight dance session', 'Checking street with binoculars', 'Practicing dramatic speech',
    'Talking to a houseplant', 'Shadowboxing in living room', 'Chasing a stray moth',
    'Candlelit meditation circle', 'Fixing a flickering desk lamp', 'Rearranging wall art',
    'Hiding a wrapped holiday gift', 'Late-night espresso pacing', 'Studying a conspiracy corkboard',
    'Peeking nervously through blinds', 'Assembling flat-pack furniture', 'Juggling in living room',
    'Stretching awkwardly on floor', 'Checking hallway peephole', 'Midnight photography flash',
    'Trying on vintage coats', 'Staring right back across the street'
  ],
  dramaticEvents: [
    'delivery', 'fire', 'murder', 'medical', 'argument', 'burglary', 'ufo',
    'fuse', 'disco', 'blackout', 'pizza', 'balcony_lock', 'moving_boxes', 'telescope', 'standoff'
  ]
};

// 8 Floors (floor 0 = top 8th floor, floor 7 = 1st floor above lobby) × 3 Multi-Window Apartments/Floor = 24 Units (72 Windows)!
export const APARTMENT_SPECS = [
  // --- FLOOR 8 (Top Floor, floorIdx = 0) ---
  {
    id: '8A', floor: 0, col: 0, label: 'The Chen Family', rooms: ['kitchen', 'living', 'kids'], startLit: 1,
    decor: { xmasTree: 1, xmasLights: true, menorah: -1, pumpkin: 1, spookyGlow: false, flowers: 0, ac: 2 },
    residents: [
      { name: 'Mei', shirt: '#c86a6a', pants: '#344154', hair: '#1a181c', skin: '#e8c4a4', scale: 0.96, startRoom: 0, startPose: 'cook', startActivity: 'Washing evening dishes' },
      { name: 'Kenji', shirt: '#4f7a9e', pants: '#2a323d', hair: '#18181c', skin: '#e5be9e', scale: 1.03, startRoom: 1, startPose: 'sit', startActivity: 'Reading on the sofa' },
      { name: 'Leo', shirt: '#68a678', pants: '#363d4c', hair: '#1b191e', skin: '#ecc6a6', scale: 0.72, startRoom: 2, startPose: 'sleep', startActivity: 'Asleep in bunk bed' }
    ]
  },
  {
    id: '8B', floor: 0, col: 1, label: 'Night-Owl Bachelor (Marcus)', rooms: ['bedroom', 'living', 'kitchen'], startLit: 1,
    decor: { xmasTree: -1, xmasLights: false, menorah: -1, pumpkin: 1, spookyGlow: true, flowers: -1, ac: 0 },
    residents: [
      { name: 'Marcus', shirt: '#5e996c', pants: '#2d3340', hair: '#211b17', skin: '#cfa07b', scale: 1.04, startRoom: 1, startPose: 'sit', startActivity: 'Watching late-night TV' }
    ]
  },
  {
    id: '8C', floor: 0, col: 2, label: 'The Goldberg Family (Jewish)', rooms: ['office', 'living', 'kitchen'], startLit: 1,
    decor: { xmasTree: -1, xmasLights: false, menorah: 1, pumpkin: -1, spookyGlow: false, flowers: 2, ac: 0 },
    residents: [
      { name: 'Rachel', shirt: '#9c78b8', pants: '#323042', hair: '#3b2820', skin: '#edd0b6', scale: 0.96, startRoom: 1, startPose: 'window', startActivity: 'Lighting the Hanukkah menorah' },
      { name: 'Daniel', shirt: '#537396', pants: '#28303b', hair: '#241e1a', skin: '#e6c0a1', scale: 1.02, startRoom: 0, startPose: 'type', startActivity: 'Finishing work at desk' }
    ]
  },

  // --- FLOOR 7 (floorIdx = 1) ---
  {
    id: '7A', floor: 1, col: 0, label: 'Remote Engineer (Sam)', rooms: ['office', 'living', 'bedroom'], startLit: 0,
    decor: { xmasTree: 1, xmasLights: false, menorah: -1, pumpkin: -1, spookyGlow: false, flowers: -1, ac: 2 },
    residents: [
      { name: 'Sam', shirt: '#d69d49', pants: '#2b323d', hair: '#453022', skin: '#e6bc9c', scale: 1.0, startRoom: 0, startPose: 'type', startActivity: 'Coding by dual monitors' }
    ]
  },
  {
    id: '7B', floor: 1, col: 1, label: 'The Alvarez Family', rooms: ['kitchen', 'living', 'bedroom'], startLit: -1,
    decor: { xmasTree: 1, xmasLights: true, menorah: -1, pumpkin: 1, spookyGlow: false, flowers: 1, ac: 2 },
    residents: [
      { name: 'Sofia', shirt: '#cf677c', pants: '#323545', hair: '#211818', skin: '#d6a481', scale: 0.95, startRoom: 2, startPose: 'sleep', startActivity: 'Sleeping quietly' },
      { name: 'Mateo', shirt: '#6a8299', pants: '#262b33', hair: '#1d1917', skin: '#c48f6b', scale: 1.03, startRoom: 2, startPose: 'sleep', startActivity: 'Sleeping quietly' }
    ]
  },
  {
    id: '7C', floor: 1, col: 2, label: 'Painter (Nora)', rooms: ['studio', 'living', 'kitchen'], startLit: 0,
    decor: { xmasTree: -1, xmasLights: false, menorah: -1, pumpkin: 0, spookyGlow: true, flowers: 0, ac: -1 },
    residents: [
      { name: 'Nora', shirt: '#49a398', pants: '#323742', hair: '#7d3828', skin: '#f0cbb0', scale: 0.96, startRoom: 0, startPose: 'paint', startActivity: 'Painting quietly at easel' }
    ]
  },

  // --- FLOOR 6 (floorIdx = 2) ---
  {
    id: '6A', floor: 2, col: 0, label: 'Couple (Maya & Devon)', rooms: ['kitchen', 'living', 'office'], startLit: 1,
    decor: { xmasTree: 1, xmasLights: true, menorah: -1, pumpkin: 1, spookyGlow: false, flowers: 0, ac: 2 },
    residents: [
      { name: 'Maya', shirt: '#d46a6a', pants: '#344457', hair: '#2a1d17', skin: '#e8be9e', scale: 0.95, startRoom: 1, startPose: 'read', startActivity: 'Reading on couch' },
      { name: 'Devon', shirt: '#5b8fb9', pants: '#2b3438', hair: '#1c1917', skin: '#b07b55', scale: 1.04, startRoom: 2, startPose: 'type', startActivity: 'Working late at monitor' }
    ]
  },
  {
    id: '6B', floor: 2, col: 1, label: 'Quiet Loner (Arthur)', rooms: ['living', 'office', 'bedroom'], startLit: -1,
    decor: { xmasTree: -1, xmasLights: false, menorah: -1, pumpkin: -1, spookyGlow: false, flowers: -1, ac: -1 },
    residents: [
      { name: 'Arthur', shirt: '#8a6c53', pants: '#2c2927', hair: '#736c64', skin: '#e6c0a1', scale: 1.0, startRoom: 2, startPose: 'sleep', startActivity: 'Asleep in dark bedroom' }
    ]
  },
  {
    id: '6C', floor: 2, col: 2, label: 'The Patel Family', rooms: ['kitchen', 'dining', 'living'], startLit: 1,
    decor: { xmasTree: -1, xmasLights: true, menorah: -1, pumpkin: 2, spookyGlow: false, flowers: 1, ac: 2 },
    residents: [
      { name: 'Priya', shirt: '#c97859', pants: '#2f3240', hair: '#17151a', skin: '#b8825c', scale: 0.95, startRoom: 0, startPose: 'cook', startActivity: 'Brewing evening chai' },
      { name: 'Rohan', shirt: '#58789c', pants: '#262b36', hair: '#17151a', skin: '#ad7853', scale: 1.03, startRoom: 1, startPose: 'sit', startActivity: 'Reading at dining table' },
      { name: 'Ananya', shirt: '#e0a952', pants: '#343b4a', hair: '#17151a', skin: '#bc8660', scale: 0.72, startRoom: 2, startPose: 'sit', startActivity: 'Drawing on living rug' }
    ]
  },

  // --- FLOOR 5 (floorIdx = 3) ---
  {
    id: '5A', floor: 3, col: 0, label: 'Seamstress (Eleanor)', rooms: ['sewing', 'living', 'kitchen'], startLit: 0,
    decor: { xmasTree: 1, xmasLights: true, menorah: -1, pumpkin: 0, spookyGlow: false, flowers: 0, ac: -1 },
    residents: [
      { name: 'Eleanor', shirt: '#b689c0', pants: '#3c3244', hair: '#cfd3da', skin: '#efd0b6', scale: 0.93, startRoom: 0, startPose: 'sew', startActivity: 'Sewing under warm task lamp' }
    ]
  },
  {
    id: '5B', floor: 3, col: 1, label: 'Roommates (Chloe & Ben)', rooms: ['studio', 'living', 'kitchen'], startLit: 1,
    decor: { xmasTree: 1, xmasLights: false, menorah: -1, pumpkin: 1, spookyGlow: true, flowers: 1, ac: 0 },
    residents: [
      { name: 'Chloe', shirt: '#54a8a0', pants: '#353a46', hair: '#873d2c', skin: '#f1ccb0', scale: 0.96, startRoom: 1, startPose: 'sit', startActivity: 'Watching muted TV' },
      { name: 'Ben', shirt: '#c77c48', pants: '#2d3436', hair: '#241e1a', skin: '#c48f68', scale: 1.03, startRoom: 2, startPose: 'cook', startActivity: 'Heating midnight noodles' }
    ]
  },
  {
    id: '5C', floor: 3, col: 2, label: 'Night Nurse (Tessa)', rooms: ['bedroom', 'living', 'kitchen'], startLit: -1,
    decor: { xmasTree: -1, xmasLights: false, menorah: -1, pumpkin: -1, spookyGlow: false, flowers: 1, ac: 0 },
    residents: [
      { name: 'Tessa', shirt: '#6a94b8', pants: '#2c3542', hair: '#3b2b20', skin: '#e8c1a2', scale: 0.96, startRoom: 0, startPose: 'sleep', startActivity: 'Resting before shift' }
    ]
  },

  // --- FLOOR 4 (floorIdx = 4) ---
  {
    id: '4A', floor: 4, col: 0, label: 'Jewish Family (Miriam & Avi)', rooms: ['sewing', 'living', 'kids'], startLit: 1,
    decor: { xmasTree: -1, xmasLights: false, menorah: 1, pumpkin: -1, spookyGlow: false, flowers: 0, ac: -1 },
    residents: [
      { name: 'Miriam', shirt: '#7b99c4', pants: '#313747', hair: '#4a3228', skin: '#edd0b6', scale: 0.96, startRoom: 1, startPose: 'sit', startActivity: 'Relaxing by menorah glow' },
      { name: 'Avi', shirt: '#5c728a', pants: '#29303b', hair: '#241e1b', skin: '#e4bd9d', scale: 1.02, startRoom: 1, startPose: 'window', startActivity: 'Admiring the lit menorah' },
      { name: 'Noa', shirt: '#d4879a', pants: '#363b4c', hair: '#3b2720', skin: '#efd0b6', scale: 0.72, startRoom: 2, startPose: 'sleep', startActivity: 'Asleep in bedroom' }
    ]
  },
  {
    id: '4B', floor: 4, col: 1, label: 'Volatile Couple (Elena & Victor)', rooms: ['kitchen', 'living', 'bedroom'], startLit: 1,
    decor: { xmasTree: 1, xmasLights: true, menorah: -1, pumpkin: 1, spookyGlow: false, flowers: -1, ac: 2 },
    residents: [
      { name: 'Elena', shirt: '#cf5c78', pants: '#2b2d3c', hair: '#1c1718', skin: '#f0c8ac', scale: 0.96, startRoom: 0, startPose: 'cook', startActivity: 'Making late dinner' },
      { name: 'Victor', shirt: '#7d8a97', pants: '#23282e', hair: '#382a20', skin: '#d9ad8b', scale: 1.04, startRoom: 1, startPose: 'window', startActivity: 'Staring out at the rain' }
    ]
  },
  {
    id: '4C', floor: 4, col: 2, label: 'Writer (Julian)', rooms: ['office', 'living', 'bedroom'], startLit: 0,
    decor: { xmasTree: -1, xmasLights: false, menorah: -1, pumpkin: 1, spookyGlow: true, flowers: -1, ac: -1 },
    residents: [
      { name: 'Julian', shirt: '#94775c', pants: '#2e2b29', hair: '#30251e', skin: '#e3bb9c', scale: 1.01, startRoom: 0, startPose: 'type', startActivity: 'Typing late-night manuscript' }
    ]
  },

  // --- FLOOR 3 (floorIdx = 5) ---
  {
    id: '3A', floor: 5, col: 0, label: 'The Brooks Family', rooms: ['kitchen', 'living', 'kids'], startLit: -1,
    decor: { xmasTree: 1, xmasLights: true, menorah: -1, pumpkin: 1, spookyGlow: false, flowers: 0, ac: 2 },
    residents: [
      { name: 'Hannah', shirt: '#7d9e77', pants: '#313a3d', hair: '#593e2b', skin: '#ebd0b7', scale: 0.96, startRoom: 1, startPose: 'sit', startActivity: 'Folding laundry quietly' },
      { name: 'Greg', shirt: '#62738c', pants: '#282f3a', hair: '#332820', skin: '#e3bc9d', scale: 1.04, startRoom: 1, startPose: 'sit', startActivity: 'Watching muted news' },
      { name: 'Eli', shirt: '#d98f4a', pants: '#303645', hair: '#4a3324', skin: '#ebd0b7', scale: 0.72, startRoom: 2, startPose: 'sleep', startActivity: 'Asleep in bedroom' }
    ]
  },
  {
    id: '3B', floor: 5, col: 1, label: 'Musician (Dante)', rooms: ['studio', 'living', 'bedroom'], startLit: 1,
    decor: { xmasTree: -1, xmasLights: false, menorah: -1, pumpkin: 0, spookyGlow: true, flowers: -1, ac: 2 },
    residents: [
      { name: 'Dante', shirt: '#a85a68', pants: '#242730', hair: '#1a1716', skin: '#996645', scale: 1.03, startRoom: 1, startPose: 'instrument', startActivity: 'Strumming acoustic guitar' }
    ]
  },
  {
    id: '3C', floor: 5, col: 2, label: 'Elderly Couple (Ruth & Walter)', rooms: ['dining', 'living', 'bedroom'], startLit: -1,
    decor: { xmasTree: 1, xmasLights: true, menorah: -1, pumpkin: 0, spookyGlow: false, flowers: 0, ac: -1 },
    residents: [
      { name: 'Ruth', shirt: '#a8849e', pants: '#36323d', hair: '#d8dce3', skin: '#efd2ba', scale: 0.92, startRoom: 2, startPose: 'sleep', startActivity: 'Sleeping peacefully' },
      { name: 'Walter', shirt: '#6c7c8c', pants: '#2c3038', hair: '#c9ced6', skin: '#e8c4a6', scale: 0.98, startRoom: 2, startPose: 'sleep', startActivity: 'Sleeping peacefully' }
    ]
  },

  // --- FLOOR 2 (floorIdx = 6) ---
  {
    id: '2A', floor: 6, col: 0, label: 'Grad Students (Aisha & Zara)', rooms: ['office', 'living', 'kitchen'], startLit: 0,
    decor: { xmasTree: -1, xmasLights: false, menorah: -1, pumpkin: 1, spookyGlow: false, flowers: 1, ac: 0 },
    residents: [
      { name: 'Aisha', shirt: '#5e9691', pants: '#2d3440', hair: '#19161a', skin: '#8c5a3c', scale: 0.96, startRoom: 0, startPose: 'type', startActivity: 'Studying at desk monitor' },
      { name: 'Zara', shirt: '#c98855', pants: '#2c313d', hair: '#1f191a', skin: '#a6714d', scale: 0.96, startRoom: 2, startPose: 'cook', startActivity: 'Making late-night tea' }
    ]
  },
  {
    id: '2B', floor: 6, col: 1, label: 'Jewish Solo Resident (Hannah K.)', rooms: ['kitchen', 'living', 'bedroom'], startLit: 1,
    decor: { xmasTree: -1, xmasLights: false, menorah: 1, pumpkin: -1, spookyGlow: false, flowers: 1, ac: -1 },
    residents: [
      { name: 'Hannah K.', shirt: '#5c82b0', pants: '#2d3340', hair: '#38251d', skin: '#edd0b6', scale: 0.96, startRoom: 1, startPose: 'read', startActivity: 'Reading near window menorah' }
    ]
  },
  {
    id: '2C', floor: 6, col: 2, label: 'Late-Shift Worker (Ray)', rooms: ['kitchen', 'dining', 'bedroom'], startLit: -1,
    decor: { xmasTree: -1, xmasLights: true, menorah: -1, pumpkin: 1, spookyGlow: false, flowers: -1, ac: 2 },
    residents: [
      { name: 'Ray', shirt: '#6c7bc4', pants: '#262b38', hair: '#1d1b1a', skin: '#9e6b49', scale: 1.03, startRoom: 2, startPose: 'sleep', startActivity: 'Resting after shift' }
    ]
  },

  // --- FLOOR 1 (Above Lobby, floorIdx = 7) ---
  {
    id: '1A', floor: 7, col: 0, label: 'The Kowalski Family', rooms: ['kitchen', 'living', 'bedroom'], startLit: 1,
    decor: { xmasTree: 1, xmasLights: true, menorah: -1, pumpkin: 1, spookyGlow: false, flowers: 0, ac: 2 },
    residents: [
      { name: 'Marek', shirt: '#6a7d8f', pants: '#2a3038', hair: '#4a3d31', skin: '#ebc7ab', scale: 1.03, startRoom: 1, startPose: 'sit', startActivity: 'Watching late news' },
      { name: 'Anya', shirt: '#b86878', pants: '#343642', hair: '#6b4e38', skin: '#f0ceb4', scale: 0.95, startRoom: 0, startPose: 'cook', startActivity: 'Tidying the kitchen' }
    ]
  },
  {
    id: '1B', floor: 7, col: 1, label: 'Super / Handyman (Frank)', rooms: ['office', 'living', 'kitchen'], startLit: -1,
    decor: { xmasTree: -1, xmasLights: false, menorah: -1, pumpkin: -1, spookyGlow: false, flowers: -1, ac: -1 },
    residents: [
      { name: 'Frank', shirt: '#7d6b56', pants: '#2b2d33', hair: '#595550', skin: '#deb696', scale: 1.02, startRoom: 1, startPose: 'sit', startActivity: 'Dozing in armchair' }
    ]
  },
  {
    id: '1C', floor: 7, col: 2, label: 'Newlyweds (Clara & Owen)', rooms: ['dining', 'living', 'bedroom'], startLit: 1,
    decor: { xmasTree: 1, xmasLights: true, menorah: -1, pumpkin: 1, spookyGlow: false, flowers: 1, ac: 2 },
    residents: [
      { name: 'Clara', shirt: '#c97b8a', pants: '#333645', hair: '#6e4730', skin: '#f2ceb5', scale: 0.95, startRoom: 1, startPose: 'sway', startActivity: 'Listening to vinyl together' },
      { name: 'Owen', shirt: '#598276', pants: '#283033', hair: '#3b2b1e', skin: '#e6c0a2', scale: 1.03, startRoom: 1, startPose: 'sway', startActivity: 'Slow-dancing in living room' }
    ]
  }
];
