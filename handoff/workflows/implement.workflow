export const meta = {
  name: 'variant-implementation',
  description: 'Implement, test and adversarially verify 19 quantum chess variants',
  phases: [
    { title: 'Implement', detail: 'one agent per variant: module, tests, docs snippet' },
    { title: 'Verify', detail: 'adversarial rules review + fuzz, fixes in place' },
  ],
}

const SP = args.handoff
const REPO = '/home/user/Quantum_Chess'
const IDS = args.ids

const EXTRA = {
  multiverse: 'This is the hardest variant. The quantum layer (core/quantum.js) reads worlds through b.board, b.sq, b.ty, b.sd and b.x, so keep the piece-list world shape: give V.topology a static capacity of squares (for example timelines x time slots x files x ranks, with a bounded history window) and encode every board square as one integer; a piece on a board snapshot is an ordinary piece id (new snapshots may add ids; keep b.sq/b.ty/b.sd arrays of equal length inside a world). Provide layoutOf(state) to draw only the boards that exist in some world. Override generate/apply only if you must.',
  fourplayer: 'Four sides: give each side a rotate angle (0, 90, 180, 270) so each player sees their army at the bottom, an orient(side, vec) that turns oriented pawn vectors, isOut(w, side) for eliminated players, and a worldResult for the last player (or team) standing. Offer a teams option if the spec proposes it.',
  bughouse: 'Four seats on two boards. Squares of both boards are one topology (two 8x8 boards side by side with labels). Sides are seats; enemies(a, b) is true only for the two seats of the same board. Captured pieces go to the partner seat hand (onCapture). Set drops: true.',
  crazyhouse: 'Set drops: true. Captured pieces go to the capturer hand (onCapture), promoted pieces demote to pawns (track promotion in the type, e.g. a separate promoted type id, or in w.x).',
  shogi: 'Set drops: true. Pentagon glyphs (shape shogi, promoted: true for promoted types). Promotion via types[t].promote with optional/forced; captured pieces demote and change side (onCapture).',
  kriegspiel: 'Hidden information: hidden: true, visibility(state, side) (own squares only), candidateMoves(state) (moves the side might try given only its own pieces: generate with enemy pieces removed from every world, plus pawn capture tries to any diagonal square), aiView(state, side). The UI shows "the umpire says: not possible" when a tried move is illegal (branches() null); captures are announced by square.',
  darkchess: 'Hidden information: hidden: true, visibility(state, side) (own pieces plus every square they might move to, over all worlds; use reachable() from core/quantum.js), aiView(state, side).',
  xiangqi: 'Points board: cells with shape "point", layout lines for the grid, palace diagonals, a river area. noMoves: the side without a legal move loses.',
  hexagonal: 'Hex cells: use makeTopology with shape "hex" cells (x, y = centre, w = width, h = height of a flat-topped hexagon), three shades (light, mid, dark).',
  raumschach: 'Draw the five 5x5 levels side by side (or in a compact grid) with a boards entry per level labelled A..E.',
  trid: 'Draw the three main levels and the four fixed attack boards as separate boards in a readable 2D arrangement with labels.',
  hyper4d: 'Draw a 4x4 grid of 4x4 boards with labels; the square name joins board and cell with a colon (e.g. B2:c3).',
  chess960: 'Option: the start position number 0..959 (type number, random: true, default 518). The castling rights come from castlingRights() in core/orthodox.js.',
}

const IMPLEMENT = (id) => `You implement the chess variant "${id}" for Quantum Chess 2.0 in the repo ${REPO}.

Read first, in this order:
1. ${SP}/IMPLEMENTING.md (the API as built, style rules and the checks you must run).
2. ${SP}/research/${id}.md (the researched and reviewed rules spec of this variant). If it does not exist, research the rules yourself first (precise, well-known rule set). The researchers' prototypes on the real core are in ${SP}/prototypes/ (see ${SP}/status-research.md for which folder belongs to which variant); reuse what is correct.
3. The core files named in IMPLEMENTING.md, especially src/variants/core/quantum.js, world.js, orthodox.js, orthodoxVariant.js, variant.js, and tests/js/variants/core.spec.js + helpers.js.
4. docs/rules.md (the quantum rules players know).
${EXTRA[id] ? '\nVariant-specific guidance: ' + EXTRA[id] + '\n' : ''}
Do:
- Replace the placeholder src/variants/${id}.js with the full variant (default export defineVariant({...}), id '${id}', category as in src/variants/catalog.js). Include rules() with 3 to 8 short translated sentences about what is special in this variant, piece names for every type, glyphs, values for the computer, and a good layout.
- Write tests/js/variants/${id}.spec.js: at least 10 tests covering setup (every start square), movement of every piece type (move counts from concrete squares), every special rule, the win/draw conditions, and at least 3 quantum interactions (a split, a roll, a game-end or solid roll where the variant makes it interesting). Use the concrete test cases of the spec where they fit. Use stateOf/play from tests/js/variants/helpers.js.
- Write the player-facing documentation snippet ${SP}/docs/${id}.md: a level-3 heading with the variant name, then 4 to 10 bullet points in plain English: board, pieces, special rules, how to win, and how the quantum rules interact with them. No fluff.
- Only create or edit: src/variants/${id}.js, tests/js/variants/${id}.spec.js, ${SP}/docs/${id}.md. Never edit other repository files (core, UI, catalog, other variants, shared tests). If the core truly blocks a correct implementation, work around it with the variant hooks (generate/apply overrides are allowed) and describe the needed core change in your report.
- Run and make pass: npx eslint src/variants/${id}.js tests/js/variants/${id}.spec.js (0 problems; use --fix first), node tools/check-line-length.mjs (no findings in your files), npx vitest run tests/js/variants/${id}.spec.js, and npx vitest run tests/js/variants/fuzz.spec.js -t ${id} (random games must never throw or break an invariant, and must run in well under a minute).

Return a short report: what you implemented, rule decisions that differ from the spec (and why), test count, anything the core should change.`

const VERIFY = (id, report) => `You are an adversarial reviewer of the chess variant "${id}" in the repo ${REPO} (Quantum Chess 2.0). The implementer reported:
---
${report}
---
Read ${SP}/IMPLEMENTING.md, ${SP}/research/${id}.md (the rules spec; may be missing), src/variants/${id}.js, tests/js/variants/${id}.spec.js and ${SP}/docs/${id}.md.

Hunt for real defects, by running code, not only by reading:
- Write throwaway probes as a temporary vitest file ${REPO}/tests/js/variants/probe-${id}.spec.js (run it with "npx vitest run tests/js/variants/probe-${id}.spec.js"; console.log what you need) and DELETE it when you are done. Probes check: every start square against the spec; the move counts of every piece type from several squares against hand calculation; every special rule (promotion, castling, drops, explosions, forced captures, win conditions, regions, blocking legs, screens, whatever applies); that rules() text, docs snippet and code agree; that the layout draws every square exactly once with sensible coordinates and that side 0 is at the bottom.
- Quantum interactions: splits of each splittable type, a roll landing on a ghost, pass = link, measure, and the game-end roll for this variant's win condition.
- Performance: a 60-ply random game must stay fast (see tests/js/variants/fuzz.spec.js).
Fix every defect you confirm, in src/variants/${id}.js, tests/js/variants/${id}.spec.js or ${SP}/docs/${id}.md only (add a regression test for each fix). Do not edit other files. Then rerun: npx eslint on the two files, node tools/check-line-length.mjs, npx vitest run tests/js/variants/${id}.spec.js and npx vitest run tests/js/variants/fuzz.spec.js -t ${id}.

Return a short list: each defect found (confirmed by a probe), what you fixed, and any remaining concern (including core changes you think are needed, with reasons).`

const results = await pipeline(
  IDS,
  (id) => agent(IMPLEMENT(id), { label: 'implement:' + id, phase: 'Implement' }),
  (report, id) => agent(VERIFY(id, report), { label: 'verify:' + id, phase: 'Verify' }).then((v) => ({ id, report, verify: v })),
)
return results.filter(Boolean)
