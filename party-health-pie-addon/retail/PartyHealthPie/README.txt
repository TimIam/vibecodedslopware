PARTY HEALTH PIE (RETAIL)
A circular 5-man party health meter for World of Warcraft: Midnight.


INSTALL

1. Exit World of Warcraft.

2. Unzip the download. You get a folder called PartyHealthPie.

3. Move that folder into your retail AddOns folder:

     Windows:  C:\Program Files (x86)\World of Warcraft\_retail_\Interface\AddOns
     Mac:      /Applications/World of Warcraft/_retail_/Interface/AddOns

   If you installed the game somewhere else, look there instead.

   When you are done, this file should exist:
     ...\_retail_\Interface\AddOns\PartyHealthPie\PartyHealthPie.toc

4. Start the game. On the character select screen, click AddOns and make
   sure Party Health Pie is ticked.


FIRST USE

/php        opens the settings (also under Options > AddOns)
/php demo   previews a sample party; type it again to stop

Drag the circle to move it. Hover a wedge and press a heal key to cast on
that player or pet. Left-click a wedge to target them.

Each wedge shows a tank, healer or DPS symbol for that player's role in the
group. Someone with no role set gets no symbol.

When a player has a debuff you can dispel, the symbol takes the debuff's color
and glows, the glow fades as it runs out, and a countdown shows the seconds
left. If several qualify, it shows the one ending soonest.

On first login the addon turns on the game's Mouseover Cast option so hovering
works. You can change that under Options > Combat, or turn off Mouseover
Healing in the addon's settings.

Classes with a secondary resource (combo points, holy power, soul shards,
chi, arcane charges, essence, runes) can show it in place of their main power.
Tick Secondary next to the class in the settings.


TROUBLESHOOTING

Not in the AddOns list?
  Check for a doubled folder, like AddOns\PartyHealthPie\PartyHealthPie\...
  The .toc file must be one level inside AddOns\PartyHealthPie.
  Make sure it is in the _retail_ folder, not _classic_ or _forever_.

Listed but marked out of date?
  Tick "Load out of date AddOns" on the same screen.


UPDATING

Exit the game, delete the old PartyHealthPie folder, and follow the install
steps again. Your settings are kept.
