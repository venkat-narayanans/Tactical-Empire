# TACTICAL EMPIRE
# COMPLETE VISUAL DESIGN SPECIFICATION

## 1. DESIGN GOAL

Tactical Empire should look like a polished modern digital board game.

The design should take inspiration from the clarity and usability of online board games such as Richup without copying their branding, assets or exact interface.

The desired visual combination is:

MODERN BOARD GAME
+
STRATEGY GAME
+
SUBTLE TERRITORIAL / MEDIEVAL INFLUENCE

The game is NOT a fantasy RPG.

Avoid:

- commanders
- warriors
- swords
- castles
- fantasy characters
- dramatic medieval illustrations
- excessive parchment
- dark fantasy interfaces

---

# 2. VISUAL PERSONALITY

The visual personality is:

- clean
- premium
- social
- strategic
- playful
- readable
- modern

Visual decoration must never compete with game information.

---

# 3. BOARD PRIORITY

The board is the visual hero.

The user should immediately recognize:

1. board
2. player positions
3. ownership
4. current turn
5. available actions

The board should occupy most of the gameplay viewport.

---

# 4. DESKTOP TARGET

Primary supported resolutions:

1366 × 768
1440 × 900
1920 × 1080

Normal gameplay should not require page-level vertical scrolling.

The board should remain visible.

Side panels may internally scroll if necessary.

---

# 5. BOARD STRUCTURE

Board:

40 spaces

4 corners

36 regular spaces

Each side:

9 regular spaces
2 corners

The centre of the board is a neutral decorative gameplay area.

Do not place critical gameplay information in the centre if it interferes with board visibility.

---

# 6. TILE HIERARCHY

A normal city tile should communicate:

CITY NAME
PRICE
TERRITORY EMBLEM
OWNER
DEVELOPMENT

Hierarchy:

CITY NAME
↓
PRICE
↓
TERRITORY
↓
OWNERSHIP / DEVELOPMENT

City name must remain readable at all times.

---

# 7. CITY TILE BACKGROUND

Before purchase:

Use a light neutral background.

The territory may have subtle visual characteristics.

Do not use large or dark background artwork.

After purchase:

Introduce the owner's player colour through:

- border
- accent
- bottom strip
- subtle tint

Do not completely fill the tile with saturated player colour.

---

# 8. TERRITORY EMBLEM

Each territory gets a dedicated emblem.

The emblem should be:

- small
- distinct
- simple
- recognizable
- contained in a small circular or badge-like area

The emblem is a territory identifier.

It must not look like:

- house
- hotel
- army
- player token

---

# 9. PLAYER COLOUR

Player colour is the ownership language.

If Player A chooses a colour:

That colour should appear consistently in:

- player token
- player list
- ownership accents
- property ownership
- alliance indicators where appropriate
- war UI
- relevant strategic UI

---

# 10. DEVELOPMENT ICONS

Use separate icons for:

1 house
2 houses
3 houses
4 houses
hotel

Development icons should be small and visually consistent.

They must never resemble territory logos.

---

# 11. PLAYER TOKEN

Player token:

- circular
- simple
- high visibility
- player colour
- subtle shadow/elevation

Do not use detailed character models.

The token represents the player.

---

# 12. TOKEN MOVEMENT

When a dice roll occurs:

The token moves through each board space sequentially.

Do not teleport the token.

Movement should feel:

- smooth
- linear
- quick
- readable

The animation must not modify game state.

---

# 13. TYPOGRAPHY

Use a modern sans-serif.

Avoid medieval/decorative fonts.

Typography should prioritize:

- readability
- hierarchy
- compactness

City names may use small text because board tiles are constrained.

Do not shrink text so far that it becomes unreadable.

Use:

- font weight
- spacing
- truncation
- controlled wrapping

instead of extreme font reduction.

---

# 14. COLOUR SYSTEM

Base interface:

- light neutral background
- dark readable text
- restrained borders
- subtle shadows

Territory visual language:

- subtle accent colours / emblems

Player visual language:

- stronger player colours

Never allow territory colour and player colour to become visually indistinguishable.

---

# 15. PANELS

Panels should use:

- rounded corners
- subtle borders
- moderate shadows
- clean spacing
- clear headings

Panels should not cover large sections of the board unnecessarily.

---

# 16. TOP BAR

Top bar contains:

- game title
- round
- active player
- room code
- connection status

Example:

TACTICAL EMPIRE
ROUND 8
PLAYER 2 TURN
ROOM A7K92
● CONNECTED

---

# 17. LEFT PANEL

The left panel may show:

- players
- player colours
- money
- properties
- army
- relevant strategic status

Keep it compact.

---

# 18. RIGHT PANEL

The right panel is contextual.

It changes according to current state.

Examples:

- buy property
- auction
- trade
- scouting
- alliance
- army lending
- war
- property development

Do not show every possible action simultaneously.

---

# 19. BOTTOM ACTION AREA

The bottom action area can contain the most immediate player action.

Examples:

YOUR TURN
[ROLL DICE]

or:

PROPERTY AVAILABLE

[BUY]
[AUCTION]

Primary action should always be obvious.

---

# 20. MAIN GAMEPLAY LAYOUT

Recommended structure:

```text
┌───────────────────────────────────────────────┐
│                 TOP BAR                       │
├──────────────┬────────────────┬───────────────┤
│              │                │               │
│   PLAYERS    │                │  CONTEXTUAL   │
│   / STATS    │     BOARD      │    PANEL      │
│              │                │               │
│              │                │               │
├──────────────┴────────────────┴───────────────┤
│                  ACTION BAR                   │
└───────────────────────────────────────────────┘

21. MAIN MENU

Minimal.

Show:

TACTICAL EMPIRE

[ CREATE GAME ]

[ JOIN GAME ]

[ HOW TO PLAY ]

Avoid unnecessary decorative screens.

22. CREATE GAME

Show:

PLAYER NAME
GAME SETTINGS
CREATE GAME

After creation:

→ Lobby

23. JOIN GAME

Show:

PLAYER NAME
ROOM CODE
JOIN GAME

Invalid room:

"Room not found."

Do not expose technical errors.

24. LOBBY

Show:

room code
copy button
players
colours
host
settings
start button

Host settings are editable only by host.

25. GAME START

When host starts:

Transition smoothly:

LOBBY
↓
BOARD
↓
GAME START

Avoid unnecessary loading screens.

26. PROPERTY PURCHASE UI

When available:

CITY NAME

₹PRICE

[ TERRITORY EMBLEM ]

[ BUY ]
[ AUCTION ]

Auction appears only if enabled.

27. OWNED PROPERTY UI

Show:

CITY NAME

OWNER

RENT

DEVELOPMENT

If local player owns it:

[ BUILD ]

when legal.

28. DEVELOPMENT UI

Example:

CITY NAME

2 HOUSES

NEXT:
3 HOUSES

BUILD COST
₹XXX

[ BUILD ]
29. AUCTION UI

Show:

AUCTION

CITY

CURRENT BID

HIGHEST BIDDER

[ BID ]

[ PASS ]

Use live updates.

30. TRADE UI

Use a symmetrical layout.

YOU                    PLAYER

OFFER                  REQUEST

₹500                   ₹300
PROPERTY A             PROPERTY B

[ SEND OFFER ]
31. ARMY UI

Army must be visually separate.

Show:

ARMY

AVAILABLE
COMMITTED
POWER

Use a dedicated army icon.

32. SCOUT UI

Show:

SCOUT

TARGET

COST

INFORMATION TO BE REVEALED

[ SCOUT ]

33. ALLIANCE UI

Show:

PLAYER NAME

REQUESTS AN ALLIANCE

[ ACCEPT ]
[ DECLINE ]

Active:

ALLIANCE ACTIVE

34. ARMY LENDING UI

Show:

LEND ARMY

RECIPIENT

AVAILABLE SUPPORT

COMMITTED SUPPORT

[ LEND ]

35. WAR UI

War is a strategic action.

It should appear in the contextual action panel.

Do not place "DECLARE WAR" as a permanent giant button in the centre of the board.

Flow:

SELECT TARGET
↓
SELECT TERRITORY
↓
SHOW POWER
↓
SHOW SUPPORT
↓
SHOW COST
↓
CONFIRM

36. WAR CONFIRMATION

Show:

DECLARE WAR

TARGET
TERRITORY

YOUR POWER
ENEMY POWER
ALLY SUPPORT

COST / CONSEQUENCES

[ CONFIRM WAR ]

[ CANCEL ]

37. WAR RESULT

Show concise result:

WAR RESULT

ATTACKER
POWER

DEFENDER
POWER

WINNER

CONSEQUENCE

Avoid giant combat animations.

38. SPECIAL TILE DESIGN

Special tiles should visually differ from city properties.

Use dedicated icons.

Treasure:
reward-oriented

Surprise:
random-event-oriented

College Fees:
economic

Airport:
transport/travel

Other special locations:
use their semantic identity without becoming overly decorative.

39. CORNER DESIGN

Corners may be larger than normal tiles.

START:
strong start icon

IG SIGNAL:
distinct special-state icon

VACATION:
rest/travel icon

GO TO IG SIGNAL:
movement/redirect icon

40. NOTIFICATIONS

Use compact notifications.

Examples:

Property Purchased
Rent Paid
Trade Completed
Alliance Formed
Army Support Added
War Declared
Territory Captured

Do not interrupt gameplay unnecessarily.

41. ANIMATION PRINCIPLES

Animation should communicate state change.

Use animation for:

dice
token movement
property purchase
auction bid
trade completion
alliance
army support
war result
notifications

Do not animate everything constantly.

42. ACCESSIBILITY

Target WCAG 2.1 AA.

Support:

keyboard navigation
focus indicators
readable contrast
semantic buttons
accessible labels
modal focus management
non-colour-only important states
43. DESIGN RULE

At any moment a player should be able to answer:

WHOSE TURN?
WHERE AM I?
WHO OWNS THIS?
WHAT DOES IT COST?
WHAT TERRITORY?
WHAT CAN I DO?
HOW MUCH MONEY DO I HAVE?

without searching through multiple screens.