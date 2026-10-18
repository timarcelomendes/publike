-- Convites também para prestadores de serviço (eletricista, diarista...): o convite é para a
-- vitrine de serviços. Quem responde "pode", o admin monta a vitrine e manda o acesso.

alter table public.convites drop constraint if exists convites_tipo_check;
alter table public.convites
  add constraint convites_tipo_check check (tipo in ('empresa', 'agencia', 'prestador'));

notify pgrst, 'reload schema';
