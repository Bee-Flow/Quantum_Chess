# Lead decisions (binding for every variant)

These decisions were taken by the lead during the local session of 2026-09-25. They override anything in a research
spec, a review note or an earlier report that says otherwise.

## L1. The classic win and draw rules apply to every variant

The variants follow `docs/rules.md` sections 5 and 6, as the core now implements by default for classic two-side
variants (`escapeRule`, `bareKingsDraw`, `drawsWait` in `src/variants/core/variant.js`):

- **The king cannot escape:** if every action the side to move could make would leave its king to be captured for
  certain, and none of its actions could capture an enemy king with any chance, the mover wins at once (reason
  `cannotEscape`). This is the game's version of checkmate.
- **Bare kings:** only the kings left (and no pieces in hand) is a draw (reason `bareKings`).
- **Draws wait** while the player to move can capture an enemy king for certain.

Opt out only when the variant's own rules make the classic rule wrong, and say why in a code comment:

| Variant | escapeRule | bareKingsDraw | Why |
|---|---|---|---|
| koth | keep | `false` | a bare king can still walk to the hill and win |
| antichess | off by default (compulsory capture, no royal piece) | off | losing chess: kings are ordinary pieces |
| horde | keep (Black's king) | `false` | White has no king; the horde wins by capturing the king, Black by capturing every white piece |
| atomic | keep | keep | an explosion is a capture for the escape test |
| multiverse | off by default (multi-move turns) | decided by its final spec | |
| fourplayer, bughouse | off by default (four sides) | off | |

A variant that already returns `bareKings` from its own `worldResult` must not do it twice: prefer the core flag and
remove the variant copy, unless the variant's condition differs (then keep its own and set `bareKingsDraw: false`).

The variant's `rules()` card must not contradict this. Do not write "there is no checkmate" or "you win only by
capturing the king". The shared rules card already explains capture-the-king and the escape rule; a variant card
only says what is special in that variant.

## L2. `specialMoves: false` for variants with neither castling nor en passant

Set `specialMoves: false` in raumschach, hyper4d, shogi, xiangqi and makruk, so the shared rules card leaves out
its castling and en passant sentence. Variants with at least one of the two keep the default.

## L3. Texts decided in the core

- A missed drop reads "Missed: the piece stays in hand" (shared `outcomeText`), in every drop variant.
- The roll memo key is `ply:positionHash:code` with a trailing promotion suffix stripped (`src/variantplay/rolls.js`):
  undoing and choosing another promotion piece replays the same roll.

## L4. Castling and en passant

Castling never rolls and en passant is certain (legal only when available in every world), as `docs/rules.md` says.

## L5. Tests follow the rules, not the other way round

When a variant test fails because the core now applies L1 to L4, fix the test position or expectation (and add a test
for the new behaviour where it matters), not the core.
