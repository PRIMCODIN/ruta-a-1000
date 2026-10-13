"""
Libro de aperturas para la revisión de partidas: todas las posiciones del catálogo
lichess-org/chess-openings (CC0) como hashes FNV-1a de 32 bits de «tablero turno enroques»,
y el nombre de la apertura en las posiciones finales de cada línea.

Uso: python tools/build_book.py <carpeta con a.tsv..e.tsv>
Salida: src/data/book.json  →  { "k": [hash, …], "n": { "hash": "ECO · Nombre" } }
"""
import json
import sys

import chess
import chess.pgn  # noqa: F401  (carga el parser SAN)

TSV_DIR = sys.argv[1]

FAMILIAS = {
    "Sicilian Defense": "Defensa Siciliana",
    "French Defense": "Defensa Francesa",
    "Caro-Kann Defense": "Defensa Caro-Kann",
    "Scandinavian Defense": "Defensa Escandinava",
    "Pirc Defense": "Defensa Pirc",
    "Modern Defense": "Defensa Moderna",
    "Alekhine Defense": "Defensa Alekhine",
    "Owen Defense": "Defensa Owen",
    "Nimzowitsch Defense": "Defensa Nimzowitsch",
    "Italian Game": "Partida Italiana",
    "Ruy Lopez": "Apertura Española",
    "Scotch Game": "Partida Escocesa",
    "Four Knights Game": "Cuatro Caballos",
    "Three Knights Opening": "Tres Caballos",
    "Two Knights Defense": "Defensa de los Dos Caballos",
    "Petrov's Defense": "Defensa Petrov",
    "Philidor Defense": "Defensa Philidor",
    "King's Pawn Game": "Peón de rey",
    "King's Knight Opening": "Apertura del caballo de rey",
    "Queen's Pawn Opening": "Peón de dama",
    "English Defense": "Defensa Inglesa",
    "Anglo-Indian Defense": "Defensa Angloindia",
    "King's Gambit": "Gambito de Rey",
    "King's Gambit Accepted": "Gambito de Rey Aceptado",
    "King's Gambit Declined": "Gambito de Rey Rehusado",
    "Vienna Game": "Partida Vienesa",
    "Bishop's Opening": "Apertura de Alfil",
    "Center Game": "Partida del Centro",
    "Danish Gambit": "Gambito Danés",
    "Ponziani Opening": "Apertura Ponziani",
    "Latvian Gambit": "Gambito Letón",
    "Elephant Gambit": "Gambito Elefante",
    "Queen's Pawn Game": "Peón de dama",
    "Queen's Gambit": "Gambito de Dama",
    "Queen's Gambit Accepted": "Gambito de Dama Aceptado",
    "Queen's Gambit Declined": "Gambito de Dama Rehusado",
    "Slav Defense": "Defensa Eslava",
    "Semi-Slav Defense": "Defensa Semieslava",
    "London System": "Sistema Londres",
    "Colle System": "Sistema Colle",
    "Englund Gambit": "Gambito Englund",
    "Englund Gambit Complex": "Gambito Englund",
    "Indian Defense": "Defensa India",
    "King's Indian Defense": "India de Rey",
    "King's Indian Attack": "Ataque Indio de Rey",
    "Queen's Indian Defense": "India de Dama",
    "Nimzo-Indian Defense": "Nimzoindia",
    "Bogo-Indian Defense": "Bogoindia",
    "Old Indian Defense": "India Antigua",
    "Grünfeld Defense": "Defensa Grünfeld",
    "Benoni Defense": "Defensa Benoni",
    "Dutch Defense": "Defensa Holandesa",
    "Catalan Opening": "Apertura Catalana",
    "English Opening": "Apertura Inglesa",
    "Réti Opening": "Apertura Réti",
    "Zukertort Opening": "Apertura Zukertort",
    "Trompowsky Attack": "Ataque Trompowsky",
    "Torre Attack": "Ataque Torre",
    "Bird Opening": "Apertura Bird",
    "Polish Opening": "Apertura Polaca",
    "Grob Opening": "Apertura Grob",
    "Hungarian Opening": "Apertura Húngara",
    "Van't Kruijs Opening": "Apertura Van't Kruijs",
    "Mieses Opening": "Apertura Mieses",
    "Rat Defense": "Defensa Rata",
    "Robatsch Defense": "Defensa Robatsch",
    "Blackmar-Diemer Gambit": "Gambito Blackmar-Diemer",
    "Budapest Defense": "Defensa Budapest",
    "Benko Gambit": "Gambito Benko",
    "Center Counter": "Defensa Escandinava",
}


def nombre(raw: str) -> str:
    fam, _, var = raw.partition(": ")
    fam_es = FAMILIAS.get(fam, fam)
    return f"{fam_es}: {var}" if var else fam_es


def fnv(s: str) -> int:
    h = 0x811C9DC5
    for b in s.encode():
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def key(board: chess.Board) -> int:
    f = board.fen().split(" ")
    return fnv(" ".join(f[:3]))


keys: set[int] = set()
names: dict[int, str] = {}
for f in "abcde":
    with open(f"{TSV_DIR}/{f}.tsv") as fh:
        next(fh)
        for row in fh:
            eco, name, pgn = row.rstrip("\n").split("\t")
            b = chess.Board()
            keys.add(key(b))
            for tok in pgn.split():
                if tok.endswith("."):
                    continue
                b.push_san(tok)
                keys.add(key(b))
            k = key(b)
            # el nombre más corto gana si dos líneas acaban en la misma posición
            label = f"{eco} · {nombre(name)}"
            if k not in names or len(label) < len(names[k]):
                names[k] = label

out = {"k": sorted(keys), "n": {str(k): v for k, v in names.items()}}
json.dump(out, open("src/data/book.json", "w"), ensure_ascii=False, separators=(",", ":"))
print(len(keys), "posiciones,", len(names), "nombres")
