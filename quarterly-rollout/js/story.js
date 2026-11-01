// All of the game's words: the premise, each floor's briefing, the ending and the coworkers' lines.

export const TITLE = 'Quarterly Rollout';
export const PUBLISHER = 'Ambivalent Software';
export const PUBLISHER_TAGLINE = 'Probably fun. We are not entirely sure.';

export const PREMISE =
  '4:30 PM, the last day of the quarter. A rogue HVAC "rebalancing" has blown the Quarterly Report ' +
  'across six floors of Paperweight & Partners. Bea Swivelton, Associate (Interim), has half an hour, ' +
  'one squeaky office chair and a strict rule: never stand up.';

export const BRIEFINGS = {
  orientation: {
    speaker: 'Dale from Facilities',
    text: 'Ground rules, Bea. Push off with the arrow keys or WASD, and Space gives you a spin. ' +
      'Grab every page and the freight elevator unlocks. And stay seated: Old Squeaky\'s warranty is very specific.',
  },
  'break-room': {
    speaker: 'Dale from Facilities',
    text: 'Someone "fixed" the espresso machine. The linoleum is slick, the coffee is slicker, and BUFF-E is ' +
      'polishing all of it. If the robot gets close, spin into it: it needs a moment to reboot.',
  },
  'open-plan': {
    speaker: 'Velma Bottomline, VP of Outcomes',
    text: 'Bea. Pages. Elevator. Do not accept any meeting invites. Calendar Carl is circling, and he has ' +
      '"a quick sync". Watch the thumbtacks someone spilled by the supply cupboard.',
  },
  'print-room': {
    speaker: 'Dale from Facilities',
    text: 'The printers think it is still the second quarter. They lob paper jams at anything that moves. ' +
      'A good spin swats paper out of the air. Mind the cable nests, they grab the casters.',
  },
  'hvac-annex': {
    speaker: 'Dale from Facilities',
    text: 'This is where the wind came from. The vents push hard, so ride them instead of fighting them. ' +
      'And there is coffee on the floor again. Of course there is.',
  },
  'boardroom-run': {
    speaker: 'Velma Bottomline, VP of Outcomes',
    text: 'The board is seated. The projector is warm. Every page, Bea. Every. Single. Page.',
  },
};

export const ENDING = [
  'Velma clicks to the last slide. "...and that concludes the Quarterly Report."',
  'The board applauds, politely, for almost four seconds.',
  '"Bea," says Velma, "take Friday off. Actually, take the chair."',
  'Old Squeaky squeaks. It sounds like pride.',
];

export const CARL_LINES = ['Quick sync?', 'Circling back!', 'Got a sec?', 'Let\'s take this offline.', 'Per my last invite...', 'Hop on a call?'];

export const FAIL_LINES = {
  carl: 'Carl booked you into a three-hour alignment meeting.',
  bot: 'BUFF-E polished you right out of the building.',
  paper: 'Buried under a paper jam. Facilities has been notified.',
  tacks: 'Thumbtacks: 1. Composure: 0.',
  default: 'Composure depleted. Perhaps a short walk? (No. Stay seated.)',
};
