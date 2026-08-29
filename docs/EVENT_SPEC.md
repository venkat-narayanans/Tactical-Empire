
---

# `docs/EVENT_SPEC.md`

```markdown
# TACTICAL EMPIRE
# EVENT SPECIFICATION

## PURPOSE

Commands are requests.

Events are facts.

Example:

ROLL_DICE
↓
DiceRolled
↓
PlayerMoved
↓
LandingResolved
↓
RentPaid
↓
TurnEnded

Events originate from the authoritative game engine.

---

# EVENT FORMAT

```json
{
  "type": "EVENT_NAME",
  "eventId": "uuid",
  "gameId": "game-id",
  "sequence": 123,
  "payload": {}
}

ROOM EVENTS

RoomCreated
PlayerJoined
PlayerLeft
PlayerColourChanged
SettingsChanged
GameStarted

CONNECTION EVENTS

PlayerDisconnected
PlayerReconnected

A disconnect does not automatically eliminate a player.

TURN EVENTS

TurnStarted
DiceRolled
PlayerMoved
TurnEnded

LANDING EVENTS

LandingResolved
TreasureResolved
SurpriseResolved
FeePaid
SpecialReward
SpecialPenalty
ForcedMovement

Only emit events that correspond to actual configured mechanics.

PROPERTY EVENTS

PropertyPurchased
RentPaid
PropertyDeveloped
PropertyMortgaged
PropertyUnmortgaged

AUCTION EVENTS

AuctionStarted
BidPlaced
AuctionEnded
PropertyAuctioned

TRADE EVENTS

TradeCreated
TradeAccepted
TradeRejected
TradeCancelled
TradeExecuted

ARMY EVENTS

ArmyUnitPurchased
ArmySupportCommitted
ArmySupportReleased

SCOUTING EVENTS

ScoutStarted
ScoutCompleted

Scouting result may be private.

ALLIANCE EVENTS

AllianceRequested
AllianceAccepted
AllianceDeclined
AllianceExpired

WAR EVENTS

WarDeclared
WarResponseRequested
WarResolved
CasualtiesApplied
TerritoryCaptured

WarResponseRequested exists only if required by GAME_RULES.md.

PLAYER EVENTS

PlayerBankrupt
PlayerEliminated
VictoryDeclared

EVENT ORDERING

Events belonging to one game are sequential.

Example:

DiceRolled #101
PlayerMoved #102
RentPaid #103
TurnEnded #104

Clients can detect missing events using sequence numbers.

DUPLICATES

Clients must safely handle duplicate delivery.

Use:

eventId
sequence

A duplicate event must not cause duplicate state mutation.

PRIVATE EVENTS

Private information must be filtered by the server.

Examples:

scouting result
private trade information
private alliance request
EVENT CONSUMERS
GAME ENGINE
↓
PERSISTENCE
↓
WEBSOCKET BROADCASTER
↓
FRONTEND STORE
↓
UI

Logging/analytics may consume selected events.

EVENT IMMUTABILITY

Events are immutable facts.

Never modify historical events.

If state changes again, emit another event.

COMMAND VS EVENT

Command:

BUY_PROPERTY

Event:

PropertyPurchased

Command:

ROLL_DICE

Event:

DiceRolled

Command:

DECLARE_WAR

Event:

WarDeclared

A command requests.

An event confirms something happened.

EVENT ACCEPTANCE
 events ordered
 events immutable
 duplicate safe
 private events protected
 frontend can consume events
 events originate from authoritative engine