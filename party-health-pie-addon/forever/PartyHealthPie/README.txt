PARTY HEALTH PIE
A circular 5-man party health meter for World of Warcraft: Classic Forever.
https://vibecodedslopware.com/party-health-pie/


INSTALL

1. Exit World of Warcraft.

2. Unzip the download. You get a folder called PartyHealthPie.

3. Move that folder into your Classic Forever AddOns folder:

     Windows:  C:\Program Files (x86)\World of Warcraft\_forever_\Interface\AddOns
     Mac:      /Applications/World of Warcraft/_forever_/Interface/AddOns

   If you installed the game somewhere else, look there instead.

   When you are done, this file should exist:
     ...\_forever_\Interface\AddOns\PartyHealthPie\PartyHealthPie.toc

4. Start the game. On the character select screen, click AddOns and make
   sure Party Health Pie is ticked.


FIRST USE

/php        opens the settings (also under Options > AddOns)
/php demo   previews a sample party; type it again to stop

Drag the circle to move it. Hover a wedge to see that player's tooltip, and
press a heal key to cast on them or their pet. Middle and side mouse buttons
work too, if they're bound to an action bar slot, spell, item or macro.
Left-click a wedge to target them.

Each wedge shows a tank, healer or DPS symbol for that player's role in the
group. Someone with no role set gets no symbol.

When a player has a debuff you can dispel, the symbol takes the debuff's color
and glows, the glow fades as it runs out, and a countdown shows the seconds
left. If several qualify, it shows the one ending soonest.

On first login the addon turns on the game's Mouseover Cast option so hovering
works. You can change that under Options > Combat, or turn off Mouseover
Healing in the addon's settings.


TROUBLESHOOTING

Not in the AddOns list?
  Check for a doubled folder, like AddOns\PartyHealthPie\PartyHealthPie\...
  The .toc file must be one level inside AddOns\PartyHealthPie.
  Make sure it is in the _forever_ folder, not _classic_ or _retail_.

Listed but marked out of date?
  Tick "Load out of date AddOns" on the same screen.


UPDATING

Exit the game, delete the old PartyHealthPie folder, and follow the install
steps again. Your settings are kept.
