# Crafty Recovery RPG Website - Project Context

## Purpose of This Document
This file captures context, goals, and early scope for building Crafty's recovery-themed DnD character sheet experience.

Use this as a project context brief, not as a prompt.

## Core Concept
Build a DnD-style character sheet website where:

- Crafty can update her character and recovery progress from an admin panel.
- Everyone else can view progress at `dnd.craftingchaosgaming.com`.
- Community members can contribute small interactions (quests, notes, encounters, and similar ideas).

## Real-World Context
- Crafty (CraftingChaosGaming) is a Twitch streamer.
- She is undergoing a full hysterectomy on Thursday 28 May.
- Expected recovery window is around 6 to 8 weeks, mostly bed-bound.
- The website experience should make recovery updates fun, communal, and easy to follow.

## Tone and Theme
The sheet is intentionally homebrew and playful:

- Recovery limitations become temporary debuffs.
- Progress and medical clearance can remove debuffs over time.
- Krusher acts as DM with final say on certain roll outcomes.
- A "captain's log" style timeline can record key events, rolls, and outcomes.

## Source Message from Crafty (Discord)
> Hello @everyone
>
> I am calling on all DnD experts, participants and interested parties to help me during tonight's stream in addition to bullshit and shenanigan aficionados, we are gonna be making my recovery a bit more fun.
>
> While hanging out in VC last night we came up with the idea that I will need to roll for deception during my recovery for those times I try to convince Krusher I should be allowed to do something, because left to my own devices I am too convincing and will make him cave. This has evolved into the idea of creating a very homebrew character sheet for my recovery, with chronic illness characteristics built in and stat and roll debuffs for post-surgery recovery. Through my recovery I can then level up and lose debuffs over time and as my doctor clears me for things, but Krusher can still have executive control as the DM deciding some rolls needing higher success limits.
>
> But I have limited experience with making a character sheet and I know there are many people here who may have some very fun ideas.
>
> After we make our homebrew Frankenstein of a sheet Krusher will make it available on my website so you all can see the updates and leveling up, and we might have a captain's log where Krusher can keep a list of what I have been made to roll for (chronicling my list of demands) and the results of those rolls, as a fun way to keep you all up to date on how recovery is going.

## Website Experience Ideas
### Passive Visual Layer
- A small "runner" visualization of Crafty moving through a generated world.
- Not real-time multiplayer, just ambient and fun.
- Visual progression tied to level, items, or daily events.

### Visual Implementation Guidelines (New)
- Use `three.js` as the graphics library for the visual experience.
- Keep the visual viewport square (1:1 aspect ratio).
- For mobile performance, either:
  - simplify scene complexity, or
  - cap rendering at 30 FPS.
- Use freely available models/assets only (license-safe for public use).
- Review and reference existing GitHub projects for implementation patterns before building custom systems.

### Visual Approach Options
Current candidate directions:

1. 2D sprite avatar in a 3D scene shell.
	- Crafty is represented as a sprite.
	- Rotate/update sprite orientation over time.
	- Swap sprite states every few days to show progression.

2. Lightweight side-scroller mode.
	- Background scrolls horizontally.
	- Character sprites update every few days.
	- Easier to keep performant and easier to ship as MVP.

Preferred MVP direction:
- Start with the side-scroller sprite approach for speed and reliability.
- Keep architecture flexible so a richer temple-run style scene can be layered in later.

### Progression Loop
- Start at level 1.
- Gain 1 level per day at midnight.
- Potential max near level 60 over roughly two months.
- Include a visible countdown timer to next level-up.

### Itemization Direction (Open Decision)
Need to decide whether campaign items are:

1. Fully recovery-themed.
2. Traditional fantasy with recovery-inspired equivalents.
3. A hybrid model.

Example mapping:
- Stomach wrap -> chest armor.
- Wedge pillow -> permanent Blessing of Feather Fall.

## Community Interaction Options
Initial options being considered:

1. Twitch-auth check-in that generates extra quests for Crafty.
2. Lightweight no-auth submission (with CAPTCHA) where names become random encounter NPCs.
3. Additional interactions to be defined during scoping.

## Daily Output / Automation Ideas
At end of each day, automatically generate:

- A character sheet or image snapshot.
- A Discord post in a dedicated channel.
- A short 3 to 5 line event summary, for example:
	- "Crafty fought X"
	- "Y joined the party"

## Stream Workflow
- During tonight's stream, Crafty and community will co-design the homebrew sheet.
- Notes from stream should be captured and converted into implementation scope.

## Scope Guidance
There are many possible directions, so the first priority is selecting a viable path and avoiding early scope creep.

Recommended immediate focus:

1. Define MVP features for launch.
2. Lock interaction model (auth vs no-auth contributions).
3. Implement daily progression + daily summary pipeline.
4. Add visual polish after core loop is stable.