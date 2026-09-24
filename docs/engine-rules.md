<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Quantum Chess: engine rules (normative)

**Rules version `v = 1`.** This document is the normative specification of the game rules for the two engine
implementations: `src/engine` (JavaScript, browser and Web Worker) and `lib/Engine` (PHP, server). The two engines
must produce **byte-identical** results on the parity fixtures. [`rules.md`](rules.md) explains the same rules
for players.

Conventions:

- MUST, MUST NOT, SHOULD and MAY are used as in RFC 2119. Everything is normative unless it is marked
  *(non-normative)*.
- Squares are written as names (`e4`) in prose and move codes, and as integer indices in JSON.
- `T` is the fixed weight total `2^24 = 16 777 216` (§1).
- "World" and "board" are bookkeeping words. The player-facing name for a world is a *possibility*.

---

## 0. Design decisions

Each row records a decision that shapes these rules, with the reason for it. Rows D17 and D18, and the edge cases
65–86 and A1–A6 of §11, came out of an adversarial review of an earlier draft of these rules.

| # | Decision | Rationale |
|---|---|---|
| D1 | The state is a **public probabilistic mixture of classical boards** ("worlds"). There are no amplitudes and no interference. | Odds are something a player can work out, captures are always definite, and the model is cheap to compute. Signed amplitudes were rejected: JS and PHP floats do not cancel reliably (`H·H ≠ 0.5`), and partial merges are unreadable for players. |
| D2 | **Integer weights with a fixed total `T = 2^24`.** A split uses ceil/floor. Rescaling uses the largest-remainder rule. The state holds no floats, the JSON is byte-identical, and parity has no tolerance. | PHP and JS print floats differently (`1.0e-7` vs `1e-7`). A 1e-12 tolerance lets the two engines sample different outcomes at a boundary. Exact rationals grow without bound. |
| D3 | **Kings are always classical.** They never split or merge, and every non-castling king move is in the measured class M (castling is never in M, §4.5, §4.6). | No king-hiding and no surviving by a defensive coin flip. King danger is cheap to compute exactly. |
| D4 | **There is no check rule.** Every move that is otherwise legal stays legal whatever it does to your king. You win by capturing the king. Instead there is a **king-danger ring** that always shows its percentage and a **confirmation dialog** that is on by default. These are UI aids, not rules. The only related rule is a *termination* rule: a side whose every move leaves its king certainly capturable has lost at once (D17). | A check layer adds a second legality notion, and it brings "reckless move" losses. Instant blunder losses are handled by the confirmation, which asks from 10% risk upwards (§8) so that cheap low-odds king shots do not go unnoticed. The ring turns red at 100% ("certain danger"): the opponent has a move that captures the king with probability 1, which is the useful meaning of check. Chess players still get check-like moments without a second legality notion. |
| D5 | **Per-side quantum budget: `B(c) ≤ 8`.** B(c) counts the distinct arrangements of side c's own pieces. `worlds ≤ 64` follows from it. A split that would exceed the budget is illegal. A non-measured move that would exceed it is resolved by a roll (*budget fallback*); it is never forbidden. | The opponent can never use up your capacity (proof in §7.2). A shared global cap would allow capacity-denial griefing. A fixed number of "ghost slots" was not chosen: in a mixture model the thing to bound is correlation, not pieces. The UI shows the budget as a pip meter and explains the number as "three 50/50 splits". |
| D6 | **Readability limits.** A split may not leave the piece on more than `MAX_LOCATIONS = 4` squares. Split targets must be empty in **every** world, including the splitting piece itself. There is **no** minimum branch weight: a branching world of weight 1 sends its single unit to child 1 (§4.7). | Arbitrary weights are hard to read. A split can no longer build a 5-square cloud, and it can no longer land on its own part, which was the main source of 3:1 and 5:3 odds. A minimum branch weight (`MIN_BRANCH_WEIGHT = 2`) was considered and dropped: every classical piece stands in every world, so one weight-1 world, which the *opponent* can create, would forbid all of your splits. That is exactly the capacity denial D5 rules out. |
| D7 | **A split is two half-weight standard moves.** A child whose lane is blocked stays on the source square. The split also needs at least one world where both lanes are clear. | The same blocking rule applies everywhere. No split can quietly move the whole piece to one target. |
| D8 | **A merge is a converging move and may capture** (*converging capture*). If the result is uncertain it is rolled. If X reaches the target in **every** world (so X stands only on the two merged squares, or already on the target, and no lane can be blocked), the capture is certain and no number is drawn. | "Preparation beats dice": good play turns uncertainty into certainty. It also settles the case of a ghost queen attacking the king with both halves. |
| D9 | **Measure move.** Spend your turn to measure one of your own superposed pieces. It has at most 8 outcomes. | It gives the player a choice at the budget limit, frees stuck ghosts, and teaches measurement as a deliberate act. You can measure only your own pieces. |
| D10 | **When a roll happens.** A move is rolled only if it is a pawn move, a king move, a merge or standard move that *lands* on a square another piece might hold, a Measure, or a budget fallback. A slide past a possibly-occupied square links the pieces without a roll. A number is drawn only when there are at least 2 outcomes. The outcome key is `miss` / `move` / `capture`. | The mnemonic is "land = roll, pass = link". A chance node has at most 3 children. Forced outcomes use no randomness. |
| D11 | **Pawns stay classical**, and promotion and en passant are always definite. `ep` is set only when an en-passant capture is actually available. | The chess skeleton stays solid, and the repetition key carries no `ep` noise. |
| D12 | **Castling rights follow the state.** A right is lost when, after a move, the king or that rook is not certainly on its home square. A missed or blocked attempt keeps the right. | It is as deterministic and cheap as the attempt-based rule, and attempt-based loss punishes moves that never happened. |
| D13 | **Termination rules.** Threefold repetition is automatic, using FNV-1a-64 over the exact state. The 50-move rule counts only events that actually happened. Bare kings is a draw, no legal move is a draw, and there is a technical cap of 1200 plies. There is **no** K+minor draw. The bare-kings, repetition and 50-move draws **yield to a pending certain king capture** (D18). | Split and merge shuffling can no longer stall a game. Without check, K+minor versus K may be winnable. |
| D14 | **Randomness.** Online, a fresh CSPRNG value is drawn when the move is applied, and no seed is stored. Each move record carries a SHA-256 hash chain, which detects later changes to moves a client has **already loaded**; it cannot detect a roll that someone with database access changes before the opponent's client first loads the move (§9.4). Local games draw a fresh CSPRNG value the first time a rolled move is played in a given position and remember it for that game (*roll memo*), so undo cannot re-roll the same move in the same position, and no future value exists that could be read in advance. The trainer uses forced outcomes. | A commit-reveal seed kept on the server lets an admin see every future roll, and the admin is often a player. A local HMAC seed was rejected: the seed sits in browser storage, so a player could compute every future roll, and a different promotion letter gave a fresh roll after an undo. Two-party verifiable dice need a secret on the opponent's device (Appendix D). |
| D15 | **Determinism discipline.** Every state carries `v`. Key order is fixed. Codes are canonical. The move list has a total integer order. The engine provides a lenient parser, `whyIllegal` reason codes, `isLegal` / `hasAnyLegalMove`, and `applyMove({u} \| {outcome})`. | These make bit-identical twin engines possible and give the LLM useful feedback when it retries. |
| D16 | **Honesty contract** for the trainer, the coach and LLM prompts (Appendix E). | The game models superposition, measurement and entanglement as correlation. It does not model interference or non-locality. |
| D17 | **Trapped king ends the game** (`king_trapped`, E1b). After a move, if every legal move of the side to move leaves the game running with its own king certainly capturable (`kingTrapped`, §6), the mover wins at once. | Without it every forced win needs one pointless extra ply from the loser, and the loser controls when it happens: in a correspondence game the winner could wait days for a timeout. It is a termination rule, not a legality rule, so D4 still holds. It reuses `generateMoves`, `getOutcomes` and `kingDanger`, which are already parity-tested. |
| D18 | **Draws yield to a certain king capture.** E2 (bare kings), E3 (repetition) and E4 (50 moves) are checked only if the side to move has no certain king capture. | Otherwise taking the last defended piece with the king next to the enemy king, or blundering on the 100th half-move, would turn a lost position into a draw. Chess avoids this because moving into check is illegal and mate takes precedence over the move-count rules. |

**Rejected, with the reason:**

- **Signed amplitudes, interference and partial merges.** These are float-fragile and players cannot follow them. They are at most a future unrated variant with its own `v`.
- **Splittable kings.**
- **Any global world cap.** It allows capacity denial.
- **A commit-reveal seed stored on the server.** It gives the admin foresight.
- **The coin/ghost model as the canonical state.** It is a second representation, and every probability is 50/50. Its readability goals are kept through D5, D6 and the UI.
- **Check, reckless moves and the `king_exposed` auto-loss.**
- **A "Family" legality mode.** It would be a second parity surface.
- **Decoherence timers and multi-way splits.**
- **Live Fischer clocks in v1.** They need polling at 1 s or faster.
- **Float weights, the 1e-12 tolerance and a vanishing-weight floor.**
- **A minimum branch weight for splits** (`MIN_BRANCH_WEIGHT`). The opponent could use it to forbid all of your splits (D6).
- **A local HMAC seed** (`HMAC(gameSeed, ply/code)`). Every future roll could be read from browser storage (D14).
- **Forbidding converging capture of a king.** Converging capture is the only way a ghost takes a king without dice; forbidding it would make more games end on a roll, not fewer.
- **The K+minor draw.**
- **Attempt-based castling loss.**
- **Measuring enemy pieces.**

**Open items to settle with playtest telemetry.** Changing any constant requires `v = 2`.

- Whether the budget should be 8 or 12.
- How often a game ends on a rolled king capture (probability below 100%), and at what odds. The pre-registered lever, if too many games end on low-odds king shots, is the **certain king capture rule** for `v = 2`: "a standard move or merge whose target holds a king is legal only if `W_capture = T`", with the reason code `king_shot_uncertain` placed after `own_piece` (§4.11). It makes `kingDanger` binary. Track alongside it how often a single ghost part is the only thing standing between an attacker and a king (the "ghost screen" such a rule would make a full block).
- How often the budget fallback triggers.
- How often games end by `king_trapped`, and how often the confirmation dialog (§8) is shown and overridden.
- White's score, which shows any first-move advantage.
- How often players use Measure.

---

## 1. Constants

| Name | Value | Meaning |
|---|---|---|
| `V` | `1` | Rules version, stored as `v` in every state |
| `T` | `16777216` (`2^24`) | The sum of all world weights |
| `BUDGET` | `8` | Maximum `B(c)` per side (§3.3) |
| `MAX_WORLDS` | `64` | Derived bound (`BUDGET²`). It is exported for the UI and is never checked on its own |
| `MAX_LOCATIONS` | `4` | Maximum number of squares a piece may occupy after a **split** |
| `FIFTY_MOVE_PLIES` | `100` | 50-move rule |
| `REPETITION_COUNT` | `3` | Threefold repetition |
| `MAX_PLY` | `1200` | Technical game-length cap |

---

## 2. Encodings

### 2.1 Squares

`idx = rank * 8 + file`. Files `a..h` are `0..7` and ranks `1..8` are `0..7`, so `a1 = 0`, `h1 = 7`, `a2 = 8`,
`e4 = 28`, `a8 = 56` and `h8 = 63`.

- `name(idx) = "abcdefgh"[idx & 7] + String((idx >> 3) + 1)`.
- Names are always lowercase.
- `file(s) = s & 7` and `rank(s) = s >> 3`.

### 2.2 Pieces, ids and letters

There are 32 fixed piece ids. Ids 0 to 15 are White and 16 to 31 are Black. The colour follows from the id:
`id < 16` is White.

| id (W / B) | 0 / 16 | 1 / 17 | 2 / 18 | 3 / 19 | 4 / 20 | 5 / 21 | 6 / 22 | 7 / 23 | 8–15 / 24–31 |
|---|---|---|---|---|---|---|---|---|---|
| letter (W / B) | A / a | B / b | C / c | D / d | E / e | F / f | G / g | H / h | I–P / i–p |
| start square | e1 / e8 | d1 / d8 | a1 / a8 | h1 / h8 | c1 / c8 | f1 / f8 | b1 / b8 | g1 / g8 | a2–h2 / a7–h7 |
| initial type | k | q | r | r | b | b | n | n | p |

- `letter(id) = chr(0x41 + id)` for `id < 16`, and `chr(0x61 + id − 16)` otherwise.
- `types` is a 32-character string over `k q r b n p`. Character `i` is the type of piece `i`.
  - Ids 0–7 and 16–23 always keep their initial type.
  - A pawn id (8–15 or 24–31) is `p`, or `q`/`r`/`b`/`n` after a promotion. Setup positions may pre-assign these (Appendix A).
  - The type of a piece is the same in every world.
- The castling rooks are fixed by id: `K` uses rook 3 (h1), `Q` uses rook 2 (a1), `k` uses rook 19 (h8) and `q` uses rook 18 (a8).

### 2.3 Boards

A board is a 64-character ASCII string. Character `s` describes square `s`:

- `.` means empty.
- Any other character is the letter of the piece on that square.

The alphabet has 33 characters. Its byte order is `.` (0x2E) < `A`…`P` (0x41–0x50) < `a`…`p` (0x61–0x70).
Boards never contain digits, so PHP never casts them to integer array keys.

### 2.4 Worlds and weights

A world is the JSON pair `[board, weight]`.

- `weight` is an integer with `1 ≤ weight ≤ T`.
- The weights of all worlds sum to **exactly** `T`.
- The probability of a world is `weight / T`. That division is exact in IEEE doubles, because `T` is a power of two.
- **Canonical order:** worlds are sorted by board string in strictly ascending byte order, and no board appears twice.

### 2.5 State JSON

The keys MUST appear in exactly this order.

| Key | Type | Content |
|---|---|---|
| `v` | int | Rules version, `1` |
| `types` | string(32) | See §2.2 |
| `worlds` | array of `[string(64), int]` | Canonical order, 1 to 64 entries |
| `turn` | `"w"` \| `"b"` | Side to move |
| `castling` | string | A subset of `KQkq` in that order, or `"-"` |
| `ep` | string | A square name, or `"-"` |
| `halfmove` | int | ≥ 0 (§5.4, I11). It exceeds 100 only while a certain king capture is pending (§6, D18) |
| `fullmove` | int | ≥ 1. It increases after Black's move |
| `ply` | int | 0..1200. The number of moves applied since the initial or setup position |
| `captured` | array of int | Captured ids in capture order. For setup states, the absent ids come first, in ascending order |
| `history` | array of string | 16-hex-digit position hashes since the last halfmove reset (or since setup). The last entry is the hash of this state (§5.4) |
| `result` | `null` \| object | `{"result": "1-0" \| "0-1" \| "1/2-1/2", "reason": <engine reason>}` (§6) |

This is the start position, which is also a parity test vector:

```json
{"v":1,"types":"kqrrbbnnppppppppkqrrbbnnpppppppp","worlds":[["CGEBAFHDIJKLMNOP................................ijklmnopcgebafhd",16777216]],"turn":"w","castling":"KQkq","ep":"-","halfmove":0,"fullmove":1,"ply":0,"captured":[],"history":["80c209d9560802c2"],"result":null}
```

### 2.6 Canonical serialisation

- **JS:** `JSON.stringify(state)` on an object whose keys were inserted in the order of §2.5.
- **PHP:** `json_encode($state, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)` on arrays built in the same order.
  - List-shaped values (`worlds`, each world pair, `captured`, `history`) MUST be PHP lists, so that `array_is_list` is true.
  - An empty `captured` MUST encode as `[]`.
- No whitespace. All values are ASCII.
- The state contains no floats.
- These two outputs MUST be byte-identical. The start vector above was checked in Node 22 and PHP 8.4.

The same rule applies to the other JSON objects defined here, with these key orders:

- **Move object:** `type, from, to, promo`. `promo` is present only on promotions.
- **Measurement record:** `key, u, captured, outcomes, fallback`. Each outcome is `{key, weight}`.
- **LegalMove** (§4.10): the order given there.

### 2.7 Invariants (`validateState` MUST check all of them)

- **I1 One occupant per square.** For every square, all worlds together show at most one distinct non-`.` character there.
- **I2 Conservation.** Every live id (one not in `captured`) appears exactly once in every board. Captured ids appear in no board. `captured` has no duplicates.
- **I3 Classical pawns.** Every live piece of type `p` is on the same square in all worlds, and never on rank 1 or 8.
- **I4 Classical kings.** Ids 0 and 16 have type `k` and are on the same square in all worlds. Both are live unless `result.reason = "king_captured"`.
- **I5 Weights.** Every weight is an integer ≥ 1, and the weights sum to `T`.
- **I6 Canonical order.** Boards are pairwise distinct and strictly ascending.
- **I7 Budget.** `B(w) ≤ 8` and `B(b) ≤ 8` (§3.3). This implies `1 ≤ |worlds| ≤ 64`.
- **I8 Types.** `types` has length 32 over `kqrbnp`. Ids 0–7 and 16–23 have their initial type.
- **I9 Castling.** For each flag, the king and that flag's rook are on their home squares in **all** worlds.
- **I10 En passant.** If `ep ≠ "-"`, then all of the following hold:
  - `ep` is on rank 3 when `turn = "b"`, or on rank 6 when `turn = "w"`;
  - the pawn that just double-pushed stands on `p = ep + 8` (a White pawn, when `turn = "b"`) or on `p = ep − 8` (a Black pawn, when `turn = "w"`);
  - a pawn of the side to move stands on a square `s` **beside `p`**: `rank(s) = rank(p)` and `|file(s) − file(p)| = 1`. Adjacency is always judged by file and rank, never by `p ± 1` (which would wrap from the h-file to the a-file of the next rank);
  - `ep` is empty in all worlds.
- **I11 Bookkeeping.**
  - `0 ≤ halfmove ≤ 99 + ply`, `fullmove ≥ 1` and `0 ≤ ply ≤ 1200`. (A setup position starts with `halfmove ≤ 99`, and `halfmove` grows by at most 1 per ply. It can pass 100 only under D18.)
  - `history` is non-empty, has at most `halfmove + 1` entries, holds 16-hex-digit lowercase strings, and ends with `positionHash(state)`.
  - `result` is `null` or well formed.
- **I12 Version.** `v = 1`.

---

## 3. Quantities used by the rules

These are defined on a state with worlds `(b_i, w_i)`, `i = 0..n−1`, in canonical order. X, Y and Z are piece ids.

### 3.1 Occupancy

- `occ(s)` is the unique id whose letter appears at `s` in some world, or *none*. It is well defined by I1.
- `W(X@s)` is the sum of `w_i` over the worlds with `b_i[s] = letter(X)`, and `P(X@s) = W(X@s)/T`.
- `W(X@a ∧ Y@b)` is the sum of `w_i` over the worlds that satisfy both conditions.
- `loc(X)` is the ascending list of squares with `W(X@s) > 0`. It is empty for a captured piece.
- X is **certain** if `|loc(X)| = 1` (its weight there is `T`), and **superposed** if `|loc(X)| ≥ 2`.
- A square is **certainly empty** if `occ(s) = none`.

There is no epsilon anywhere in the rules. All comparisons are between integers.

### 3.2 Geometry, lanes and clearance

`G(type, f, t)` is geometric reachability on an empty board. It requires `f ≠ t`, and:

- `n`: `{|Δfile|, |Δrank|} = {1, 2}`;
- `b`: `|Δfile| = |Δrank|`;
- `r`: `Δfile = 0` or `Δrank = 0`;
- `q`: `b` or `r`;
- `k`: `max(|Δfile|, |Δrank|) = 1`. Castling is **not** part of `G` (§4.6).

Pawn geometry is in §4.2.

The **lane** `lane(f, t)`:

- for `b`, `r` and `q`, the squares strictly between `f` and `t`, in order from `f`;
- for `n` and `k`, empty;
- for a pawn double push, the skipped square;
- for any other pawn move, empty.

`clear(b, f, t)` is true if every square of `lane(f, t)` is `.` in board `b`. A piece never blocks itself: in a
world where X stands on `f`, X is not on any other square.

### 3.3 Budget

For a colour `c`, `proj_c(b)` is board `b` with every character that is not a letter of colour `c` replaced by `.`.

**`B(c)` is the number of distinct strings `proj_c(b_i)` over all worlds.**

- Kings and pawns are classical, so an implementation MAY build the projection only from the squares of `c`'s live
  pieces of type `q`, `r`, `b` or `n`, in id order. The count is identical.
- `B(c) ≥ 1` always.
- `|worlds| ≤ B(w) · B(b)`: a board is fully determined by its two projections.

---

## 4. Moves

### 4.1 Move objects and canonical codes

Move object: `{"type": "standard" | "split" | "merge" | "measure", "from": [...], "to": [...], "promo"?: "q" | "r" | "b" | "n"}`.
Squares are indices.

| Type | `from` | `to` | Canonical code | Example |
|---|---|---|---|---|
| standard | `[f]` | `[t]` | `f-t`, plus `=Q`/`=R`/`=B`/`=N` on promotion | `e2-e4`, `e7-e8=Q` |
| castling (a standard king move) | `[4]` / `[60]` | `[6]`, `[2]` / `[62]`, `[58]` | king squares | `e1-g1`, `e8-c8` |
| split | `[f]` | `[t1, t2]`, `t1 < t2` | `f-t1\|t2` | `g1-f3\|h3` |
| merge | `[f1, f2]`, `f1 < f2` | `[t]` | `f1\|f2-t` | `f3\|h3-g1` |
| measure | `[min loc(X)]` | `[]` | `?` + that square | `?a3` |

Canonical code grammar (ABNF-like):

```
code     = standard / split / merge / measure
standard = sq "-" sq [ "=" ("Q" / "R" / "B" / "N") ]
split    = sq "-" sq "|" sq          ; second square index < third
merge    = sq "|" sq "-" sq          ; first square index < second
measure  = "?" sq                    ; the lowest square in loc(X)
sq       = %x61-68 %x31-38           ; "a".."h" "1".."8"
```

`moveCode(move)` emits only this form. The lenient input parser is in §4.12.

### 4.2 Pawn geometry

Directions are given for White. Black mirrors them: `−8` instead of `+8`, the double push starts from rank 7, and
promotion is on rank 1.

| Kind | Condition | `lane` | Happens in world `b` if… | Key |
|---|---|---|---|---|
| push | `t = f + 8` | – | `b[t] = '.'` | `move` |
| double push | `rank(f) = 1` (rank 2), `t = f + 16` | `[f + 8]` | `b[f+8] = '.'` and `b[t] = '.'` | `move` |
| diagonal | `t = f + 7` with `file(f) ≥ 1`, or `t = f + 9` with `file(f) ≤ 6` | – | `b[t]` holds an enemy piece | `capture` |
| en passant | diagonal with `t = ep` | – | always (by I10) | `capture` of the pawn on `t − 8` (Black: `t + 8`) |

A pawn move that ends on the last rank MUST carry `promo`. No other move may carry it.

### 4.3 The per-world standard function

For a standard (non-castling) move of piece X from `f` to `t`, each world board `b` maps to `(b', key, capturedId)`:

```
std(b):
  if b[f] ≠ letter(X)                       → (b, miss)          // X is not on f in this world
  if not clear(b, f, t)                     → (b, miss)          // lane blocked
  y := b[t]
  if type(X) = p:
     push / double push:  y = '.'           → (X f→t, move)      else (b, miss)
     diagonal:            y is enemy        → (X f→t, y removed, capture, id(y))
                          t = ep            → (X f→t, pawn on t∓8 removed, capture, its id)
                          otherwise         → (b, miss)
  else if y = '.'                           → (X f→t, move)
  else if y is an enemy piece               → (X f→t, y removed, capture, id(y))
  else                                      → (b, miss)          // y is a friendly piece ≠ X
```

"X f→t" means `b'[f] = '.'` and `b'[t] = letter(X)`. By I1, the captured id is the same in every world whose key is
`capture`: it is `occ(t)`, or the en-passant pawn.

### 4.4 Standard move: legality

A standard non-castling move `f → t` (with optional `promo`) is legal if and only if all of these hold:

1. `result = null`.
2. `X = occ(f)` exists and has the colour of `turn`.
3. Geometry: `G(type(X), f, t)` holds for a non-pawn; for a pawn, one row of §4.2 applies.
4. `promo` is present if and only if X is a pawn and `t` is on its last rank.
5. At least one world gives a key other than `miss`.

This includes moving a part of a superposed piece onto a square where another part of the same piece stands. In
every world where X is on `f`, the square `t` is empty (edge case 11).

### 4.5 Measured class, budget fallback and resolution

**Measured class M.** A standard move is in M if and only if:

- X is a pawn, or
- X is a king and the move is not castling (§4.6), or
- `occ(t) ∉ {none, X}`, that is, some world (**any** world, not only those with X on `f`) has another piece on `t`.

A merge is in M if and only if `occ(t)` is an enemy piece. Splits, castling and Measure are never in M. Measure is
always rolled (§4.9).

A move outside M can never capture, because no world holds another piece on `t`.

**Outcome weights.** For a standard move or a merge, `W_k` is the total weight of the worlds whose per-world key is
`k`, for `k` in the fixed order **`miss`, `move`, `capture`**. `outcomes` is the list of `(k, W_k)` with `W_k > 0`, in
that order. `ΣW_k = T`.

**Budget fallback.** If a standard move or merge is **not** in M, and its unmeasured result (§5.1 steps A2 and A4)
would have `B(mover) > BUDGET`, then the move is resolved **as if it were in M**, with `fallback = true`.

- Its outcomes are always exactly `miss` and `move`.
- Implementation note: B can only grow when two worlds with the same own projection get different keys. So only moves
  whose `outcomes` contain both `miss` and `move` need the check.

**Resolution** of every legal move. It is exposed as `LegalMove.resolution`:

| Resolution | When | Random number |
|---|---|---|
| `rolled` | Measure; or (in M, or fallback) with `\|outcomes\| ≥ 2` | exactly one `u` |
| `certain` | (in M, or fallback) with `\|outcomes\| = 1`; or not in M with `outcomes = [move]`; castling | none |
| `quantum` | a split; or not in M (and no fallback) with `outcomes = [miss, move]` | none |

A `certain` move in M whose single key is `capture` is a *certain capture*. For example, a classical piece takes a
classical piece.

### 4.6 Castling

A standard move `f → t` is **castling** if and only if `X = occ(f)` is a king (id 0 or 16), `f = home(X)` (`e1` for id 0,
`e8` for id 16) and `t ∈ {home(X) − 2, home(X) + 2}`. Any other king move is an ordinary king move and needs `G`.
For example, the Black king standing on e1 and moving e1-g1 is not castling; it fails `G` (`unreachable`).

| Flag | King | Rook (id) | Must be empty in every world |
|---|---|---|---|
| `K` | e1 → g1 | h1 → f1 (3) | f1, g1 |
| `Q` | e1 → c1 | a1 → d1 (2) | b1, c1, d1 |
| `k` | e8 → g8 | h8 → f8 (19) | f8, g8 |
| `q` | e8 → c8 | a8 → d8 (18) | b8, c8, d8 |

- Castling is legal if and only if `result = null`, X has the colour of `turn`, the flag for `t` is present, and every listed square has `occ = none`.
- There are no attack conditions, because there is no check.
- By I9 the king and rook are certain on their home squares.
- The move is applied identically in every world. It is `certain` and never rolled.

### 4.7 Split

A split of piece X from `f` to `t1` and `t2` is legal if and only if all of these hold:

- **S1** `result = null`; `X = occ(f)` is of the side to move; `type(X) ∈ {q, r, b, n}`. Kings and pawns never split; promoted pieces may.
- **S2** `t1 < t2`; both differ from `f`; `G(type, f, t1)` and `G(type, f, t2)` hold.
- **S3** `occ(t1) = none` and `occ(t2) = none`. Both targets are empty in every world, including X itself. A split never lands on anything.
- **S4** At least one world has `b[f] = X`, `clear(b, f, t1)` and `clear(b, f, t2)`.
- **S7** `|loc(X)| ≤ MAX_LOCATIONS` in the resulting state (after steps A2 and A4 of §5.1). Equivalently, unless a child is dropped (below), `loc_after(X) = (loc(X) \ {f}) ∪ {t1, t2} ∪ ({f} if some world with b[f] = X has a blocked lane to t1 or t2)`.
- **S5** `B(mover) ≤ BUDGET` in the resulting state. This exact count is normative.
  - A split that exceeds the budget is **illegal**. It is never converted to a roll.
  - Optional fast accept, as an optimisation only. It may only *accept*; when it does not apply, the exact count decides. Let `k` be the number of distinct own projections among branching worlds (worlds with `b[f] = X` and at least one clear lane), and `k_b` the number of those projections for which some world with that projection and `b[f] = X` has a blocked lane to `t1` or `t2`. Accept early if `B(mover) + k + k_b ≤ BUDGET`. (`B + 2k ≤ BUDGET` is also sound.) Reason: a branching projection `p` becomes at most `p[X→t1]`, `p[X→t2]` and, if some world with projection `p` has a blocked lane, `p` itself. The shortcut `B + k ≤ BUDGET` is **unsound** and MUST NOT be used (W13).
- There is no minimum branch weight. (Rules v1 drafts had an `S6`/`precision` rule; it was removed, D6.)

**Per-world function.** For a world with `b[f] = X` and weight `w`, let `c1 = clear(b, f, t1)` and
`c2 = clear(b, f, t2)`. The world produces two children, *child 1* before *child 2*:

```
child 1 := (c1 ? X f→t1 : b, ceil(w / 2))     // t1, the lower index, receives the odd unit
child 2 := (c2 ? X f→t2 : b, floor(w / 2))    // weight 0 when w = 1: this child is dropped
```

- "Lower index" means the lower square **index** (§2.1), never the lower square name: for `h4-h3|a4`, `t1 = h3 (23)` and `t2 = a4 (24)` (W12).
- A child of weight 0 is discarded. This happens only for a branching world of weight 1: its single unit goes to child 1, that is, to `t1` if lane 1 is clear, and otherwise it stays on `f`. The rounding error is at most `2^-24` per world, the same order as a rescale.
- If neither lane is clear, both children equal `b`. They merge back into `(b, w)` in step A4, so the world is unchanged. Worlds with `b[f] ≠ X` are unchanged.

A split is never measured and never draws a random number. Because `ceil + floor = w`, it preserves `T` exactly, and
every surviving weight is at least 1.

Lanes are judged on the board **before** the move. So `t1` may lie on the lane to `t2`: a rook a1 splitting to
`a3|a5` is clean, because a3 is empty in every world before the move.

### 4.8 Merge

A merge of piece X from `f1` and `f2` to `t` is legal if and only if all of these hold:

- **M1** `result = null`; `occ(f1) = occ(f2) = X`, of the side to move; `type(X) ∈ {q, r, b, n}`; `f1 < f2`.
- **M2** `t ∉ {f1, f2}`; `G(type, f1, t)` and `G(type, f2, t)` hold.
- **M3** `occ(t)` is none, X, or an enemy piece. It is never a friendly piece other than X.
- **M4** Some world has `b[f1] = X ∧ clear(b, f1, t)`, and some world has `b[f2] = X ∧ clear(b, f2, t)`. Every part named in the merge must be able to arrive somewhere.

**Per-world function:**

```
merge(b):
  if b[f1] = X and clear(b, f1, t)  → X f1→t   (capture if b[t] is an enemy)
  elif b[f2] = X and clear(b, f2, t) → X f2→t  (capture if b[t] is an enemy)
  else                               → (b, miss)
```

The key is `capture` if an enemy was removed, `move` if X moved without capturing (onto an empty square or onto its own part), and `miss` otherwise. X is never
on both `f1` and `f2` in the same world, so the branch order has no effect. The lane from `f1` may pass `f2`; `f2` is
empty in every world where X is on `f1`.

Resolution follows §4.5. A merge that takes X to `t` in every world is `certain`, and X becomes classical. A merge
onto a possibly-present enemy is `rolled`. A merge onto a certainly-present enemy that X reaches in every world is a
certain capture: this is **converging capture**.

### 4.9 Measure

`?s` is legal if and only if all of these hold:

- `result = null`;
- `X = occ(s)` is of the side to move;
- X is superposed.

Kings and pawns are never superposed.

- **Outcomes:** one per square of `loc(X)`, in ascending index order. The key is the square name and the weight is `W(X@s)`. There are between 2 and 8 outcomes (§7.5).
- **Effect:** keep only the worlds with X on the sampled square. Nothing moves. Every piece correlated with X updates through the conditioning.
- The canonical `from` is `min loc(X)`. The parser and `findMove` accept any square of `loc(X)`.

### 4.10 The legal move list

`generateMoves(state)` returns `[]` if `result ≠ null`. Otherwise it returns every legal move of the side to move,
exactly once, sorted ascending by this integer tuple:

| Move | Tuple |
|---|---|
| standard (including castling) | `(0, f, t, p)` with `p = 0` for no promotion, and `1, 2, 3, 4` for `q, r, b, n` |
| split | `(1, f, t1, t2)` |
| merge | `(2, f1, f2, t)` |
| measure | `(3, min loc(X), 0, 0)` |

The tuples are unique, so the order is total. Promotions produce four entries with identical outcome weights.

**LegalMove** object. The keys appear in this order:

| Key | Content |
|---|---|
| `type`, `from`, `to`, `promo`? | As in the move object |
| `code` | Canonical code |
| `piece` | Moving id (X) |
| `resolution` | `"certain"` \| `"quantum"` \| `"rolled"` (§4.5) |
| `measured` | `resolution = "rolled"` |
| `fallback` | `true` only for a budget-fallback roll |
| `capture` | Some outcome is `capture` |
| `happenWeight` | Standard and merge: `W_move + W_capture`. Split: total weight of branching worlds. Measure and castling: `T` |
| `outcomes` | Standard and merge: `[{key, weight}]` per §4.5. Measure: squares. Split and castling: `[]` |
| `successProbability` | `happenWeight / 2^24`, as a double. It is derived and not compared byte-wise |

*Example.* White Ke1 and Ng1, Black Ke8, White to move, no castling rights. The list is exactly these 11 moves, in
this order:

```
e1-d1  e1-f1  e1-d2  e1-e2  e1-f2  g1-e2  g1-f3  g1-h3  g1-e2|f3  g1-e2|h3  g1-f3|h3
```

Their tuples are (0,4,3,0) (0,4,5,0) (0,4,11,0) (0,4,12,0) (0,4,13,0) (0,6,12,0) (0,6,21,0) (0,6,23,0) (1,6,12,21)
(1,6,12,23) (1,6,21,23).

### 4.11 `isLegal`, `whyIllegal` and reason codes

- `isLegal(state, move)` is `whyIllegal(state, move) === null`.
- `whyIllegal(state, input)` accepts a move object or a code string.
  - A string is first parsed with `parseMoveCode` (§4.12). If parsing fails, the result is `malformed`. A castling marker becomes the standard move of the side to move's king from its home square `h` (e1 or e8) to `h + 2` (`O-O`) or `h − 2` (`O-O-O`). A parsed piece letter is kept for check 5.
  - Split targets and merge sources are then sorted by square index. Nothing else is normalised yet.
- It then runs the checks below **in order** and returns the first failing code.
  - **After check 5 passes**, and only then, a Measure `from` is replaced by `min loc(X)`. (Doing this earlier would take the minimum of an empty list when `from` is empty: PHP `min([])` throws, JS `Math.min()` returns `Infinity`.)
- Every failure is one of these codes. `whyIllegal` never throws for a well-typed state, whatever the move input is.
- The same codes are used in UI tooltips, `IllegalMoveException`, and the LLM retry `feedback`.
- PHP SHOULD validate a single move this way, without generating the full list.

| # | Code | Applies to | Condition |
|---|---|---|---|
| 1 | `game_over` | all | `result ≠ null` |
| 2 | `malformed` | all | Wrong shape: unparsable string; unknown type; wrong array lengths (standard 1/1, split 1/2, merge 2/1, measure 1/0); squares not integers in 0..63; equal pair members; `promo` not one of `q r b n`; `promo` present on a split, merge or measure |
| 3 | `no_piece` | all | `occ(from[0]) = none` |
| 4 | `not_your_piece` | all | The piece is not of `turn` |
| 5 | `piece_mismatch` | string input with a piece letter | The letter (`K Q R B N`) is not the type of `occ(from[0])` |
| 6 | `merge_mismatch` | merge | `occ(f2) ≠ occ(f1)` |
| 7 | `cannot_split` / `cannot_merge` | split / merge | The type is `k` or `p` |
| 8 | `not_superposed` | measure | X is certain |
| 9 | `castle_no_right` | castling (§4.6) | The flag is absent |
| 10 | `castle_blocked` | castling | A listed square is not certainly empty |
| 11 | `unreachable` | standard, split, merge | Geometry (§3.2, §4.2, S2, M2) fails |
| 12 | `promotion_required` / `promotion_invalid` | standard | Rule 4 of §4.4 fails |
| 13 | `nothing_to_capture` | pawn diagonal | Every world is `miss` |
| 14 | `blocked` | standard | Every world is `miss`, and either X is a pawn pushing, or every world with X on `f` has a blocked lane |
| 15 | `own_piece` | standard | Every world is `miss` (the remaining cases: the target holds a friendly piece wherever X could arrive) |
| 16 | `split_target_occupied` | split | S3 |
| 17 | `split_blocked` | split | S4 |
| 18 | `location_cap` | split | S7 |
| 19 | `budget_full` | split | S5 |
| 20 | `merge_target_own` | merge | M3 |
| 21 | `merge_part_stuck` | merge | M4 |

### 4.12 Lenient parser

`parseMoveCode(code)` is used for LLM output and typed input. Both engines MUST implement exactly this procedure. It
returns a move object (with split targets and merge sources sorted by index and `promo` in lower case), optionally
with a separate piece letter, or a castling marker (`O-O`, `O-O-O`), or `null`.

**Normalisation pipeline**, applied in this order:

1. If the string contains `{`, cut it at the first `{` (drop the `{` and everything after it). Canonical codes never contain `{`; notation puts the outcome annotation there (§5.7).
2. Remove leading and trailing whitespace (space, tab, CR, LF).
3. While the last character is one of `+ # ! ?` or whitespace, remove it.
4. Match the whole remaining string against `input` below. No other characters, and no inner whitespace except after `measure`, are allowed.

**Grammar** (ABNF, RFC 5234, except that quoted literals here are **case-sensitive**; every accepted case is listed):

```
input    = castle / measure / split / merge / standard
standard = [piece] sq [sep] sq [promo]
split    = [piece] sq [sep] sq pairsep sq
merge    = [piece] sq pairsep sq [sep] sq
measure  = "?" [piece] sq / measword 1*wsp sq
castle   = oh "-" oh [ "-" oh ]              ; O-O = short, O-O-O = long
measword = ("m"/"M") ("e"/"E") ("a"/"A") ("s"/"S") ("u"/"U") ("r"/"R") ("e"/"E")
oh       = "O" / "o" / "0"
piece    = "K" / "Q" / "R" / "B" / "N"
sq       = file rank
file     = "a"/"b"/"c"/"d"/"e"/"f"/"g"/"h" / "A"/"B"/"C"/"D"/"E"/"F"/"G"/"H"
rank     = "1"/"2"/"3"/"4"/"5"/"6"/"7"/"8"
sep      = "-" / "x" / "X" / ":"
pairsep  = "|" / "/" / ","
promo    = ["="] ("Q"/"R"/"B"/"N"/"q"/"r"/"b"/"n")
wsp      = " " / %x09
```

The grammar is unambiguous: a `sq` is always a file letter followed by a digit, so a leading `B` is a piece letter
exactly when a file letter follows it (`Bc1-h6`), and a square otherwise (`B1-c3` is `b1-c3`). A piece letter
comes **after** the `?` of a Measure (`?Na4`); `N?a4` is rejected.

**Meaning.**

- Squares are case-folded to lower case. A pair (split targets, merge sources) may be given in either order and is sorted by index.
- A piece letter is not part of the move object. `findMove` and `whyIllegal` check it against `type(occ(from))` (`piece_mismatch`).
- A Measure may name any square of `loc(X)`; `findMove` and `whyIllegal` replace it by `min loc(X)`.
- A castling marker is resolved for the side to move: `O-O` is `home → home + 2`, `O-O-O` is `home → home − 2`.

`findMove(state, moveOrCode)` parses the input if it is a string, normalises it as above, and returns the matching
entry of `generateMoves(state)`, or `null` (also on a piece-letter mismatch). Measure moves match by piece:
`occ(from)`.

**Parser fixtures** (both engines MUST produce exactly these results; square indices in brackets):

| Input | Result |
|---|---|
| `Qd4\|h5xh8 #` | merge `[27, 39] → [63]`, letter Q |
| `?Na4 {c4 50%}` | measure `[24]`, letter N |
| `Nf3xe5 {capture 25%} #` | standard `[21] → [36]`, letter N |
| `Bc1xh6 {capture 50%}` | standard `[2] → [47]`, letter B |
| `g1-h3\|f3`, `g1f3/h3`, `G1-F3,H3` | split `[6] → [21, 23]` |
| `h3/f3g1` | merge `[21, 23] → [6]` |
| `E2E4`, `e2:e4`, `e2-e4+` with surrounding spaces | standard `[12] → [28]` |
| `e7e8q`, `e7-e8=Q`, `e7-e8=q!?` | standard `[52] → [60]`, `promo: "q"` |
| `measure A4`, `?a4` | measure `[24]` |
| `o-o-o`, `0-0-0` | long castling marker |
| `B1-c3` | standard `[1] → [18]` (no letter) |
| `N?a4`, `e2 e4`, `e2-e4-e5`, `Pe2-e4`, `e9-e4`, the empty string | `null` |

In addition, every notation string produced in §10 MUST parse back to the move that produced it.

## 5. Applying a move

### 5.1 Pipeline (identical in both engines)

`applyMove(state, move, opts)` returns `{state, move: LegalMove, measurement: Record | null}`. It MUST NOT mutate its
input.

- **A1** `L := findMove(state, move)`. If it is null, throw `IllegalMove(whyIllegal(...))`.
- **A2** Compute the per-world results in canonical world order (§4.3, §4.6, §4.7, §4.8). A split emits child 1 before child 2. Measure leaves every world unchanged and keys it by X's square.
- **A3** If `L.resolution = "rolled"`, choose one outcome key (§5.2) and discard every world whose key differs.
- **A4** Merge identical boards by adding their weights.
- **A5** Sort ascending (§2.4).
- **A6** If the sum of weights `S < T` (only after A3), rescale (§5.3).
- **A7** Global bookkeeping, in this order (§5.4): `captured`, `types`, `castling`, `ep`, `halfmove`, `fullmove`, `ply`, `turn`.
- **A8** Update `history` (§5.4).
- **A9** Run the end checks (§6), including E1b, and set `result`.

Growth guarantees:

- Standard moves, castling and merges map each world to exactly one world, so they never increase the world count.
- Measurements only remove worlds.
- Only splits add worlds, and I7 (through S5) bounds them.

### 5.2 Sampling

```
if L.resolution ≠ "rolled":
    // certain, quantum, split, castling: nothing is chosen, no random number, measurement := null.
    // opts.u, opts.rng and opts.outcome are IGNORED and NOT validated.
else:                                                 // |outcomes| ≥ 2 (§4.5)
    outcomes := [(k, W_k)] with W_k > 0, in key order // moves: miss, move, capture; measure: ascending square index
                                                      // Σ W_k = T
    if opts.outcome is given: chosen := opts.outcome  // MUST be a key of outcomes, else throw an argument error
                                                      // (not IllegalMove); u := null
    else:
        u := opts.u                                   // if given: integer, 0 ≤ u < 2^24, else throw
          or floor(opts.rng() * 16777216)             // rng MUST return a finite double r with 0 ≤ r < 1, else throw
          or the default source (§9.1)
        acc := 0
        for (k, W) in outcomes: acc += W; if u < acc: chosen := k; stop
```

- The random source is consulted **exactly once** per rolled move, and never for any other move.
- `floor(r · 2^24)` is exact in IEEE doubles, because it is a power-of-two scaling followed by a floor.
- A double `r` produced as `random_int(0, 2^53 − 1) / 2^53` gives `u` = its top 24 bits.
- So `applyMove(W6, "d4|h5-h8", {outcome: "miss"})` does **not** throw: the merge is `certain` and the option is ignored. `applyMove(W2, "c1-h6", {outcome: "miss"})` throws, because `miss` is not an outcome of that rolled move.

### 5.3 Rescaling (largest remainder)

After A3 to A5, let the surviving worlds be `w_0 … w_{m−1}` in canonical order, with sum `S < T`.

```
for i in 0..m−1:  N_i := w_i · T;  q_i := floor(N_i / S);  r_i := N_i − q_i · S
D := T − Σ q_i                                          // 0 ≤ D < m
add 1 to q_i for the D indices with the largest r_i     // ties: lower canonical index first
w_i := q_i
```

- `N_i ≤ 2^48`, which is exact in JS numbers and PHP 64-bit integers.
- **PHP** uses `intdiv` and `%`.
- **JS** uses `q = Math.floor(N / S)` and `r = N − q·S`, and then MUST adjust with `while (r < 0) {q--; r += S}` and `while (r >= S) {q++; r -= S}`. The adjustment never fires at these magnitudes, but it is mandatory.
- Every rescaled weight is at least its old weight, so weights stay ≥ 1.
- Rescaled weights differ from the exact conditional probabilities by less than `2^-24` per world. Puzzle fixtures MUST NOT claim exact thirds.
- **Vector:** weights `(8388608, 4194304)` with `S = 12582912` rescale to `(11184811, 5592405)`. See W7.

### 5.4 Bookkeeping

| Field | Rule |
|---|---|
| `captured` | Append the captured id if the realised key is `capture`. This includes en passant and a converging capture. |
| `types` | If X is a pawn, the key is `move` or `capture`, and `t` is on the last rank: `types[X] := promo`. Nothing happens on `miss`. |
| `castling` | **State-based.** For each present flag, keep it only if the king (0 or 16) and that flag's rook (3, 2, 19 or 18) are on their home squares in **every** world after the move. Otherwise remove it permanently; flags are never added. So a split, a partly-blocked slide, a completed move, or a capture loses the right. A `miss` does not, and merging back does not restore it. |
| `ep` | Set it to the skipped square if and only if all of these hold: the move is a pawn double push, the key is `move`, and an enemy pawn stands on a square `s` with `rank(s) = rank(t)` and `\|file(s) − file(t)\| = 1`. Otherwise set it to `"-"`. Never test `t ± 1`: from `h4` (31), index 32 is `a5`, which is not adjacent (W15). |
| `halfmove` | `0` if the key is `capture`, or if X is a pawn and the key is `move`. Otherwise `+1`: splits, merges without capture, castling, Measure, quantum moves, missed attempts and missed captures. |
| `fullmove` | `+1` after Black's move. |
| `ply` | `+1`. |
| `turn` | Always switches, including after a `miss`. |
| `history` | `h := positionHash(newState)`. If `halfmove = 0`, then `history := [h]`; otherwise append `h`. It normally holds at most 101 entries; it can grow further only while D18 suspends E4. |

**Position hash.** FNV-1a-64 is taken over the ASCII bytes of

```
turn + "|" + castling + "|" + ep + "|" + types + "|" + join(",", board_i + ":" + decimal(weight_i))
```

- The worlds are taken in canonical order.
- The offset basis is `cbf29ce484222325` and the prime is `100000001b3`.
- The output is 16 lowercase hex digits.
- PHP: `hash('fnv1a64', $s)`. JS: BigInt arithmetic, or 16-bit limbs.
- Test vectors: start `80c209d9560802c2`; after `1. g1-f3|h3`, `483a99c829aee5ce`. Both were checked in Node 22 and PHP 8.4.

### 5.5 Measurement record

A rolled move returns a record. Every other move returns `null`. The record is stored in `qchess_moves.measurement`
and drives the animation, replays and the luck ledger.

```json
{"key":"capture","u":8388608,"captured":23,"outcomes":[{"key":"move","weight":8388608},{"key":"capture","weight":8388608}],"fallback":false}
```

| Field | Content |
|---|---|
| `key` | The chosen outcome key: `miss` / `move` / `capture` / a square name |
| `u` | The integer used, or `null` if the outcome was forced |
| `captured` | The captured id, or `null` |
| `outcomes` | The **pre-move** outcome weights (sum `T`), in key order |
| `fallback` | `true` for a budget-fallback roll |

The API layer MAY add derived floats (`probability = weight/2^24`, `happened`). They are not part of parity.

### 5.6 `getOutcomes(state, move)`

- **Rolled move:** one entry per outcome, in key order.
- **Any other move:** exactly one entry, with key `"certain"` or `"quantum"` and weight `T`.

Entry shape: `{key, weight, probability, happened, captured, state}`.

- `state` is the result of `applyMove` with that outcome forced (for a move that is not rolled: plain `applyMove`, §5.2).
- `happened` is `key ≠ "miss"`.
- `captured` is the captured id or `null`. For a certain capture it is the captured id.

Engine search uses this uniformly: a chance node has between 1 and 8 children, and at most 3 unless the move is a
Measure.

### 5.7 Notation (`moveNotation(stateBefore, move, measurement)`)

The notation string is `head + suffix + mark`, in that order.

- **Letter:** `K Q R B N`, from the type before the move. There is no letter for a pawn or for castling.
- **Head:**

  | Move | Head |
  |---|---|
  | standard | letter, `f`, then `x` if the realised key is `capture` (otherwise `-`), then `t`, then `=Q` etc. |
  | castling | `O-O` / `O-O-O` (no letter) |
  | split | letter, `f-t1\|t2` |
  | merge | letter, `f1\|f2`, then `x` or `-`, then `t` |
  | measure | `?`, then the letter, then the canonical square (`?Na4`: the `?` comes first) |

- **Suffix** (rolled moves only): `" {" + key + " " + pct(W_key) + "%}"`.
- **Mark:** `" #"` if the move won the game (E1 `king_captured` or E1b `king_trapped`).

Examples: `Bc1xh6 {capture 50%}`, `d3-e4 {miss 75%}`, `?Na4 {c4 50%}`, `Qd4|h5xh8 #`, `Ng1-f3|h3`,
`Nf3xe5 {capture 25%} #`, `Ra1-a8 #` (W14). The parser (§4.12) reads every one of them back.

---

## 6. Game end

The checks run after every move, on the new state, in this order. The first one that matches sets `result`. "The
mover" is the side that just moved; "the side to move" is `newState.turn`.

| # | Condition | Result | `reason` |
|---|---|---|---|
| E1 | The realised outcome captured a king | The mover wins (`1-0` or `0-1`) | `king_captured` |
| E1b | `kingTrapped(newState)` (below) | The mover wins | `king_trapped` |
| E2 | Only the two kings are live (`captured` has 30 ids), **and** the side to move has no certain king capture | `1/2-1/2` | `bare_kings` |
| E3 | The new hash occurs ≥ 3 times in `history`, **and** the side to move has no certain king capture | `1/2-1/2` | `repetition` |
| E4 | `halfmove ≥ 100`, **and** the side to move has no certain king capture | `1/2-1/2` | `fifty_moves` |
| E5 | `ply ≥ 1200` | `1/2-1/2` | `max_ply` |
| E6 | The side to move has no legal move (`hasAnyLegalMove`, which stops at the first legal move) | `1/2-1/2` | `no_moves` |

**"The side to move has a certain king capture"** means `kingDanger(newState, mover) = T` (§8). For E2 this reduces to
"the two kings stand on adjacent squares". When it holds, E2 to E4 are skipped for this move only (D18). They are
checked again after the next move, so a player who does not take the king can still be drawn. E1, E1b, E5 and E6
are never skipped.

**`kingTrapped(s)`** (normative, identical in both engines). Let `d = s.turn`. It is true if and only if:

1. `s.result = null` and `d` has at least one legal move; and
2. for **every** legal move `m` of `d` and **every** entry `o` of `getOutcomes(s, m)` (§5.6), the outcome state `s_o`
   has `s_o.result = null` and `kingDanger(s_o, d) = T`.

In words: whatever `d` does, the game goes on and `d`'s king can then be captured with certainty. It is the game's
equivalent of checkmate (or of a stalemate that forces the king into capture), found one ply early so that the loser
does not have to make a pointless move.

- A reply that captures the enemy king with any probability ends the game (E1), so `s_o.result ≠ null` and that reply is an escape. A reply that ends the game by E5 is also an escape.
- Condition 1 keeps E6: a side with no legal move at all is drawn, not trapped.
- **No recursion.** Inside `kingTrapped`, the states `s_o` are computed with the normal pipeline but with E1b skipped. This cannot change the answer: if `kingDanger(s_o, d) = T`, the side to move in `s_o` has a certain king capture, which ends the game, so that side is never trapped.
- *(non-normative)* Stop at the first `(m, o)` that breaks condition 2. Trying king moves and captures of the attacking pieces first usually finds an escape at once; only genuinely trapped positions enumerate every move (a few hundred moves, at most 8 outcomes each).

Legality is unchanged: moving into, or staying in, a position where the king can be captured is legal. There is no
check rule and no stalemate rule. Captures are measured and kings are classical, so a king capture is always
definite. E1b only ends a game whose result is already forced.

The engine writes only these reasons. The server records resignation, draw agreement, timeout, abort and
abandonment in the game row, never in the engine state. Once `result` is set, `generateMoves` returns `[]` and
`applyMove` throws `game_over`.

---

## 7. Limits and guarantees

| Limit | Value | At the limit |
|---|---|---|
| Budget `B(c)` | ≤ 8 per side | Splits are illegal (`budget_full`). A quantum standard move or merge that would exceed the budget becomes a roll (`fallback`). Moving is never forbidden because of the budget. |
| Worlds | ≤ 64 | Follows from the budget. There is no separate check. |
| Locations after a split | ≤ 4 | The split is illegal (`location_cap`). |
| Branch weight | ≥ 1 | No limit applies. A weight-1 branching world sends its unit to child 1 (§4.7). |
| 50-move | 100 plies | Draw (E4), unless a certain king capture is pending (D18) |
| Repetition | 3 | Draw (E3), unless a certain king capture is pending (D18) |
| Game length | 1200 plies | Draw (E5) |
| Outcomes | ≤ 3 per move, ≤ 8 per Measure | – |
| State size | ≤ about 64 × 78 B for worlds, plus normally ≤ 101 × 19 B for history ≈ 7 KB (theoretical worst case with D18 repeatedly suspending E4: 1201 history entries ≈ 28 KB) | Fits the `state` TEXT column (64 KB) |

### 7.1 World bound

A board is determined by its white and black projections, so `|worlds| ≤ B(w)·B(b) ≤ 64`.

### 7.2 Ownership: the opponent can never use up your budget

**Lemma.** Any move by side `c` leaves `B(¬c)` unchanged or lower.

- **Unmeasured moves.** A split, a quantum or certain move or merge, or castling changes only the positions of `c`'s pieces inside each world. Each world's `¬c`-projection is unchanged. Merging identical boards can only remove duplicates.
- **Rolled moves and Measure.** These only discard worlds, which is a subset of the projections.
- **A capture of a `¬c` piece.** The captured piece stood on the same square in every surviving world. Removing it from all projections keeps distinct projections distinct.

It follows that only your own splits and your own quantum moves can raise `B(c)`. Both are checked at move time: the
split is refused or the fallback roll is used.

### 7.3 Own moves

- **Rolled outcomes.** Worlds are filtered first. After `miss`, the surviving worlds are unchanged, so they are a
  subset. After `move` or `capture`, the surviving worlds all have X on the same source square (or, for a merge, on
  one of two), and all move it to `t`. The map on projections is therefore injective, or merges them. Either way `B`
  cannot grow.
- **Certain moves** move a classical piece in every world (a bijection), or reunite a ghost (a merge of
  projections).
- **Castling** is a bijection on projections.
- **Own blockers.** A quantum slide whose lane is blocked only by the mover's own pieces cannot raise `B(mover)`. The
  result is a function of the mover's own projection.

### 7.4 Termination

- `halfmove` resets only on a capture or a pawn move that actually happened.
- There are finitely many of those events, and at most 100 plies can pass between them, except while D18 suspends E4 because a certain king capture is pending.
- `MAX_PLY` bounds every game, including those cases.

### 7.5 Location bound

Every location of X belongs to at least one distinct projection of its side, so `|loc(X)| ≤ B(colour(X)) ≤ 8`.
Splits alone cannot exceed 4. Partly-blocked quantum slides can add at most one location per move and are bounded
by the budget.

---

## 8. Derived views

These views are defined identically in both engines. The UI, the coach, the AI and `describeForLlm` use them, and the
PHP prompt builder and the JS UI MUST agree. `kingDanger` and `kingTrapped` are also used by the end checks (§6), so
they are part of the rules and covered by the parity fixtures.

| Function | Definition |
|---|---|
| `worldCount(s)` | `\|worlds\|` |
| `budget(s, c)` | `B(c)` |
| `squareView(s)` | For each square: `null` if `occ = none`, otherwise `{piece, type, color, weight: W(occ@s), probability: weight/T}` |
| `pieceLocations(s)` | For each live id: `[{square, weight, probability}]`, in ascending square order |
| `conditionalView(s, sq)` | Let `X = occ(sq)` and `W0 = W(X@sq)`. For each square `s'`: `null` if no world with X on `sq` has a piece on `s'`; otherwise `{piece: occ(s'), weight: W(X@sq ∧ occ(s')@s'), probability: weight/W0}` |
| `links(s)` | Pairs of live superposed pieces `X < Y` such that some `a ∈ loc(X)` and `b ∈ loc(Y)` have `\|T·W(X@a ∧ Y@b) − W(X@a)·W(Y@b)\| ≥ 2^36`. That is, the joint probability differs from independence by at least `2^-12`. The threshold absorbs rescale rounding, which is below `2^32`. All quantities are integers below `2^49`. |
| `linkGroups(s)` | The connected components of `links`. The UI uses them for link threads and badges. |
| `kingDanger(s, c)` | See below. |
| `moveRisk(s, m)` | `Σ_o P(o) · (0 if outcome o captures the enemy king, else kingDanger(state_o, mover))`, over `getOutcomes`. |
| `kingTrapped(s)` | §6 (E1b). |
| `rollDisplay(record)` | The text form of a roll (§9.4). |
| `pct(W)` | `0` if `W = 0`; `100` if `W = T`; otherwise `min(99, max(1, floor((200·W + T) / (2·T))))`. An uncertain event is never shown as 0% or 100%. |

**`kingDanger(s, c)`** is the probability that the opponent could capture `c`'s king with its best **single** move if
it were the opponent's turn. Let `k` be the king's square. Take the maximum over every live opponent piece Y of:

- **Standard capture.** For each `f ∈ loc(Y)` from which Y attacks `k`: pawns diagonally forward; other pieces by `G`, where an enemy king attacks by adjacency. The weight is `Σ` over worlds with `b[f] = Y ∧ clear(b, f, k)`.
- **Converging capture.** Only for Y of type `q r b n` with `|loc(Y)| ≥ 2`. For each pair `f1 < f2` in `loc(Y)` with both attacking `k` and M4 satisfied, the weight is `Σ` over worlds with `(b[f1]=Y ∧ clear(f1,k)) ∨ (b[f2]=Y ∧ clear(f2,k))`.

The result is reported as a weight, and as `weight/T`. `kingDanger = T` is shown as **certain danger** (red, "check"
in chess terms).

**UI rules** *(non-normative, the default for all game types, can be switched off in preferences)*:

- The danger ring always shows its percentage (`pct`) when `kingDanger > 0`. It is amber below 100% and red at 100%.
- Ask for confirmation when `moveRisk(m) ≥ 0.10` and some legal move `m'` has `moveRisk(m') ≤ moveRisk(m) − 0.10`. The dialog states both numbers ("Your king would be 25% capturable; Ke8-d8 would make it 0%") and offers "don't ask again this game". A missed king shot costs the attacker only a tempo, so even a 25% shot is worth taking for the opponent; the threshold makes sure such shots are never a surprise.
- The coach and the post-game review label an opponent's king shot below 100% as a "free king shot" and point to the move that would have prevented it.

---

## 9. Randomness sources and the game record

### 9.1 Engine contract

The engines never call a clock, `Math.random`, or locale functions.

- The random input is `opts.u`, `opts.rng`, or `opts.outcome`.
- If none is given, JS uses `crypto.getRandomValues(new Uint32Array(1))[0] >>> 8` and PHP uses `random_int(0, 16777215)`.
- Replays, fixtures, the trainer and puzzles MUST pass `u` or `outcome`.

### 9.2 Online games (server-authoritative)

- The server draws `u = random_int(0, 2^24 − 1)` **while applying the move**, and only if the move is rolled.
- No seed or future value is stored anywhere, so nobody can know an outcome **in advance**, including an admin with database access.
- `u` is stored in the measurement record of the move row.
- An `rng` that returns `random_int(0, 2^53−1)/2^53` is equivalent through §5.2.
- Trust boundary: the server applies the roll, so whoever controls the server or its database can still **change** a roll after the fact, before the opponent's client has loaded the move (§9.4). No v1 mechanism prevents that.

### 9.3 Local games (engine, LLM, pass & play): the roll memo

- The local game record keeps `rolls`, a map from *roll identity* to `u`. It is saved with the game and survives undo.
- **Roll identity** = `decimal(ply) + "/" + positionHash(stateBefore) + "/" + stripPromo(code)`, where `ply` is `state.ply` before the move, `code` is the canonical code (§4.1), and `stripPromo` removes a trailing `=Q`, `=R`, `=B` or `=N`.
  - Example: W2's `c1-h6` at ply 0 has the identity `0/8f9af7718bec3d8a/c1-h6`.
  - `e7-e8=Q` and `e7-e8=N` in the same position share one identity, so they share one `u`. Their outcome weights are identical (§4.10), so they have the same outcome.
- For every rolled move of a local game (the player's, the engine's and the LLM's): if the identity is in `rolls`, `u := rolls[identity]`. Otherwise `u := crypto.getRandomValues(new Uint32Array(1))[0] >>> 8`, stored in `rolls` and persisted **before** `applyMove(state, move, {u})` is called.
- Each move entry of the local record also stores its `u`, as online, so replays and the review use the recorded values.
- Consequences:
  - Undoing and replaying the same move in the same position, with any promotion piece, gives the same result.
  - A roll has no value until the move is first played, so nothing in browser storage predicts a future roll.
  - The same position at a later ply (a genuine repetition, or a line changed after an undo) is a fresh roll. The ply is part of the identity for exactly this reason; the position hash stops a known value from being reused in a different position.
- Any undo marks the game "assisted", which excludes it from local statistics.
- Local games are trust-based. The record lives in the player's browser and can be edited there. Local results never affect ratings.

### 9.4 Game record integrity (normative for the server and the online client)

Each stored move carries `chain` (64 lowercase hex digits):

```
chain_0 = sha256hex("qchess-chain|v1|" + gameId + "|" + whiteUid + "|" + blackUid + "|" + createdAt)
chain_n = sha256hex(chain_{n-1} + "|" + ply + "|" + code + "|" + (u ?? "-") + "|" + (key ?? "-") + "|" + sha256hex(canonicalStateJsonAfter))
```

Inputs, exactly:

| Input | Format |
|---|---|
| `gameId` | The game's id as a decimal integer, no padding (`42`) |
| `whiteUid`, `blackUid` | The Nextcloud user ids, verbatim |
| `createdAt` | The game's creation time in Unix seconds as a decimal integer, no padding: the `created_at` column, which the API returns as `createdAt` (`1790000000`). Never a formatted date |
| `ply` | `state.ply` **before** the move, decimal. The first move has ply `0` |
| `code` | The canonical code (§4.1) |
| `u` | The recorded `u` as a decimal integer, or `-` if the move was not rolled (or its outcome was forced) |
| `key` | The measurement record's `key`, or `-` if there is no record |
| `canonicalStateJsonAfter` | The canonical JSON (§2.6) of the state after the move |

`sha256hex` is lowercase hex of SHA-256 over the UTF-8 bytes of its argument.

**Test vector** (W2 played as game `42`, White `alice`, Black `bob`, created at `1790000000`):

- `chain_0` input `qchess-chain|v1|42|alice|bob|1790000000` gives `049816ae57365c0bfe28b2358e4ff9b460d91765ee10fcbc8714a3a0d2163c75`.
- Move 1 is `c1-h6` at ply `0` with `u = 8388608` and key `capture`. The state after it is:

  ```json
  {"v":1,"types":"kqrrbbnnppppppppkqrrbbnnpppppppp","worlds":[["....A..........................................E............a...",16777216]],"turn":"b","castling":"-","ep":"-","halfmove":0,"fullmove":1,"ply":1,"captured":[1,2,3,5,6,7,8,9,10,11,12,13,14,15,17,18,19,20,21,22,24,25,26,27,28,29,30,31,23],"history":["15ec044c3e248721"],"result":null}
  ```

  Its `sha256hex` is `b4b4d83ee34de58f4039ea6b4a6ffe08c84f95a850b2396bc18f0d23ed6234eb`.
- `chain_1` input `049816ae…3c75|0|c1-h6|8388608|capture|b4b4d83e…34eb` (full values) gives `23c84483be0638e3765cec8a1f46c3ed84d01806ad05c3598ebd9355fa8d6608`.

Checks:

- **Client check.** The client keeps the last `(ply, chain)` it saw for each game. On every fetch it replays new moves with the JS engine using the recorded `u`, and recomputes the chain.
- **On mismatch.** The client shows a persistent "Game history was altered on the server" banner.
- **Verify button.** The post-game review's **Verify** button replays the whole game the same way.
- **What the chain proves.** It detects any later change to a move the client has **already loaded**. It is not keyed, so someone with write access to the database can rewrite a move the opponent's client has not loaded yet (including its `u`), recompute the chain, and leave no trace. A server administrator who is also a player could do this to their own roll before the opponent first sees it. Player-facing text MUST NOT claim more than this ([`rules.md`](rules.md) §8).

**Roll display** (`rollDisplay`, used by the move list, the replay and the Verify view):

- Let the outcomes be `(k_1, W_1) … (k_n, W_n)` in key order (§5.2), `a_0 = 0` and `a_i = W_1 + … + W_i`. Outcome `k_i` is chosen exactly when `a_{i−1} ≤ u < a_i`: every outcome owns a half-open interval, and `capture`, when present, is always the **last** one.
- `dec_d(x)` renders an integer `0 ≤ x ≤ T` as `floor(x · 10^d / 2^24)` with `d` decimals, by **truncation**, in integer arithmetic (JS `Math.floor(x * 10 ** d / 16777216)`, PHP `intdiv($x * 10 ** $d, 16777216)`; exact because `T · 10^8 < 2^53`). Rounding functions (`toFixed`, `number_format`) MUST NOT be used: they print `u = 8388607` as `0.5000`.
- `d = 4` if `dec_4(a_0) < dec_4(a_1) < … < dec_4(a_n)` and `dec_4(u) < dec_4(a_j)` for the chosen outcome `k_j`. Otherwise `d = 8` for the whole line. Because `10^8 > 2^24`, `dec_8` is strictly increasing on integers, so the shown roll always lies inside the shown interval of the shown result.
- Text form: every outcome as `Label [dec(a_{i−1}), dec(a_i))`, joined by ` · `, then ` · rolled ` + `dec(u)` + ` → ` + the chosen label. Labels are Missed, Moved and Captured, or the square name for a Measure. A forced outcome (`u = null`) shows `forced` instead of a roll value.
- The Verify view also shows the integers `u` and `W_k`. The bar in the move list draws the same intervals with a marker at `u`.
- Vectors:

  | Outcomes | `u` | Text |
  |---|---|---|
  | W2 `[move 8388608, capture 8388608]` | `6227703` | `Moved [0.0000, 0.5000) · Captured [0.5000, 1.0000) · rolled 0.3712 → Moved` |
  | same | `8388607` | `Moved [0.0000, 0.5000) · Captured [0.5000, 1.0000) · rolled 0.4999 → Moved` |
  | W3 `[miss 8388608, move 4194304, capture 4194304]` | `10368000` | `Missed [0.0000, 0.5000) · Moved [0.5000, 0.7500) · Captured [0.7500, 1.0000) · rolled 0.6179 → Moved` |
  | `[miss 11184811, capture 5592405]` | `11184810` | `Missed [0.00000000, 0.66666668) · Captured [0.66666668, 1.00000000) · rolled 0.66666662 → Missed` |
  | same | `11184811` | `Missed [0.0000, 0.6666) · Captured [0.6666, 1.0000) · rolled 0.6666 → Captured` |

---

## 10. Worked examples

Positions are built from a FEN plus a prelude of moves (Appendix A). Boards are shown as canonical strings. The
readable piece list is in braces: uppercase is White and lowercase is Black. `captured` for setup positions lists
every absent id and is omitted here. `T = 16777216`.

### W1. The start, a split, and a merge back

The start is one world with weight `16777216` and hash `80c209d9560802c2` (the JSON is in §2.5).

**1. `g1-f3|h3`** (split, `quantum`).

- Tuple `(1, 6, 21, 23)`. `t1 = f3 (21)`, `t2 = h3 (23)`.
- Both lanes are empty (knight), so the single world branches into `ceil = 8388608` (child 1, knight on f3) and `floor = 8388608` (child 2, knight on h3).
- Sorted, the h3 board comes first, because at index 21 `.` < `H`:

```
CGEBAF.DIJKLMNOP.......H........................ijklmnopcgebafhd  8388608   {Nh3 …}
CGEBAF.DIJKLMNOP.....H..........................ijklmnopcgebafhd  8388608   {Nf3 …}
```

- `B(w) = 2`, `B(b) = 1`, `halfmove = 1`, `ply = 1`, `turn = "b"`, hash `483a99c829aee5ce`.
- Full JSON:

```json
{"v":1,"types":"kqrrbbnnppppppppkqrrbbnnpppppppp","worlds":[["CGEBAF.DIJKLMNOP.......H........................ijklmnopcgebafhd",8388608],["CGEBAF.DIJKLMNOP.....H..........................ijklmnopcgebafhd",8388608]],"turn":"b","castling":"KQkq","ep":"-","halfmove":1,"fullmove":1,"ply":1,"captured":[],"history":["80c209d9560802c2","483a99c829aee5ce"],"result":null}
```

**1… `e7-e5`.**

- The pawn is in M, with a single outcome `move`, so it is `certain` and draws no `u`.
- No white pawn is next to e5, so `ep = "-"`.
- `halfmove = 0`, and `history` resets to `["62e1e066b0926df1"]`.

**2. `f3|h3-g1`** (merge).

- Both parts reach g1 in their worlds, so `outcomes = [move]` and the merge is `certain`.
- The knight is classical again. The worlds collapse into one with weight `16777216`. Hash `49192f86bee5e059`.
- `castling` is still `KQkq`: the knight has nothing to do with the rights.

### W2. A solid piece attacks a ghost (two outcomes)

FEN `4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1`, prelude `g8-f6|h6`. White: Bc1, Ke1. Black: Ke8, and the knight (id 23) is 50%
f6 / 50% h6.

```
..E.A..........................................h............a...  8388608  {Bc1 Ke1 nh6 ke8}
..E.A........................................h..............a...  8388608  {Bc1 Ke1 nf6 ke8}
```

**`c1-h6`.** The target may hold a black piece, so the move is in M.

- The lane d2, e3, f4, g5 is clear in both worlds.
- Keys: the h6 world is `capture`, the f6 world is `move`.
- `outcomes = [move 8388608, capture 8388608]`: 50% each, `rolled`.

| `u` | Chosen | Result |
|---|---|---|
| `0 … 8388607` (e.g. `r = 0.3 → u = 5033164`) | `move` | `....A........................................h.E............a...` 16777216 {Ke1 nf6 Bh6 ke8}: the bishop is on h6 and the knight is certainly on f6. `halfmove +1`. |
| `8388608 … 16777215` | `capture` | `....A..........................................E............a...` 16777216 {Ke1 Bh6 ke8}. Id 23 is appended to `captured`, and `halfmove = 0`. |

Record for `u = 8388608`: `{"key":"capture","u":8388608,"captured":23,"outcomes":[{"key":"move","weight":8388608},{"key":"capture","weight":8388608}],"fallback":false}`.
Notation: `Bc1xh6 {capture 50%}`. Either way the bishop ends on h6, **because its lane is clear in every world**: a
solid piece whose lane is certainly clear never wastes its move when it lands on a ghost. If a ghost part might
stand on the lane, the move can also `miss` (edge case #5, #84): with the knight split `g4-e3|h6` instead, the e3 part
blocks the lane (d2, e3, f4, g5) and `c1-h6` gives `[miss 8388608, capture 8388608]`.

### W3. A ghost attacks a ghost (three outcomes)

FEN `4k3/8/3b4/8/8/8/8/4K1N1 w - - 0 1`, prelude `g1-f3|h3`, then `d6-c7|e5`. There are four independent worlds of
`4194304` each:

```
....A..................H..........................e.........a...  4194304  {Ke1 Nh3 bc7 ke8}
....A..................H............e.......................a...  4194304  {Ke1 Nh3 be5 ke8}
....A................H............................e.........a...  4194304  {Ke1 Nf3 bc7 ke8}
....A................H..............e.......................a...  4194304  {Ke1 Nf3 be5 ke8}
```

**`f3-e5`** (in M, because `occ(e5)` is the bishop).

- Keys per world: `miss`, `miss` (the knight is on h3), `move`, `capture`.
- `outcomes = [miss 8388608, move 4194304, capture 4194304]`.

| `u` range | Key | After |
|---|---|---|
| `0 … 8388607` | `miss` | Two worlds, `{Nh3 bc7}` and `{Nh3 be5}`. The sum is `8388608`; rescaled ×2, it becomes 8388608 each. The knight is certainly on h3. The bishop is still 50/50. |
| `8388608 … 12582911` | `move` | `{Ne5 bc7}`, one world. The bishop is certainly on c7. |
| `12582912 … 16777215` | `capture` | `{Ne5}`, and id 20 is captured. |

### W4. A blocked slide creates a link, then a Measure collapses both pieces

FEN `4k3/8/1n6/8/8/8/8/R3K3 b - - 0 1`.

**1… `b6-a4|c4`.**

```
C...A.....................g.................................a...  8388608  {Ra1 Ke1 nc4 ke8}
C...A...................g...................................a...  8388608  {Ra1 Ke1 na4 ke8}
```

**2. `a1-a8`.** a8 is certainly empty, so the move is not in M.

- The lane a2…a7 contains a4. The c4 world keys `move` and the a4 world keys `miss`.
- `outcomes = [miss, move]`, so the move is `quantum`: no roll.
- `B(w)` becomes 2, which is ≤ 8, so there is no fallback.

```
....A.....................g.............................C...a...  8388608  {Ke1 nc4 Ra8 ke8}
C...A...................g...................................a...  8388608  {Ra1 Ke1 na4 ke8}
```

- The rook and the knight are now linked:
  - `T·W(Ra8 ∧ nc4) = 2^24·2^23 = 2^47`;
  - `W(Ra8)·W(nc4) = 2^46`;
  - the difference is `2^46`, which is ≥ `2^36`.
- `conditionalView(a4)` shows the rook 100% on a1. `conditionalView(a8)` shows the knight 100% on c4.

**2… `?a4`** (Black measures the knight; the canonical square is `min(a4, c4) = a4`).

- `outcomes = [a4 8388608, c4 8388608]`.
- `u = 3` gives `a4`: one world `{Ra1 Ke1 na4 ke8}`. The rook collapses to a1 with it.
- `u = 9000000` gives `c4`: `{Ke1 nc4 Ra8 ke8}`.
- `halfmove +1`.

### W5. A split with one lane blocked in some worlds

FEN `4k3/8/8/8/8/6n1/8/1K1R4 b - - 0 1`.

**1… `g3-f1|h5`.** The knight is 50% f1 / 50% h5.

**2. `d1-h1|d5`.** `t1 = h1 (7)`, `t2 = d5 (35)`. S4 holds: in the h5 world both lanes are clear.

- **World with the knight on h5 (8388608).** Both lanes are clear. Child 1 is rook h1 (4194304) and child 2 is rook d5 (4194304).
- **World with the knight on f1 (8388608).** The lane to h1 (e1, f1, g1) is blocked, so child 1 stays on d1 (4194304). Child 2 is rook d5 (4194304).

```
.A.................................C...g....................a...  4194304  {Kb1 Rd5 nh5 ke8}
.A.....C...............................g....................a...  4194304  {Kb1 Rh1 nh5 ke8}
.A...g.............................C........................a...  4194304  {Kb1 nf1 Rd5 ke8}
.A.C.g......................................................a...  4194304  {Kb1 Rd1 nf1 ke8}
```

- Rook: d5 50%, h1 25%, d1 25%.
- `loc_after = {d1, h1, d5}` (3 squares, ≤ 4). `B(w) = 3`, `B(b) = 2`, 4 worlds.
- The rook is linked to the knight: the rook is on d1 only where the knight is on f1.
- No number was drawn.

### W6. A converging capture (certain) and "certain danger"

FEN `7k/8/8/8/8/8/8/3QK3 w - - 0 1`, prelude `d1-d4|h5`. The queen is 50% d4 / 50% h5, and the black king is on h8.

```
....A..................................B.......................a  8388608  {Ke1 Qh5 kh8}
....A......................B...................................a  8388608  {Ke1 Qd4 kh8}
```

**`kingDanger(black)`:**

- the standard captures `d4-h8` and `h5-h8` score 50% each;
- the converging capture `d4|h5-h8` scores 100%.

So the danger is `T`: **certain danger**.

**`d4|h5-h8`** (a merge in M).

- Keys: `capture` in both worlds. `outcomes = [capture 16777216]`, so the move is `certain`.
- No `u` is drawn and `measurement = null`.
- The result is one world, `....A..........................................................B` {Ke1 Qh8}, with id 16 captured.
- E1 then gives `{"result":"1-0","reason":"king_captured"}`. Notation: `Qd4|h5xh8 #`.

By contrast, the standard move `h5-h8` has `outcomes = [miss 8388608, capture 8388608]`. With `u = 100` it misses,
and the queen is then certainly on d4.

### W7. Largest-remainder rescale after a missed pawn capture

FEN `4k1n1/8/8/8/8/3P4/8/4K3 b - - 0 1`. Play `1… g8-f6|h6 2. e1-e2 f6-d5|e4`. The knight is on three squares.

```
............A......I...........................h............a...  8388608  {Ke2 Pd3 nh6 ke8}
............A......I...............h........................a...  4194304  {Ke2 Pd3 nd5 ke8}
............A......I........h...............................a...  4194304  {Ke2 Pd3 ne4 ke8}
```

**`3. d3-e4`** (pawn diagonal, in M).

- Keys: `miss`, `miss`, `capture`. `outcomes = [miss 12582912, capture 4194304]`: 75% / 25%.

**`u = 3000000` gives `miss`.** The kept weights are `(8388608, 4194304)` and `S = 12582912`.

- h6 world: `N = 8388608·2^24`, `q = 11184810`, `r = 8388608`.
- d5 world: `q = 5592405`, `r = 4194304`.
- `D = 16777216 − 16777215 = 1`. The largest remainder is the h6 world, so it gets +1.
- Result: `(11184811, 5592405)`, shown as 67% / 33%. The pawn stays on d3 and `halfmove` increases by 1.

**`u = 13000000` gives `capture`.** One world `{Ke2 Pe4 ke8}`, id 23 is captured, and `halfmove = 0`.

### W8. Budget fallback

FEN `4k3/8/6n1/8/8/8/8/1NBQK2R w - - 0 1`, prelude `b1-a3|c3`, `c1-d2|e3`, `d1-b3|a4`, `g6-f4|h4`.

- White has three independent 50/50 pieces, so `B(w) = 8`.
- The black knight is 50% f4 / 50% h4, so `B(b) = 2`.
- There are 16 worlds of `1048576` each.

**`h1-h8`.**

- h8 is certainly empty, so the move is not in M.
- The lane h2…h7 contains h4. Unmeasured, the rook would be on h1 where the knight is on h4 and on h8 where it is on f4.
- Every white arrangement would then exist with both rook squares, so `B(w)` would be 16, which exceeds 8. This is the **fallback**.
- The move is `rolled` with `outcomes = [miss 8388608, move 8388608]`.

**`u = 9000000` gives `move`.**

- The 8 worlds with the knight on f4 survive and are rescaled to `2097152` each.
- The rook is certainly on h8 and the knight certainly on f4.
- `B(w) = 8`, `B(b) = 1`.
- The record has `"fallback":true`, and the preview showed "roll: budget full".

### W9. A pawn probe, a double push and en passant

FEN `4k3/8/8/8/3p2n1/8/4P3/4K3 w - - 0 1`, prelude `g4-e3|h6`. The black knight is 50% e3 / 50% h6.

**`e2-e4`.**

- The pawn is in M. The lane is `[e3]`.
- Keys: the e3 world is `miss`, the h6 world is `move`. `outcomes = [miss 8388608, move 8388608]`.

**`u = 1` gives `miss`.** The pawn stays on e2. It does not advance one square. The knight is certainly on e3. `ep = "-"`
and `halfmove +1`.

**`u = 16000000` gives `move`.** The pawn is on e4 and the knight is certainly on h6. A black pawn stands on d4, next to
e4, so `ep = "e3"` and `halfmove = 0`.

**Then `d4-e3`** (en passant) is a certain capture of id 12, the e2 pawn. No `u` is drawn and `halfmove = 0`.

### W10. Castling rights follow the state

FEN `4k3/8/8/8/8/8/8/4K2R w K - 0 1`.

- **`h1-h3|h5`.** Rook 3 is no longer on h1 in every world, so `K` is removed and `castling = "-"`.
- **A later `h3|h5-h1`.** The rook returns to h1 with certainty, but the flag stays removed.
- **A missed king attempt** (the king bumps into its own ghost on e2) leaves the king on e1, so `K` would be kept.

### W11. Randomness vectors

- `r = 0.5` gives `u = 8388608`. `r = 0.999999999` gives `u = 16777215`.
- Roll memo identity (§9.3): W2's `c1-h6` at ply 0 is `0/8f9af7718bec3d8a/c1-h6`.
- Chain (§9.4): `chain_0 = 049816ae57365c0bfe28b2358e4ff9b460d91765ee10fcbc8714a3a0d2163c75`, `chain_1 = 23c84483be0638e3765cec8a1f46c3ed84d01806ad05c3598ebd9355fa8d6608`.
- Roll display: the five rows of the §9.4 table.

### W12. Index order, not name order (odd weights)

FEN `4k1n1/8/8/8/7R/3P4/8/4K3 w - - 0 1`, prelude `g8-f6|h6`, `f6-d5|e4`, `d3-e4@miss`. The prelude repeats W7, so
the knight is h6 `11184811` / d5 `5592405`. The rook on h4 is id 2 (`C`, FEN step 2). Hash `1059583f07581935`.

```
....A..............I...........C...............h............a...  11184811  {Ke1 Pd3 Rh4 nh6 ke8}
....A..............I...........C...h........................a...   5592405  {Ke1 Pd3 Rh4 nd5 ke8}
```

**`h4-h3|a4`** (split). By index `h3 = 23 < a4 = 24`, although `"a4" < "h3"` as names.

- Canonical code `h4-h3|a4`, tuple `(1, 31, 23, 24)`. A parser MUST also accept `h4-a4|h3` and normalise it.
- Both worlds branch, and both weights are odd, so child 1 (**h3**) gets the extra unit: `11184811 → h3 5592406, a4 5592405` and `5592405 → h3 2796203, a4 2796202`.

```
....A..............I....C......................h............a...  5592405  {Ke1 Pd3 Ra4 nh6 ke8}
....A..............I....C..........h........................a...  2796202  {Ke1 Pd3 Ra4 nd5 ke8}
....A..............I...C.......................h............a...  5592406  {Ke1 Pd3 Rh3 nh6 ke8}
....A..............I...C...........h........................a...  2796203  {Ke1 Pd3 Rh3 nd5 ke8}
```

- `B(w) = 2`, hash `e64c1d334ceeb8af`.

**1… `e8-d8`** (certain), hash `fa1e4e870feb98ca`. **2. `?h3`** (the canonical Measure is `?h3`, the lowest
**index** of `loc = {h3, a4}`; `?a4` parses to the same move).

- `outcomes = [h3 8388609, a4 8388607]`, in index order.
- `u = 0` and `u = 8388608` give `h3`: the h3 worlds rescale to `(11184811, 5592405)`, hash `221bc0511bf8b8f6`.
- `u = 8388609` gives `a4`, hash `c8c6e6a2d75059ea`.
- An engine that orders by name would produce `h4-a4|h3`, give the odd unit to a4, use `?a4`, and map `u = 0` to `a4`. All of these differ from the vector.

### W13. The budget fast accept must count blocked lanes

FEN `4k3/8/8/8/8/6n1/8/KNBR4 w - - 0 1`, prelude `g3-f1|h5`, `b1-a3|c3`, `c1-b2|e3`. There are 8 worlds of
`2097152`. `B(w) = 4` (knight a3/c3 × bishop b2/e3; the rook is certain on d1), `B(b) = 2`. Hash `0c9886eceb87b80e`.

**`d1-h1|d5`** is **illegal: `budget_full`.**

- The lane to d5 (d2, d3, d4) is clear in every world, so all 8 worlds branch, and `k = 4`.
- In the four worlds with the black knight on f1, the lane to h1 (e1, f1, g1) is blocked, so child 1 stays on d1.
- Result: each of the 4 White arrangements exists with the rook on h1, d5 and d1, so `B(w) = 12 > 8`.
- `k_b = 4`, so the sound fast accept `B + k + k_b = 12 > 8` does not apply, and the exact count decides. The unsound shortcut `B + k = 8 ≤ 8` would wrongly accept.

### W14. A trapped king ends the game (E1b)

FEN `6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1`. White: Ra1, Ke1. Black: Kg8, pawns f7, g7, h7.

**`a1-a8`** (certain).

- Black's legal moves are `g8-f8`, `g8-h8` and the six pawn moves. After each of them, the rook captures the king with certainty along the clear eighth rank, so `kingDanger(s_o, black) = T` every time.
- So `kingTrapped` holds, and E1b gives `{"result":"1-0","reason":"king_trapped"}`. Notation `Ra1-a8 #`. Hash `7166d3cef5551f3c`.
- With an extra black knight on d7, `d7-b8` or `d7-f8` blocks the rank, so Black is not trapped and play goes on.

### W15. En passant adjacency uses files, not index ± 1

FEN `4k3/8/8/p7/8/8/7P/4K3 w - - 0 1`. **`h2-h4`** (certain).

- `t = h4 = 31`. Index 32 is `a5`, which holds a black pawn, but `a5` is on another rank. No black pawn stands beside h4, so `ep = "-"`. Hash `7630184fdd9223c9`. (A wrapping engine would write `ep = "h3"`, hash `be9e53289ababfcb`.)
- Mirror: FEN `4k3/p7/8/8/7P/8/8/4K3 b - - 0 1`, **`a7-a5`** gives `ep = "-"`, hash `67d9307690c4f1b5`, although index 31 (h4) holds a white pawn.

### W16. Draws yield to a certain king capture (D18)

FEN `8/8/4k3/3n4/4K3/8/8/8 w - - 0 1`. White: Ke4. Black: Ke6, Nd5.

- **`e4-d5`** is a certain capture of the knight. Only the two kings are left, but they stand on adjacent squares, so Black has a certain king capture and E2 is skipped: `result = null`, hash `3bdffd05d877049c`.
- **1… `e6-d5`** captures the king: `{"result":"0-1","reason":"king_captured"}`.
- In the same way, a move that makes `halfmove = 100`, or repeats a position for the third time, does not draw if it leaves the mover's king certainly capturable.

### W17. Setup vectors (Appendix A)

- **Two queens.** FEN `4k3/8/8/8/8/8/8/2QQK3 w - - 0 1`. Pass 1 gives the d1 queen id 1 (`B`) and the king id 0 (`A`). Pass 2 finds no free queen id for the c1 queen. Pass 4 gives it the lowest free pawn id, 8 (`I`), with `types[8] = "q"`. Board `..IBA.......................................................a...`, `types = "kqrrbbnnqpppppppkqrrbbnnpppppppp"`, `captured = [2,3,4,5,6,7,9,10,11,12,13,14,15,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31]`, hash `3a386523ce53fad7`. (A single square-by-square scan would wrongly give the c1 queen id 1.)
- **Ghost plus en passant.** FEN `4k3/8/8/8/3pP3/8/8/4K1N1 b - e3 0 1`, prelude `g1-f3|h3`. Each prelude move runs with `turn` = its owner and `ep = "-"`. Afterwards `turn = "b"` and `ep = "e3"` come from the FEN and pass I10. Hash `e2f094948d875644`. Black may now play `d4-e3` en passant.
- **Rolled prelude move without an outcome.** FEN `4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1`, prelude `g8-f6|h6`, `c1-h6` fails with `prelude_needs_outcome`. `c1-h6@capture` is accepted.

---

## 11. Edge-case table

X is the moving piece, Y a friendly piece and Z an enemy piece. "P" is a probability. "Rolled" means one `u` is drawn.

| # | Situation | Exact resolution |
|---|---|---|
| 1 | Classical piece, clear lane, target certainly empty | `certain`, no `u` |
| 2 | Classical piece captures a classical piece | In M with the single key `capture`: a certain capture, no `u`, measurement `null` |
| 3 | Slider lane crosses a square that holds Z with 0 < P < 1, and the target is certainly empty | Not in M, so `quantum`. X moves in the worlds with a clear lane and stays elsewhere. X and Z are linked. No `u`, unless there is a fallback (#40). |
| 4 | Same, but the lane blocker is own Y | As #3. The link is between own pieces, and `B(mover)` cannot grow (§7.3). |
| 5 | Lane crosses an uncertain piece, and the target certainly holds Z | In M. `capture` (worlds with a clear lane) or `miss`. On capture, the blocker is certainly off the lane. On miss, X stays, the blocker is certainly on the lane, and Z is untouched. |
| 6 | X certain, lane clear, Z on the target with P = ½ | Rolled `move` ½ / `capture` ½. After `move`, Z is certainly on its other square or squares. |
| 7 | X on `f` with P = ½, Z certain on the target | Rolled `miss` ½ / `capture` ½. After `miss`, X is certainly not on `f`. |
| 8 | X ½ and Z ½, independent | Three outcomes: `miss` ½, `move` ¼, `capture` ¼ (W3) |
| 9 | The target holds own Y with 0 < P < 1 | In M (exclusion). `move` means Y is certainly not on the target. `miss` keeps every world where the move failed, for whatever reason. |
| 10 | The target certainly holds own Y | Illegal: `own_piece` |
| 11 | X is partly on `f` and partly on `t`; move `f → t` | Not in M. X moves in the worlds with X on `f` and a clear lane, and the weights add up on `t`. If every part arrives, X becomes certain on `t`. |
| 12 | Z is on the target only in worlds where X is not on `f` | Still in M, because `occ(t) ≠ none`. The outcomes are `miss` / `move`, so it is rolled. This keeps I1 true. |
| 13 | X can stand on `f`, but the lane is blocked in every such world | Illegal: `blocked` |
| 14 | A ghost part moves to a certainly empty square along a certainly clear lane | `quantum`. It moves only in its own worlds, and `B` is unchanged. |
| 15 | Rook 50% a1 / 50% a4 plays `a1-a8` | a4 is empty in every world where the rook is on a1. Result: a8 50% / a4 50%, `quantum`. A piece never blocks itself. |
| 16 | A split target holds any piece, including X, in any world | Illegal: `split_target_occupied` |
| 17 | A split lane is blocked in every world with X on `f`, or no world has both lanes clear | Illegal: `split_blocked` |
| 18 | A split lane is blocked in only some worlds | The blocked child stays on `f` (W5) |
| 19 | Splitting a part of a superposed piece | Legal if S3 to S7 hold. For example, knight h6 ½, d5 ¼, e4 ¼ (W7). |
| 20 | A split would leave X on 5 or more squares | Illegal: `location_cap` |
| 21 | A split would make `B(mover) > 8` | Illegal: `budget_full`. It is never converted to a roll. |
| 22 | A branching world has weight 1 | Legal. Child 2 would get weight 0 and is dropped: the unit goes to `t1` if lane 1 is clear, else it stays on `f` (§4.7). If that world was the only one with lane 2 clear, `t2` receives nothing. There is no `precision` code. |
| 23 | A branching world has odd weight `w` | Child 1 (the lower-**index** target) gets `ceil(w/2)` (W12) |
| 24 | `t1` lies on the lane to `t2`, e.g. rook `a1-a3\|a5` | Legal and clean. Lanes are judged before the move. |
| 25 | Split or merge of a king or pawn | Illegal: `cannot_split` / `cannot_merge` |
| 26 | Merge where X reaches the target in **every** world (it stands only on `f1`, `f2` or `t`, and no lane can be blocked) | `certain`: X is classical on the target. Two named parts that surely arrive are not enough if X has a third part elsewhere. |
| 27 | Merge onto a target that holds no enemy piece (empty or X), where some part may not arrive (a blocked lane, or a third part elsewhere) | Those worlds are unchanged, so the merge is `quantum` (or a budget fallback, #40). No roll. |
| 28 | Merge where one named part can never reach the target | Illegal: `merge_part_stuck`. Use the standard move from the other part. |
| 29 | Merge with `t = f1` or `t = f2` | Illegal: `unreachable`. The standard move `f2 → f1` does it (#11). |
| 30 | The merge target holds a friendly piece other than X in any world | Illegal: `merge_target_own` |
| 31 | The merge target certainly holds Z, and X reaches it in every world | A certain converging capture, with no `u` (W6) |
| 32 | The merge target possibly or certainly holds Z, and the result is not a single outcome | Rolled: `miss` / `move` / `capture`. For example, queen d4/h5/a1 merging `d4\|h5-h8` onto a king misses in the a1 worlds. |
| 33 | The piece is on 3 squares, and two of them merge | The third part is unaffected. If the target holds the third part, the weight gathers there. |
| 34 | A merge lane from `f1` passes `f2` | Never blocked by X itself |
| 35 | Measure of a certain piece, or of an enemy piece | Illegal: `not_superposed` / `not_your_piece` |
| 36 | Measure of a piece linked to an enemy piece | Both collapse together (W4). This is intended. |
| 37 | A pawn pushes onto a square that possibly holds any piece | Rolled `move` / `miss` (a probe). The pawn stays classical. |
| 38 | A double push with the skipped square or the target possibly occupied | Rolled. On `miss` the pawn stays on its home square; it never advances one square. `ep` is set only on `move`, and only if an enemy pawn is adjacent (W9). |
| 39 | A pawn diagonal onto a square with Z at P < 1 | Rolled `capture` / `miss`. After `miss`, Z is certainly elsewhere. |
| 40 | A quantum move would raise `B(mover)` above 8 | Budget fallback: rolled `miss` / `move` (W8) |
| 41 | The opponent's moves and your own budget | They can only lower your `B` (§7.2) |
| 42 | A pawn diagonal onto a certainly empty non-`ep` square, or onto a square that possibly holds only own pieces | Illegal: `nothing_to_capture` |
| 43 | En passant | Always certain: one outcome, no `u` |
| 44 | A promotion push onto a possibly occupied square | Rolled. The type changes only on `move`. The four promotion moves have identical weights. |
| 45 | A promotion capture takes the king | The type is set, then E1 applies |
| 46 | A king steps onto a square that possibly holds own Y | Rolled `move` / `miss`. After `miss`, Y is certainly there and the castling rights are kept. |
| 47 | A king steps onto a square that possibly holds Z | Rolled `move` / `capture`. The king ends on the target either way. |
| 48 | A ghost attacker with P = ½ attacks a classical king | Rolled `capture` ½ / `miss` ½. On `miss`, the attacker is certainly elsewhere. |
| 49 | A king captures a king | E1: the mover wins |
| 50 | A castling square between king and rook is possibly occupied | Illegal: `castle_blocked` |
| 51 | Castling out of, through or into attack | Legal. There is no check; the UI warns. |
| 52 | A rook split, then merged back home | The right was lost at the split and does not return (W10) |
| 53 | The castling rook is captured | Its flag is removed (state-based) |
| 54 | A rolled-class move whose worlds all share one key | `certain`: no `u`, measurement `null` |
| 55 | An unmeasured move makes two worlds identical | They are merged and their weights added. No rescale. |
| 56 | A move is possible only in a world of weight 1 | Legal. It is shown as `1%` (`pct` never shows an uncertain event as 0%). |
| 57 | Only the two kings are left, not adjacent | Draw: `bare_kings`. If they are adjacent, see #82. |
| 58 | A king capture on ply 1200 | `king_captured`: E1 is checked before E5. (A king capture always resets `halfmove`, so it never meets E4.) |
| 59 | A split/merge cycle recreates a position | The third occurrence is a draw (`repetition`), unless the side to move has a certain king capture (#83) |
| 60 | The side to move has no legal move | Draw: `no_moves` |
| 61 | `applyMove` on a finished game | Throws `game_over`. `generateMoves` returns `[]`. |
| 62 | Local undo and replay of the same rolled move in the same position | Same roll identity, so the roll memo gives the same `u` and the same outcome. The game is marked assisted. |
| 63 | Local undo and a different move at the same ply | A different identity, so a fresh `u`. A different **promotion piece** is not a different move for this purpose: `e7-e8=Q` and `e7-e8=N` share one identity and one `u` (§9.3). |
| 64 | `opts.outcome` names a key that is not an outcome | On a rolled move: throws an argument error. On a move that is not rolled: ignored, like `opts.u` (§5.2). |
| 65 | A split where some world with a branching projection has a blocked lane (W13) | That projection can yield three projections. S5 counts exactly; the fast accept must use `B + k + k_b`. W13 is `budget_full`. |
| 66 | A roll lands just below a boundary, e.g. `u = 8388607` against `[move ½, capture ½]` | `move`. Shown by truncation, `rolled 0.4999`; 8 decimals whenever 4 would put the roll on a shown boundary (§9.4). Never "needed below … for Captured": `capture` is always the last interval. |
| 67 | A rolled prelude move without `@key` | Setup error `prelude_needs_outcome` (Appendix A). A setup is never random. |
| 68 | A prelude double push, or a FEN `ep` field together with a prelude | Every prelude move runs with `ep = "-"`. Afterwards `ep` is the FEN field and must pass I10 (W17). |
| 69 | Two pieces of one type compete for an id in a FEN (queens on c1 and d1) | Four complete passes: the d1 queen gets id 1, the c1 queen a pawn id (W17) |
| 70 | A double push to the h-file with an enemy pawn on the a-file of the next rank (or the mirror) | Not adjacent: `ep = "-"` (W15) |
| 71 | Split targets or Measure squares whose names sort differently from their indices (`h3` = 23, `a4` = 24) | Index order everywhere: code `h4-h3\|a4`, odd unit to h3, `?h3`, outcomes `[h3, a4]` (W12) |
| 72 | Chain for a move that is not rolled, or has a forced outcome | `u` and/or `key` are `-`; all numbers are plain decimals; `createdAt` is Unix seconds (§9.4) |
| 73 | A king that is not on its own home square makes a castling-shaped move (Black king on e1 plays `e1-g1`) | Not castling. An ordinary king move that fails `G`: `unreachable` |
| 74 | Castling by the side not to move | Illegal: `not_your_piece` |
| 75 | A Measure of a certainly empty square | `no_piece`. The Measure square is normalised only after check 5. |
| 76 | `promo` on a split, merge or Measure | `malformed` |
| 77 | A code string whose piece letter does not match the piece (`Nc1-h6` for a bishop) | `piece_mismatch`; `findMove` returns `null` |
| 78 | The opponent creates a world of weight 1 (e.g. by many skewed split/merge cycles) | Your splits stay legal (#22). The opponent cannot deny your splits. |
| 79 | Notation with annotations: `Qd4\|h5xh8 #`, `?Na4 {c4 50%}`, `Nf3xe5 {capture 25%} #` | Parsed by the fixed pipeline (§4.12). `N?a4` is `null`. |
| 80 | A ghost part gives the opponent a 25% king shot | Legal on both sides. The shot is a rolled capture; a miss costs the shooter a tempo. The ring shows 25% and the confirmation asks from 10% (§8). |
| 81 | After a move, every legal move of the side to move leaves the game running with its king certainly capturable | E1b: the mover wins, `king_trapped` (W14) |
| 82 | A capture leaves only the two kings, standing on adjacent squares | E2 is skipped; the side to move can capture the king (W16) |
| 83 | A move makes `halfmove ≥ 100`, or repeats a position for the third time, and leaves the mover's king certainly capturable | E3/E4 are skipped for this move. `halfmove` may pass 100 (I11). |
| 84 | A solid attacker's lane crosses a ghost part, and the target holds a ghost | Rolled with `miss` possible, e.g. bishop `c1-h6` against knight e3/h6: `miss` ½ / `capture` ½. "A solid piece never wastes its move" holds only for a certainly clear lane. |
| 85 | The side to move has a reply that captures the enemy king with any probability | Not trapped: that reply ends the game, so it is an escape |
| 86 | The trapping move is made at ply 1199, so every reply reaches ply 1200 | Not trapped: every reply ends the game in a draw by E5 |

**Application edge cases** (Appendix D; not engine rules):

| # | Situation | Resolution |
|---|---|---|
| A1 | A player times out while the opponent has only a king | Draw |
| A2 | A player times out before making their first move | The game is aborted, not lost |
| A3 | Someone with database access changes a roll before the opponent's client loads the move | Not detectable in v1; the chain only protects moves a client has already loaded (§9.4). A player who is an instance administrator is marked in rated games. |
| A4 | A coach or AI-move request carries a slightly altered copy of one of the requester's active rated positions (weights, flags or ids changed) | Refused: the server compares support keys, not exact hashes (Appendix D) |
| A5 | A player looks for future local rolls in browser storage | There are none: a local roll is drawn when the move is first played (§9.3) |
| A6 | Local: undo, play a waiting move, then the same rolled move at a later ply | A fresh roll, because the position and ply changed. The undo already marked the game assisted. |

---

## 12. Parity and testing requirements

- **Fixtures** (`tests/fixtures/engine/*.json`). Each step records:
  - the input state;
  - the ordered legal code list;
  - the chosen code;
  - the integer `u` or the forced `outcome`;
  - the resulting state;
  - the measurement record.

  States and records are compared as **canonical JSON bytes**, with no tolerance. Derived float fields
  (`successProbability`, `probability`) are excluded from byte comparison.
- **Vectors** that both engines MUST reproduce:
  - the start JSON and hash (§2.5);
  - W1 (hashes `483a99c829aee5ce`, `62e1e066b0926df1`, `49192f86bee5e059`);
  - W5 (code `d1-h1|d5`, where index order `h1 = 7 < d5 = 35` differs from name order);
  - W12 (index order with odd weights: split code, child weights, canonical Measure, outcome order, `u → key`);
  - W13 (`budget_full`), W14 (`king_trapped`), W15 (`ep`), W16 (bare kings adjacent), W17 (setup);
  - the rescale vector (§5.3);
  - the chain vector and the roll-display vectors (§9.4), and the roll-memo identity (§9.3; JS client only);
  - the `r → u` vectors (W11);
  - the move order example (§4.10);
  - the parser fixtures (§4.12), including the round trip of every notation string in §10.
- **Property tests**, run after every applied move in both engines:
  - `validateState` passes;
  - the weights sum to `T`;
  - `B(mover) ≤ 8` after every split, and `B(c) ≤ 8` for both sides after every move;
  - `B(¬mover)` did not increase;
  - `|worlds| ≤ 64`;
  - `parseMoveCode(moveNotation(...))` returns the applied move;
  - if an implementation has a split fast accept, it never accepts a split that the exact count rejects.
- **Randomly generated games** MUST include splits, merges, converging captures, Measures, promotions, castling, en passant, budget-full positions, fallbacks, trapped kings (E1b) and suspended draws (D18), plus crafted positions with weight-1 worlds.
- **PHP requirements:**
  - a 64-bit build;
  - `strcmp`/`SORT_STRING` only, never the default `sort` flags;
  - `intdiv`;
  - `hash('fnv1a64')`;
  - `hash('sha256', …)` for the chain.
- **JS requirements:**
  - no floats for weights except exact integers below `2^53`;
  - BigInt or limbs for FNV;
  - no `Math.random` inside the engine.

---

## Appendix A. Setup positions (`setupPosition`, JS; fixtures and trainer)

`setupPosition(spec)` accepts either `{state}` (checked with `validateState`) or `{fen, prelude?}`. A setup is
**deterministic**: the same spec gives the same bytes everywhere, and it never draws a random number.

**FEN id assignment** is normative, so lessons and puzzles are identical everywhere. Ids are assigned per colour in
**four complete passes**. Each pass scans that colour's pieces in ascending square index and finishes before the next
pass starts.

1. A piece standing on the start square of an id with the same initial type gets that id. This includes pawns: a pawn on e2 gets 12, a rook on h1 gets 3.
2. Each remaining non-pawn gets the lowest free id among ids 0–7 (16–23) whose initial type matches.
3. Each remaining pawn gets the lowest free pawn id (8–15 or 24–31).
4. Each remaining non-pawn, such as a second queen, gets the lowest free pawn id, and `types` records its real type.

Example: White queens on c1 and d1 (W17). Pass 1 gives d1 id 1; pass 2 finds no free queen id for c1; pass 4 gives
c1 id 8 with `types[8] = "q"`.

- If a colour does not have exactly one king, or has more pieces than ids, the setup fails.
- Unassigned ids are captured, in ascending order.
- The FEN `halfmove` field must be 0..99 and `fullmove` ≥ 1.

**Prelude.** A list of canonical codes (§4.1), each with an optional forced outcome suffix `@key`, e.g.
`c1-h6@capture`. The procedure is:

1. Build the FEN state: ids as above, one world of weight `T`, `castling` = the FEN flags ∩ the state-based condition (§5.4), `ep = "-"`, `ply = 0`, `result = null`.
2. For each prelude item, in order:
   - let X be `occ(from)`; set `turn` := X's colour and `ep := "-"`;
   - the move MUST be legal in that state, else the setup fails with `prelude_illegal` (and the `whyIllegal` code);
   - if the move is `rolled`, `@key` is required (else `prelude_needs_outcome`) and MUST be one of its outcome keys (else `prelude_bad_outcome`); if it is not rolled, `@key` MUST be absent (else `prelude_outcome_unused`);
   - apply it with `{outcome: key}` through steps A1–A8 of §5.1. The end checks (A9) are **not** run inside a prelude. A prelude move that captures a king fails with `prelude_king_captured`.
3. After the prelude, set:
   - `turn`, `halfmove`, `fullmove` and `ep` from the FEN;
   - `castling` := the FEN flags ∩ the state-based condition on the final worlds;
   - `ply = 0`, `result = null`, `history = [positionHash(state)]`.
4. Run `validateState` (I1–I12, including I10 for the FEN `ep`). A failure is `invalid_state`.

So a prelude never leaves a stray `ep` behind, a FEN `ep` survives any prelude (W17: a ghost on the board with en
passant available), and no prelude roll is ever random.

Setup error codes: `bad_fen`, `king_count`, `too_many_pieces`, `prelude_bad_code`, `prelude_illegal`,
`prelude_needs_outcome`, `prelude_bad_outcome`, `prelude_outcome_unused`, `prelude_king_captured`, `invalid_state`.

---

## Appendix B. LLM text form (`describeForLlm`, recommended) *(non-normative)*

```
Quantum Chess (rules v1). You are Black. Move 14, Black to move.
Certain pieces (FEN, uncertain pieces removed): 4k3/8/8/8/8/8/8/4K3 b - - 3 14
Uncertain pieces:
- White rook: a1 50%, a8 50%
- Black knight: a4 50%, c4 50%
Links: white rook a8 <-> black knight c4 (rook on a8 exactly when knight on c4)
Possibilities: 2. Budget: White 2/8, Black 2/8. King danger: White 0%, Black 50%.
Legal moves: e8-d7 (certain) … c4-e5 (quantum: moves only where the knight is on c4) … ?a4 (measure: a4 50%, c4 50%)
Splits: Nc4 may split to any two of: a3, a5, b2, b6, d2, d6, e3, e5
```

The LLM MUST answer with a code from the legal list. On failure, the client retries once with
`feedback = whyIllegal` text, then falls back to the built-in engine.

---

## Appendix C. Engine and AI guidance *(non-normative)*

- The AI MAY evaluate with floats. Only rules state is bound by parity.
- Evaluate on marginals `W(X@s)` (O(64)) rather than world by world. Expected material equals the marginal material.
- Chance nodes branch into at most 3 children (at most 8 for Measure). Use `getOutcomes`.
- Prune split candidates to pairs drawn from each piece's best-scoring standard targets. Deduplicate moves whose resulting position hashes are equal.
- Search king safety with `kingDanger`. It is exact and cheap because kings are classical.
- E1b (`kingTrapped`) costs one extra ply of move generation. Inside its own search the AI MAY apply moves with an internal variant that skips E1b, because the search finds the king capture one ply later anyway. States produced that way MUST NOT be stored, shown or sent to the server; every move actually played goes through the normal `applyMove`.
- **JS fast paths:**
  - cache `occ`, `W(occ@s)` and the uncertain-square mask per state;
  - a lane made only of certain squares is clear or blocked in every world at once;
  - only moves with mixed `miss`/`move` outcomes need the fallback check.

---

## Appendix D. Application rules

These rules are not part of the engine. They describe how the application around it uses the engine's results.

- **Randomness and record.** Online games follow §9.2 to §9.4. Each row of `qchess_moves` stores the `chain` string(64) and the measurement record from §5.5.
- **Time.** Use correspondence deadlines of 1, 3 or 7 days per move, with a default of 3. Send reminders at 50% and 90% of the deadline.
  - Timeout loses.
  - A timeout is a draw instead if the player who did not time out has only a king left.
  - If a side times out before making its first move, the game is aborted, not lost.
  - Unrated games may choose "no deadline", in which case the 30-day abandonment rule applies.
- **Rated play.**
  - Either side may abort until both sides have moved.
  - The server assigns colours in rated games.
  - From the 4th rated game between the same pair within 24 hours, games are unrated.
  - Use Elo with K = 40 for the first 10 rated games (shown as provisional "?"), then K = 20.
  - Results against the engine, the LLM, or in pass & play never affect rating.
- **Dice trust.** The server applies every online roll, so dice are only as trustworthy as the server (§9.2, §9.4).
  - In rated games, a player who is a member of the instance's `admin` group SHOULD be shown with an "admin" badge that links to the dice FAQ entry ([`rules.md`](rules.md)).
  - *Possible extension, non-normative:* two-party "verified dice" for rated games. At join, each client keeps a secret `x` and publishes `anchor = SHA256^600(x)`. A rolled move is stored as `roll_pending` with `commit = SHA256(r)` for fresh server randomness `r`. The opponent's client, on its next fetch, checks the pending move and reveals the next element `e` of its hash chain; the server checks `e` against the previous element, reveals `r`, and applies `u` = the first 24 bits of `SHA256(r ‖ e ‖ chain_{n−1})`; both clients verify. It is not part of the rules because `x` must live on the opponent's device (a second device or cleared storage breaks the game) and the mover sees the result only when the opponent next opens the game.
- **Fair play.** In a player's own active rated games, the coach, hints, eval bar, analysis and position export are disabled.
  - `POST /api/ai/coach` **and** `POST /api/ai/move` refuse (HTTP 403, `rated_game_in_progress`) any `state` whose *support key*, or its colour mirror, equals the support key of a position from the last 20 plies of one of the requester's active rated games, counting only positions with `ply ≥ 10` (earlier positions are opening material that also appears in lessons).
  - Support key: `turn + "|" +` a 64-character string with, for each square, the letter of `type(occ(s))` (upper case for White, lower case for Black) or `.`. It ignores weights, ids, links, castling, `ep` and history, so re-weighting a world, dropping a flag or swapping ids does not get round it. The mirror flips ranks, swaps colours and swaps `turn`.
  - This only raises the bar. The built-in engine runs in the browser and cannot be switched off by the server, so rated fair play rests on trust, and [`rules.md`](rules.md) says so.
- **UI.**
  - Budget meters: 8 pips per side.
  - The king-danger ring, which always shows its percentage, and the confirmation from 10% risk (§8).
  - "Your king cannot escape" when a game ends by `king_trapped`, with the forced capture shown as a ghost arrow.
  - Preview icons: certain, quantum, roll, and "roll: budget full". Tooltips come from `whyIllegal`.
  - A link thread and the conditional view on hover.
  - A roll bar with one interval per outcome and a marker at the roll, with the text form of §9.4 (`rollDisplay`). Never "needed below x for Captured": `capture` is always the last interval.
  - Trainer lessons, coach answers and LLM prompts quote these rules with their conditions. In particular, "a solid piece never wastes its move when it lands on a ghost" is only said together with "if its path is certainly clear" (edge case #84).
  - A luck ledger in the post-game review: per roll, the probability of the realised outcome, and cumulative realised minus expected eval. It is display only and never feeds ratings.
  - A reduced-motion mode.

**Not implemented.** The application does not implement these rules of this appendix: deadline reminders, unrated
games from the 4th rated game between the same pair, the admin badge, the refusal of `POST /api/ai/coach` and
`POST /api/ai/move` for positions of active rated games, position export and the luck ledger. Live clocks are
not part of the rules; they would need a server push channel.

---

## Appendix E. Honesty contract (trainer, coach, LLM system prompt)

| Phenomenon | Shown? | What may be said |
|---|---|---|
| Superposition | Yes, as a probability mixture | "A ghost piece is in several places with the shown odds, until something asks where it is." |
| Measurement and collapse | Yes | "By the rules of this game, landing on a maybe-occupied square, pawn and king moves, and Measure are measurements. The answer is random with the shown odds, and everything consistent with it updates." |
| Entanglement | Yes, as correlation ("links") | "Linked pieces collapse together." Never claim non-locality or faster-than-light influence. |
| Interference and phases | **No** | "Real quantum mechanics uses complex amplitudes that can interfere. This game deliberately uses probabilities only, so merges always recombine." |
| Seeing the state | Not physical | "Real experiments only show outcomes. The game shows the full state, like a simulator." |
| "Worlds" or "possibilities" | Bookkeeping | Not an endorsement of the many-worlds interpretation. |

The "physics names" toggle in the UI maps these terms:

| Game term | Physics name |
|---|---|
| ghost | superposition |
| roll | measurement |
| link | entanglement (correlation) |
| possibility | branch/world |
