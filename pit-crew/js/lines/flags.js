// White flag radio. {r} = the team involved (Krone, Rossa...), {c} = that driver's surname.
// INCIDENT plays the moment the flag comes out, BOX is the call to take the cheap stop,
// CLEAR is the restart.

export const INCIDENT = {
  crash: [
    [['dev', 'BINNED IT! {r} have binned it at turn four. White flag is out.'], ['lou', 'Ooh. That is a lot of carbon fibre.']],
    [['dev', '{c} shunted! Hard into the barrier. Driver is out and walking. White flag.'], ['mags', 'Walking is good. Crew, get ready.']],
    [['toby', 'Was that a {r}? Is that a {r} in the wall?'], ['dev', '{r} have binned it. {c} is out of the race. White flag, white flag.']],
    [['dev', 'Big shunt for {c}. The {r} is in the gravel and staying there. White flag.'], ['pip', 'I felt that one from here.']],
    [['nico', 'Crash ahead! A {r} just went straight on into the tyres!'], ['dev', 'Copy. {c} is out of the car and fine. White flag is out.']],
    [['dev', '{r} have binned it! {c} lost the rear on the kerb. White flag, field is slowing.'], ['boss', 'Tragic. For them. Wonderful for us.']],
    [['sanna', 'Car in the wall. {r}. It is finished.'], ['dev', 'Copy, Sanna. {c} has shunted. White flag.']],
  ],
  stranded: [
    [['dev', '{c} has stopped on track. The {r} is smoking. White flag.'], ['lou', 'Poor thing. It just wanted a rest.']],
    [['sanna', 'A {r} is parked on the racing line. No power, it looks like.'], ['dev', '{c} is stranded. Marshals are out. White flag.']],
    [['dev', 'Engine failure for {c}. The {r} is done for the day. White flag while they push it clear.'], ['mags', 'That is why we check the bolts twice.']],
    [['dev', '{c} has coasted to a halt. Gearbox, by the sound of it. White flag.'], ['toby', 'Oh. That is a sad noise.']],
    [['pip', 'There is a {r} on fire at the hairpin. Not my fire.'], ['dev', '{c} is out and safe. White flag. And Pip, noted.']],
  ],
  debris: [
    [['dev', "Debris on the main straight. Bits of somebody's front wing. White flag."], ['lou', 'Not ours. I counted.']],
    [['nico', 'There is a whole endplate in the middle of the track!'], ['dev', 'Copy, marshals are on it. White flag is out.']],
    [['dev', 'White flag. A carbon panel is lying at turn one. Field slowing down.'], ['toby', 'I hope whoever owns it has a spare.']],
    [['sanna', 'Debris. Large. Turn six.'], ['dev', 'Seen. White flag. Thank you, Sanna.']],
    [['dev', 'Somebody shed a mirror on the straight. White flag while they sweep it.'], ['mags', 'A mirror. Seven years of slow stops for them.']],
  ],
  animal: [
    [['nico', 'There is a dog on the track! A small, very fast dog!'], ['dev', 'White flag. Marshals are chasing the dog. The dog is winning.']],
    [['dev', 'We have a goose on the circuit. I repeat, a goose. White flag.'], ['lou', 'My mother warned me about geese.']],
    [['sanna', 'Seagulls on the racing line. Many. They will not move.'], ['dev', 'White flag while the marshals negotiate.']],
    [['dev', 'White flag. There is a cat sitting on the start line, washing itself.'], ['boss', "Is it a sponsor's cat? Find out if it is a sponsor's cat."]],
    [['toby', 'Is that a fox? On the track? It has a sandwich.'], ['dev', 'It is a fox. White flag until the fox leaves. With its sandwich.']],
  ],
  oil: [
    [['dev', 'Oil down at turn three. Someone has left half their engine on the track. White flag.'], ['pip', 'Not fuel. Oil. Different department.']],
    [['nico', 'The track is shiny at the chicane. Shiny is bad, right?'], ['dev', 'Shiny is bad. Oil spill. White flag while they dust it.']],
    [['dev', 'White flag. A {r} has sprayed oil all the way through the final sector.'], ['mags', 'Messy. Everybody stay off the shiny bits.']],
    [['sanna', 'Oil. Very slippery. I almost had a moment.'], ['dev', 'Copy. White flag is out for the clean-up.']],
    [['dev', 'Fluid on the racing line at turn nine. White flag, marshals with brooms.'], ['toby', 'I would love a turn with the broom.']],
  ],
};

export const BOX = [
  [['dev', 'White flag means a cheap stop. Box this lap if you want it. Tyres and fuel ready.'], ['mags', 'Crew out! Everybody ready!']],
  [['dev', 'The field is crawling. A stop now costs half as much. Call them in, crew.'], ['toby', 'Tyres on the trolley! Both sets!']],
  [['mags', 'Free stop, people! White flag! Get the cars in!'], ['dev', 'Agreed. Box now and we lose almost nothing.']],
  [['dev', 'Box, box, box. The white flag window is open. Fresh tyres for nothing.'], ['lou', 'Barbara is warmed up and willing.']],
  [['boss', 'Is this the moment? This feels like the moment.'], ['dev', 'It is the moment. White flag. Box the cars now.']],
  [['dev', 'Half the field is pitting under the white flag. We should too. Call them in.'], ['pip', 'Hose is hot. Bring them to me.']],
  [['nico', 'White flag! Do you want me in?'], ['dev', 'Yes. Box this lap. Cheapest stop of the day.']],
  [['sanna', 'White flag. Box?'], ['dev', 'Box. Now. This is a gift.']],
];

export const CLEAR = [
  [['dev', 'Track is clear. Green flag. Racing again.']],
  [['dev', 'Marshals are off. Green flag. Push now.'], ['nico', 'Finally!']],
  [['dev', 'White flag is in. Back to full speed.'], ['mags', 'Reset the box. The next stop could come quick.']],
  [['dev', 'Green, green, green. We are racing.'], ['toby', 'I love that bit.']],
  [['dev', 'All clear. The field is going again. Watch the tyres on the restart.']],
];
