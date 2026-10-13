# Ruta a 1000

Entrenador de ajedrez personal construido sobre mis propias partidas de Chess.com: repertorio con repetición espaciada, mis errores convertidos en ejercicios, finales contra Stockfish y un panel que mide si de verdad estoy mejorando.

- **Hoy**: sesión de unos 15 minutos que mezcla repertorio, errores y un final, empezando por lo que fallé.
- **Repertorio**: árbol por respuesta del rival, con minitablero de la posición clave en cada línea. 28 líneas comprobadas con Stockfish (Colle con blancas, siciliana con ...Cc6 y fianchetto con negras). Las explicaciones se dibujan en el tablero.
- **Aperturas**: 13 aperturas (Italiana, Española, Siciliana, Caro-Kann…) con 80 variantes del catálogo de Lichess, para entrenar con blancas o con negras. «Mi apertura» construye tu árbol con tus partidas y te lleva a las posiciones donde más fallas.
- **Mis errores**: posiciones reales donde perdí ventaja. Incluye «Ver amenazas», que marca en rojo mis piezas atacadas o mal defendidas y en verde lo que puedo ganar. Al terminar se puede repetir «lo que pasó en tu partida» y «la línea buena».
- **Finales**: técnica básica y finales de mis partidas, jugados contra el motor con barra de evaluación.
- **Partidas**: botón «Actualizar desde Chess.com» (API pública) o subida de PGN. Cada partida nueva se analiza en el navegador y genera ejercicios.
- **Revisión de partida** (como la de pago de Chess.com): cada jugada de los dos bandos se clasifica en Brillante, Gran jugada, Mejor, Excelente, Buena, Teórica, Forzada, Imprecisión, Error, Oportunidad perdida o Error grave. Muestra la precisión de cada jugador (fórmula de Lichess), la precisión por fases, los momentos clave, la explicación de cada jugada, la mejor alternativa y su continuación, «Reintentar» tus errores y un tablero de análisis libre con las tres mejores líneas del motor.
- **Progreso**: compara las partidas recientes con la base inicial (500 partidas) y separa lo que mejora de lo que sigue igual o peor.
- **Ajustes · Aspecto**: 7 tableros, 8 juegos de piezas, modo oscuro, claro o automático, coordenadas y velocidad de las piezas. La interfaz toma el tono y el color de acento del tablero elegido. Se guarda en la cuenta.

## Stack

| Parte | Tecnología |
| --- | --- |
| Frontend | Vite + React 18 + TypeScript, sin librería de UI. Iconos Phosphor, letra Geist alojada en la app |
| Lógica de ajedrez | chess.js 1.0 |
| Motor | Stockfish 17.1 lite (NNUE, un hilo, WebAssembly) en un Web Worker |
| Datos y login | Supabase (Postgres + Auth email/contraseña + RLS) |
| Despliegue | GitHub Pages con GitHub Actions |
| Partidas | API pública de Chess.com (`api.chess.com/pub`, permite CORS) |

## Estructura

```
src/
  analysis/core.ts       análisis de una partida → jugadas, métricas y ejercicios
  analysis/aggregate.ts  métricas, medias móviles y comparación antes/ahora
  analysis/review.ts     revisión: MultiPV 2, clasificación de jugadas, precisión, libro y explicaciones
  engine/engine.ts       cola de búsquedas sobre Stockfish en un worker
  board/                 tablero, flechas, sonidos sintetizados
  lib/look.ts            temas de tablero, piezas y modo: escribe las variables CSS de la interfaz
  lib/db.ts              acceso a Supabase
  lib/store.tsx          estado global y repetición espaciada (1, 3, 7, 16 y 35 días)
  lib/sync.tsx           sincronización con Chess.com, PGN e importación inicial
  views/                 pantallas
  data/                  líneas de repertorio y finales
public/
  engine/                Stockfish 17.1 lite (GPLv3, ver COPYING-stockfish.txt)
  pieces/                juegos de piezas de Lichess (licencias en pieces/LICENSES.md)
  seed.json              mis 500 partidas ya analizadas + 120 ejercicios iniciales
supabase/migrations/     esquema de la base de datos
tools/                   scripts Python: análisis inicial, build_openings.py (catálogo) y build_book.py (libro para «Teórica»)
scripts/check-seed.ts    comprueba que las métricas en TS coinciden con el análisis original
```

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # URL y clave pública de Supabase
npm run dev                  # http://localhost:5173/ruta-a-1000/
npx tsx scripts/check-seed.ts
```

## Base de datos

El proyecto de Supabase `ruta-a-1000` ya tiene aplicadas las migraciones de `supabase/migrations/` (esquema inicial y `settings.prefs` para el aspecto). Todas las tablas tienen RLS: cada usuario solo ve sus filas. Para recrearlo en otro proyecto, ejecuta ese SQL en el editor de Supabase y cambia las variables de `.env.local` y del workflow.

Como la app es solo para mí, después de crear mi cuenta conviene desactivar los registros nuevos: Supabase → Authentication → Sign In / Providers → desactivar «Allow new users to sign up». Si se mantiene la confirmación por email, el enlace del correo debe apuntar a la URL de GitHub Pages: Authentication → URL Configuration → Site URL = `https://primcodin.github.io/ruta-a-1000/`.

## Despliegue

Cada push a `main` construye y publica en GitHub Pages (`.github/workflows/deploy.yml`). La primera vez hay que activar Pages: Settings → Pages → Source: «GitHub Actions».

## Primer uso

1. Crear la cuenta en la pantalla de entrada.
2. En «Hoy», pulsar «Importar mis 500 partidas». Crea la línea base y los 120 primeros ejercicios.
3. En «Partidas», «Actualizar desde Chess.com» trae y analiza las partidas posteriores al 9 de octubre de 2026.

## Licencias

Stockfish se distribuye bajo GPLv3 (`public/engine/COPYING-stockfish.txt`). Piezas: ver `public/pieces/LICENSES.md`. Letra Geist (SIL OFL 1.1). Iconos Phosphor (MIT). Catálogo de aperturas: lichess-org/chess-openings (CC0).

## Cómo se clasifican las jugadas

La pérdida se mide en probabilidad de ganar (fórmula de Lichess) con los mismos umbrales que publica Chess.com: Mejor (la del motor), Excelente (< 2 puntos), Buena (< 5), Imprecisión (< 10), Error (< 20) y Error grave (≥ 20). Además:

- **Brillante**: la mejor jugada (o casi) que entrega un caballo, alfil, torre o dama que el rival puede ganar, sin estar ya ganando de sobra y con la posición buena después. No cuenta si la pieza ya estaba perdida o si el material se recupera enseguida.
- **Gran jugada**: la única buena; la segunda opción del motor pierde 12 puntos o más y deja de ser una posición buena.
- **Oportunidad perdida**: no castigas un error del rival o dejas escapar un mate corto.
- **Teórica**: posición del catálogo de aperturas de Lichess (CC0). **Forzada**: única jugada legal.

La revisión completa analiza cada posición con Stockfish 17 y MultiPV 2 y se guarda en la partida; las nuevas ya llegan revisadas al sincronizar.
