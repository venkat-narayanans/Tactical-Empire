
---

# `docs/ARCHITECTURE.md`

```markdown
# TACTICAL EMPIRE
# COMPLETE TECHNICAL ARCHITECTURE

## 1. ARCHITECTURE PRINCIPLE

Tactical Empire is a multiplayer browser game.

The architecture must be:

- server authoritative
- modular
- testable
- deterministic where appropriate
- configuration driven
- multiplayer safe
- reconnectable

Use a modular monolith initially.

Do not introduce microservices without a concrete requirement.

---

# 2. SYSTEM

```text
                  BROWSER
                     │
                     │ HTTPS / WebSocket
                     ▼
              ┌───────────────┐
              │    SERVER     │
              │               │
              │ Rooms         │
              │ Sessions      │
              │ WebSocket     │
              └───────┬───────┘
                      │
                      ▼
              ┌───────────────┐
              │  GAME ENGINE  │
              │               │
              │ Rules         │
              │ State         │
              │ Commands      │
              │ RNG           │
              │ Events        │
              └───────┬───────┘
                      │
                      ▼
              ┌───────────────┐
              │  DATABASE     │
              └───────────────┘

3. FRONTEND

Recommended:

React
TypeScript
Vite

Responsibilities:

rendering
input
UI state
animations
accessibility
command submission
state display

Frontend must not own gameplay authority.

4. SERVER

Recommended:

Node.js
TypeScript
Fastify
WebSocket

Responsibilities:

rooms
sessions
authentication
connections
command validation
game engine invocation
broadcasting
persistence
5. GAME ENGINE

The game engine is the most important architectural component.

It contains:

GameState
rules
command handlers
calculations
RNG
state transitions
event generation

It must not import:

React
browser APIs
WebSocket libraries
Prisma
6. DATABASE

Recommended:

PostgreSQL.

Recommended ORM:

Prisma.

Database stores:

rooms
players
active games
game state
relevant history
session information
versions
7. CONFIGURATION

GAME_CONFIG.json is configuration.

It should contain data such as:

board spaces
city names
prices
territory IDs
development values
special tile configuration
limits
other tunable data

Do not hard-code configurable game data into frontend components.

8. RULES

GAME_RULES.md is the authoritative gameplay specification.

Code must implement the rules.

If code conflicts with GAME_RULES.md:

the implementation is wrong.

9. GAME STATE

Conceptual:

GameState
├── id
├── phase
├── round
├── activePlayerId
├── players
├── properties
├── auctions
├── trades
├── alliances
├── wars
├── turnState
├── rng
└── version

Exact schema should reflect GAME_RULES.md.

10. PLAYER STATE

Conceptual:

PlayerState
├── id
├── name
├── colour
├── cash
├── position
├── properties
├── army
├── alliances
├── status
└── statistics

Do not duplicate derived values unnecessarily.

11. PROPERTY STATE

Static:

name
territory
price
configuration

Dynamic:

owner
development
mortgage
other state defined by rules
12. COMMAND MODEL

The client sends intentions.

Examples:

ROLL_DICE
BUY_PROPERTY
BUILD
PLACE_BID
CREATE_TRADE
ACCEPT_TRADE
REQUEST_ALLIANCE
LEND_ARMY
DECLARE_WAR

Never allow commands such as:

SET_MONEY
SET_POSITION
SET_DICE
SET_OWNER
SET_ARMY
SET_WINNER

13. COMMAND PIPELINE
CLIENT
↓
MESSAGE VALIDATION
↓
AUTHENTICATION
↓
ROOM VALIDATION
↓
GAME VALIDATION
↓
RULE VALIDATION
↓
GAME ENGINE
↓
STATE TRANSITION
↓
EVENTS
↓
PERSISTENCE
↓
BROADCAST
14. STATE MACHINE

Recommended states:

LOBBY
INITIALIZING
PLAYER_TURN
RESOLVING_MOVEMENT
RESOLVING_LANDING
ACTION
AUCTION
TRADE
ALLIANCE
WAR
GAME_OVER

PAUSED may exist only if the product requires it.

15. TURN
PLAYER_TURN
↓
ROLL
↓
DICE RESULT
↓
MOVEMENT
↓
LANDING
↓
ACTION
↓
TURN END
↓
NEXT PLAYER

Special interactions may temporarily suspend normal turn flow.

16. CONCURRENCY

All state-changing commands for a game must be serialized.

Example:

Player A buys property.

Player B simultaneously buys same property.

The first valid command changes ownership.

The second is rejected.

Never allow two state mutations to operate against the same stale state concurrently.

17. IDEMPOTENCY

Mutation commands should include request IDs.

If a duplicate request arrives:

Do not execute it twice.

This is required for:

purchase
auction
trade
alliance
army lending
war
18. STATE VERSION

Maintain monotonically increasing game state version.

Example:

version 101
version 102
version 103

Clients can detect stale state.

19. RNG

Use a game RNG abstraction.

Production:

server-generated randomness.

Testing:

seeded deterministic RNG.

Do not scatter Math.random throughout the game.

20. SECURITY

Assume every client can be manipulated.

Never trust:

money
dice
position
ownership
rent
army power
war result
victory
21. RECONNECTION

When reconnecting:

authenticate
identify player
locate game
retrieve current state
send snapshot
synchronize
resume
22. EVENTS

Game engine produces immutable events.

Examples:

DiceRolled
PlayerMoved
PropertyPurchased
RentPaid
TradeExecuted
AllianceAccepted
WarResolved
VictoryDeclared

Events are facts.

Commands are requests.

23. DATABASE TRANSACTIONS

Any state mutation that must be atomic should use a database transaction or equivalent transactional mechanism.

Examples:

property purchase
trade
auction completion
rent payment
war resolution

Never persist half of a transaction.

24. LOGGING

Log:

room creation
joins
disconnects
reconnects
rejected commands
important game events
unexpected errors
invalid state transitions

Do not log sensitive information unnecessarily.

25. ERROR MODEL

Use structured error codes.

Examples:

NOT_YOUR_TURN
INSUFFICIENT_FUNDS
PROPERTY_UNAVAILABLE
INVALID_TRADE
INVALID_BID
INVALID_ALLIANCE
INVALID_ARMY_SUPPORT
INVALID_WAR
PLAYER_BANKRUPT
GAME_FINISHED
INVALID_PHASE

26. DIRECTORY STRUCTURE

Preferred:

apps/
  web/
  server/

packages/
  game-engine/
  shared/
  config/
  ui/

docs/
tests/
scripts/

If an existing repository structure is already functional, preserve it.

27. DEPENDENCY DIRECTION
UI
↓
SERVER API / SOCKET
↓
APPLICATION SERVICES
↓
GAME ENGINE
↓
PERSISTENCE

The game engine must remain infrastructure-independent.

28. FRONTEND STATE

Maintain:

authoritativeGameState

and:

uiState

separately.

Animations are derived from state changes.

Animations never determine state.

29. PERFORMANCE

Prioritize:

minimal unnecessary React renders
efficient board rendering
efficient WebSocket updates
indexed database access
bounded event history
efficient state serialization

Do not optimize without measuring.

30. ARCHITECTURAL ACCEPTANCE
 server authoritative
 game engine independent
 configuration driven
 state machine explicit
 commands validated
 events ordered
 duplicate commands safe
 reconnection supported
 persistence implemented
 frontend separated from rules