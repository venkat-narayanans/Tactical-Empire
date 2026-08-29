# SOURCE OF TRUTH HIERARCHY

GAME_RULES.md defines the conceptual and structural rules of Tactical Empire.

GAME_CONFIG.json defines the machine-readable implementation configuration and balancing values.

When implementing the game:

1. GAME_RULES.md defines what the mechanic means.
2. GAME_CONFIG.json defines configured numerical values and board/content data.
3. Neither frontend code nor UI specifications may independently redefine gameplay rules.
4. If GAME_RULES.md and GAME_CONFIG.json appear to conflict, do not silently choose one. Report the conflict and resolve it before implementing the affected mechanic.
5. UI_SPEC.md describes presentation and interaction only; it is never an authority for gameplay calculations.
6. ARCHITECTURE.md describes software structure only; it is never an authority for gameplay rules.

# Tactical Empire — Machine-Readable Game Configuration
Version: 1.0.0

This file is the single source of truth for the initial game configuration. Rules that are structural are represented as invariants; balancing constants are represented as configuration values so they can be changed without rewriting the game engine.

## Core
- Board spaces: 40
- Players: 2–8
- Starting cash: ₹3000
- Turn timer: 60 seconds
- Maximum rounds: 60

## Territories
- T1: Madagadipet, Thirubhuvanai — bonus ₹500\n- T2: Molapaakam, Kandamangalam, Ariyur — bonus ₹750\n- T3: Thirukaanji, Villianur, Sulthanpet — bonus ₹750\n- T4: Velrampet, Ariyankuppam, Cuddalore — bonus ₹750\n- T5: Kalapet, Rediyarpalayam, Kottakuppam — bonus ₹750\n- T6: Lawspet, Muthialpet, Nellithope — bonus ₹750\n- T7: Uzhavarkarai, Thattanchavady — bonus ₹500\n- T8: Bussy Street, Mission Street, White Town — bonus ₹750\n
## City economics
Base rent is 10% of purchase price, rounded to the nearest ₹5, with a minimum of ₹20.
Rent multipliers: 1×, 3×, 6×, 10×, 15×, 22× for levels 0–5.
Level 5 is the hotel.

## Development
House costs by territory:
- T1: ₹50\n- T2: ₹60\n- T3: ₹70\n- T4: ₹80\n- T5: ₹80\n- T6: ₹90\n- T7: ₹90\n- T8: ₹100\n
Hotel cost equals the territory house cost. Building resale is 50%.
Even-build mode allows a maximum one-level difference within a complete set.

## Army
- Guard: ₹250 / 30 power
- Archer: ₹350 / 45 power
- Rider: ₹500 / 65 power
- Siege: ₹750 / 90 power
- Base capacity: 6 units
- +1 capacity per 2 owned cities
- Maximum: 14 units
- Army resale: 50%

## Diplomacy
- One active alliance per player.
- Alliance duration: 3 rounds.
- Army lending cap: 30% of currently available army power.
- Same target can be scouted once per round.
- Scout cost: ₹100.

## War
- One outgoing war per turn.
- One active war per player.
- Declaration fee: 10% of target territory property value, clamped to ₹100–₹250.
- Defender receives +10% home-defense power.
- Battle factors are independently sampled from 0.90–1.10.
- Casualties are based on battle margin.
- Winner also takes casualties.
- Weakest units are removed first.
- Captured target-player properties in the selected territory receive one round of war damage.
- War-damaged properties collect 75% rent and cannot be developed for that round.

## Safety / Consistency Invariants
- cash must never be negative\n- only current player may perform turn actions\n- client never determines authoritative dice or war RNG\n- one property can have at most one owner\n- one army unit cannot be simultaneously active, lent, sold, or lost\n- one asset cannot participate in conflicting trade/auction/war locks\n- territory completion is derived from city ownership\n- army power is derived from active units\n- all important commands are idempotent using actionId\n- state-changing operations are atomic\n- host settings freeze when game starts\n- automatic event chains cannot exceed configured maximum depth\n- all money uses integer currency units\n
## Implementation rule
The frontend is a presentation client. The authoritative game engine must validate commands, mutate state atomically, emit events, and broadcast the resulting state/events to clients. Client-side animations never determine game outcomes.
