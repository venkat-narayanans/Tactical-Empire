
---

# `docs/UI_SPEC.md`

```markdown
# TACTICAL EMPIRE
# COMPLETE UI IMPLEMENTATION SPECIFICATION

## APPLICATION

The application consists of:

- Main Menu
- Create Game
- Join Game
- Lobby
- Gameplay
- Game Over

Gameplay is the primary application state.

---

# MAIN MENU

Components:

- Logo
- Create Game button
- Join Game button
- How To Play button

Create Game → Create Game screen.

Join Game → Join Game screen.

---

# CREATE GAME

Fields:

- player name

Settings:

- all settings defined by GAME_CONFIG / GAME_RULES

Button:

CREATE GAME

On success:

CREATE GAME → LOBBY

---

# JOIN GAME

Fields:

- player name
- room code

Button:

JOIN GAME

Validation errors must be human readable.

---

# LOBBY

Display:

- room code
- copy button
- player list
- player colours
- host indicator
- settings
- start button

Only host can:

- modify host-controlled settings
- start game

Players can:

- select available colour
- change their own colour while lobby permits

---

# GAMEPLAY LAYOUT

Desktop:

```text
┌──────────────────────────────────────────────┐
│                 TOP BAR                      │
├─────────────┬────────────────┬───────────────┤
│             │                │               │
│ PLAYER      │                │ CONTEXTUAL    │
│ INFORMATION │     BOARD      │ ACTION PANEL  │
│             │                │               │
├─────────────┴────────────────┴───────────────┤
│              PRIMARY ACTION BAR              │
└──────────────────────────────────────────────┘
The board remains central.

TOP BAR

Display:

game name
round
current player
room code
connection state
PLAYER PANEL

Display:

player name
money
property count
territory count
army information when appropriate

Use actual state.

Do not invent statistics.

PLAYER LIST

Every player:

colour
name
relevant public information
turn indicator

Current player visually highlighted.

Bankrupt players visually marked.

BOARD

Exactly 40 spaces.

Board data comes from GAME_CONFIG.json.

Never duplicate board definitions in JSX.

Each tile receives its configuration and current dynamic state.

TILE COMPONENTS

Use reusable components:

CityTile
SpecialTile
CornerTile

Do not create 40 unrelated custom components.

CITY TILE

Render:

city name
price
territory emblem
ownership treatment
development icons
SPECIAL TILE

Render:

icon
title
optional short description

Do not display unnecessary data.

CORNER TILE

Render:

icon
title
special-state styling

Corners can be larger.

PROPERTY OWNERSHIP

Unowned:

neutral background.

Owned:

player colour accent.

The owner colour must not obscure:

city name
price
territory emblem
TERRITORY

Display territory emblem consistently.

Territory emblem is static identity.

Owner colour is dynamic identity.

DEVELOPMENT

Display:

0
house
house + house
house + house + house
house + house + house + house
hotel

Never confuse development icon with territory emblem.

PLAYER TOKEN

Render one token per player.

Token is circular.

Token colour is player colour.

Token position is based on authoritative state.

TOKEN ANIMATION

When PlayerMoved event occurs:

determine previous position
determine destination
animate through intermediate spaces
finish at destination
do not alter authoritative state
TURN UI

Current player:

YOUR TURN

[ROLL]

Other players:

PLAYER NAME'S TURN

The Roll button is disabled for non-active players.

DICE UI

Client sends:

ROLL_DICE

Server returns:

DiceRolled

Frontend animates dice.

Do not generate authoritative dice result locally.

LANDING UI

After PlayerMoved:

Wait for authoritative landing resolution.

Possible outcomes:

available property
owned property
own property
special tile
forced movement
event
BUY UI

Available property:

CITY NAME
PRICE
TERRITORY

BUY
AUCTION

Auction only appears if enabled.

RENT UI

If another player's property:

CITY NAME
OWNER
RENT

The server performs payment.

Frontend displays result.

BUILD UI

If development is legal:

CITY
CURRENT DEVELOPMENT
NEXT DEVELOPMENT
COST

BUILD

Button disabled when illegal.

AUCTION UI

Display:

property
current bid
highest bidder
player's valid bid amount
bid action
pass action

Update live.

TRADE UI

Trade interface must clearly distinguish:

OFFER
REQUEST

The user must never be confused about what they are giving.

TRADE CONFIRMATION

Receiver sees:

OFFERING PLAYER
ASSETS OFFERED
ASSETS REQUESTED

ACCEPT
REJECT

Server revalidates before execution.

ARMY UI

Display:

TOTAL ARMY
AVAILABLE ARMY
COMMITTED ARMY
POWER

Only display fields that exist in the authoritative game model.

SCOUTING UI

Display:

TARGET
COST
ACTION

SCOUT

Results are private where required.

ALLIANCE UI

Incoming request:

PLAYER NAME
REQUESTS ALLIANCE

ACCEPT
DECLINE

Active alliance:

PLAYER NAME
ALLIANCE ACTIVE

ARMY LENDING UI

Display:

RECIPIENT
AVAILABLE ARMY
SUPPORT AMOUNT
COMMITTED SUPPORT

LEND

Validate before submission.

WAR UI

War action appears in the contextual strategic panel.

Do not permanently place it in the centre of the board.

Display:

TARGET
TERRITORY
ATTACK POWER
DEFENSE POWER / KNOWN INFORMATION
ALLY SUPPORT
COST
CONSEQUENCES

CONFIRM WAR
CANCEL

Only display information permitted by the rules.

WAR RESULT

Display:

WAR RESULT
ATTACKER
DEFENDER
RESULT
CONSEQUENCES

If territory changes:

TERRITORY CAPTURED

NOTIFICATIONS

Use compact non-blocking notifications.

Examples:

Property Purchased
Rent Paid
Auction Won
Trade Completed
Alliance Accepted
Army Support Added
War Declared
Territory Captured

MODALS

Use modals/context panels for:

trade
auction
scouting
alliance
army lending
war confirmation

Do not use modals for every normal action.

CONNECTION

Connected:

● Connected

Reconnecting:

○ Reconnecting...

Disconnected:

Connection lost.
Trying to reconnect.

RECONNECTION

On reconnect:

restore session
receive snapshot
replace stale state
resume rendering

Do not replay stale local commands automatically unless the command system explicitly supports safe retry.

GAME OVER

Display:

VICTORY
or
GAME OVER

Winner

Final ranking/statistics if configured.

Buttons:

PLAY AGAIN
RETURN TO LOBBY

RESPONSIVE

Primary desktop targets:

1366×768
1440×900
1920×1080

Normal gameplay should fit within one viewport.

Avoid full-page vertical scrolling.

UI STATE

Separate:

authoritativeGameState

from:

uiState

Authoritative:

money
position
properties
army
alliances
wars
turn
game phase

UI:

selected tile
modal
hover
animation
panel state
UI SECURITY

Frontend must never trust its own displayed calculations.

All authoritative values arrive from server state/events.

ACCEPTANCE
 Board contains 40 spaces.
 Board order is configuration driven.
 City names are correct.
 Prices are readable.
 Territory emblems are visible.
 Ownership is clear.
 Development is clear.
 Player tokens are visible.
 Board fits target desktop view.
 No unwanted page scroll.
 City names are never upside down.
 Contextual actions work.
 Multiplayer state updates correctly.
 Reconnection works.