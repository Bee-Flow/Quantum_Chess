<!--
  - SPDX-FileCopyrightText: 2026 BeeFlow
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Translation glossary

English is the source language. Every translation uses **one word per term** below, in the app, the notifications,
the settings pages, the trainer, the rules page and the chess variants. The App Store texts in `appinfo/info.xml` are
English only. The terms follow the glossary of [`docs/rules.md`](../docs/rules.md) and, for the variants,
[`docs/variants.md`](../docs/variants.md); where a language has an established chess term, that term is used.
Workflow: [`README.md`](README.md).

Form of address: Dutch *je*, German *du*, French *vous* (as Nextcloud itself).

Nextcloud offers German twice: *Deutsch* (`de`, du) and *Deutsch (Förmlich: Sie)* (`de_DE`), and it does not fall back
from `de_DE` to `de` for an app. `translationfiles/de_DE` therefore exists as well; it currently carries the `de`
texts (du) so that formal-German users never see English. A translator who turns it into the Sie form edits only
`translationfiles/de_DE/quantumchess.po`; new strings must be added to both German files.

## Game terms

| English | Dutch (nl) | German (de) | French (fr) |
|---|---|---|---|
| ghost | spookstuk | Geist | fantôme |
| part (of a ghost) | deel | Teil | part |
| solid | vast | fest | solide |
| Move (move type) | Zet | Zug | Coup |
| Split / to split | Splitsen / splitsen | Teilen / teilen | Diviser / diviser |
| Merge / to merge | Samenvoegen / samenvoegen | Vereinen / vereinen | Fusionner / fusionner |
| Measure / to measure | Meten / meten | Messen / messen | Mesurer / mesurer |
| measurement | meting | Messung | mesure |
| roll (noun) / to roll | worp / gooien | Wurf / würfeln | lancer / lancer les dés |
| Land = roll, pass = link | Landen = gooien, passeren = koppelen | Landen = würfeln, vorbeiziehen = verknüpfen | Atterrir = lancer, passer = lier |
| link / linked | koppeling / gekoppeld | Verknüpfung / verknüpft | lien / lié |
| Captured / Moved / Missed | Geslagen / Verzet / Gemist | Geschlagen / Gezogen / Verfehlt | Pris / Déplacé / Raté |
| converging capture | samenvoegslag | Vereinigungsschlag | prise convergente |
| possibility | mogelijkheid | Möglichkeit | possibilité |
| quantum budget | kwantumbudget | Quantenbudget | budget quantique |
| king danger | koningsgevaar | Königsgefahr | danger pour le roi |
| the king cannot escape | de koning kan niet ontsnappen | der König kann nicht entkommen | le roi ne peut pas s'échapper |
| safety net | vangnet | Sicherheitsnetz | filet de sécurité |
| What-if view | wat-als-weergave | Was-wäre-wenn-Ansicht | vue « Et si ? » |
| odds / chance | kans | Chance / Wahrscheinlichkeit | chance / probabilité |

## Chess terms

| English | Dutch (nl) | German (de) | French (fr) |
|---|---|---|---|
| king, queen, rook, bishop, knight, pawn | koning, dame, toren, loper, paard, pion | König, Dame, Turm, Läufer, Springer, Bauer | roi, dame, tour, fou, cavalier, pion |
| White / Black (the sides) | Wit / Zwart | Weiß / Schwarz | les Blancs / les Noirs |
| check / checkmate | schaak / schaakmat | Schach / Schachmatt | échec / échec et mat |
| capture | slaan, slag | schlagen | prendre, prise |
| castling (kingside / queenside) | rokade (kort / lang) | Rochade (kurz / lang) | roque (petit / grand) |
| promotion / to promote | promotie / promoveren | Umwandlung / umwandeln | promotion / promouvoir |
| draw | remise | Remis | nulle |
| resign | opgeven | aufgeben | abandonner |
| abort (a game) | afbreken | abbrechen | annuler la partie |
| rematch | revanche | Revanche | revanche |
| rating / rated game | rating / partij met rating | Wertung / gewertete Partie | cote / partie classée |
| leaderboard | ranglijst | Bestenliste | classement |
| open challenge | open uitdaging | offene Herausforderung | défi ouvert |
| engine | engine | Engine | moteur |
| square, file, rank | veld, lijn, rij | Feld, Linie, Reihe | case, colonne, rangée |
| back rank | achterste rij | Grundreihe | première rangée |
| square colour | veldkleur | Feldfarbe | couleur de case |
| start position | beginstelling | Startstellung | position de départ |
| double step (of a pawn) | dubbele stap | Doppelschritt | double pas |
| en passant | en passant | en passant | en passant |
| stalemate | pat | Patt | pat |
| double check / perpetual check | dubbelschaak / eeuwig schaak | Doppelschach / Dauerschach | échec double / échec perpétuel |
| bare king | kale koning | blanker König | roi seul |
| castle out of, through or into attack (variant rules) | rokeren als de koning aangevallen wordt, of als hij een aangevallen veld passeert of bereikt | aus, durch oder in einen Angriff rochieren | roquer alors que votre roi est attaqué, en passant par une case attaquée ou en arrivant sur une case attaquée |

The castling row is the wording of the Capablanca chess and Chess960 rules; Kriegspiel says the same about check. The
classic rules text still has the older Dutch and French wording (*rokeren uit, door of in een aanval*, *roquer en étant
attaqué, à travers ou vers une case attaquée*). The German wording is kept in all three places for now; if it changes,
it changes in all three together.

## App terms

| English | Dutch (nl) | German (de) | French (fr) |
|---|---|---|---|
| Quantum Chess (the app name) | Quantum Chess | Quantum Chess | Quantum Chess |
| Pass & play | Samen spelen | Zu zweit | Jeu à deux |
| Computer | Computer | Computer | Ordinateur |
| AI opponent | AI-tegenstander | KI-Gegner | adversaire IA |
| Trainer / lesson / puzzle | Trainer / les / puzzel | Trainer / Lektion / Rätsel | Entraînement / leçon / problème |
| coach / hint | coach / hint | Coach / Tipp | coach / indice |
| evaluation bar | evaluatiebalk | Bewertungsbalken | barre d'évaluation |
| review | analyse | Analyse | analyse |
| move quality: Quantum brilliancy, Only move, Best, Excellent, Good, Inaccuracy, Mistake, Blunder, Lucky, Unlucky | Kwantumbriljant, Enige zet, Beste, Uitstekend, Goed, Onnauwkeurigheid, Fout, Blunder, Geluk, Pech | Quanten-Glanzzug, Einziger Zug, Bester Zug, Ausgezeichnet, Gut, Ungenauigkeit, Fehler, Grober Fehler, Glück, Pech | Brillance quantique, Seul coup, Meilleur coup, Excellent, Bon, Imprécision, Erreur, Gaffe, Chanceux, Malchanceux |
| Nextcloud AI / organisation provider / my own API key | Nextcloud AI / AI-dienst van de organisatie / mijn eigen API-sleutel | Nextcloud-KI / KI-Anbieter der Organisation / mein eigener API-Schlüssel | IA de Nextcloud / fournisseur IA de l'organisation / ma propre clé d'API |
| chess variant / Chess variants | variant / Schaakvarianten | Variante / Schachvarianten | variante / Variantes d'échecs |
| computer levels: Easy, Normal, Hard | Makkelijk, Normaal, Moeilijk | Leicht, Normal, Schwer | Facile, Normal, Difficile |
| on this device | op dit apparaat | auf diesem Gerät | sur cet appareil |
| Pass the device / to hand the device over | Apparaat doorgeven / het apparaat doorgeven | Gerät weitergeben / das Gerät weitergeben | Passer l'appareil / passer l'appareil |
| pass & play in running text (variant rules) | bij samen spelen | beim Spiel zu zweit an einem Gerät | en jeu à deux |
| You play (side choice in the new-game dialog) | Je speelt met | Du spielst | Votre camp |
| {side} to move / {side} is thinking… | {side} is aan zet / {side} denkt na… | {side} ist am Zug / {side} denkt nach… | Trait : {side} / {side} : réflexion en cours… |
| Play and roll | Zetten en gooien | Ziehen und würfeln | Jouer et lancer les dés |
| Undo (the button, also named in rules texts) | Terugnemen | Rückgängig | Annuler le coup (in running text *annuler un coup*) |
| Flip board / Whole board / Zoom in / Zoom out / Recentre | Bord omdraaien / Hele bord / Inzoomen / Uitzoomen / Centreren | Brett drehen / Ganzes Brett / Vergrößern / Verkleinern / Zentrieren | Retourner l'échiquier / Tout l'échiquier / Zoom avant / Zoom arrière / Recentrer |
| Previous / Next board to play | Vorig / Volgend speelbaar bord | Vorheriges / Nächstes spielbares Brett | Échiquier précédent / suivant à jouer |
| {count} targets outside the view | {count} doelen buiten beeld | {count} Zugziele außerhalb der Ansicht | {count} cibles hors de la zone affichée |
| Game options (variant game screen) | Spelopties | Partieoptionen | Options de la partie |
| Hide rules | Regels verbergen | Regeln ausblenden | Masquer les règles |

Open point: *Pass & play* also names the variant mode for bughouse and four-player chess, where *Zu zweit* and
*Jeu à deux* wrongly say "two players". The German and French reviewers ask for a separate msgid or a new term for all
places (for example *Gemeinsam spielen*, *Partie locale*); until that is decided, keep the terms above.

## Variant names

The names in common use in each language. Kriegspiel, Chess960, Crazyhouse, Horde, Shogi, Xiangqi and Makruk keep
their names in all three languages.

| English | Dutch (nl) | German (de) | French (fr) |
|---|---|---|---|
| 3D chess (Raumschach) | 3D-schaak (Raumschach) | 3D-Schach (Raumschach) | Échecs en 3D (Raumschach) |
| Tri-Dimensional chess | Driedimensionaal schaak | Dreidimensionales Schach | Échecs tridimensionnels |
| 4D chess | 4D-schaak | 4D-Schach | Échecs en 4D |
| Multiverse chess (5D) | Multiversumschaak (5D) | Multiversum-Schach (5D) | Échecs du multivers (5D) |
| Fog of war | Oorlogsmist | Nebel des Krieges | Brouillard de guerre |
| Atomic | Atoomschaak | Atomschach | Échecs atomiques |
| Bughouse | Tandemschaak | Tandemschach | Bughouse |
| Antichess | Slagschaak | Räuberschach | Qui perd gagne |
| King of the Hill | King of the Hill | King of the Hill | Roi de la colline |
| Three-check | Driemaal schaak | Dreimal Schach | Trois échecs |
| Hexagonal chess | Hexagonaal schaak | Hexagonalschach | Échecs hexagonaux |
| Four-player chess | Schaak voor vier | Vierschach | Échecs à quatre |
| Capablanca chess | Capablancaschaak | Capablanca-Schach | Échecs Capablanca |

### Categories

| English | Dutch (nl) | German (de) | French (fr) |
|---|---|---|---|
| Other dimensions | Andere dimensies | Andere Dimensionen | Autres dimensions |
| Hidden information | Verborgen informatie | Verdeckte Informationen | Information cachée |
| Different rules | Andere regels | Andere Regeln | Règles différentes |
| Different boards and more players | Andere borden en meer spelers | Andere Bretter und mehr Spieler | Autres échiquiers et plus de joueurs |
| Regional relatives | Regionale verwanten | Verwandte aus aller Welt | Cousins régionaux |

## Variant terms

Pieces that move like chess pieces keep the chess words, also in shogi (king, rook, bishop, knight, pawn).

### Boards and dimensions

| English | Dutch (nl) | German (de) | French (fr) |
|---|---|---|---|
| board (one of several: 3D, 4D, 5D, bughouse) | bord | Brett | échiquier |
| level (of a 3D board: A–E, W/N/B; not the computer level) | niveau | Ebene | niveau |
| cube (Raumschach) / slice of the cube | kubus / doorsnede van de kubus | Würfel / Schicht des Würfels | cube / tranche du cube |
| main level / attack board (Tri-Dimensional chess) | hoofdniveau / aanvalsbord | Hauptebene / Angriffsbrett | niveau principal / échiquier d'attaque |
| map square (Tri-Dimensional chess) | kaartveld | Kartenfeld | case de la carte |
| king's side / queen's side (Tri-Dimensional chess) | koningsvleugel / damevleugel | Königsflügel / Damenflügel | côté roi / côté dame |
| cell (3D, 4D, hexagonal; the same word as square) | veld | Feld | case |
| touching cell (the king's step) | aangrenzend veld | angrenzendes Feld | case contiguë |
| the kings touch / do not touch | naast elkaar staan / niet naast elkaar staan | sich berühren / sich nicht berühren | se toucher / ne pas se toucher |
| hexagon (a cell of the hexagonal board) | zeshoek | Sechseck | hexagone |
| point (xiangqi: where the lines cross) | punt | Punkt | point |

### Time and timelines (5D)

These are the words of the Multiverse chess texts. German uses *Zug* for a move and for a turn, as in the rest of
the app. The 5D texts do not say *branch*: in the rules page *branch/world* is another word for a possibility
(*tak/wereld*, *Zweig/Welt*, *branche/monde*), not a timeline.

| English | Dutch (nl) | German (de) | French (fr) |
|---|---|---|---|
| multiverse | multiversum | Multiversum | multivers |
| timeline / new timeline | tijdlijn / nieuwe tijdlijn | Zeitlinie / neue Zeitlinie | ligne temporelle / nouvelle ligne temporelle |
| the present / the past / Now (the mark of the present) | het heden / het verleden / Nu | die Gegenwart / die Vergangenheit / Jetzt | le présent / le passé / Maintenant |
| time travel / to travel / travel (the arrows) | tijdreizen / reizen / reizen | Zeitreise / reisen / Reisen | voyage dans le temps / voyager / voyages |
| to travel back / Travel back: {turns} turns | terugreizen / Terugreizen: {turns} beurten | zurückreisen / Zeitreise: {turns} Züge zurück | remonter dans le temps / Voyage dans le passé : {turns} tours |
| to open a new timeline / Opened timeline {line} | een nieuwe tijdlijn openen / Tijdlijn {line} geopend | eine neue Zeitlinie öffnen / Zeitlinie {line} geöffnet | ouvrir une nouvelle ligne temporelle / Ligne temporelle {line} ouverte |
| active / inactive (timeline) / Inactive timeline | actief / inactief / Inactieve tijdlijn | aktiv / inaktiv / Inaktive Zeitlinie | active / inactive / Ligne temporelle inactive (board label *{board} · inactif*) |
| hatched (an inactive timeline) | gearceerd | schraffiert | hachuré |
| sealed (a board too old to travel to) | verzegeld | versiegelt | scellé |
| jump / to jump (onto another timeline) | sprong / springen | Sprung / springen | saut / sauter |
| axis (file, rank, time, timeline) | as | Achse | axe |
| turn (all moves of one player) / Submit turn | beurt / Beurt beëindigen | Zug / Zug beenden | tour / Valider le tour |
| Submit turn in running text | “Beurt beëindigen” | „Zug beenden“ | Valider le tour; « Valider le tour » where it must read as a name |
| to finish your turn | je beurt afmaken | deinen Zug beenden | terminer votre tour |
| must move / optional (the board marks) / Required boards | verplicht / optioneel / Verplichte borden | Zugpflicht / optional / Pflichtbretter | obligatoire / facultatif / Échiquiers obligatoires |
| must move / optional in running text | “verplicht” / “optioneel” | „Zugpflicht“ / „optional“ | « obligatoire » / « facultatif » |
| gold / blue (the boards you may play) | goud / blauw | gold / blau | doré / bleu |
| royal / royal piece | koninklijk / koninklijk stuk | königlich / königliche Figur | royal / pièce royale |
| to pass (end the turn without moving) / 5D check | passen / schaak in 5D | passen / Schach in 5D | passer son tour / échec 5D |
| twins (a ghost copied to a new timeline) | tweelingen | Zwillinge | jumeaux |
| paths (the past remembers both paths) | wegen | Wege | chemins |
| Timelines are AND, possibilities are OR | Tijdlijnen zijn EN, mogelijkheden zijn OF | Zeitlinien sind UND, Möglichkeiten sind ODER | Les lignes temporelles sont un ET, les possibilités un OU |

*Pass* here ends a turn without moving. It is not the *pass* of *land = roll, pass = link* (*passeren*,
*vorbeiziehen*, *passer*), so French always writes *passer son tour*.

### Hidden information

| English | Dutch (nl) | German (de) | French (fr) |
|---|---|---|---|
| umpire (Kriegspiel) | scheidsrechter | Schiedsrichter | arbitre |
| try / to try (a move, Kriegspiel) | poging / proberen | Versuch / versuchen | tentative / tenter |
| pawn try / pawn tries ("%n pawn tries.", "No pawn tries.") | pionslag / pionslagen (*%n pionslagen mogelijk.*, *Geen pionslagen mogelijk.*) | Bauernschlagversuch / Bauernschlagversuche | prise de pion possible / prises de pion possibles |
| check directions: file, rank, long diagonal, short diagonal | lijn, rij, lange diagonaal, korte diagonaal | Linie, Reihe, lange Diagonale, kurze Diagonale | colonne, rangée, grande diagonale, petite diagonale |
| to refuse (a try) / Refused this turn | weigeren / Deze beurt geweigerd | ablehnen / In diesem Zug abgelehnt | refuser / Coups refusés ce tour-ci |
| to announce | melden | ansagen | annoncer |
| fog | mist | Nebel | brouillard |
| hidden (a square or piece you cannot see; "{square}: hidden") | verborgen | verdeckt | caché |
| dark square (a square in the fog, Fog of war) | donker veld | Feld im Nebel | case cachée |

### Different rules

| English | Dutch (nl) | German (de) | French (fr) |
|---|---|---|---|
| explosion / to explode / to blow up (Atomic) | explosie / ontploffen / opblazen | Explosion / explodieren / sprengen | explosion / exploser / faire exploser |
| drop / to drop / Dropped / Drop {piece} | inzet / inzetten / Ingezet / {piece} inzetten | Einsetzen / einsetzen / Eingesetzt / {piece} einsetzen | parachutage / parachuter / Parachuté / Parachuter : {piece} |
| onto any empty square (a drop) | op een leeg veld naar keuze | auf ein beliebiges leeres Feld | sur n'importe quelle case vide |
| hand (pieces in hand) / in hand / In hand: {side} | hand / in de hand / In de hand van {side} | Hand / in der Hand / In der Hand von {side} | réserve / en réserve / Réserve : {side} |
| promoted piece (marked +) / unpromoted | gepromoveerd stuk (gemarkeerd met +) / ongepromoveerd | umgewandelte Figur (mit + markiert) / nicht umgewandelt | pièce promue (marquée +) / non promu |
| Promoted queen, rook, bishop, knight (Crazyhouse, Bughouse) | Gepromoveerde dame, toren, loper; Gepromoveerd paard | Umgewandelte Dame; Umgewandelter Turm, Läufer, Springer | Dame promue, Tour promue, Fou promu, Cavalier promu |
| Do not promote | Niet promoveren | Nicht umwandeln | Ne pas promouvoir |
| compulsory capture / capture try (Antichess) | slagplicht / slagpoging | Schlagzwang / Schlagversuch | prise obligatoire / tentative de prise |
| hill / centre squares (King of the Hill) | heuvel / centrumvelden | Hügel / Zentrumsfelder | colline / cases centrales |
| check (counted in Three-check) / to give check / counter | schaak / schaak geven / teller | Schach (never *Schachs*) / Schach bieten / Zähler | échec / mettre en échec / compteur |
| Checks: {count}/3 / Checks given / three checks (end reason) | Schaak: {count}/3 / Schaak gegeven / driemaal schaak | Schach: {count}/3 / Schach geboten / dreimal Schach | Échecs : {count}/3 / Échecs donnés / trois échecs |

### More players

| English | Dutch (nl) | German (de) | French (fr) |
|---|---|---|---|
| seat / the seats White A, White B, Black B, Black A (bughouse) | plaats / Wit A, Wit B, Zwart B, Zwart A | Platz / Weiß A, Weiß B, Schwarz B, Schwarz A | place / Blancs A, Blancs B, Noirs B, Noirs A |
| partner / team / Team 1 | partner / team / Team 1 | Partner / Team / Team 1 | partenaire / équipe / Équipe 1 |
| Game mode: Free for all / Teams (four-player chess) | Spelvorm: Ieder voor zich / Teams | Spielmodus: Jeder gegen jeden / Teams | Mode de jeu : Chacun pour soi / Équipes |
| in free for all / in Teams (running text) | bij ieder voor zich / bij Teams | bei „Jeder gegen jeden“ / bei „Teams“ | en mode chacun pour soi / en mode équipes |
| Red, Blue, Yellow, Green (four-player chess) | Rood, Blauw, Geel, Groen | Rot, Blau, Gelb, Grün | Rouge, Bleu, Jaune, Vert |
| eliminated / is out | uitgeschakeld / ligt eruit | ausgeschieden / scheidet aus | éliminé / est éliminé |
| sits out (cannot move) | slaat een beurt over | setzt aus | passe son tour (move list: *{side} : aucun coup possible, tour passé*) |
| the last king standing | de laatste koning die overeind blijft | der letzte verbliebene König | le dernier roi en jeu |

The French colours are singular; *Bleu* is the same msgid as the blue board theme, and *Rouge* is shared with xiangqi.

### Other pieces

| English | Dutch (nl) | German (de) | French (fr) |
|---|---|---|---|
| archbishop (bishop + knight) / chancellor (rook + knight) | aartsbisschop / kanselier | Erzbischof / Kanzler | archevêque / chancelier |
| slides (their bishop and rook moves) | zetten als loper of toren | Läufer- und Turmzüge | glissements |
| unicorn (3D, 5D) | eenhoorn | Einhorn | licorne |
| dragon (5D) | draak | Drache | dragon |
| princess (5D) | prinses | Prinzessin | princesse |
| royal queen / common king (5D) | koninklijke dame / gewone koning | königliche Dame / gewöhnlicher König | dame royale / roi ordinaire |
| brawn (5D, a pawn that also captures across boards) | krachtpion | Kraftbauer | pion costaud |

### Shogi

| English | Dutch (nl) | German (de) | French (fr) |
|---|---|---|---|
| gold general / silver general; the golds | gouden generaal / zilveren generaal; de gouden generaals | Goldgeneral / Silbergeneral; die Goldgeneräle | général d'or / général d'argent; les généraux d'or |
| lance | lans | Lanze | lance |
| promoted (red) / unpromoted | gepromoveerd / ongepromoveerd | umgewandelt / nicht umgewandelt | promu / non promu |
| Dragon (promoted rook) | Draak (gepromoveerde toren) | Drache (umgewandelter Turm) | Dragon (tour promue) |
| Horse (promoted bishop; Dutch keeps *drakenpaard*, as *paard* is the knight) | Drakenpaard (gepromoveerde loper) | Pferd (umgewandelter Läufer) | Cheval (fou promu) |
| promoted silver, promoted knight, promoted lance | gepromoveerd zilver, gepromoveerd paard, gepromoveerde lans | umgewandeltes Silber, umgewandelter Springer, umgewandelte Lanze | argent promu, cavalier promu, lance promue |
| tokin (promoted pawn) | tokin | Tokin | tokin |
| enemy camp (the promotion zone) | vijandelijk kamp | gegnerisches Lager | camp adverse |
| impasse / the 27-point rule | impasse / de 27-puntenregel | Impasse / die 27-Punkte-Regel | impasse / la règle des 27 points |
| face (the side of a piece that is up: promoted or not) | kant (die boven ligt) | Oberseite | face |

### Xiangqi

| English | Dutch (nl) | German (de) | French (fr) |
|---|---|---|---|
| Red / Black (the sides) | Rood / Zwart | Rot / Schwarz | Rouge / les Noirs |
| general / advisor | generaal / adviseur | General (plural Generäle) / Berater | général / conseiller |
| elephant / horse | olifant / paard | Elefant / Pferd | éléphant / cheval |
| chariot / cannon | wagen / kanon | Wagen / Kanone | char / canon |
| screen (the piece a cannon jumps over) | scherm | Schirm | écran |
| soldier | soldaat | Soldat | soldat |
| palace / river | paleis / rivier | Palast / Fluss | palais / rivière |

### Makruk

| English | Dutch (nl) | German (de) | French (fr) |
|---|---|---|---|
| Khun (king), Met, Khon, Ma, Rua, Bia (pawn) | Khun, Met, Khon, Ma, Rua, Bia | Khun, Met, Khon, Ma, Rua, Bia (masculine; plural *Khuns*) | Khun, Met, Khon, Ma, Rua, Bia |
| lone Khun | kale Khun | blanker Khun | Khun seul |
| counting (the moves left to capture a lone Khun) / the counting rule | telling / de telregel | Zählung / die Zählregel | décompte / la règle du décompte |

### Game ends

| English | Dutch (nl) | German (de) | French (fr) |
|---|---|---|---|
| {side} wins ({reason}) | {side} wint ({reason}) | {side} gewinnt ({reason}) | Victoire : {side} ({reason}) |
| The game ends: {result} | De partij eindigt: {result} | Die Partie endet: {result} | Fin de la partie — {result} |
| resignation (end reason) | opgave | Aufgabe | abandon |
| no legal move | geen toegestane zet | kein möglicher Zug | aucun coup légal |
| stranded (5D: your own move left your turn impossible to finish) | vastgelopen | festgefahren | tour bloqué |
| the move limit / Move limit reached | het maximale aantal zetten / Maximum aantal zetten bereikt | Zuglimit erreicht / Zuglimit erreicht | la limite de coups / Limite de coups atteinte |
| stalemate is a draw / is not a draw | pat is remise / pat is geen remise | Patt ist remis / Patt ist kein Remis | le pat donne la nulle / le pat ne donne pas la nulle |
| Gliński's scoring (hexagonal chess) | de puntentelling van Gliński | Glińskis Wertung | le barème de Gliński |

## Never translated

- Move codes and square names: `g1-f3|h3`, `?a6`, `e4`, `f3-e5`.
- The names of cells, boards, levels, timelines and turns in the variants (`Cc3`, `B2c3`, `b3N`, `L0`, `L+1`, `T3`),
  drop codes (`P@e4`) and the promotion mark `+`.
- The 5D move notation (`(0T2)Nc3>(+1T2)c3`, `>>`, `x`), the timeline labels `−0` and `+0`, and the piece letters
  K, Q, R, B, N, U, D, S, Y, C and W, also in brackets after a piece name (*de eenhoorn (U)*).
- Sente and Gote (the sides in shogi), the Thai names of the makruk pieces, and the kanji and hanzi on the shogi and
  xiangqi pieces.
- The proper names in variant names and summaries: Raumschach, Kriegspiel, Chess960, Fischer Random, Gliński,
  Capablanca, Enterprise.
- Placeholders in braces (`{name}`, `{p}`), `%n`, `%s`, `%1$s`, `%d`, `%%`.
- Names of the engine levels (Wobbles, Dice, Quark, Tangle, The Observer) and of the AI personas (Professor Qubit,
  Captain Collapse, Madame Superposa, Q-7): they are characters.
- Product names: Nextcloud, Nextcloud Assistant, OpenAI, Anthropic, Ollama, LocalAI.

## Typography

- Percentages keep the space of the source (`50 %`); French puts a no-break space before `:`, `?`, `!`, `;` and `%`.
- Quotation marks: Dutch “…”, German „…“, French « … ».
- Board sizes keep the multiplication sign with spaces (`5 × 5 × 5`, `10 × 8`).
- Dutch and German keep the no-break space before `…` where the source has one (`The coach is thinking …`) and
  write none where the source has none (`{side} is thinking…`); French writes `…` without a space.
- Buttons and board labels do not wrap: a longer text is cut off with `…`. Keep them about as short as the source,
  for example German *Zug beenden (eine deiner königlichen Figuren kann geschlagen werden: {percent})* and French
  *{board} · inactif*.
- Keep the emoji and symbols of the source (✦ ! ?! ?? 🍀 🎲 ♚ ✓ ·).
