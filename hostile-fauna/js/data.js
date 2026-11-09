// All the words. The humans' side of the story lives here: barks, signs, diaries, headlines.
// {name} is the speaker or the soldier being talked about, {thing} the object that just broke.

export const RANKS = { marine: ['Pvt.', 'Pvt.', 'Cpl.'], heavy: ['Sgt.'], sniper: ['Spc.'], mech: ['Lt.'], hero: ['Capt.'] };
export const FIRST = ['Dana', 'Chuck', 'Brenda', 'Todd', 'Marisol', 'Gus', 'Priya', 'Hank', 'Lorraine', 'Kofi', 'Trish', 'Vince', 'Yuki', 'Earl', 'Bo', 'Mindy', 'Rafael', 'Doreen', 'Skip', 'Anneke', 'Lamar', 'Peg'];
export const LAST = ['Kowalski', 'Hardcastle', 'Nguyen', 'Brubaker', 'Okafor', 'Steele', 'Pruitt', 'Vasquez', 'Lindqvist', 'Rockwell', 'Abernathy', 'Tanaka', 'Gunderson', 'Mbeki', 'Finch', 'DeLuca', 'Strong', 'Popov', 'Wainwright', 'Jablonski'];

// Shown under the crosshair when you look at a soldier.
export const REASONS = [
  'Enlisted to protect the innocent. You are not on the list.',
  'Enlisted for the dental plan.',
  'Thinks this planet was empty. Is looking at you.',
  'Was told the natives would be grateful.',
  'Has a speech ready for when you surrender.',
  'Two days from retirement. Bought a boat.',
  'Keeps a photo of the flag in a locket.',
  'Believes the briefing. All of it.',
  'Wrote "HERO" on own helmet in marker.',
  'Here to bring peace. Brought 900 rounds of it.',
  'Has never once wondered.',
  'Wondered once. Was given a pamphlet.',
  'Calls the moss "the green stuff". The moss is your aunt.',
  'Got a medal for landing. Wants another.',
];

// What the fleet writes down when one of them is sent back up alive.
export const RECORDS = [
  'fell heroically',
  'died as they lived: certain',
  'lost to an unprovoked defence',
  'vaporised (unverified) (alive)',
  'promoted to legend',
  'awarded a medal, posthumously, prematurely',
  'gave everything (was returned intact)',
  'last words: "we\'re the good guys"',
  'missing, presumed correct',
  'martyred, pending paperwork',
];

export const BARKS = {
  idle: [
    'You ever wonder if we\'re the... nah.',
    'Lovely planet. Shame about the locals living on it.',
    'Command says they had "cities". I say glowing rocks.',
    'Four million years and they never invented the flag. Sad.',
    'My translator keeps saying "please leave". Must be broken.',
    'I heard they don\'t even have a word for "ours". Savages.',
    'This moss is everywhere. Somebody should pave it.',
    'When this is over they\'ll thank us. They always thank us in the films.',
  ],
  spot: [
    'Contact! It\'s just standing there. Menacingly!',
    'There it is! Remember, we\'re the good guys!',
    'Hostile native on its own prop... on OUR property!',
    'It\'s coming right for the land we found!',
    'Eyes on the monster. It looks disappointed in us.',
    'For freedom! And for mineral rights!',
    'It\'s defending its home! Classic villain move!',
    'Monster sighted! It has the nerve to live here!',
  ],
  hurt: [
    'It hit me! Unprovoked!',
    'I\'m hit! Tell my mother I was right!',
    'Why is it so angry? We took the planet POLITELY!',
    'Ow! That\'s assault! We\'re the ones allowed to assault!',
    'It shot back! Nobody said it would shoot back!',
  ],
  ally: [
    '{name}\'s gone! Vaporised! Probably!',
    'They got {name}! {name} had a boat picked out!',
    'Another hero lost to the monster\'s cruel bubble!',
    'Don\'t look at the bubble! Command says the bubble isn\'t real!',
    '{name}! No! Avenge now, grieve at the ceremony!',
    'It took {name}! It didn\'t even hate doing it!',
  ],
  hitYou: [
    'Got it! Justice is served!',
    'Hit confirmed! History will thank us!',
    'Take that, you four-million-year-old... wait, how old?',
    'That one\'s for everybody you looked at funny!',
  ],
  stunned: [
    'It LOOKED at me! I feel judged!',
    'It\'s doing the stare! Don\'t make eye contact!',
    'I suddenly remember every mistake I\'ve made!',
    'It\'s like my grandmother, but taller!',
  ],
  blink: [
    'It teleported! That\'s cheating! We only use air support!',
    'Where did it go? Monsters aren\'t supposed to be clever!',
    'It moved! Somebody tell it to hold still and be evil!',
  ],
  flee: [
    'Fall back! Heroically!',
    'Tactical retreat! This still counts as a win!',
    'I\'m advancing in the other direction!',
  ],
  broke: [
    'It broke the {thing}! Does it have ANY respect for property?',
    'That {thing} was taxpayer equipment, you animal!',
    'The {thing}! It had a name! It was "the {thing}"!',
    'Vandal! That {thing} was here for nearly a week!',
  ],
  dropship: [
    'Reinforcements inbound. Stay righteous, people.',
    'Dropship on station. Deploying freedom.',
    'More heroes coming down. We have plenty.',
  ],
  blocked: [
    'Shield holds! Says PEACE right on it!',
    'Bounced off! Peace through plexiglass!',
  ],
  sniper: [
    'I\'ve got the shot. Somebody write down what I say next.',
    'Lining up. This is for civilisation. Ours.',
  ],
  mech: [
    'Liberator online. Stomping for a brighter tomorrow.',
    'Big steps for mankind. Mind the natives.',
    'Rockets away! Each one is hand-signed "sorry not sorry"!',
  ],
  drone: [
    'CITIZEN. YOU ARE TRESPASSING ON LAND WE ARRIVED AT.',
    'PLEASE REMAIN CALM. YOU ARE BEING LIBERATED.',
    'THIS DRONE COMES IN PEACE. FIRING.',
    'YOUR FEEDBACK MATTERS. PLEASE HOLD STILL.',
  ],
  turret: [
    'SENTRY ACTIVE. HAVE A NICE DAY. TARGET ACQUIRED.',
  ],
  youDown: [
    'It\'s down! We did it! Somebody get a camera!',
    'Monster slain! Again! It keeps being slain!',
  ],
};

// Your name on their boss bar, one per mission.
export const DESIGNATIONS = ['UNIDENTIFIED WILDLIFE (LARGE)', 'HOSTILE FAUNA', 'THE BEAST OF LIBERTY RIDGE', 'DREAD OVERLORD (PROBABLY)', 'FINAL BOSS'];

export const SIGNS = {
  landed: ['LIBERTY', 'HAS LANDED'],
  ourland: ['THIS LAND IS OUR LAND', '(effective immediately)'],
  days: ['DAYS SINCE WE WERE', 'THE BAD GUYS:  ∞'],
  seesay: ['SEE SOMETHING NATIVE?', 'SAY SOMETHING.'],
  peace: ['WE COME IN PEACE', '(shoot to kill)'],
  parking: ['FUTURE SITE OF:', 'PARKING'],
  rig: ['FREEDOM RIG 7', 'drilling for a better tomorrow'],
  sanctuary: ['NATIVE WILDLIFE SANCTUARY', 'they\'re happier in here'],
  feed: ['PLEASE DO NOT FEED', 'THE CIVILISATION'],
  air: ['FRESH AIR IS A HUMAN RIGHT', '(humans only)'],
  flag: ['WOULD THE BAD GUYS', 'HAVE A FLAG THIS NICE?'],
  mess: ['HEROES\' MESS HALL', 'taco tuesday'],
  started: ['REMEMBER:', 'THEY STARTED IT BY BEING HERE'],
  proud: ['CAPT. STERLING SAYS:', '"I\'M PROUD OF ME"'],
  accomplished: ['MISSION ACCOMPLISHED', '(pending)'],
  grateful: ['ONE DAY THEY\'LL', 'THANK US'],
  moss: ['KEEP OFF THE MOSS', '(it stains)'],
};

// Datapads to pick up, three per mission. Read them in the Conclave under Intercepts.
export const LOGS = [
  // 1
  { id: 'a1', who: 'Pvt. D. Kowalski', title: 'Day One', text: 'Landed on a paradise. Purple sky, glowing trees, giant carved towers everywhere. Sarge says it\'s uninhabited. I asked who carved the towers. Sarge says wind.' },
  { id: 'a2', who: 'Sgt. B. Hardcastle', title: 'Re: The Tall One', text: 'A local approached the perimeter today holding a small flat object. It bowed. I know a threat display when I see one. Requesting more guns.' },
  { id: 'a3', who: 'Survey Tech Peg Finch', title: 'Beacon placement', text: 'Planted Beacon Deborah in a nice soft patch of moss arranged in neat rows with little stone markers. No idea why the soil here is so rich. Great spot.' },
  // 2
  { id: 'b1', who: 'Rig Chief E. Gunderson', title: 'Freedom Rig 7, shift log', text: 'Hit water at 400 metres. It was glowing and, the lads swear, humming a tune. Pumped it into the settling pond. Tune stopped. Morale high.' },
  { id: 'b2', who: 'Cpl. T. Brubaker', title: 'Something weird', text: 'Kowalski is in the cafeteria. I watched Kowalski get vaporised on Tuesday. He says a bubble picked him up and put him down by the salad bar. Command says he is a clone sent to confuse us. He knew my birthday.' },
  { id: 'b3', who: 'Fleet Morale Office', title: 'MEMO: The Bubble', text: 'Personnel are reminded that the so-called "bubble" is a weapon of terror. The fact that everyone it hits turns up unharmed on Deck 4 is exactly the kind of trick a monster would pull.' },
  // 3
  { id: 'c1', who: 'Warden L. Pruitt', title: 'Sanctuary intake', text: 'Collected three elderly specimens from a "library". Placed in Habitat A with a tyre swing and enrichment pellets. They have not used the tyre swing. One of them corrected my spelling.' },
  { id: 'c2', who: 'Dr. A. Lindqvist', title: 'Field notes', text: 'Specimen 2 drew a complete star chart of our home system in the dirt, labelled, with our own names for things. Fascinating instinct. Much like how a bird builds a nest.' },
  { id: 'c3', who: 'Spc. Y. Tanaka', title: 'Overwatch, night', text: 'Watched the big one through the scope for an hour. It was watering something. Then it looked straight at me from two kilometres and sort of sighed. I\'ve been sighed at by experts and that was the best one.' },
  // 4
  { id: 'd1', who: 'Atmospherics Lead R. DeLuca', title: 'Fresh Air Initiative', text: 'Processor 1 is live. The air now smells like home, which is to say a car park. The glowing forest downwind has gone grey. Probably seasonal.' },
  { id: 'd2', who: 'Fleet Chaplain', title: 'Sermon notes', text: 'Point one: we are the good guys. Point two: see point one. Point three: if anyone asks who was here first, remind them that "first" is a matter of perspective and we have the better perspective.' },
  { id: 'd3', who: 'Lt. V. Rockwell', title: 'Liberator pilot log', text: 'The natives have sent a formal letter. Forty pages, footnoted, offering us the southern continent for free. Intel says it\'s a trap. Why else would they be nice? Loaded extra rockets.' },
  // 5
  { id: 'e1', who: 'Capt. Buck Sterling', title: 'Captain\'s log', text: 'The monster comes for me at last. I have prepared three speeches: one for the fight, one for my second wind and one for when I win. I did not prepare one for losing. Heroes don\'t.' },
  { id: 'e2', who: 'Comms Officer K. Mbeki', title: 'Unsent', text: 'Sir, the translator was never broken. I checked it nine times. They have been saying "please" this whole time. I am putting this in a drawer.' },
  { id: 'e3', who: 'Pvt. D. Kowalski', title: 'Deck 4', text: 'Bubbled for the fourth time. I\'ve stopped being scared. It\'s quite gentle. There are two hundred of us up here now and the tacos are good. I think the monster might be a gardener.' },
];

export const SPEAKERS = {
  oon: { name: 'Speaker Oon-Vael', title: 'Voice of the Conclave. Has chaired it for 600,000 years.', color: '#7fe8d4' },
  thess: { name: 'Archivist Thess', title: 'Keeper of the Ninth Ledger. Corrects people.', color: '#d9a6ff' },
  moth: { name: 'Elder Moth', title: 'Of the Eighth Stair. Recently a zoo exhibit.', color: '#ffc27a' },
  you: { name: 'You', title: 'Groundskeeper of the Ancestor Lawn. 41,000 years in the post.', color: '#b8f5ff' },
  sarge: { name: 'Sgt. Brock Hardcastle', title: 'United Earth Settlers. Landing party.', color: '#ffb057', human: true },
  sterling: { name: 'Capt. Buck Sterling', title: 'Hero of the Colony Fleet. Not wearing a helmet.', color: '#ffd24a', human: true },
  translator: { name: 'UES FIELD TRANSLATOR v1.0', title: '', color: '#ff6a55', human: true },
};

export const INTRO = [
  { who: 'oon', text: 'Groundskeeper. Thank you for coming up from the Lawn. I know it is watering season.' },
  { who: 'oon', text: 'A fleet has arrived from another galaxy. They call themselves "humans". They are about three hundred thousand years old and they have named our world "Liberty Prime".' },
  { who: 'thess', text: 'For the record, we have been here four million, one hundred and six thousand years. I have the receipts. I have ALL the receipts.' },
  { who: 'oon', text: 'They have landed on the Ancestor Lawn. They are quite sure they are the heroes of this. We have checked. We cannot find the part where that is true.' },
  { who: 'oon', text: 'You know the Lawn. Take the Returner. It harms no one. It simply puts them back where they came from.' },
  { who: 'you', text: '...They are standing on my great-grandmother.', choices: ['I will ask them to leave.', 'I will ask them to leave, firmly.'] },
];

export const DEBRIEFS = [
  {
    ours: ['Note delivered. Note was shot.', 'Three metal sticks removed from Great-Grandmother.', 'All visitors returned to their vessel unharmed.'],
    head: 'UNPROVOKED!', sub: 'Peaceful landing party ambushed while peacefully claiming planet',
    body: 'Witnesses say the monster "screeched threats" before attacking. The witnesses were, to be clear, vaporised, and gave their statements from Deck 4.',
    ticker: ['Survey beacons Hope, Faith and Deborah remembered as heroes', 'Fleet chaplain confirms: still the good guys', 'Weather on Liberty Ridge: ours'],
  },
  {
    ours: ['The hole in the aquifer has been asked to stop.', 'The machine fell over.', 'The aquifer is older than their species. It is humming again.'],
    head: 'FREEDOM RIG 7 MARTYRED', sub: 'Beloved drill was only six days old',
    body: '"It had so much drilling to live for," said Rig Chief Gunderson, reached by this reporter on Deck 4, where he insists he is not a clone.',
    ticker: ['Candlelight vigil for rig tonight, bring own candle', 'Glowing water "probably fine": experts', 'Monster still at large, still tall'],
  },
  {
    ours: ['Three Elders released from the "Sanctuary".', 'Elder Moth reports the food was pellets.', 'The tyre swing has been returned to orbit with the rest.'],
    head: 'MONSTER RAIDS WILDLIFE SANCTUARY, STEALS WILDLIFE', sub: 'Specimens were "thriving, probably", says warden',
    body: 'The rescued creatures had been enjoying a tyre swing and regular pellets. "One of them corrected my spelling," said Warden Pruitt. "You don\'t get that in the wild."',
    ticker: ['Liberator walker "resting" after encounter', 'Poll: 104% of fleet believes we are the good guys', 'Kowalski sighted in cafeteria again, security alerted'],
  },
  {
    ours: ['The sky has been returned to its original recipe.', 'The forest downwind is glowing again.', 'They may breathe on the southern continent. The offer stands.'],
    head: 'BEAST DESTROYS AIR ITSELF', sub: 'Fresh, breathable freedom-air replaced with "whatever was here before"',
    body: '"This is what hatred looks like," said an atmospherics spokesman, pointing at a meadow. Forty-page letter from natives dismissed as "suspiciously reasonable".',
    ticker: ['Captain Sterling to address fleet: "I have three speeches"', 'Southern continent "probably a trap"', 'Deck 4 now at capacity, tacos extended to Wednesday'],
  },
  {
    ours: ['Captain Sterling returned to orbit after three farewell speeches.', 'Total visitors harmed: none. Total visitors returned: all.', 'The Lawn needs watering.'],
    head: 'VICTORY!', sub: 'Hero drives off monster by strategically ascending into orbit',
    body: 'Captain Sterling, speaking from Deck 4, confirmed that he won. "It looked at me with those ancient eyes and I saw fear," he said. Asked whose fear, he ended the interview.',
    ticker: ['Fleet to remain in orbit "as a show of strength"', 'Natives send fruit basket, analysts suspicious', 'Sterling memoir "I Was Right" out next month'],
  },
];

export const ENDINGS = [
  { pick: 'Offer them the southern continent. Again.', text: 'The fleet debated it for eleven years, then landed on the southern continent and declared they had conquered it. You sent a card. Speaker Oon says they are young, and to give them a million years.' },
  { pick: 'File a formal complaint with their galaxy.', text: 'The complaint ran to 9,000 pages with an index. It was received by a civilisation of sentient gas who wrote back: "Oh no, are they doing it AGAIN?" Help is expected within the epoch.' },
  { pick: 'Say nothing. Go back to the Lawn.', text: 'You watered the moss. Great-Grandmother came in thicker than ever where the beacon had been. In orbit, two thousand humans ate tacos and told each other they had won. Everyone, for once, was happy.' },
];

export const DEATH_HEADS = ['MONSTER SLAIN!', 'MONSTER SLAIN (AGAIN)!', 'BEAST DEFINITIVELY DEAD THIS TIME', 'IT\'S OVER! (IT\'S THE SAME ONE)', 'MONSTER KILLED FOR GOOD, SAY SOURCES'];
