/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The Rules page content (SPEC §14.10): translatable structured data that follows docs/RULES.md section by section
 * (60-second summary, sections 1–10, FAQ, glossary). Wording changes to RULES.md must be mirrored here; a unit test
 * checks that the section list matches the headings of RULES.md.
 *
 * Blocks: `{type: 'p', text}`, `{type: 'list', items}`, `{type: 'table', head, rows}` (all thunks returning
 * translated strings) and `{type: 'board', setup, caption, play?}` where `play: {code}` shows the position before
 * and after one move, with a toggle for each possible result.
 */

import { t } from '@nextcloud/l10n'

// TRANSLATORS: the words "ghost", "link", "roll" and "possibility" are game terms, see the glossary in RULES.md.

export const RULES_SECTIONS = [
	{
		id: 'summary',
		heading: '## Quantum Chess in 60 seconds',
		title: () => t('quantumchess', 'Quantum Chess in 60 seconds'),
		blocks: [
			{
				type: 'list',
				ordered: true,
				items: [
					() => t('quantumchess', 'It’s chess. Same board, same pieces, same moves. Castling, en passant and promotion all exist.'),
					() => t('quantumchess', 'You win by capturing the king. There is no check: take the enemy king and the game is over. If every move your opponent could make would leave their king to be captured for certain, you win at once: their king cannot escape.'),
					() => t('quantumchess', 'Split. A knight, bishop, rook or queen may move to two empty squares at once. It becomes a ghost, half on each square (50% / 50%).'),
					() => t('quantumchess', 'Merge. Bring two parts of a ghost together on one square, and the piece is whole again. Merging onto an enemy piece can capture it for certain.'),
					() => t('quantumchess', 'Land = roll, pass = link. If your move lands on a square where a piece is or might be, and the result is uncertain, the game rolls the dice. You see the odds before you move. If you only pass such a square, nothing is rolled: your piece becomes linked to that piece instead.'),
					() => t('quantumchess', 'Kings and pawns are always solid. Their moves are settled at once, with a roll if needed. Pawns are good at poking ghosts.'),
					() => t('quantumchess', 'Measure. Instead of moving, you may spend your turn finding out where one of your own ghosts really is.'),
					() => t('quantumchess', 'Limits. Each side has a budget of 8: at most 8 different ways its own pieces might be standing. A split can never spread a piece over more than 4 squares.'),
				],
			},
			{ type: 'board', setup: { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', prelude: ['g1-f3|h3'] }, caption: () => t('quantumchess', 'A split knight: 50% on f3, 50% on h3.') },
		],
	},
	{
		id: 'reading',
		heading: '## 1. Reading the board',
		title: () => t('quantumchess', '1. Reading the board'),
		blocks: [
			{
				type: 'table',
				head: [() => t('quantumchess', 'You see'), () => t('quantumchess', 'It means')],
				rows: [
					[() => t('quantumchess', 'A normal piece'), () => t('quantumchess', 'Solid: the piece is on that square for certain (100%).')],
					[() => t('quantumchess', 'A faded piece with a percentage badge'), () => t('quantumchess', 'One part of a ghost. The piece is on this square with that chance.')],
					[() => t('quantumchess', 'A dotted line between faded pieces'), () => t('quantumchess', 'These are the parts of one piece.')],
					[() => t('quantumchess', 'A thin thread with a chain icon'), () => t('quantumchess', 'These pieces are linked: where one is tells you where the other is.')],
					[() => t('quantumchess', 'A ring around a king'), () => t('quantumchess', 'King danger: the chance the opponent could capture this king with one move right now. Red at 100%.')],
					[() => t('quantumchess', 'Pips next to a player’s name'), () => t('quantumchess', 'That side’s quantum budget (0–8 used).')],
				],
			},
			{ type: 'p', text: () => t('quantumchess', 'Behind the scenes, the game keeps a list of possibilities: complete chessboards that could be the real one, each with a chance. The percentages on the board summarise that list. Tap one part of a ghost to get the what-if view: the board as it would be if that part is the real one.') },
		],
	},
	{
		id: 'moves',
		heading: '## 2. The four kinds of move',
		title: () => t('quantumchess', '2. The four kinds of move'),
		blocks: [
			{ type: 'p', text: () => t('quantumchess', 'Move: a normal chess move. A part of a ghost can move on its own; it then moves only in the possibilities where the piece is really on that square.') },
			{ type: 'p', text: () => t('quantumchess', 'Split: a knight, bishop, rook or queen moves to two squares at once. Both targets must be squares the piece could normally reach, and both must be empty for certain. Each target gets half of the chance the piece had. A split never captures and never rolls the dice.') },
			{ type: 'board', setup: { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' }, play: { code: 'g1-f3|h3' }, caption: () => t('quantumchess', 'g1-f3|h3: the knight splits.') },
			{ type: 'p', text: () => t('quantumchess', 'Merge: choose two squares where the same ghost stands and a target both parts can reach. If the piece ends up on the target in every possibility, it is solid again. Merging onto an enemy piece is a converging capture: if the ghost has no other part, both paths are certainly clear and the enemy piece is surely there, the capture is certain. Preparation beats dice.') },
			{ type: 'board', setup: { fen: '7k/p7/8/8/8/8/8/3QK3 w - - 0 1', prelude: ['d1-d4|h5', 'a7-a6'] }, play: { code: 'd4|h5-h8' }, caption: () => t('quantumchess', 'd4|h5-h8: the queen merges onto the king. Captured for certain, no dice.') },
			{ type: 'p', text: () => t('quantumchess', 'Measure: point at one of your own ghosts. The game rolls to decide where it really is, using the odds on the board. The piece becomes solid there, and every linked piece updates. This uses your turn. You cannot measure enemy pieces.') },
			{ type: 'board', setup: { fen: '4k3/p7/8/8/8/8/8/4K1N1 w - - 0 1', prelude: ['g1-f3|h3', 'a7-a6'] }, play: { code: '?f3' }, caption: () => t('quantumchess', 'Measuring the knight: it turns out to be on f3 or on h3.') },
		],
	},
	{
		id: 'what-happens',
		heading: '## 3. What happens when you move',
		title: () => t('quantumchess', '3. What happens when you move'),
		blocks: [
			{
				type: 'table',
				head: [() => t('quantumchess', 'Preview'), () => t('quantumchess', 'Meaning')],
				rows: [
					[() => t('quantumchess', 'Certain'), () => t('quantumchess', 'The result is fixed. No dice.')],
					[() => t('quantumchess', 'Quantum'), () => t('quantumchess', 'No dice, but afterwards your piece is (or stays) in several places, or it becomes linked.')],
					[() => t('quantumchess', 'Roll'), () => t('quantumchess', 'The game rolls. The chance of every result is shown before you commit.')],
					[() => t('quantumchess', 'Roll (budget full)'), () => t('quantumchess', 'Normally quantum, but your budget is full, so it is settled with a roll.')],
				],
			},
			{ type: 'p', text: () => t('quantumchess', 'The game rolls only when a move could turn out in more than one way and it lands on a square where a piece is or might be, or it is a pawn or king move, a Measure, or your budget is full. Nothing else ever rolls, and nothing collapses on its own.') },
			{
				type: 'table',
				head: [() => t('quantumchess', 'Result'), () => t('quantumchess', 'What happened')],
				rows: [
					[() => t('quantumchess', 'Captured'), () => t('quantumchess', 'Your piece moved and took the piece on the target square.')],
					[() => t('quantumchess', 'Moved'), () => t('quantumchess', 'Your piece moved. The target square turned out to be empty.')],
					[() => t('quantumchess', 'Missed'), () => t('quantumchess', 'Nothing moved: your piece wasn’t really on its square, its way was blocked, or your own piece was on the target. Your turn is still used.')],
				],
			},
			{ type: 'board', setup: { fen: '4k1n1/p7/8/8/8/8/8/2B1K3 w - - 0 1', prelude: ['e1-d1', 'g8-f6|h6'] }, play: { code: 'c1-h6' }, caption: () => t('quantumchess', 'A solid bishop lands on a ghost: 50% Captured, 50% Moved. Afterwards the board catches up.') },
			{ type: 'p', text: () => t('quantumchess', 'A ghost only hits if it is really there: a 50% part that attacks a solid piece captures half the time and misses otherwise.') },
			{ type: 'board', setup: { fen: '3rk3/p7/8/8/8/8/8/3QK3 w - - 0 1', prelude: ['d1-d3|a4', 'a7-a6'] }, play: { code: 'd3-d8' }, caption: () => t('quantumchess', 'The queen’s d3 part attacks the rook: Captured or Missed.') },
			{ type: 'p', text: () => t('quantumchess', 'Passing a ghost links you. If you only pass a square where a piece might be, nothing is rolled: where the piece is in the way you stay, where it isn’t you arrive. Now the two pieces are linked, and finding out about one tells you about the other.') },
			{ type: 'board', setup: { fen: '4k3/8/1n6/8/8/8/7P/R3K3 w - - 0 1', prelude: ['h2-h3', 'b6-a4|c4'] }, play: { code: 'a1-a8' }, caption: () => t('quantumchess', 'a1-a8 passes a4: the rook is now 50% a1, 50% a8, linked to the knight.') },
		],
	},
	{
		id: 'pawns',
		heading: '## 4. Pawns',
		title: () => t('quantumchess', '4. Pawns'),
		blocks: [
			{
				type: 'list',
				items: [
					() => t('quantumchess', 'Pawns are always solid. They never split or merge, and every pawn move is settled at once.'),
					() => t('quantumchess', 'Pushing onto a square where a piece might be is a roll: Moved means it was free, Missed means something was there.'),
					() => t('quantumchess', 'A double step needs both squares free. If the way is blocked, the pawn stays where it was.'),
					() => t('quantumchess', 'Capturing diagonally onto a ghost is a roll: Captured or Missed.'),
					() => t('quantumchess', 'Promotion happens only if the pawn really reaches the last rank. En passant works as in chess and is always certain.'),
				],
			},
			{ type: 'board', setup: { fen: '4k3/8/8/8/6n1/8/4P3/4K3 w - - 0 1', prelude: ['e1-d1', 'g4-e3|h6'] }, play: { code: 'e2-e4' }, caption: () => t('quantumchess', 'Pawns make great probes: e2-e4 finds out where the knight is.') },
		],
	},
	{
		id: 'king',
		heading: '## 5. The king and castling',
		title: () => t('quantumchess', '5. The king and castling'),
		blocks: [
			{
				type: 'list',
				items: [
					() => t('quantumchess', 'The king is always solid. A king step onto a square where a piece might be is a roll.'),
					() => t('quantumchess', 'There is no check. You may move your king into danger; if you do, your opponent may take it.'),
					() => t('quantumchess', 'King danger: every king shows the chance that the opponent could capture it with one move right now. At 100% the ring turns red.'),
					() => t('quantumchess', 'Safety net: if a move would leave your king at 10% danger or more and another move is at least 10 points safer, the game asks you to confirm.'),
					() => t('quantumchess', 'Your king cannot escape: if every move you could make would leave your king to be captured for certain, you have lost at once.'),
					() => t('quantumchess', 'Castling needs the king and rook solid on their starting squares and every square between them empty for certain. You may castle out of, through or into attack.'),
				],
			},
			{ type: 'board', setup: { fen: '7k/p7/8/8/8/8/8/3QK3 w - - 0 1', prelude: ['d1-d4|h5'] }, caption: () => t('quantumchess', 'Both parts of the queen attack the black king: king danger 100%.') },
		],
	},
	{
		id: 'winning',
		heading: '## 6. Winning and drawing',
		title: () => t('quantumchess', '6. Winning and drawing'),
		blocks: [
			{ type: 'p', text: () => t('quantumchess', 'You win when you capture the enemy king, when the enemy king cannot escape after your move, or when your opponent resigns or, online, runs out of time.') },
			{
				type: 'list',
				items: [
					() => t('quantumchess', 'Draw: only the two kings are left.'),
					() => t('quantumchess', 'Draw: the same position appears for the third time.'),
					() => t('quantumchess', 'Draw: 50 moves by each side without a capture or a pawn move actually happening.'),
					() => t('quantumchess', 'Draw: the player to move has no legal move, or the game reaches 600 moves by each side.'),
				],
			},
			{ type: 'p', text: () => t('quantumchess', 'The first three draws wait if the player to move can capture the enemy king for certain. Players can also agree to a draw.') },
		],
	},
	{
		id: 'limits',
		heading: '## 7. Limits',
		title: () => t('quantumchess', '7. Limits'),
		blocks: [
			{ type: 'p', text: () => t('quantumchess', 'The quantum budget counts the different ways your own pieces could be standing: one 50/50 knight gives 2, add a 50/50 bishop and you have 4, add a 50/50 rook and you have 8, which is full.') },
			{ type: 'board', setup: { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', prelude: ['g1-f3|h3', 'a7-a6', 'b1-a3|c3', 'b7-b6'] }, caption: () => t('quantumchess', 'Two white ghosts: White’s budget is 4/8.') },
			{
				type: 'list',
				items: [
					() => t('quantumchess', 'When your budget is full, splits are greyed out and quantum moves are settled with a roll. Everything else works as normal.'),
					() => t('quantumchess', 'Your opponent can never use up your budget; their moves can only lower it.'),
					() => t('quantumchess', 'A split may not spread a piece over more than 4 squares.'),
				],
			},
		],
	},
	{
		id: 'dice',
		heading: '## 8. Fair dice',
		title: () => t('quantumchess', '8. Fair dice'),
		blocks: [
			{
				type: 'list',
				items: [
					() => t('quantumchess', 'Before you move, the preview shows the chance of every result.'),
					() => t('quantumchess', 'After a roll, the log shows a bar with one stretch per result (Missed, Moved, Captured) and a marker at the number rolled.'),
					() => t('quantumchess', 'Online games: the server draws a fresh random number when your move is applied. Every roll is recorded and chained, and changes to moves you have already seen show a warning.'),
					() => t('quantumchess', 'Local games remember each roll: undoing and playing the same move in the same position gives the same result, so undo cannot re-roll the dice. Undo marks the game as assisted.'),
					() => t('quantumchess', 'The built-in engine and AI opponents do not know future rolls. They see the same odds you do.'),
				],
			},
		],
	},
	{
		id: 'online',
		heading: '## 9. Online games',
		title: () => t('quantumchess', '9. Online games'),
		blocks: [
			{
				type: 'list',
				items: [
					() => t('quantumchess', 'You can resign at any time, and you can offer a draw.'),
					() => t('quantumchess', 'Online games have a time limit per move (1, 3 or 7 days). The player who runs out of time loses, unless the other player has only their king left (a draw) or the player had not moved yet (the game is cancelled).'),
					() => t('quantumchess', 'In your running online games the coach, hints, the evaluation bar and the analysis are switched off. They come back when the game ends.'),
					() => t('quantumchess', 'Games against the computer, an AI model or pass & play never change your rating.'),
				],
			},
		],
	},
	{
		id: 'quantum',
		heading: '## 10. What\'s quantum about it (and what isn\'t)',
		title: () => t('quantumchess', '10. What’s quantum about it (and what isn’t)'),
		blocks: [
			{ type: 'p', text: () => t('quantumchess', 'Quantum Chess uses three real quantum ideas in a simplified form: superposition (a ghost is in several places until something asks), measurement (landing, pawn and king moves and Measure ask a question with the shown odds) and entanglement (linked pieces are correlated).') },
			{ type: 'p', text: () => t('quantumchess', 'It does not model interference or non-locality, and it shows you the full state the way a physics simulator would. Turn on physics names in the settings to see the textbook terms.') },
			{
				type: 'table',
				head: [() => t('quantumchess', 'Game term'), () => t('quantumchess', 'Physics name')],
				rows: [
					[() => t('quantumchess', 'ghost'), () => t('quantumchess', 'superposition')],
					[() => t('quantumchess', 'roll'), () => t('quantumchess', 'measurement')],
					[() => t('quantumchess', 'link'), () => t('quantumchess', 'entanglement (correlation)')],
					[() => t('quantumchess', 'possibility'), () => t('quantumchess', 'branch/world')],
				],
			},
		],
	},
	{
		id: 'faq',
		heading: '## FAQ',
		title: () => t('quantumchess', 'FAQ'),
		blocks: [
			{ type: 'faq', q: () => t('quantumchess', 'Is there check or checkmate?'), a: () => t('quantumchess', 'There is no check: you win by capturing the king. The nearest thing to checkmate is a king that cannot escape: the game ends at once.') },
			{ type: 'faq', q: () => t('quantumchess', 'Why didn’t my piece move?'), a: () => t('quantumchess', 'The result was Missed. The piece wasn’t really on its square, its path was blocked, or your own piece was on the target. The board has updated to match what you learned.') },
			{ type: 'faq', q: () => t('quantumchess', 'My rook is suddenly in two places, but I never split it!'), a: () => t('quantumchess', 'It slid past a square where another piece might have been. Where that piece was in the way, the rook stayed; where it wasn’t, the rook arrived. Now the two pieces are linked.') },
			{ type: 'faq', q: () => t('quantumchess', 'Can a ghost capture?'), a: () => t('quantumchess', 'Yes, but only if it is really there: a 50% part captures with a 50% chance. To capture for certain, merge its parts onto the target.') },
			{ type: 'faq', q: () => t('quantumchess', 'Why can’t I split this piece?'), a: () => t('quantumchess', 'The tooltip tells you: it is a king or a pawn, a target is not empty for certain, no possibility has both paths clear, the piece would be on more than 4 squares, or your budget is full.') },
			{ type: 'faq', q: () => t('quantumchess', 'Can I re-roll by undoing?'), a: () => t('quantumchess', 'No. In local games the same move in the same position always gets the same result.') },
			{ type: 'faq', q: () => t('quantumchess', 'The percentages say 67% and 33%. Why not halves?'), a: () => t('quantumchess', 'After a roll, the remaining possibilities share the chance in proportion.') },
		],
	},
	{
		id: 'glossary',
		heading: '## Glossary',
		title: () => t('quantumchess', 'Glossary'),
		blocks: [
			{
				type: 'table',
				head: [() => t('quantumchess', 'Term'), () => t('quantumchess', 'Meaning')],
				rows: [
					[() => t('quantumchess', 'Budget'), () => t('quantumchess', 'How many different ways your own pieces might be standing. At most 8 per side.')],
					[() => t('quantumchess', 'Captured / Moved / Missed'), () => t('quantumchess', 'The three results of a rolled move.')],
					[() => t('quantumchess', 'Converging capture'), () => t('quantumchess', 'A merge onto an enemy piece.')],
					[() => t('quantumchess', 'Ghost'), () => t('quantumchess', 'A piece that is on several squares at once, each with a chance.')],
					[() => t('quantumchess', 'Link'), () => t('quantumchess', 'Two or more pieces whose positions depend on each other.')],
					[() => t('quantumchess', 'Measure'), () => t('quantumchess', 'A move that settles where one of your own ghosts really is.')],
					[() => t('quantumchess', 'Possibility'), () => t('quantumchess', 'One complete chessboard that could be the real one, with its chance.')],
					[() => t('quantumchess', 'Roll'), () => t('quantumchess', 'The random decision when a move could turn out in several ways.')],
					[() => t('quantumchess', 'Solid'), () => t('quantumchess', '100% on one square. Kings and pawns are always solid.')],
					[() => t('quantumchess', 'What-if view'), () => t('quantumchess', 'The board as it would be if the part you tapped is the real one.')],
				],
			},
		],
	},
]
