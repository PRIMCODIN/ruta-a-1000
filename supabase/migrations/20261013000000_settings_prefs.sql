-- Preferencias de aspecto (tablero, piezas, modo) sincronizadas entre dispositivos.
alter table public.settings add column if not exists prefs jsonb not null default '{}'::jsonb;
