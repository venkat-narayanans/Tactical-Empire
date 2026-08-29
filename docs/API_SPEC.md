
---

# `docs/API_SPEC.md`

```markdown
# TACTICAL EMPIRE
# API AND NETWORK SPECIFICATION

## 1. PRINCIPLE

Client sends intent.

Server validates.

Game engine resolves.

Server broadcasts authoritative result.

---

# 2. MESSAGE FORMAT

Command:

```json
{
  "type": "COMMAND_NAME",
  "requestId": "uuid",
  "payload": {}
}

3. ROOM
CREATE_ROOM

Input:

playerName
settings

Server:

validates
creates room
creates host
returns room/session
JOIN_ROOM

Input:

roomCode
playerName

Validate:

room exists
room joinable
player limit
name
game not started
LEAVE_ROOM

Player leaves when permitted.

SELECT_COLOUR

Input:

colour

Validate:

colour available
lobby
player belongs to room
UPDATE_SETTINGS

Host only.

Validate:

host
lobby
valid settings
START_GAME

Host only.

Validate:

host
minimum players
valid colours
valid settings
lobby state
4. TURN
ROLL_DICE

No dice result supplied by client.

Server:

validates active player
validates phase
generates dice
updates state
emits DiceRolled
resolves movement
END_TURN

Validate:

correct player
legal phase
required actions completed

Advance to next player.

5. PROPERTY
BUY_PROPERTY

Input:

propertyId

Validate:

exists
unowned
purchasable
correct player
sufficient funds
legal phase
BUILD

Input:

propertyId

Validate:

player owns property
development legal
requirements met
sufficient funds
maximum not exceeded
6. AUCTION
START_AUCTION

Input:

propertyId

Validate:

property available
auction enabled
current phase
player eligibility
PLACE_BID

Input:

auctionId
amount

Validate:

auction active
player eligible
bid legal
amount legal
PASS_AUCTION

Input:

auctionId

7. TRADE
CREATE_TRADE

Input:

targetPlayerId
offeredAssets
requestedAssets

Validate every asset.

ACCEPT_TRADE

Input:

tradeId

Revalidate:

ownership
cash
player status
trade validity

Execute atomically.

REJECT_TRADE

Input:

tradeId

CANCEL_TRADE

Input:

tradeId

8. ARMY
BUY_ARMY

Input:

unit/type
quantity

Validate:

legal unit
legal quantity
funds
capacity
rules
LEND_ARMY

Input:

targetPlayerId
amount

Validate:

target
alliance requirements
available army
support limits
legal phase
9. SCOUT
SCOUT

Input:

targetPlayerId

Validate:

target
cost
limits
legal phase

Return only permitted information.

10. ALLIANCE
REQUEST_ALLIANCE

Input:

targetPlayerId

ACCEPT_ALLIANCE

Input:

requestId

DECLINE_ALLIANCE

Input:

requestId

11. WAR
DECLARE_WAR

Input:

targetPlayerId
territoryId

Server validates:

attacker
target
territory
resources
army
alliance state
legal phase
war restrictions

Server calculates result.

Client cannot supply:

power
winner
casualties
result
12. SNAPSHOT

Server may send:

GAME_STATE_SNAPSHOT

Used for:

joining
reconnecting
recovery
synchronization
13. COMMAND REJECTION
{
  "type": "COMMAND_REJECTED",
  "requestId": "uuid",
  "error": {
    "code": "NOT_YOUR_TURN",
    "message": "It is not your turn."
  }
}

Never expose:

stack traces
database errors
internal server paths
14. IDEMPOTENCY

Every important mutation uses requestId.

Duplicate request:

same result / safe rejection

Never execute mutation twice.

15. PRIVATE DATA

Server must filter private responses.

Examples:

scouting results
private offers
private alliance requests

Never broadcast private information globally.

16. CONNECTION

On connection:

authenticate session

On reconnect:

authenticate
↓
restore game
↓
send snapshot
↓
resume

17. AUTHORITY

Never trust client:

dice
money
rent
property owner
position
army
war
victory
auction winner
18. API ACCEPTANCE
 schema validation
 authentication
 authorization
 request IDs
 duplicate protection
 private data protection
 server authority
 reconnection
 structured errors