// Film catalog. Every title is a pun on a famous film. Art for each film's shots lives in frames.js
// (keyed by id); each film has 3 or 4 shots, and the splice between reel k and k+1 shows shot k on
// both sides (consecutive frames of one shot are nearly identical, so the join is invisible).
//
// kind:   'arthouse' (Acts I and IV, 35mm only), 'blockbuster' (Acts II-III, 35mm print or DCP), 'cult' (any act)
// reels:  35mm reels the print ships on; a build-up takes reels-1 splices
// cost:   flat booking fee; the distributor also keeps `cut` of every ticket
// appeal: base pull with regular audiences (0..1); hip: pull with hipsters (0..1)
// act:    first act it shows up in the Coming Soon list

export const FILMS = [
  // ---- arthouse ----
  { id: 'the-400-bros', title: 'The 400 Bros', spoof: 'The 400 Blows', kind: 'arthouse', genre: 'French New Wave', tagline: 'A boy runs from a frat house all the way to the sea. Freeze frame.', reels: 3, shots: 4, cost: 60, cut: 0.35, appeal: 0.35, hip: 0.9, act: 1 },
  { id: 'bicycle-cheese', title: 'Bicycle Cheese', spoof: 'Bicycle Thieves', kind: 'arthouse', genre: 'Neorealism', tagline: 'Rome, 1948. A man and his son search the city for a stolen wheel of parmesan.', reels: 3, shots: 3, cost: 55, cut: 0.35, appeal: 0.3, hip: 0.85, act: 1 },
  { id: 'seven-salamis', title: 'Seven Salamis', spoof: 'Seven Samurai', kind: 'arthouse', genre: 'Jidaigeki', tagline: 'A village hires seven cured meats to defend the harvest. Three and a half hours. Worth it.', reels: 4, shots: 4, cost: 80, cut: 0.4, appeal: 0.45, hip: 0.8, act: 1 },
  { id: '8-quarter', title: '8¼', spoof: '8½', kind: 'arthouse', genre: 'Italian Surrealism', tagline: 'A famous director cannot decide what to have for lunch.', reels: 3, shots: 3, cost: 50, cut: 0.35, appeal: 0.25, hip: 0.95, act: 1 },
  { id: 'oatmelie', title: 'Oatmélie', spoof: 'Amélie', kind: 'arthouse', genre: 'Whimsy', tagline: 'A shy Parisian waitress secretly fixes everyone’s breakfast.', reels: 3, shots: 4, cost: 65, cut: 0.35, appeal: 0.5, hip: 0.75, act: 1 },
  { id: 'nosferatwo', title: 'Nosferatwo', spoof: 'Nosferatu', kind: 'arthouse', genre: 'Silent Horror', tagline: 'The sequel nobody asked for. His shadow climbs the stairs. Again.', reels: 3, shots: 3, cost: 45, cut: 0.3, appeal: 0.35, hip: 0.85, act: 1 },
  { id: 'metropolice', title: 'Metropolice', spoof: 'Metropolis', kind: 'arthouse', genre: 'Silent Sci-Fi', tagline: 'In the city of tomorrow, the robot gives out parking tickets.', reels: 4, shots: 4, cost: 70, cut: 0.35, appeal: 0.4, hip: 0.8, act: 1 },
  { id: 'seventh-seal-pup', title: 'The Seventh Seal Pup', spoof: 'The Seventh Seal', kind: 'arthouse', genre: 'Swedish Existential', tagline: 'A knight plays chess with a baby seal for his soul. The seal is very good at chess.', reels: 3, shots: 3, cost: 55, cut: 0.35, appeal: 0.3, hip: 0.9, act: 1 },
  { id: 'citizen-cane', title: 'Citizen Cane', spoof: 'Citizen Kane', kind: 'arthouse', genre: 'Classic Drama', tagline: 'A newspaper tycoon dies whispering one word. It was a candy cane.', reels: 4, shots: 4, cost: 75, cut: 0.4, appeal: 0.5, hip: 0.7, act: 1 },
  { id: 'casa-blanket', title: 'Casa Blanket', spoof: 'Casablanca', kind: 'arthouse', genre: 'Romance', tagline: 'Of all the nap spots in all the towns in all the world, she walks into mine.', reels: 3, shots: 4, cost: 70, cut: 0.4, appeal: 0.55, hip: 0.6, act: 1 },
  { id: 'sunscreen-boulevard', title: 'Sunscreen Boulevard', spoof: 'Sunset Boulevard', kind: 'arthouse', genre: 'Noir', tagline: 'A faded star is ready for her close-up. SPF 50.', reels: 3, shots: 3, cost: 55, cut: 0.35, appeal: 0.4, hip: 0.75, act: 1 },
  { id: 'vertigoat', title: 'Vertigoat', spoof: 'Vertigo', kind: 'arthouse', genre: 'Thriller', tagline: 'A retired mountain goat is afraid of heights. San Francisco has a lot of hills.', reels: 4, shots: 4, cost: 70, cut: 0.4, appeal: 0.5, hip: 0.65, act: 1 },
  { id: 'la-dolce-pita', title: 'La Dolce Pita', spoof: 'La Dolce Vita', kind: 'arthouse', genre: 'Italian Drama', tagline: 'Seven nights in Rome. Seven gyros. One fountain.', reels: 3, shots: 3, cost: 50, cut: 0.35, appeal: 0.35, hip: 0.85, act: 1 },
  { id: 'rash-o-mon', title: 'Rashōmon', spoof: 'Rashomon', kind: 'arthouse', genre: 'Mystery', tagline: 'Four witnesses describe the same rash. Nobody agrees.', reels: 3, shots: 4, cost: 55, cut: 0.35, appeal: 0.3, hip: 0.9, act: 1 },
  { id: 'beanstalker', title: 'Beanstalker', spoof: 'Stalker', kind: 'arthouse', genre: 'Slow Cinema', tagline: 'Three men cross the Zone to find a room that grants wishes. Mostly they look at puddles.', reels: 4, shots: 3, cost: 50, cut: 0.3, appeal: 0.2, hip: 1.0, act: 1 },
  { id: 'wings-of-dessert', title: 'Wings of Dessert', spoof: 'Wings of Desire', kind: 'arthouse', genre: 'Fantasy', tagline: 'Angels drift over Berlin, longing to taste cake.', reels: 3, shots: 3, cost: 55, cut: 0.35, appeal: 0.35, hip: 0.85, act: 1 },
  { id: 'mood-for-noodles', title: 'In the Mood for Noodles', spoof: 'In the Mood for Love', kind: 'arthouse', genre: 'Romance', tagline: 'Two neighbours keep passing each other on the way to the noodle stall.', reels: 3, shots: 4, cost: 65, cut: 0.35, appeal: 0.45, hip: 0.85, act: 1 },
  { id: 'paris-texas-toast', title: 'Paris, Texas Toast', spoof: 'Paris, Texas', kind: 'arthouse', genre: 'Road Movie', tagline: 'A man walks out of the desert holding a single slice of garlic bread.', reels: 3, shots: 3, cost: 55, cut: 0.35, appeal: 0.35, hip: 0.85, act: 1 },

  // ---- blockbusters ----
  { id: 'paws', title: 'Paws', spoof: 'Jaws', kind: 'blockbuster', genre: 'Summer Thriller', tagline: 'You’re gonna need a bigger leash.', reels: 4, shots: 4, cost: 260, cut: 0.6, appeal: 0.85, hip: 0.2, act: 2 },
  { id: 'the-codfather', title: 'The Codfather', spoof: 'The Godfather', kind: 'blockbuster', genre: 'Crime Epic', tagline: 'He made them an offer they couldn’t refuse. With tartar sauce.', reels: 5, shots: 4, cost: 300, cut: 0.6, appeal: 0.8, hip: 0.35, act: 2 },
  { id: 'jurassic-pork', title: 'Jurassic Pork', spoof: 'Jurassic Park', kind: 'blockbuster', genre: 'Adventure', tagline: 'Life, uh, finds a way. Into a sandwich.', reels: 5, shots: 4, cost: 340, cut: 0.65, appeal: 0.95, hip: 0.1, act: 2 },
  { id: 'tightanic', title: 'Tightanic', spoof: 'Titanic', kind: 'blockbuster', genre: 'Disaster Romance', tagline: 'The unsinkable ship. Built on a budget.', reels: 5, shots: 4, cost: 320, cut: 0.6, appeal: 0.9, hip: 0.15, act: 2 },
  { id: 'e-tea', title: 'E.Tea', spoof: 'E.T.', kind: 'blockbuster', genre: 'Family Sci-Fi', tagline: 'He is a long way from home. He would just like a cup of tea.', reels: 4, shots: 4, cost: 240, cut: 0.6, appeal: 0.85, hip: 0.2, act: 2 },
  { id: 'back-to-the-suture', title: 'Back to the Suture', spoof: 'Back to the Future', kind: 'blockbuster', genre: 'Time Travel', tagline: 'A surgeon goes back in time to fix his own stitches.', reels: 4, shots: 4, cost: 260, cut: 0.6, appeal: 0.85, hip: 0.25, act: 2 },
  { id: 'the-mattress', title: 'The Mattress', spoof: 'The Matrix', kind: 'blockbuster', genre: 'Cyberpunk', tagline: 'Firm or soft. Choose wisely. Nobody can be told what the Mattress is.', reels: 4, shots: 4, cost: 280, cut: 0.6, appeal: 0.85, hip: 0.4, act: 2 },
  { id: 'toastbusters', title: 'Toastbusters', spoof: 'Ghostbusters', kind: 'blockbuster', genre: 'Comedy', tagline: 'Who you gonna call? Somebody with butter.', reels: 4, shots: 4, cost: 230, cut: 0.6, appeal: 0.8, hip: 0.2, act: 2 },
  { id: 'star-wares', title: 'Star Wares', spoof: 'Star Wars', kind: 'blockbuster', genre: 'Space Opera', tagline: 'A long time ago, in a shopping mall far, far away.', reels: 5, shots: 4, cost: 360, cut: 0.65, appeal: 1.0, hip: 0.1, act: 2 },
  { id: 'the-lyin-king', title: 'The Lyin’ King', spoof: 'The Lion King', kind: 'blockbuster', genre: 'Animated', tagline: 'Everything the light touches is his. He says.', reels: 4, shots: 4, cost: 280, cut: 0.6, appeal: 0.9, hip: 0.1, act: 2 },
  { id: 'top-bun', title: 'Top Bun', spoof: 'Top Gun', kind: 'blockbuster', genre: 'Action', tagline: 'I feel the need. The need for seeds.', reels: 4, shots: 3, cost: 250, cut: 0.6, appeal: 0.85, hip: 0.15, act: 2 },
  { id: 'raiders-lost-bark', title: 'Raiders of the Lost Bark', spoof: 'Raiders of the Lost Ark', kind: 'blockbuster', genre: 'Adventure', tagline: 'Snakes. Why did it have to be snakes? And squirrels.', reels: 4, shots: 4, cost: 270, cut: 0.6, appeal: 0.9, hip: 0.2, act: 2 },
  { id: 'the-germinator', title: 'The Germinator', spoof: 'The Terminator', kind: 'blockbuster', genre: 'Sci-Fi Action', tagline: 'A cyborg gardener from the future. He’ll be back. With mulch.', reels: 4, shots: 4, cost: 250, cut: 0.6, appeal: 0.85, hip: 0.2, act: 2 },
  { id: 'forrest-stump', title: 'Forrest Stump', spoof: 'Forrest Gump', kind: 'blockbuster', genre: 'Drama', tagline: 'Life is like a box of woodchips.', reels: 5, shots: 4, cost: 280, cut: 0.6, appeal: 0.85, hip: 0.15, act: 2 },
  { id: 'dye-hard', title: 'Dye Hard', spoof: 'Die Hard', kind: 'blockbuster', genre: 'Action', tagline: 'Christmas Eve. A hair salon. Forty floors of highlights.', reels: 4, shots: 4, cost: 240, cut: 0.6, appeal: 0.85, hip: 0.25, act: 2 },
  { id: 'free-wifi', title: 'Free Wi-Fi', spoof: 'Free Willy', kind: 'blockbuster', genre: 'Family', tagline: 'One boy. One router. One leap to freedom.', reels: 3, shots: 3, cost: 180, cut: 0.55, appeal: 0.7, hip: 0.2, act: 2 },
  { id: 'mad-snacks', title: 'Mad Snacks: Fury Road', spoof: 'Mad Max: Fury Road', kind: 'blockbuster', genre: 'Post-Apocalyptic', tagline: 'Oh what a day. What a lovely buffet.', reels: 4, shots: 4, cost: 300, cut: 0.6, appeal: 0.9, hip: 0.35, act: 2 },
  { id: 'inspection', title: 'Inspection', spoof: 'Inception', kind: 'blockbuster', genre: 'Mind-Bender', tagline: 'A health inspector enters a dream within a dream within a kitchen.', reels: 5, shots: 4, cost: 320, cut: 0.6, appeal: 0.9, hip: 0.4, act: 2 },
  { id: 'silence-of-the-clams', title: 'The Silence of the Clams', spoof: 'The Silence of the Lambs', kind: 'blockbuster', genre: 'Thriller', tagline: 'Hello, Clarice. Have the clams stopped screaming?', reels: 4, shots: 4, cost: 260, cut: 0.6, appeal: 0.8, hip: 0.35, act: 2 },
  { id: 'apocalypse-chow', title: 'Apocalypse Chow', spoof: 'Apocalypse Now', kind: 'blockbuster', genre: 'War', tagline: 'I love the smell of brunch in the morning.', reels: 5, shots: 4, cost: 290, cut: 0.6, appeal: 0.75, hip: 0.5, act: 2 },

  // ---- cult ----
  { id: 'pulp-friction', title: 'Pulp Friction', spoof: 'Pulp Fiction', kind: 'cult', genre: 'Crime', tagline: 'Two hitmen argue about rug burn. Royale with cheese.', reels: 4, shots: 4, cost: 140, cut: 0.5, appeal: 0.7, hip: 0.7, act: 1 },
  { id: 'blade-rummer', title: 'Blade Rummer', spoof: 'Blade Runner', kind: 'cult', genre: 'Neo-Noir', tagline: 'All those moments will be lost in time, like rum in rain.', reels: 4, shots: 4, cost: 150, cut: 0.5, appeal: 0.6, hip: 0.8, act: 1 },
  { id: 'the-big-lebowl', title: 'The Big Lebowl', spoof: 'The Big Lebowski', kind: 'cult', genre: 'Comedy', tagline: 'The cereal really tied the room together.', reels: 4, shots: 4, cost: 130, cut: 0.5, appeal: 0.7, hip: 0.75, act: 1 },
  { id: 'the-shinning', title: 'The Shinning', spoof: 'The Shining', kind: 'cult', genre: 'Horror', tagline: 'All shin kicks and no play makes Jack a dull boy.', reels: 4, shots: 4, cost: 140, cut: 0.5, appeal: 0.65, hip: 0.6, act: 1 },
  { id: 'lace-odyssey', title: '2001: A Lace Odyssey', spoof: '2001: A Space Odyssey', kind: 'cult', genre: 'Sci-Fi', tagline: 'Open the pod bay doors, HAL. I need more yarn.', reels: 4, shots: 4, cost: 140, cut: 0.5, appeal: 0.5, hip: 0.9, act: 1 },
  { id: 'rocky-horror-pastry', title: 'The Rocky Horror Pastry Show', spoof: 'The Rocky Horror Picture Show', kind: 'cult', genre: 'Midnight Musical', tagline: 'Let’s do the Time Warp again. Bring croissants.', reels: 3, shots: 4, cost: 110, cut: 0.45, appeal: 0.55, hip: 0.6, act: 1 },
  { id: 'groundhog-bae', title: 'Groundhog Bae', spoof: 'Groundhog Day', kind: 'cult', genre: 'Rom-Com', tagline: 'He keeps waking up on the same first date.', reels: 3, shots: 3, cost: 120, cut: 0.5, appeal: 0.65, hip: 0.4, act: 1 },
  { id: 'bite-club', title: 'Bite Club', spoof: 'Fight Club', kind: 'cult', genre: 'Vampire Drama', tagline: 'The first rule of Bite Club: you do not talk about Bite Club. The second rule: flossing.', reels: 4, shots: 4, cost: 100, cut: 0.4, appeal: 0.8, hip: 0.8, act: 4 },
];

export const FILM_BY_ID = Object.fromEntries(FILMS.map(f => [f.id, f]));

// Tyler's shoebox of single frames he cut out of other prints. Splicing one into a feature for a single
// frame (1/24 s) is the mischief move: cult following goes up, and now and then someone complains.
export const MISCHIEF_FRAMES = [
  { id: 'soap', label: 'A bar of soap' },
  { id: 'penguin', label: 'A penguin, sliding' },
  { id: 'ducky', label: 'A rubber duck' },
  { id: 'tyler-wink', label: 'Tyler, winking' },
  { id: 'rule-card', label: '"You do not talk about the booth"' },
  { id: 'cat', label: 'A cat looking at the camera' },
];
