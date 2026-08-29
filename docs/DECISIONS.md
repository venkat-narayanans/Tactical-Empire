# TACTICAL EMPIRE
# IMPLEMENTATION DECISIONS

Every gameplay value comes from `GAME_CONFIG.json` and every mechanic from
`GAME_RULES.md`. This file records the places where those two documents did not
fully determine an implementation detail, what was chosen, and why.

Nothing here overrides a rule or a configured number. If a decision below ever
conflicts with `GAME_RULES.md` or `GAME_CONFIG.json`, those documents win and
the code is wrong.

---

## 1. Cash and army are private; scouting is how you learn them

**Gap.** `DESIGN.md` §17 says the left panel "may show money" and `UI_SPEC.md`
lists "money" in the player panel, while `GAME_CONFIG.scouting.reveals` pays
₹100 to reveal `army_unit_types`, `army_power` and a `cash` *range*.

**Decision.** A player sees their own cash, army and statistics in full. For
opponents, cash and army are omitted from the state the server sends; scouting
is the only way to learn them. Everything already visible on the board —
ownership, development, positions, completed territories, formed alliances —
stays public.

**Why.** Scouting is a priced mechanic in the authoritative config, and it only
has meaning if those values are hidden. Read that way there is no real conflict:
the player panel in `UI_SPEC.md` is the viewer's own panel, and the player list
is specified as "relevant public information". Gameplay authority sits above
`UI_SPEC.md` in the hierarchy, so the scouting config decides.

**Where.** `packages/game-engine/src/projection.ts`.

---

## 2. Auction length

**Gap.** `GAME_CONFIG.auction` defines the starting bid, bid validity, the
no-bid outcome and `anti_sniping_extension_seconds: 5`, but no base duration.

**Decision.** An auction runs for 20 seconds (`AUCTION_DURATION_SECONDS`), and
any bid extends the deadline to at least 5 seconds from that bid. An auction
also closes early once every remaining bidder has passed.

**Why.** An auction has to terminate. The anti-sniping extension is configured
and is applied exactly as specified; only the base window was missing, and it is
a single named constant that is easy to move into config later.

**Where.** `packages/game-engine/src/auction.ts`.

---

## 3. War casualty margin thresholds

**Gap.** `GAME_RULES.md` says "casualties are based on battle margin" and the
config gives three rates (`close_battle` 0.30, `moderate_victory` 0.25,
`decisive_victory` 0.20) with `winner_also_takes_casualties: true`, but no
margin boundaries and no winner rate.

**Decision.** With `margin = winnerPower / loserPower`:

| margin | rate applied to the loser |
| --- | --- |
| < 1.2 | `close_battle` |
| < 1.5 | `moderate_victory` |
| >= 1.5 | `decisive_victory` |

The winner loses half the loser's rate. Each rate is applied to that player's
own committed power, removing weakest units first until at least that share of
power is gone.

**Why.** The configured rates fall as victory becomes more decisive, which only
makes sense as "a close battle is bloodier", so the thresholds are ordered to
match. Halving for the winner keeps the winner's losses strictly smaller while
still making an expensive victory possible.

**Where.** `packages/game-engine/src/war.ts` (`casualtyRateFor`).

---

## 4. Lent units cannot become casualties

**Gap.** It is not stated whether army lent to an ally can be destroyed in that
ally's war.

**Decision.** Casualties only ever remove units the principal holds themselves.
Units lent to an ally are locked to that ally and are never lost.

**Why.** The invariant list in both `GAME_RULES.md` and `GAME_CONFIG.json` reads
"one army unit cannot be simultaneously active, lent, sold, **or lost**", which
puts `lent` and `lost` in the same set of mutually exclusive states.

**Where.** `packages/game-engine/src/war.ts` (`removeWeakestUnits`).

---

## 5. Ally support in war means army that was actually lent

**Gap.** `GAME_CONFIG.alliances.defender_ally_must_accept: true` implies a
consent step, but `GAME_RULES.md` defines no war response phase, and
`EVENT_SPEC.md` says `WarResponseRequested` "exists only if required by
GAME_RULES.md".

**Decision.** War resolves immediately on declaration. A player's support power
is the army their ally has already committed to them through `LEND_ARMY`, which
requires an accepted alliance and a deliberate act by the lender.

**Why.** The acceptance the config asks for already exists — twice — in
accepting the alliance and in choosing to lend. No new mechanic is invented, and
lending becomes a genuine pre-commitment decision.

**Where.** `packages/game-engine/src/war.ts` (`resolveWar`).

---

## 6. How long a war stays "active"

**Gap.** `war.locked_during_war` freezes `trade` and `new_mortgage`, and
`max_active_wars_per_player` is 1, but wars resolve instantly, so without a
duration both would never apply.

**Decision.** A war counts as active for the remainder of the turn in which it
was declared. During that window its two participants cannot create trades or
take new mortgages.

**Why.** It gives the configured locks a real effect without inventing a
multi-turn war phase that no rule describes.

**Where.** `packages/game-engine/src/property.ts` (`isInActiveWar`), cleared in
`turn.ts` at turn end.

---

## 7. "Target territory property value" for the declaration fee

**Gap.** The fee is `clamp(territory_property_value * 0.10, 100, 250)`, but
"territory property value" is not defined.

**Decision.** The sum of the purchase prices of the **defender's** properties in
the selected territory.

**Why.** The fee is described as a share of the target's holdings, and the war
targets one player's property in one territory. Using the whole territory,
including cities the defender does not own, would charge the attacker for
property that is not at stake.

**Where.** `packages/game-engine/src/war.ts` (`territoryPropertyValue`).

---

## 8. Mortgaging requires an undeveloped property

**Gap.** `mortgage.building_while_mortgaged: false` forbids building on a
mortgaged property but does not say what happens to existing buildings.

**Decision.** A property must be at development level 0 to be mortgaged; the
owner sells its buildings first (at the configured 50% resale).

**Why.** It keeps the two states mutually exclusive in one direction as the
config already does in the other, and avoids inventing a rule for what a
mortgaged hotel would be worth.

**Where.** `packages/game-engine/src/property.ts` (`mortgageProperty`).

---

## 9. Buildings do not transfer on bankruptcy

**Gap.** `bankruptcy` specifies that army transfers to the creditor and that
bank-held assets return to unowned, but not what happens to buildings on
transferred properties.

**Decision.** Properties transfer to the creditor at development level 0; the
buildings are lost.

**Why.** The creditor would otherwise inherit a developed set without the
even-build spending that normally earns it, and no rule grants that.

**Where.** `packages/game-engine/src/bankruptcy.ts`.

---

## 10. Scouted cash range granularity

**Gap.** `scouting.reveals.cash: "range"` does not define the range width.

**Decision.** Cash is reported as the ₹250 bucket it falls in, e.g. ₹1,250–₹1,500.

**Why.** Wide enough to stay an estimate rather than an exact figure, narrow
enough to inform a war decision, and a round number against the configured
prices and army costs.

**Where.** `packages/game-engine/src/scouting.ts` (`cashRange`).

---

## 11. State machine phases

**Gap.** `ARCHITECTURE.md` §14 lists *recommended* states including
`RESOLVING_MOVEMENT`, `RESOLVING_LANDING`, `TRADE`, `ALLIANCE` and `WAR`.

**Decision.** The persisted phases are `LOBBY`, `PLAYER_TURN`, `ACTION`,
`AUCTION`, `RESOLVING_DEBT` and `GAME_OVER`.

**Why.** Movement and landing are resolved inside the single `ROLL_DICE`
command, so they never exist between commands — storing them would be a phase
the game can never be observed in. Trade, alliance and scouting do not suspend
the turn, so they are not phases either; they are side interactions. Auctions
and unpaid debts genuinely do suspend play, so they are phases. Movement and
landing are still fully visible to clients through the ordered event stream
(`PlayerMoved`, `LandingResolved`), which is what drives the animations.

**Where.** `packages/shared/src/state.ts` (`GamePhase`).

---

## 12. Persistence engine

**Gap.** `ARCHITECTURE.md` §6 recommends PostgreSQL with Prisma.

**Decision.** Persistence sits behind a `GameStore` port with a SQLite adapter
(`better-sqlite3`) as the shipped implementation.

**Why.** No PostgreSQL service is available in this environment, and the
architectural requirement is atomicity, not a specific vendor: `better-sqlite3`
is synchronous, so a command's new state and its events commit inside one real
transaction, with an optimistic version check to reject a stale write. Because
every call goes through the port, swapping in a Postgres adapter touches one
file and no gameplay code.

**Where.** `apps/server/src/db/store.ts`, `apps/server/src/db/sqlite-store.ts`.

---

## 13. Turn timer expiry

**Gap.** `GAME_RULES.md` sets a 60-second turn timer but does not say what
happens when it runs out.

**Decision.** On expiry the server rolls for the player if they have not rolled,
resolves the landing normally, treats an unanswered purchase offer as a decline
(which starts an auction when auctions are on), and ends the turn. A player with
an unsettled debt is not force-advanced.

**Why.** A disconnected or idle player must not be able to stall a social game,
and the timer is only meaningful if it does something. Rolling for them applies
the same authoritative rules as any other roll and never invents an outcome.

**Where.** `packages/game-engine/src/turn.ts` (`forceEndTurn`).

---

## 14. Buying army, scouting and declaring war are own-turn actions

**Gap.** The rules cap wars per turn and scouting per round, but do not say
whether recruiting or scouting can happen off-turn.

**Decision.** `BUY_ARMY`, `SCOUT`, `BUILD` and `DECLARE_WAR` require it to be
the player's own turn. Trading, alliance requests, selling buildings, selling
army and mortgaging remain available at any time.

**Why.** "One outgoing war per turn" and "scout a target once per round" are
both expressed per turn or round, which only bounds anything if these are turn
actions. The reactive actions a player needs in order to raise money or answer
an offer stay open, which is what keeps debt resolution and trading workable.

**Where.** `packages/game-engine/src/engine.ts` (`requireOwnTurnAction`).
