# CLAUDE.md — Tactical Empire Operating System

## 0. PROJECT IDENTITY

Product:
Tactical Empire

Product Type:
Multiplayer browser-based strategic board game.

Primary Use Case:
Friends playing together in classrooms and social environments.

Primary Platform:
Desktop Web Browser.

Primary Development Agent:
Claude Code.

Primary Model:
Claude Opus.

---

# 1. PRODUCT INDEX & GOALS

## 1.1 Source-of-Truth Hierarchy

Claude MUST respect the following authority order.

### Gameplay

1. `docs/GAME_RULES.md`
2. `docs/GAME_CONFIG.json`

These define WHAT the game does.

### Product

3. `product.md`
4. `personas.md`
5. `goals.md`

These define WHO the game is for and WHY it exists.

### Visual Design

6. `DESIGN.md`
7. `docs/UI_SPEC.md`

These define HOW the game looks and behaves visually.

### Technical Architecture

8. `docs/ARCHITECTURE.md`
9. `docs/API_SPEC.md`
10. `docs/EVENT_SPEC.md`

These define HOW the software is structured.

### Testing

11. `docs/TEST_PLAN.md`

Defines HOW correctness is verified.

---

# 2. PRODUCT GOAL

Tactical Empire should provide a fast, social, strategic multiplayer board-game experience.

The core experience combines:

- property acquisition
- territory completion
- rent
- development
- auctions
- trading
- army building
- scouting
- alliances
- army lending
- warfare
- negotiation
- risk management

The social layer is important.

Players may verbally negotiate outside the application.

The application only enforces formal game actions.

---

# 3. NORTH STAR

The North Star is:

> Players should continuously have meaningful strategic decisions while understanding the game state immediately.

A player should always understand:

- whose turn it is
- their money
- their properties
- their army
- the current board position
- available actions
- important threats
- recent events

---

# 4. ACTIVE DEVELOPMENT PRINCIPLE

Development uses vertical slices.

Do NOT build the entire backend first and the frontend later.

Each major milestone should produce something visually testable.

Preferred sequence:

Foundation
→
Playable shell
→
Lobby
→
Board
→
Dice
→
Movement
→
Property
→
Economy
→
Trade/Auction
→
Army
→
Scouting
→
Alliance
→
War
→
Victory
→
Polish
→
QA
→
Deployment

---

# 5. GOAL-DRIVEN PROTOCOL

For every non-trivial task:

1. Determine the goal.
2. Identify the relevant source-of-truth documents.
3. Inspect only relevant files.
4. Identify dependencies.
5. Implement the smallest complete slice.
6. Verify.
7. Report result.

Do NOT read the entire repository unnecessarily.

---

# 6. INTERVIEW RULE

Do NOT automatically conduct a four-question interview for every task.

Only ask questions when:

- required gameplay rules are missing
- required UI behavior is genuinely undefined
- two authoritative documents conflict
- implementation cannot safely proceed

If the specification is sufficiently defined:

Proceed autonomously.

Never ask questions merely to confirm information already present in the repository.

---

# 7. AUTONOMY GUARD

Claude may autonomously:

- inspect code
- create files
- implement requested features
- refactor local code
- run tests
- fix implementation errors
- fix type errors
- fix lint errors
- improve obvious UI overflow
- update relevant documentation

Claude MUST stop and request approval when:

- gameplay rules must change
- game balance must change
- a source-of-truth document conflicts with another
- a major architectural change is required
- a new external service is required
- sensitive/security-impacting architecture changes are required

Do not endlessly iterate.

Maximum normal verification loop:

Implement
→ Test
→ Fix
→ Test
→ Review
→ Stop

---

# 8. DESIGN AUTHORITY

Before changing UI:

Read only the relevant sections of:

`DESIGN.md`

and:

`docs/UI_SPEC.md`

Do not invent a new visual language.

Do not redesign existing approved screens without reason.

Do not introduce:

- fantasy RPG commander themes
- excessive medieval decoration
- dark military dashboards
- excessive glassmorphism
- unnecessary 3D elements

The product is a modern strategic board game.

---

# 9. GAMEPLAY AUTHORITY

Never invent gameplay rules.

Never change:

- prices
- rent
- army power
- army costs
- war formulas
- alliance rules
- scouting rules
- movement
- victory conditions

unless explicitly instructed.

All gameplay constants must come from:

`docs/GAME_CONFIG.json`

All gameplay behavior must follow:

`docs/GAME_RULES.md`

---

# 10. SERVER AUTHORITY

The server/game engine is authoritative.

Never trust client-provided:

- cash
- position
- dice result
- property ownership
- rent
- army power
- war result
- casualties
- victory
- auction winner

Client:

REQUESTS

Server:

VALIDATES → RESOLVES → BROADCASTS

---

# 11. GAME ENGINE RULE

Gameplay logic must live in the framework-independent game engine.

Frontend must NOT contain authoritative gameplay calculations.

Backend transport code must NOT contain gameplay rules.

Database code must NOT contain gameplay rules.

Preferred architecture:

Client
→ Command
→ Server
→ Game Engine
→ State Transition
→ Event
→ Persistence
→ Broadcast
→ Client

---

# 12. UI RULE

The frontend is a presentation layer over authoritative game state.

Separate:

SERVER STATE

from:

LOCAL UI STATE

Server state includes:

- players
- cash
- properties
- position
- army
- alliances
- wars
- turn
- round

Local UI state includes:

- modal open/closed
- selected player
- selected property
- hovered tile
- animation progress
- active tab

---

# 13. PERFORMANCE RULE

Prefer simple architecture.

Do NOT introduce:

- microservices
- Kubernetes
- Kafka
- Redis
- ECS
- unnecessary CQRS
- unnecessary event brokers

unless a concrete requirement proves the need.

---

# 14. CODE QUALITY

Use:

- strict TypeScript
- small focused modules
- typed interfaces
- Zod validation
- reusable components
- meaningful names
- configuration-driven data

Avoid:

- unnecessary abstraction
- duplicated logic
- magic numbers
- giant components
- giant functions
- `any`
- dead code
- speculative features

---

# 15. TESTING GATES

Before declaring a feature complete:

- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Relevant unit tests pass
- [ ] Relevant integration tests pass
- [ ] Relevant E2E tests pass
- [ ] No obvious console errors
- [ ] No gameplay logic duplicated in frontend
- [ ] No source-of-truth rules modified accidentally

For visual features:

- [ ] 1366×768 checked
- [ ] 1440×900 checked
- [ ] 1920×1080 checked

---

# 16. ACCESSIBILITY

Target WCAG 2.1 AA where practical.

Check:

- keyboard navigation
- focus states
- contrast
- readable text
- non-colour-only indicators
- button labels
- disabled states
- modal accessibility

---

# 17. TASK REPORT FORMAT

At the end of a task report only:

### Completed
- concise list

### Changed
- relevant files

### Verification
- commands/tests
- result

### Issues
- only unresolved issues

### Next
- one recommended next step

Do not dump large files into the response.

---

# 18. CONTEXT EFFICIENCY

This is mandatory.

Claude should:

- read only relevant documents
- read only relevant code
- avoid repeating specifications
- avoid reproducing entire files
- avoid unnecessary refactoring
- avoid rewriting working code
- use existing abstractions where appropriate
- make focused commits

Never paste the complete contents of `GAME_RULES.md` or `DESIGN.md` into responses unless explicitly requested.

---

# 19. DEFINITION OF DONE

A feature is complete only when:

Specification
→
Implementation
→
Validation
→
Integration
→
Testing
→
UI verification where applicable

are complete.

A visual mockup alone is NOT a completed gameplay feature.

A backend endpoint alone is NOT a completed player feature.

---

# 20. CURRENT DEVELOPMENT RULE

Work in phases.

Do not implement unrelated future systems.

When asked to implement Phase N:

- inspect Phase N dependencies
- implement Phase N
- test Phase N
- preserve previous functionality
- stop

Do not continue into later phases unless explicitly requested.