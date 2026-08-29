
---

# `docs/TEST_PLAN.md`

```markdown
# TACTICAL EMPIRE
# COMPLETE TEST PLAN

## OBJECTIVE

The game must be tested as a complete multiplayer product.

Testing must cover:

- game engine
- server
- database
- WebSocket
- frontend
- multiplayer
- reconnection
- security
- UI
- performance

---

# GAME ENGINE TESTS

Test:

- game initialization
- player creation
- turn order
- active player
- dice
- movement
- landing
- property purchase
- rent
- development
- auction
- trade
- army
- scouting
- alliances
- army lending
- war
- bankruptcy
- victory

---

# ECONOMY

Verify:

- valid purchase
- insufficient funds
- rent
- development cost
- auction payment
- trade transfer
- army costs
- scouting costs
- war costs

Money must never become invalid through normal legal gameplay.

---

# PROPERTY

Verify:

- starts unowned
- purchase
- ownership
- rent
- development
- invalid purchase
- duplicate purchase
- property cannot have two owners

---

# AUCTION

Verify:

- start
- bids
- invalid bids
- insufficient resources
- winner
- payment
- ownership
- completion
- duplicate bid

---

# TRADE

Verify:

- valid trade
- invalid trade
- unavailable asset
- changed asset
- insufficient funds
- accept
- reject
- cancel
- duplicate acceptance
- atomic execution

---

# ARMY

Verify:

- purchase
- quantity
- cost
- power
- limits
- available army
- committed army
- support
- release

Critical invariant:

available army + committed army must never exceed the player's total usable army according to the configured model.

---

# SCOUTING

Verify:

- target
- cost
- limits
- result
- private information
- no information leakage

---

# ALLIANCE

Verify:

- request
- acceptance
- rejection
- duplicate request
- invalid target
- active state
- expiration

---

# ARMY LENDING

Verify:

- valid support
- insufficient army
- invalid target
- alliance requirements
- support limits
- duplicate support
- release
- committed army unavailable for simultaneous reuse

---

# WAR

Verify:

- declaration
- target
- territory
- costs
- army power
- support
- resolution
- casualties
- capture
- duplicate resolution
- victory interaction

The client must never determine the result.

---

# BANKRUPTCY

Verify:

- inability to pay
- bankruptcy
- assets
- properties
- player status
- spectator mode
- rejected commands

---

# VICTORY

Verify:

- exact victory condition
- winner
- terminal state
- no actions after game over

---

# INVARIANTS

The game engine must guarantee:

- property has at most one owner
- money changes are legal
- bankrupt players cannot act
- only active player performs turn actions
- client cannot control dice
- client cannot control rent
- client cannot control ownership
- client cannot control war result
- trade executes at most once
- auction produces one winner
- war resolves at most once
- committed army cannot be reused
- finished game is terminal

---

# ROOM TESTS

Test:

- create
- join
- leave
- colour
- duplicate colour
- host
- settings
- start
- invalid room
- full room

---

# MULTIPLAYER

Run multiple clients.

Verify every client sees identical authoritative:

- players
- money
- positions
- ownership
- development
- turn
- auction
- trade
- alliance
- army
- war result

---

# RECONNECTION

Disconnect:

- active player
- inactive player
- during movement
- during auction
- during trade
- during alliance
- during war

Reconnect.

Verify authoritative state is restored.

---

# RACE CONDITIONS

Test simultaneous:

- property purchase
- auction bids
- trade acceptance
- alliance acceptance
- war commands

Only one legal state transition should win where appropriate.

---

# SECURITY

Attempt malicious commands:

SET_MONEY
SET_POSITION
SET_DICE
SET_OWNER
SET_ARMY
FORCE_RENT
FORCE_WAR_WIN
FORCE_VICTORY

All must be rejected.

---

# FRONTEND

Verify:

- board
- order
- city names
- prices
- territory emblems
- ownership
- development
- tokens
- actions
- panels
- modals
- notifications
- connection state

---

# VISUAL

Check:

1366×768
1440×900
1920×1080

Verify:

- board fits
- bottom visible
- no unwanted page scrolling
- no clipping
- no overlapping
- no upside-down text
- readable city names
- readable prices
- readable controls

---

# ACCESSIBILITY

Check:

- keyboard
- focus
- contrast
- semantic controls
- labels
- modal focus
- disabled state
- colour-independent critical information

---

# PERFORMANCE

Measure:

- initial load
- board rendering
- React rendering
- WebSocket messages
- server processing
- database queries
- memory
- network usage

Optimize only after measurement.

---

# REGRESSION

Every important bug should receive a regression test.

Example:

Bug:
Duplicate trade execution.

Fix:
Request ID.

Test:
Submit same ACCEPT_TRADE twice.

Expected:
One execution.

---

# RELEASE GATE

Before production:

- [ ] typecheck
- [ ] lint
- [ ] unit tests
- [ ] integration tests
- [ ] multiplayer tests
- [ ] E2E
- [ ] security
- [ ] reconnection
- [ ] visual QA
- [ ] accessibility
- [ ] performance
- [ ] production build