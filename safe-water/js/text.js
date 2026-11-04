// Every document the player can read. Narration is original; the 1909 comet remark is Twain's own.
export const DOCS = {
  letter: {
    kind: 'letter', title: 'A letter, left on the desk',
    body: `<p class="salut">To the party reading this, —</p>
<p>I am told a man's last chapter ought to be written in one place, at one sitting, by lamplight, with the cat on the desk. Mine has got away from me. It went into the pictures, the way things do at my age, and I can't follow it there. My knees have resigned.</p>
<p>There are three views by the stereoscope. Put one in the holder, look hard, and go where it takes you. Each of those places is keeping a page of mine. They will not give it up for nothing (the river never gave anybody anything for nothing), but they can be talked round by somebody who pays attention.</p>
<p>When you have all three, lay them by the machine and let it finish. The comet is coming up over the hill. I came in with it, and I have an engagement to go out with it, and I would hate to be late with the chapter undone.</p>
<p class="sign">Yours, in some haste for the first time in seventy-four years,<br>S. L. C.</p>`,
  },
  scopeCard: {
    kind: 'card', title: 'Printed on the pedestal',
    body: `<p class="caps">Patent Stereoscope</p><p>Place the view in the holder.<br>Apply both eyes to the hood.<br>Do not be alarmed.</p>`,
  },
  shelf: {
    kind: 'card', title: 'The bookshelf',
    body: `<p><i>The Innocents Abroad. Roughing It. The Adventures of Tom Sawyer. Life on the Mississippi. Adventures of Huckleberry Finn. A Connecticut Yankee in King Arthur's Court. Pudd'nhead Wilson.</i></p><p>A slip of paper tucked in the last one: <i>"Keep these where I can see them, so I know what not to write again."</i></p>`,
  },
  // ---- The river ----
  bixby: {
    kind: 'notebook', title: "The pilot's notebook",
    body: `<p class="caps">Hat Island crossing. Going down, at night.</p>
<p>Hug the larboard shore. Do <u>not</u> start across until the big cottonwood on the point is abreast of you, square off your larboard beam. A cub who starts early puts her on the bar, and I have backed two off it already this season.</p>
<p>Then put the jackstaff on the woodyard light and hold it there.</p>
<p>The water sets you down toward the bar on the crossing. Listen to the leads. Mark three and quarter less three, all good. Mark twain is safe water. Quarter less twain and you are scraping. Haul her off.</p>
<p>One tap of the big bell to go ahead. Hold the wheel steady; she steers like a barn but she answers.</p>
<p class="sign">H. B.</p>`,
  },
  leads: {
    kind: 'slate', title: "The leadsman's slate",
    body: `<table class="leads"><tr><td>M-A-R-K THREE</td><td>18 ft</td></tr><tr><td>QUARTER LESS THREE</td><td>16½</td></tr><tr><td>HALF TWAIN</td><td>15</td></tr><tr><td>QUARTER TWAIN</td><td>13½</td></tr><tr><td>M-A-R-K TWAIN</td><td>12</td></tr><tr><td>QUARTER LESS TWAIN</td><td>10½</td></tr></table><p class="chalk">She draws 9. Sing out loud.</p>`,
  },
  pageRiver: {
    kind: 'page', title: 'Chapter the Last, page one',
    body: `<p>I learned the river once. I learned it the way you learn a face, every dimple and scar of it, by daylight and by dark, coming up and going down, which are two different rivers, and the Lord help the cub who thinks otherwise.</p>
<p>A pilot does not look at water; he reads it. Where a passenger sees a pretty ripple, a pilot sees a bluff reef that would tear the bottom out of her. I gave up the poetry of it for the knowledge, and I have never been sure it was a fair trade. But I would make it again tonight for one more crossing with the leads singing <i>mark twain, mark twain</i>, and safe water all the way down.</p>`,
  },
  // ---- The cave ----
  tom: {
    kind: 'scrawl', title: 'Scratched on a scrap of wallpaper',
    body: `<p>Becky and me come out the far hole, five mile down the river. To find it again:</p>
<p>At every forks, hold your candle out and turn round slow. Where the flame stands up tall and quiet, that is the way you come in. Where she lies over sideways, that's just a draft going by. But where she <u>squats down and fights</u> you, that is the cave breathing in at you from the far hole. Go that way.</p>
<p>Don't tell Huck about the money, he will want halves.</p>
<p class="sign">T. S.</p><p>P.S. it is under the cross</p>`,
  },
  pageCave: {
    kind: 'page', title: 'Chapter the Last, page two',
    body: `<p>Every boy in that town had smoked his name on the walls of the cave with a candle, and every one of them believed he would be remembered for it. The candle-smoke has outlasted most of us.</p>
<p>I go back there in my head more than I ought: the cold, the drip, the one candle, and the dark leaning in all round it like a crowd at a hanging. Tom was certain there was treasure in it. There was. It was being twelve years old in a place where getting lost was the worst thing that could happen to you, and getting found was the best.</p>`,
  },
  // ---- The court ----
  proclamation: {
    kind: 'placard', title: 'Nailed to the stake',
    body: `<p class="caps big">Proclamation</p><p>The STRANGER called THE BOSS, being found a Wizard, and a poor one, shall be BURNT at this stake at the stroke of NOON on the one-and-twentieth day of JUNE.</p><p class="caps">God save the King.</p><p class="small">Ale will be sold.</p>`,
  },
  hosannah: {
    kind: 'news', title: 'The Camelot Weekly Hosannah and Literary Volcano',
    body: `<h3>WIZARD TO BE BURNT</h3><p class="dek">Big Turnout Expected. Sun Due At Its Highest. Weather Fine.</p>
<p>The stranger who styles himself THE BOSS, and who has put a telephone in the Queen's dairy without asking, will be burnt in the lower ward at noon on Midsummer, the twenty-first of June, His Majesty having run out of patience.</p>
<p>THE BOSS is reported to say that "he has the sun in his pocket". Sir Kay says he has nothing in his pocket at all, having looked.</p>`,
  },
  hank: {
    kind: 'notebook', title: "The Boss's notebook",
    body: `<p><b>Merlin's Toy.</b> As far as I can make out, the old fraud's brass contraption runs the sky. Get the Toy to agree with what you want, pull the handle, and the sky goes along. Don't ask me how; it's his, not mine.</p>
<p>The Toy keeps the year by star-signs instead of months. The sun goes into the Crab on the twenty-first of June.</p>
<p>For a total eclipse you want three things lined up, same as a crooked deal: the date; the moon <u>new</u>, square between us and the sun; and the moon sitting on one of her two <u>knots</u>, where her road crosses the sun's road. Otherwise she sails by above or below and nobody is impressed.</p>
<p>Merlin paints the knots on his ring as a dragon, head and tail. Of course he does.</p>`,
  },
  merlin: {
    kind: 'scroll', title: 'A scroll on the bench',
    body: `<p class="caps">Of the Dragon that eateth the Sun</p><p>When the Moon standeth new upon the Dragon's Head, or upon his Tail, and the Dragon looketh upon the Sun, then doth he swallow it, and the people are sore afraid, and the Wizard is well paid.</p>`,
  },
  merlinDoor: {
    kind: 'card', title: 'Chalked on the tower door',
    body: `<p class="caps">Merlin</p><p>By Appointment Only.<br>No Bosses.</p>`,
  },
  pageCourt: {
    kind: 'page', title: 'Chapter the Last, page three',
    body: `<p>I sent a Yankee back to King Arthur once with nothing in his head but facts, and he set up as a wizard by knowing what day the sun would go out. It is a great comfort to know a thing before it happens.</p>
<p>The comet came in the year I was born, and it is due again, and I said a while back what I still think: "The Almighty has said, no doubt: 'Now here are these two unaccountable freaks; they came in together, they must go out together.'" I have always been a punctual man when it suited me. It suits me now.</p>`,
  },
};

export const LAST_LINE = 'The comet is in the window and the chapter is done. Put out the lamp when you go, and be good to the cat.';
