import chess, chess.pgn, chess.engine, json, sys, multiprocessing as mp
U="hustlehard619"; NODES=90000
def load(path):
    f=open(path); gs=[]
    while True:
        g=chess.pgn.read_game(f)
        if g is None: break
        gs.append(g)
    return gs
def sc(info):  # score from side-to-move POV in cp, mate mapped
    s=info["score"].relative
    if s.is_mate():
        m=s.mate(); return (10000-abs(m)*10)*(1 if m>0 else -1), m
    return s.score(), None
def work(args):
    idx, pgn = args
    import io
    g=chess.pgn.read_game(io.StringIO(pgn)); h=g.headers
    eng=chess.engine.SimpleEngine.popen_uci("/usr/games/stockfish")
    eng.configure({"Threads":1,"Hash":32})
    b=g.board(); moves=list(g.mainline_moves()); out=[]
    infos=[]
    for i in range(len(moves)+1):
        if b.is_game_over():
            if b.is_checkmate(): infos.append({"cp":-10000,"mate":0,"pv":[]})
            else: infos.append({"cp":0,"mate":None,"pv":[]})
        else:
            info=eng.analyse(b, chess.engine.Limit(nodes=NODES))
            cp,m=sc(info); infos.append({"cp":cp,"mate":m,"pv":[x.uci() for x in info.get("pv",[])[:6]]})
        if i<len(moves): b.push(moves[i])
    eng.quit()
    b=g.board(); plies=[]
    for i,mv in enumerate(moves):
        fen=b.fen(); san=b.san(mv)
        npm=sum(len(b.pieces(p,c))*v for p,v in ((2,3),(3,3),(4,5),(5,9)) for c in (0,1))
        plies.append({"ply":i,"fen":fen,"san":san,"uci":mv.uci(),"before":infos[i],"after_cp":-infos[i+1]["cp"],"after_mate":infos[i+1]["mate"],"reply_pv":infos[i+1]["pv"],"npm":npm,"queens":len(b.pieces(5,0))+len(b.pieces(5,1))})
        b.push(mv)
    return {"idx":idx,"headers":dict(h),"white":h["White"]==U,"plies":plies}
if __name__=="__main__":
    gs=load(sys.argv[1]); out=open(sys.argv[2],"w")
    jobs=[(i,str(g)) for i,g in enumerate(gs)]
    with mp.Pool(2) as p:
        for n,r in enumerate(p.imap_unordered(work,jobs)):
            out.write(json.dumps(r)+"\n"); out.flush()
            if n%25==0: print(n,flush=True)
