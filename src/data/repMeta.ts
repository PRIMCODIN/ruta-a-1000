/**
 * Cómo se presenta cada línea del repertorio en el árbol visual:
 * rama = qué hace el rival; key = índice de TU jugada clave en `moves`;
 * when = la situación en una frase; la jugada clave se muestra con flecha sobre el minitablero.
 */
export type Branch = { id: string; side: 'w' | 'b'; title: string; chips: string[]; desc: string }

export const BRANCHES: Branch[] = [
  { id: 'w-normal', side: 'w', title: 'Se desarrolla normal', chips: ['d4', 'd5', 'Nf3', 'Nf6', 'e3', 'e6'], desc: 'El negro juega ...d5, ...Cf6 y ...e6 sin romper. Tu plan: Te1, c3 y e4.' },
  { id: 'w-cc6', side: 'w', title: 'Saca el caballo a c6', chips: ['d4', 'd5', 'Nf3', 'Nc6'], desc: 'Prepara ...e5. Aquí está el tenedor ...e5-e4 que más partidas te ha costado.' },
  { id: 'w-c5', side: 'w', title: 'Ataca d4 con ...c5', chips: ['d4', 'd5', 'Nf3', 'Nf6', 'e3', 'c5'], desc: 'Sostén con c3. Cambia solo cuando ganes un tiempo para e4.' },
  { id: 'w-alfil', side: 'w', title: 'Saca el alfil: ...Af5 o ...Ag4', chips: ['d4', 'd5', 'Nf3', 'Bf5'], desc: 'Si te controla e4, cambia de ruptura: c4.' },
  { id: 'w-e5', side: 'w', title: 'Juega 1...e5 (Englund)', chips: ['d4', 'e5'], desc: 'Toma el peón y cuidado con la trampa de b2.' },
  { id: 'w-kid', side: 'w', title: 'Fianchetto: ...g6 y ...Ag7', chips: ['d4', 'Nf6', 'Nf3', 'g6'], desc: 'Te deja e4 gratis: ocupa el centro con peones.' },
  { id: 'b-abierta', side: 'b', title: 'Siciliana abierta: 3.d4', chips: ['e4', 'c5', 'Nf3', 'Nc6', 'd4'], desc: 'Dragón acelerado: ...g6, ...Ag7 y juego por la columna c.' },
  { id: 'b-ac4', side: 'b', title: 'Alfil a c4 o caballo a c3', chips: ['e4', 'c5', 'Nf3', 'Nc6', 'Bc4'], desc: 'Corta el alfil con ...e6 y evita la clavada Ag5.' },
  { id: 'b-dama', side: 'b', title: 'Saca la dama pronto', chips: ['e4', 'c5', 'Qh5'], desc: 'Defiende f7 con peones y desarrolla con tiempo.' },
  { id: 'b-d4', side: 'b', title: 'Juega 2.d4', chips: ['e4', 'c5', 'd4'], desc: 'Contra 3.Dxd4 o el gambito Smith-Morra.' },
  { id: 'b-1d4', side: 'b', title: 'Abre con 1.d4', chips: ['d4', 'd5'], desc: 'Una sola estructura: ...d5 y ...Cf6, con ...c5 contra los sistemas.' },
]

export const REP_META: Record<string, { branch: string; key: number; when: string }> = {
  'w-core': { branch: 'w-normal', key: 16, when: 'Tienes Te1 y c3 listos' },
  'w-e5-fork': { branch: 'w-normal', key: 14, when: 'Deja alfil en d6 y caballo en f6' },
  'w-e5-prepared': { branch: 'w-normal', key: 14, when: 'Prepara ...e5 con todo desarrollado' },
  'w-fork': { branch: 'w-cc6', key: 8, when: 'Peón en e5 con tu alfil en d3' },
  'w-fork-f6': { branch: 'w-cc6', key: 6, when: 'Juega ...f6 para sostener ...e5' },
  'w-e5-early': { branch: 'w-cc6', key: 6, when: 'Empuja ...e5 sin preparar' },
  'w-nc6-e5': { branch: 'w-cc6', key: 12, when: 'Clava en f3 con ...Ag4' },
  'w-c5': { branch: 'w-c5', key: 6, when: 'Ataca d4 con ...c5' },
  'w-c5-cxd4': { branch: 'w-c5', key: 8, when: 'Cambia en d4' },
  'w-c4': { branch: 'w-c5', key: 10, when: 'Cierra con ...c4' },
  'w-bf5': { branch: 'w-alfil', key: 8, when: 'Cambia alfiles en d3' },
  'w-bf5-bg6': { branch: 'w-alfil', key: 8, when: 'Se retira a g6 sin cambiar' },
  'w-bf5-exf5': { branch: 'w-alfil', key: 12, when: 'Recaptura en f5 con peón' },
  'w-bg4': { branch: 'w-alfil', key: 6, when: 'Clava con ...Ag4' },
  'w-englund': { branch: 'w-e5', key: 10, when: 'Se come b2 con la dama' },
  'w-kid': { branch: 'w-kid', key: 14, when: 'Responde a e4 con ...e5' },
  'b-sic-open': { branch: 'b-abierta', key: 7, when: 'Recaptura en d4 con caballo' },
  'b-sic-nxc6': { branch: 'b-abierta', key: 9, when: 'Cambia en c6' },
  'b-sic-bc4': { branch: 'b-ac4', key: 9, when: 'Alfil en c4 y enroque' },
  'b-pin-nge7': { branch: 'b-ac4', key: 11, when: 'Clava con Ag5 (tú con fianchetto)' },
  'b-pin-h6': { branch: 'b-ac4', key: 9, when: 'Prepara Ag5 (tú con ...Cf6)' },
  'b-sic-qh5': { branch: 'b-dama', key: 3, when: 'Dama a h5' },
  'b-pin-qf3': { branch: 'b-dama', key: 9, when: 'Dama en f3 y Ag5' },
  'b-sic-qxd4': { branch: 'b-d4', key: 5, when: 'Recaptura con la dama' },
  'b-sic-morra': { branch: 'b-d4', key: 5, when: 'Gambito con 3.c3' },
  'b-d4-london': { branch: 'b-1d4', key: 5, when: 'Sistema Londres (Af4)' },
  'b-d4-c4': { branch: 'b-1d4', key: 3, when: 'Gambito de dama (2.c4)' },
  'b-d4-colle': { branch: 'b-1d4', key: 5, when: 'Tu propio sistema (e3, Ad3)' },
}
