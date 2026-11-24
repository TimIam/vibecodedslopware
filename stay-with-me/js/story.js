// The words between the calls: difficulty definitions, shift briefings, what Dee says in the cab on the way, what she
// says afterwards, and the endings. Keep the voice plain. Dee is dry, kind underneath, and never explains a joke.

export const DIFFICULTY = {
  student: { id: 'student', name: 'Ride-along', blurb: 'Learning the job. Dee talks you through it.', points: ['Dee prompts you when you miss something', 'Doses shown in mg as you draw up', 'Labelled anatomy and depth gauge in procedures', 'Patients deteriorate more slowly', 'The 12-lead prints its own interpretation'],
    rate: 0.75, forgiving: 1, hints: true, showDose: true, gauge: 0, xray: true, interpret12: true, gps: true, oblivious: 0.05, traffic: 0.8, metronome: true, passMark: 55 },
  paramedic: { id: 'paramedic', name: 'Paramedic', blurb: 'The job as it is. Nobody tells you what the rhythm is.', points: ['No prompts: Dee does what you ask', 'You read the ampoule and do the arithmetic', 'The depth gauge shows only where you have been', 'Real-time deterioration', 'Some drivers do not hear the siren'],
    rate: 1, forgiving: 0, hints: false, showDose: false, gauge: 1, xray: false, interpret12: false, gps: true, oblivious: 0.14, traffic: 1, metronome: true, passMark: 60 },
  critical: { id: 'critical', name: 'Critical Care', blurb: 'Sicker patients, less help, and you find your own way there.', points: ['No route line: street names and a map', 'No depth read-out: feel and sound only', 'Faster deterioration', 'No CPR metronome', 'Heavier, less attentive traffic'],
    rate: 1.2, forgiving: 0, hints: false, showDose: false, gauge: 2, xray: false, interpret12: false, gps: false, oblivious: 0.24, traffic: 1.25, metronome: false, passMark: 65 },
  nsc: { id: 'nsc', name: 'No Second Chances', blurb: 'Critical Care rules. One avoidable death ends your career.', points: ['Everything in Critical Care', 'No depth gauge at all', 'A patient who dies of your error is the last patient you treat'],
    rate: 1.2, forgiving: 0, hints: false, showDose: false, gauge: 3, xray: false, interpret12: false, gps: false, oblivious: 0.24, traffic: 1.25, metronome: false, passMark: 65, permadeath: true },
};

// Shift briefings. `radio` lines render in the dispatcher's monospace.
export const BRIEF = {
  1: { title: 'First Day', text: [
    'Station 4 is a two-bay brick box on the wrong side of the river from everything the county has spent money on since 1988. The coffee machine has a hand-written sign on it. The sign says <i>NO</i>.',
    'Your partner is Deandra Okafor: EMT, twenty-two years on this truck, fourteen of them with a medic called Ray Castellano who is not here any more and whose locker nobody has emptied. She looks at your boots, then at your face, then at the clock.',
    '"I drive like I\'m carrying my mother. You\'re the medic, so today you drive, and I get to find out how you carry mine. I do airways, compressions, monitors, and I hold things. Needles and drugs are yours. If I say a thing twice, I mean it. Call me Dee."',
    'She tosses you the keys. "They call you Rook until you save one. That isn\'t me being unkind. That\'s just how it works here."'],
    radio: 'Medic 14, Ketter County. Radio check.' },
  2: { title: 'The Old Pen', text: [
    'There is a memo on the board from the County Commissioner\'s office, subject line <i>Station Consolidation Review</i>. Somebody has drawn a small tombstone on it in biro.',
    '"Every three years," Dee says, not looking at it. "They count our minutes. We\'re the slow truck because we\'re the far truck. Do the job in front of you. The minutes are the minutes."',
    'She has left a second coffee on the dash. It is on your side.'],
    radio: 'Medic 14, you\'re first due for the east bank until further notice. Medic 9 is out of service, mechanical.' },
  3: { title: 'Nights', text: [
    'Nights. The town thins out to sodium light and the people who are awake for a reason. Dee does the rig check with a torch in her teeth and the drug count out loud.',
    '"Ray used to say nights are honest. Nobody calls at three in the morning because they\'re bored." She clicks the laryngoscope blade open, checks the bulb, clicks it shut. "He said a lot of things."',
    'You ask what happened to him. She says, "Kessler Bridge. Two winters back. A kid went in the river off the south walkway and Ray went in after. They both came out. One of them stayed out." She closes the cabinet. "He hands out trolleys at the FreshWay now. He\'s fine. He\'s completely fine."'],
    radio: 'Medic 14, be advised, Engine 4 is committed at a structure fire. You have no manpower backup until they clear.' },
  4: { title: 'Weather Coming', text: [
    'The forecast is a week of rain coming in off the coast, and the light over the river has gone the colour of a bruise. Dee is in a good mood, which you are learning to distrust.',
    '"Three things kill people between the ribs," she says, apropos of nothing, pulling out of the bay. "The lung, the heart, and the medic who went in under the rib instead of over it. There\'s an artery tucked under every one. Over the top. Say it."',
    'You say it. "Again on Thursday," she says.'],
    radio: 'All units, weather advisory in effect from 1900. Expect surface water on Route 9 and the bridge approaches.' },
  5: { title: 'Time Is Brain', text: [
    'Fog. It sits in the streets like something poured. The lights at Alder and Fifth change colour for nobody.',
    'The review board met last night. Dee has the printout: response times by unit, Medic 14 at the bottom, your shifts highlighted by someone with a ruler. "They\'ve got a column for how long we took," she says. "They have not got a column for whether it was any good. I asked. There isn\'t one."',
    'She folds it into quarters and puts it under the coffee machine, where it stops the wobble.'],
    radio: 'Medic 14, visibility under a hundred metres on the east bank. Use caution. Use a lot of caution.' },
  6: { title: 'Monday, Wednesday, Friday', text: [
    'Rain, properly now. The wipers have a rhythm you could do compressions to.',
    'The decision is Friday. The station either stays or it becomes a "community paramedic response post", which Dee says is a car park with a sign. She has not said what she will do. You found a brochure for a campervan in the door pocket and put it back exactly as it was.',
    '"You\'ve stopped asking me things," she says, somewhere on Ferry Road. "That\'s either very good or very bad. I\'ll know by the end of the night."'],
    radio: 'Medic 14, welfare call holding at 218 Alder. Caller says, quote, "tell the new one it\'s Walt."' },
  7: { title: 'Kessler Bridge', text: [
    'The storm arrives at shift change and does not leave. The river is the colour of the road and the road is the colour of the sky. Route 9 is closed at the underpass; everything that moves tonight moves over Kessler Bridge.',
    'The vote was four to three. Station 4 stays, on a twelve-month review. Dee read the email twice, said "Huh," and went to check the oxygen.',
    'In the bay, with the rain hammering the roller door, she says, "I was going to tell you tonight that I\'m done. I had the speech and everything." She pulls her jacket on. "I\'m not done. Don\'t make it weird."',
    'The tones drop before you can.'],
    radio: 'All units, all units. Multiple reports, multi-vehicle collision, Kessler Bridge, mid-span. Medic 14, you are first due.' },
};

// Said in the cab on the way to each call (subtitled, a few seconds apart).
export const ENROUTE = {
  hypo: ['Alder Street. That\'ll be Walt. He calls when the kettle\'s lonely. Treat it as real every single time, because one time it is.', 'First rule: the address is a person. Second rule: so are you. Lights at the junction, look both ways anyway.'],
  stemi: ['Chest pain at the courthouse. Fifty-four. Sweating. That\'s the age and that\'s the word.', 'St. Brigid has the cath lab. Halloran General has a very nice vending machine. Know which one he needs before we load him.'],
  anaphylaxis: ['Used her own pen and she\'s still calling. So either it isn\'t working or it didn\'t work.', 'Two strengths of epi in the box, Rook. One goes in a muscle. One goes in a dead person. Read the label out loud if you have to.'],
  motorcycle: ['Bike versus car. The car always wins.', 'Blood on the floor first, then airway. I know what the book says. The book was written indoors.'],
  arrestGym: ['Working arrest, bystander CPR in progress, no engine company. So it\'s you and me and whoever\'s been pushing.', 'I\'ll take the chest. You own the monitor. Nobody touches him when you shock. You say clear and you LOOK.'],
  overdose: ['Starlite. Room twelve. No police. We go in together and we look at the floor before we kneel on it.', 'She isn\'t dying of heroin. She\'s dying of not breathing. Fix the thing that\'s killing her.'],
  asthma: ['Nineteen, asthma, can\'t talk. The ones who can\'t talk are the ones who die.', 'If she gets quiet, that isn\'t better. Quiet is the last thing before nothing.'],
  seizure: ['Still seizing after five minutes. That\'s not a seizure any more, that\'s a problem.', 'Why is she seizing, though. That\'s the question nobody asks at the door.'],
  stabbing: ['Tran\'s on scene. If Tran says it\'s secure, it\'s secure. If Tran says two swings, count the holes.', 'Chest wounds lie. The one you can see is the one that wants you to stop looking.'],
  stroke: ['Stroke. Husband saw it happen. If he can give us a time, that time is worth more than anything in the bags.', 'We are not the treatment for this. The scanner is. Ten minutes on scene, Rook. I\'m timing you.'],
  choking: ['Choking, gone unconscious. Whatever\'s in there, the family already tried the obvious.', 'There\'s a blade in the airway roll you\'ve never used on a living person. Tonight might be the night. Middle of the neck. Not deep.'],
  hyperk: ['Walt again. He said to tell the new one. That\'s you. You\'ve been adopted.', 'He never calls for nothing twice in a row, though. Look at him properly.'],
  gsw: ['Shooting at the FreshWay. PD have it locked down.', 'Where it went in tells you what it hit. Middle of the chest is the box the heart lives in.'],
  triage: ['Six vehicles. You\'re command until somebody with more brass shows up. Do not treat. Sort.', 'Thirty seconds a patient. Walking, breathing, pulse, follows commands. The loud ones are fine. Find me the quiet ones.'],
  dee: [],
};

// Dee, in the cab afterwards.
export const AFTER = {
  good: ['That\'ll do.', 'Clean. I\'d ride with that.', 'Ray would\'ve been slower. Don\'t tell him.', 'You see how quiet it went when it was working? That\'s what right sounds like.'],
  ok: ['They\'re alive. We\'ll talk about the rest when I\'ve had a coffee.', 'Not pretty. It worked. Next time make it pretty.', 'You got there. You took the scenic route.'],
  bad: ['...I\'ll write the report. You sit there a minute.', 'We don\'t get them all. We do have to earn the ones we lose. Think about which that was.', 'I\'m not going to say anything. You already know.'],
  first: 'Okay. Not "Rook" then. I\'ll think of something.',
};

export const ENDINGS = {
  deeLives: { title: 'Day Shift', text: [
    'Dee Okafor spent nineteen days in St. Brigid Regional and complained about eighteen of them.',
    'She came back to Station 4 in the spring on restricted duty, which she interpreted as driving. The campervan brochure went in the recycling. Ray Castellano came to her first shift with a FreshWay cake that said <i>WELCOME BAK</i>, and stayed for the rig check, and counted the drugs out loud.',
    'The review column for "was it any good" was added in June. Nobody on the board remembers whose idea it was.',
    'They do not call you Rook.'] },
  deeDies: { title: 'Kessler Bridge', text: [
    'Deandra Okafor, EMT, was buried on a Thursday in the rain she always said she didn\'t mind. Three hundred uniforms stood on the grass. Ray Castellano read something short and did not get to the end of it.',
    'Her locker is next to his now. Nobody has emptied either one.',
    'Station 4 stays open. You have a new partner. She is twenty-three and she looks at your boots, then at your face, then at the clock.',
    'You toss her the keys.'] },
  career: { title: 'Certification Review', text: [
    'The letter from the medical director is one page long. It uses the words <i>pattern</i> and <i>preventable</i>. It thanks you for your service to Ketter County.',
    'Dee walks you to your car. She doesn\'t say it\'ll be fine. She says, "You know more than you did. That counts somewhere." Then she goes back in, because there\'s a truck to check.'] },
};

export const CREDITS = 'Stay With Me is a work of fiction. The medicine is simplified and compressed for play and must not be used as clinical guidance. With respect to the people who do this for real at three in the morning.';
