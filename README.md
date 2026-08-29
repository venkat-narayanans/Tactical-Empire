# Tactical Empire

A multiplayer browser board game: property, territory control, economy,
auctions, trading, army, scouting, alliances and war, for 2–8 friends in one
room.

The game is defined by `GAME_RULES.md` and `GAME_CONFIG.json`. Nothing in the
code redefines a rule or a number; where those documents left a detail open, the
choice is recorded in [docs/DECISIONS.md](docs/DECISIONS.md).

---

## Running it

```bash
npm install
```

```bash
npm run dev
```

That starts the API/WebSocket server on port 3001 and the Vite client on
http://localhost:5173, which proxies `/ws` and `/api` to the server. Open the
client, create a game, and share the five-character room code.

Production:

```bash
npm run build && npm start
```

The server then also serves the built client, so a single process on port 3001
(override with `PORT`) is the whole game.

Everything at once — typecheck, lint, tests, production build:

```bash
npm run verify
```

---

## How it is put together

```
packages/config        validated, typed loader over GAME_CONFIG.json
packages/shared        domain types, command and event contracts, error codes
packages/game-engine   the rules: state, commands, RNG, transitions, events
apps/server            Fastify + WebSocket, SQLite persistence, room service
apps/web               React client, presentation only
tests/                 engine unit tests and multiplayer integration tests
```

Dependencies point one way: `web → server → game-engine → config`. The engine
imports no React, no WebSocket library and no database driver, which is why it
can be tested in-process with a seeded RNG and no browser.

### The server decides everything

The client sends intent and nothing else. There is no command that sets money,
position, ownership, dice, army power, a war result or a winner — not "rejected
if sent", but absent from the protocol. A round trip looks like:

```
client command → schema validation → session identity → engine rules
              → state transition → events → atomic commit → broadcast
```

Each command runs against a private deep copy of the game state. It becomes the
room's state only if the engine accepts it *and* the store commits it, so a
rejected command leaves the game byte-for-byte unchanged. Commands for one game
are serialised, so two players buying the same property resolve to exactly one
owner and one legal rejection.

Every mutating command carries a `requestId`. A repeat of one already applied is
recognised and does nothing, which makes a retry after a dropped connection
safe.

### What each player is allowed to see

Cash and army are private. The server projects a separate view per player and
filters the event stream by audience, so an opponent's balance and army are not
merely hidden in the UI — they are never sent. Scouting (₹100) is how you learn
them, and its report is delivered only to the scout. Alliance requests and trade
offers reach only the two parties.

### Randomness

Dice and the two war battle factors come from a seeded generator stored inside
the game state. Production seeds it from entropy; tests seed it deliberately,
which is how the war and movement tests assert exact outcomes. `Math.random()`
is never called during play.

### The client

React with a store split in two: the authoritative snapshot from the server,
replaced wholesale, and local UI state — open panel, selection, animation
progress — that never touches a game value. Token movement and dice animation
are driven by events after the fact; they display a result, they never produce
one.

The board is generated from `GAME_CONFIG.json`. There is no per-space JSX
anywhere, and city names are never rotated.

---

## Tests

```bash
npm test
```

129 tests covering initialization, turn order, dice, movement, landing, the
event decks, property purchase, rent for all three special-property groups,
development and even-build, mortgages, auctions with anti-sniping, trading with
revalidation at acceptance, army capacity and resale, alliances and expiry, army
lending limits, war resolution and casualties, bankruptcy, victory and scoring.

The integration suite runs a real server over real WebSockets with real SQLite
and asserts the things that only show up end-to-end: two clients staying in
sync, an opponent's cash never appearing in a payload, a simultaneous purchase
producing one owner, a duplicate `requestId` applying once, a disconnect leaving
a player in the game, and reconnection restoring their exact state from a
session token.

Security cases assert that `SET_MONEY`, `SET_POSITION`, `SET_DICE`, `SET_OWNER`,
`SET_ARMY`, `FORCE_RENT`, `FORCE_WAR_WIN` and `FORCE_VICTORY` are rejected as
unknown commands, and that extra fields smuggled onto `ROLL_DICE` are stripped
before the engine sees them.

---

## Configuration

`GAME_CONFIG.json` is the only place gameplay numbers live. It is schema-checked
at startup, and a set of structural assertions runs before any room exists: 40
board spaces, four corners, 22 cities, every city in a territory that lists it
back, prices agreeing between `cities` and `city_economics`, and every rent
level matching `base_rent × rent_multiplier`. A malformed config fails at boot
rather than mid-game.

Host settings chosen in the lobby are clamped to the ranges in
`host_settings` and freeze when the game starts. The host cannot set money, move
players, choose dice, change ownership or force a result.

---

## Documents

| File | What it governs |
| --- | --- |
| `GAME_RULES.md` | what each mechanic means |
| `GAME_CONFIG.json` | every number, price and limit |
| `DESIGN.md` | visual language |
| `docs/UI_SPEC.md` | screens and interaction |
| `docs/ARCHITECTURE.md` | software structure |
| `docs/API_SPEC.md` | command and network contract |
| `docs/EVENT_SPEC.md` | event model and ordering |
| `docs/TEST_PLAN.md` | what must be verified |
| `docs/DECISIONS.md` | choices made where the above left a gap |
