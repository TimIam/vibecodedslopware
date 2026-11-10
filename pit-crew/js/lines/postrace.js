// Radio after the flag, while the rest of the field finishes. Picked by how our best car did:
// WIN (P1), PODIUM (P2-P3), MIDDLE (P4-P7), POOR (P8 and below, or out), and DOUBLE when both
// cars stand on the podium. {d}/{drv}/{n}/{p} are the best car's driver, person, number and
// position; {e} and {q} are the other car's driver and position; {x} is the track.

export const WIN = [
  [['dev', "Chequered flag. {d} wins at {x}. P1."], ['{drv}', "P1? Say it again, Dev."], ['dev', "P1."], ['{drv}', "Once more, for the microphone."]],
  [['mags', "Winners. Everybody put your gloves down slowly and nobody cry on the guns."], ['toby', "Too late."]],
  [['boss', "Hargreaves here. I would like it noted that I never doubted this team."], ['mags', "You doubted us at breakfast."], ['boss', "Breakfast was a long time ago."]],
  [['{drv}', "That last stop won it. Who was on the left rear?"], ['toby', "Me! It was me!"], ['lou', "He has been waiting all season for someone to ask."]],
  [['dev', "{d} takes the win. Cool-down lap, {d}. Don't do donuts, the tyres are borrowed."], ['{drv}', "Borrowed from who?"], ['dev', "The sponsor's insurance."]],
  [['pip', "Do winners get a bigger fuel rig?"], ['mags', "Winners get a bigger cheque. The fuel rig stays the size it is."], ['pip', "Worth asking."]],
  [['lou', "Barbara and I would like to thank our families."], ['mags', "Barbara is a jack, Lou."], ['lou', "She has a family. Other jacks."]],
  [['dev', "Race win, car {n}. Strategy, stops, pace, all of it."], ['mags', "Mostly the stops."], ['dev', "Mostly the stops."]],
];

export const PODIUM = [
  [['dev', "P{p} for {d}. That's a podium at {x}."], ['toby', "Can we go up? Do the crew go up?"], ['mags', "One of us goes up. It won't be you, Toby."]],
  [['{drv}', "Podium! Did you see the pass on the last lap?"], ['dev', "I saw it on four screens."], ['{drv}', "Was it good on all four?"]],
  [['mags', "P{p}. Trophies get handed out, and somebody else gets the big one. Not today, but soon."], ['lou', "Soon is my favourite day."]],
  [['boss', "A podium. The sponsors will want photographs."], ['pip', "Of us?"], ['boss', "Of the car. Stand slightly out of shot, Pip."]],
  [['dev', "{d} home in P{p}. Good points, good stops, no fires."], ['pip', "There was one small fire."], ['dev', "No fires that made television."]],
  [['toby', "P{p}! I'm putting it in the group chat."], ['mags', "The group chat is all of us, Toby. We were here."], ['toby', "It's for the record."]],
  [['{drv}', "Not the win, but I'll take the champagne."], ['lou', "Spray some our way. It's very hot in these suits."]],
  [['dev', "Chequered flag. P{p}. Cool-down lap, {d}, and wave at the grandstand."], ['{drv}', "Which side?"], ['dev', "The side with people."]],
  [['mags', "Podium. That's the third step of a staircase we've been building all season."], ['toby', "Is the top step next?"], ['mags', "That is how stairs work."]],
  [['pip', "Do we get a trophy each?"], ['boss', "The team gets a trophy. Each of you gets my sincere nod."], ['pip', "Brilliant."]],
];

export const MIDDLE = [
  [['dev', "{d} takes the flag in P{p}. Points, but no fireworks."], ['pip', "I can do fireworks."], ['mags', "No."]],
  [['mags', "P{p}. A day's work. Not a story for the grandkids, but a day's work."], ['lou', "My grandkids love P{p} stories."]],
  [['{drv}', "P{p}. The car had more in it."], ['dev', "So did the drinks bottle. You forgot to drink."], ['{drv}', "I was busy."]],
  [['boss', "P{p}. Neither good nor bad. I shall describe it to the board as 'promising'."], ['mags', "The board is your cat."], ['boss', "She is a very discerning cat."]],
  [['dev', "Chequered flag, P{p}. Middle of the pack. Statistically very average."], ['toby', "Average is good, right?"], ['dev', "Average is average, Toby."]],
  [['lou', "P{p}. Could be worse."], ['mags', "Could be better."], ['lou', "Could be raining."]],
  [['toby', "We beat some people!"], ['mags', "We did, Toby. And some people beat us."], ['toby', "Let's not talk about them."]],
  [['dev', "{d} home in P{p}. We lost about two tenths a stop to the cars ahead."], ['mags', "Two tenths. We'll find them."], ['lou', "I'll look under the trolley."]],
  [['{drv}', "Cool-down lap. Anyone want anything from the far side of the circuit?"], ['pip', "A sandwich."], ['{drv}', "I'm in a racing car, Pip."]],
  [['pip', "P{p}. I didn't set anything on fire, so that's a personal best."], ['mags', "Write it on the board."]],
  [['dev', "Points for car {n}. P{p}. Solid, unspectacular, filed under 'fine'."], ['boss', "I have a very large file marked 'fine'."]],
  [['mags', "P{p}. Pack the guns, check the jacks, home for tea."], ['lou', "And biscuits?"], ['mags', "Biscuits are for podiums."]],
];

export const POOR = [
  [['dev', "Chequered flag. {d} finishes P{p}."], ['{drv}', "Sorry, everyone."], ['mags', "Not on you, {d}. We win and lose as a crew."]],
  [['mags', "P{p}. We'll watch it back tonight and fix one thing. Just one."], ['toby', "Which one?"], ['mags', "We'll know when we see it."]],
  [['boss', "Hargreaves here. I have seen better results. Mostly from other teams."], ['mags', "Thank you, Hargreaves."], ['boss', "I'm here all week."]],
  [['lou', "P{p}. Barbara is taking it hard."], ['mags', "The jack is fine, Lou."], ['lou', "She's putting on a brave face."]],
  [['dev', "{d} home in P{p}. Let's call it a data-gathering exercise."], ['pip', "What did we gather?"], ['dev', "That we need more data."]],
  [['{drv}', "That's a long way back. Did we have a plan?"], ['dev', "We had several. They all lost."]],
  [['toby', "Did we at least do a nice stop?"], ['mags', "One of them was lovely, Toby. Hold on to that one."]],
  [['pip', "Look on the bright side. Nobody caught fire."], ['mags', "That's the bright side?"], ['pip', "It's a very small side."]],
  [['dev', "P{p}. The good news is there's nowhere to go but up."], ['lou', "We could go down."], ['dev', "There's one place to go but up, Lou."]],
  [['boss', "When the sponsors ask, it was a strategic finish."], ['toby', "What was the strategy?"], ['boss', "Not finishing higher. For reasons."]],
  [['mags', "Gloves off. Heads up. Nobody throws a wheel gun."], ['lou', "Can I throw a small one?"], ['mags', "Lou."]],
  [['{drv}', "The car was fine. I was not fine."], ['dev', "Copy. Get some sleep, {d}. We go again next week."]],
];

export const DOUBLE = [
  [['dev', "Both cars on the podium! {d} P{p} and {e} P{q}!"], ['mags', "Everybody breathe. Then shout."], ['toby', "AAAAAH."]],
  [['boss', "Two cars on the podium. I may need to sit down."], ['mags', "You were sitting down."], ['boss', "Then I may need to sit down harder."]],
  [['{drv}', "P{p} and {e} right behind me. Who wants the champagne first?"], ['lou', "The crew. The crew wants it first."]],
  [['dev', "Double podium at {x}. That's not happened since, well, ever."], ['pip', "Since ever?"], ['dev', "Since the start of my spreadsheet."]],
  [['mags', "Two cars, two podiums, eight sets of tyres, no wheels left on the lane."], ['toby', "I found a wheel nut in my pocket."], ['mags', "Keep it. It's a souvenir."]],
  [['lou', "Two trophies. Barbara will need a bigger shelf."], ['mags', "Barbara doesn't have a shelf."], ['lou', "She will now."]],
  [['toby', "Both of them! BOTH of them!"], ['dev', "We know, Toby. We were all watching."], ['toby', "BOTH!"]],
  [['pip', "Two podiums means two lots of champagne, which is basically fuel."], ['mags', "It is not fuel."], ['pip', "It's fuel for the soul."]],
  [['boss', "Hargreaves to the crew. Both cars on the podium. Take the evening off."], ['mags', "We're already off. The race is over."], ['boss', "Take it off more."]],
  [['{drv}', "P{p} and P{q}. Tell {e} I'm keeping the bigger trophy."], ['dev', "{e} says it's a team trophy."], ['{drv}', "Tell {e} I'm keeping the team's bigger trophy."]],
];
