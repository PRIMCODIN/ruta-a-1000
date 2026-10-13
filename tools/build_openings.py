"""Construye src/data/openings.json a partir del catálogo de aperturas de Lichess (CC0,
github.com/lichess-org/chess-openings). Para cada variante se toma la fila más larga con ese
nombre exacto (como mucho 16 medias jugadas) y, si es corta, se completa hasta 12 con la mejor
jugada de Stockfish (marcada como «continuación del motor»).

Uso: python tools/build_openings.py <carpeta con a.tsv..e.tsv> <ruta a stockfish>
"""
import csv, json, sys, chess, chess.engine

TSV_DIR, SF = sys.argv[1], sys.argv[2]
rows = []
for f in "abcde":
    with open(f"{TSV_DIR}/{f}.tsv") as fh:
        for r in csv.DictReader(fh, delimiter="\t"):
            rows.append(r)

def san_list(pgn):
    b = chess.Board(); out = []
    for tok in pgn.split():
        if tok.endswith("."):
            continue
        m = b.parse_san(tok); out.append(b.san(m)); b.push(m)
    return out

FAMILIES = [
  # ---- con blancas ----
  dict(id="italiana", side="w", name="Italiana", desc="1.e4 e5 2.Cf3 Cc6 3.Ac4: el alfil apunta a f7. Desarrollo rápido, enroque y ruptura d4 con c3.", vars=[
    ("Italian Game: Giuoco Pianissimo", "Giuoco Pianissimo: d3 tranquilo"),
    ("Italian Game: Giuoco Piano", "Giuoco Piano: c3 sin prisa"),
    ("Italian Game: Two Knights Defense", "Dos caballos: 3...Cf6"),
    ("Italian Game: Two Knights Defense, Fried Liver Attack", "Ataque Fegatello: Cg5 y Cxf7"),
    ("Italian Game: Evans Gambit", "Gambito Evans: b4"),
    ("Italian Game: Hungarian Defense", "Defensa húngara: 3...Ae7")]),
  dict(id="espanola", side="w", name="Española", desc="1.e4 e5 2.Cf3 Cc6 3.Ab5: presión sobre el caballo que defiende e5. Juego lento y maniobras.", vars=[
    ("Ruy Lopez: Morphy Defense", "Defensa Morphy: 3...a6"),
    ("Ruy Lopez: Closed", "Cerrada: 5...Ae7 y Te1"),
    ("Ruy Lopez: Berlin Defense", "Berlinesa: 3...Cf6"),
    ("Ruy Lopez: Exchange Variation", "Del cambio: Axc6"),
    ("Ruy Lopez: Open", "Abierta: 5...Cxe4"),
    ("Ruy Lopez: Steinitz Defense", "Defensa Steinitz: 3...d6"),
    ("Ruy Lopez: Schliemann Defense", "Gambito Schliemann: 3...f5")]),
  dict(id="escocesa", side="w", name="Escocesa", desc="1.e4 e5 2.Cf3 Cc6 3.d4: abres el centro de inmediato y juegas con piezas activas.", vars=[
    ("Scotch Game: Classical Variation", "Clásica: 4...Ac5"),
    ("Scotch Game: Schmidt Variation", "Schmidt: 4...Cf6"),
    ("Scotch Game: Mieses Variation", "Mieses: e5 contra el caballo"),
    ("Scotch Game: Steinitz Variation", "Steinitz: 4...Dh4"),
    ("Scotch Game: Scotch Gambit", "Gambito escocés: 4.Ac4"),
    ("Scotch Game: Göring Gambit", "Gambito Göring: 4.c3")]),
  dict(id="londres", side="w", name="Sistema Londres", desc="d4, Af4, e3, Cf3, c3 y Cbd2: estructura sólida con el alfil de c1 fuera antes de e3.", vars=[
    ("Queen's Pawn Game: London System", "Contra ...d5 y ...c5"),
    ("Queen's Pawn Game: London System, with e6", "Contra ...e6"),
    ("Queen's Pawn Game: Accelerated London System", "Londres acelerado: 2.Af4"),
    ("London System", "Contra el fianchetto"),
    ("London System: Poisoned Pawn Variation", "Peón envenenado: ...Db6"),
    ("Indian Defense: London System", "Contra ...Cf6 y ...e6")]),
  dict(id="colle", side="w", name="Colle (tu sistema)", desc="d4, Cf3, e3, Ad3, Cbd2 y 0-0, con la ruptura e4. Las líneas del libro, complemento de tu repertorio.", vars=[
    ("Queen's Pawn Game: Colle System", "Colle clásico"),
    ("Queen's Pawn Game: Colle System, Traditional Colle", "Colle tradicional: c3"),
    ("Queen's Pawn Game: Colle System, Anti-Colle", "Anti-Colle: ...Af5"),
    ("Queen's Pawn Game: Colle System, Grünfeld Formation", "Contra ...g6"),
    ("Queen's Pawn Game: Zukertort Variation", "Colle-Zukertort: b3 y Ab2")]),
  dict(id="gambito-dama", side="w", name="Gambito de dama", desc="1.d4 d5 2.c4: ofreces un peón para ganar el centro. Presión sobre d5 y desarrollo armónico.", vars=[
    ("Queen's Gambit Declined: Orthodox Defense", "Rehusado: defensa ortodoxa"),
    ("Queen's Gambit Declined: Exchange Variation", "Rehusado: variante del cambio"),
    ("Queen's Gambit Accepted: Classical Defense", "Aceptado: defensa clásica"),
    ("Queen's Gambit Declined: Albin Countergambit", "Contragambito Albin: 2...e5"),
    ("Slav Defense: Modern Line", "Eslava: línea moderna"),
    ("Queen's Gambit Declined: Chigorin Defense", "Defensa Chigorin: 2...Cc6")]),
  # ---- con negras ----
  dict(id="siciliana", side="b", name="Siciliana", desc="1.e4 c5: desequilibras desde la primera jugada. Juego por la columna c y contraataque.", vars=[
    ("Sicilian Defense: Najdorf Variation", "Najdorf: 5...a6"),
    ("Sicilian Defense: Dragon Variation", "Dragón: ...g6 con ...d6"),
    ("Sicilian Defense: Accelerated Dragon", "Dragón acelerado: ...g6 sin ...d6"),
    ("Sicilian Defense: Taimanov Variation", "Taimanov: ...e6 y ...Cc6"),
    ("Sicilian Defense: Alapin Variation", "Contra la Alapin: 2.c3"),
    ("Sicilian Defense: Closed", "Contra la cerrada: 2.Cc3"),
    ("Sicilian Defense: Smith-Morra Gambit Accepted", "Smith-Morra aceptado"),
    ("Sicilian Defense: Nyezhmetdinov-Rossolimo Attack", "Contra la Rossolimo: 3.Ab5"),
    ("Sicilian Defense: Grand Prix Attack", "Contra el Grand Prix: f4"),
    ("Sicilian Defense: Bowdler Attack", "Contra 2.Ac4")]),
  dict(id="caro-kann", side="b", name="Caro-Kann", desc="1.e4 c6 y 2...d5: estructura sólida y alfil de casillas blancas fuera antes de ...e6.", vars=[
    ("Caro-Kann Defense: Classical Variation", "Clásica: 4...Af5"),
    ("Caro-Kann Defense: Advance Variation", "Del avance: 3.e5"),
    ("Caro-Kann Defense: Exchange Variation", "Del cambio: 3.exd5"),
    ("Caro-Kann Defense: Panov Attack", "Ataque Panov: c4"),
    ("Caro-Kann Defense: Two Knights Attack", "Dos caballos"),
    ("Caro-Kann Defense: Karpov Variation", "Karpov: 4...Cd7")]),
  dict(id="francesa", side="b", name="Francesa", desc="1.e4 e6 y 2...d5: cadena de peones y contraataque con ...c5 y ...f6.", vars=[
    ("French Defense: Advance Variation", "Del avance: 3.e5"),
    ("French Defense: Winawer Variation", "Winawer: 3...Ab4"),
    ("French Defense: Tarrasch Variation", "Tarrasch: 3.Cd2"),
    ("French Defense: Classical Variation", "Clásica: 3...Cf6"),
    ("French Defense: Exchange Variation", "Del cambio: 3.exd5"),
    ("French Defense: Rubinstein Variation", "Rubinstein: 3...dxe4")]),
  dict(id="escandinava", side="b", name="Escandinava", desc="1.e4 d5: atacas e4 de inmediato. Dama activa pronto y desarrollo sencillo.", vars=[
    ("Scandinavian Defense: Main Line", "Principal: 3...Da5"),
    ("Scandinavian Defense: Valencian Variation", "Valenciana: 3...Dd8"),
    ("Scandinavian Defense: Mieses-Kotroc Variation", "Mieses-Kotroc: 2...Dxd5"),
    ("Scandinavian Defense: Modern Variation", "Moderna: 2...Cf6"),
    ("Scandinavian Defense: Portuguese Gambit", "Gambito portugués: ...Ag4")]),
  dict(id="india-rey", side="b", name="India de Rey", desc="1.d4 Cf6 2.c4 g6: dejas el centro al blanco y lo atacas después con ...e5 o ...c5.", vars=[
    ("King's Indian Defense: Orthodox Variation", "Ortodoxa: Cf3 y Ae2"),
    ("King's Indian Defense: Sämisch Variation", "Sämisch: f3"),
    ("King's Indian Defense: Fianchetto Variation", "Fianchetto: g3"),
    ("King's Indian Defense: Four Pawns Attack", "Cuatro peones: f4"),
    ("King's Indian Defense: Averbakh Variation", "Averbakh: Ae2 y Ag5"),
    ("King's Indian Defense: Petrosian Variation", "Petrosian: d5")]),
  dict(id="gdr", side="b", name="Gambito de dama rehusado", desc="1.d4 d5 2.c4 e6: sostienes d5 con peones. Sólido, con ...c5 o ...e5 más tarde.", vars=[
    ("Queen's Gambit Declined: Orthodox Defense", "Ortodoxa"),
    ("Queen's Gambit Declined: Exchange Variation", "Del cambio"),
    ("Queen's Gambit Declined: Tartakower Defense", "Tartakower: ...b6"),
    ("Queen's Gambit Declined: Lasker Defense", "Lasker: ...Ce4"),
    ("Queen's Gambit Declined: Ragozin Defense", "Ragozin: ...Ab4"),
    ("Queen's Gambit Declined: Cambridge Springs Defense", "Cambridge Springs: ...Da5")]),
  dict(id="eslava", side="b", name="Eslava", desc="1.d4 d5 2.c4 c6: sostienes d5 sin encerrar el alfil de c8.", vars=[
    ("Slav Defense: Czech Variation", "Checa: 4...dxc4 5.a4 Af5"),
    ("Slav Defense: Exchange Variation", "Del cambio: cxd5"),
    ("Slav Defense: Quiet Variation", "Tranquila: e3"),
    ("Slav Defense: Chebanenko Variation", "Chebanenko: ...a6"),
    ("Semi-Slav Defense: Meran Variation", "Semieslava: Merano")]),
]

eng = chess.engine.SimpleEngine.popen_uci(SF)
eng.configure({"Threads": 2, "Hash": 128})
out = []
for fam in FAMILIES:
    vs = []
    for pat, es in fam["vars"]:
        cands = [r for r in rows if r["name"] == pat]
        cands = [(san_list(r["pgn"]), r) for r in cands]
        cands = [c for c in cands if len(c[0]) <= 16]
        if not cands:
            print("MISSING", pat); continue
        moves, r = max(cands, key=lambda c: len(c[0]))
        book = len(moves)
        b = chess.Board()
        for m in moves: b.push_san(m)
        while len(moves) < 12 and not b.is_game_over():
            info = eng.analyse(b, chess.engine.Limit(nodes=400000))
            mv = info["pv"][0]; moves.append(b.san(mv)); b.push(mv)
        vid = fam["id"] + ":" + r["eco"] + ":" + "-".join(moves[:book])[:60]
        vs.append(dict(id="op:" + fam["id"] + ":" + str(len(vs)), name=es, eco=r["eco"], book=book, moves=moves))
    root = []
    # raíz común = prefijo compartido por todas las variantes
    for k in range(20):
        col = {tuple(v["moves"][:k + 1]) for v in vs if len(v["moves"]) > k}
        if len(col) == 1 and all(len(v["moves"]) > k for v in vs): root = list(next(iter(col)))
        else: break
    out.append(dict(id=fam["id"], side=fam["side"], name=fam["name"], desc=fam["desc"], root=root, vars=vs))
    print(fam["id"], len(vs), "root", root)
eng.quit()
json.dump(out, open("src/data/openings.json", "w"), ensure_ascii=False, indent=1)
