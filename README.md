# Ruta a 1000

Entrenador de ajedrez personal construido sobre mis propias partidas de Chess.com: repertorio con repetición espaciada, mis errores convertidos en ejercicios, finales contra Stockfish y un panel que mide si de verdad estoy mejorando.

- **Hoy**: sesión de unos 15 minutos que mezcla repertorio, errores y un final, empezando por lo que fallé.
- **Repertorio**: árbol por respuesta del rival, con minitablero de la posición clave en cada línea. 28 líneas comprobadas con Stockfish (Colle con blancas, siciliana con ...Cc6 y fianchetto con negras). Las explicaciones se dibujan en el tablero.
- **Aperturas**: 13 aperturas (Italiana, Española, Siciliana, Caro-Kann…) con 80 variantes del catálogo de Lichess, para entrenar con blancas o con negras. «Mi apertura» construye tu árbol con tus partidas y te lleva a las posiciones donde más fallas.
- **Mis errores**: posiciones reales donde perdí ventaja. Incluye «Ver amenazas», que marca en rojo mis piezas atacadas o mal defendidas y en verde lo que puedo ganar. Al terminar se puede repetir «lo que pasó en tu partida» y «la línea buena».
- **Finales**: técnica básica y finales de mis partidas, jugados contra el motor con barra de evaluación.
- **Partidas**: botón «Actualizar desde Chess.com» (API pública) o subida de PGN. Cada partida nueva se analiza en el navegador, genera ejercicios y se puede revisar jugada a jugada con gráfica de evaluación.
- **Progreso**: compara las partidas recientes con la base inicial (500 partidas) y separa lo que mejora de lo que sigue igual o peor.

## Stack

| Parte | Tecnología |
| --- | --- |
| Frontend | Vite + React 18 + TypeScript, sin librería de UI |
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
  engine/engine.ts       cola de búsquedas sobre Stockfish en un worker
  board/                 tablero (verde Chess.com), flechas, sonidos sintetizados
  lib/db.ts              acceso a Supabase
  lib/store.tsx          estado global y repetición espaciada (1, 3, 7, 16 y 35 días)
  lib/sync.tsx           sincronización con Chess.com, PGN e importación inicial
  views/                 pantallas
  data/                  líneas de repertorio y finales
public/
  engine/                stockfish.wasm.js + .wasm (GPLv3, ver COPYING-stockfish.txt)
  seed.json              mis 500 partidas ya analizadas + 120 ejercicios iniciales
supabase/migrations/     esquema de la base de datos
tools/                   scripts Python: análisis inicial y build_openings.py (catálogo de aperturas)
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

El proyecto de Supabase `ruta-a-1000` ya tiene aplicado `supabase/migrations/20261011000000_init.sql`. Todas las tablas tienen RLS: cada usuario solo ve sus filas. Para recrearlo en otro proyecto, ejecuta ese SQL en el editor de Supabase y cambia las variables de `.env.local` y del workflow.

Como la app es solo para mí, después de crear mi cuenta conviene desactivar los registros nuevos: Supabase → Authentication → Sign In / Providers → desactivar «Allow new users to sign up». Si se mantiene la confirmación por email, el enlace del correo debe apuntar a la URL de GitHub Pages: Authentication → URL Configuration → Site URL = `https://primcodin.github.io/ruta-a-1000/`.

## Despliegue

Cada push a `main` construye y publica en GitHub Pages (`.github/workflows/deploy.yml`). La primera vez hay que activar Pages: Settings → Pages → Source: «GitHub Actions».

## Primer uso

1. Crear la cuenta en la pantalla de entrada.
2. En «Hoy», pulsar «Importar mis 500 partidas». Crea la línea base y los 120 primeros ejercicios.
3. En «Partidas», «Actualizar desde Chess.com» trae y analiza las partidas posteriores al 9 de octubre de 2026.

## Licencias

Stockfish se distribuye bajo GPLv3 (`public/engine/COPYING-stockfish.txt`). Piezas cburnett bajo CC BY-SA 3.0. Catálogo de aperturas: lichess-org/chess-openings (CC0).
