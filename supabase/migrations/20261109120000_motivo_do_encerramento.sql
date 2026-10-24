-- Motivo do encerramento (09/11/2026): ao encerrar uma vaga ou um serviço, a confirmação pergunta por quê
-- (opcional). Serve para saber quantas vagas foram preenchidas pelo Publike e por que as outras saem do ar.
-- Pode rodar de novo.
--   * privado.encerramentos: um por anúncio (o último motivo vale), apaga junto com o anúncio.
--   * registrar_motivo_encerramento: só quem publicou, com o anúncio já encerrado.
--   * admin_motivos_encerramento: a contagem dos últimos N dias, para o admin (só service_role).

create table if not exists privado.encerramentos (
  anuncio_id uuid primary key references public.anuncios (id) on delete cascade,
  autor_id uuid not null references public.perfis (id) on delete cascade,
  tipo text not null,
  motivo text not null check (motivo in (
    'contratei_publike', 'contratei_fora', 'desisti', 'poucos_candidatos',
    'sem_agenda', 'nao_atendo', 'outro')),
  detalhe text check (detalhe is null or char_length(detalhe) <= 200),
  criado_em timestamptz not null default now()
);
create index if not exists encerramentos_criado_idx on privado.encerramentos (criado_em desc);
alter table privado.encerramentos enable row level security;
revoke all on privado.encerramentos from public, anon, authenticated;

create or replace function public.registrar_motivo_encerramento(p_anuncio uuid, p_motivo text, p_detalhe text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
  v_tipo text;
  v_detalhe text := nullif(left(btrim(coalesce(p_detalhe, '')), 200), '');
begin
  if conta is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  select a.tipo into v_tipo from public.anuncios a
   where a.id = p_anuncio and a.autor_id = conta and a.status = 'encerrado';
  if v_tipo is null then
    raise exception 'Não encontramos esse anúncio encerrado entre os seus.' using errcode = 'P0002';
  end if;
  if p_motivo is null or p_motivo not in ('contratei_publike', 'contratei_fora', 'desisti', 'poucos_candidatos',
                                          'sem_agenda', 'nao_atendo', 'outro') then
    raise exception 'Motivo inválido.' using errcode = '22023';
  end if;
  insert into privado.encerramentos (anuncio_id, autor_id, tipo, motivo, detalhe)
  values (p_anuncio, conta, v_tipo, p_motivo, case when p_motivo = 'outro' then v_detalhe end)
  on conflict (anuncio_id) do update
    set motivo = excluded.motivo, detalhe = excluded.detalhe, criado_em = now();
end
$$;
revoke execute on function public.registrar_motivo_encerramento(uuid, text, text) from public, anon;
grant execute on function public.registrar_motivo_encerramento(uuid, text, text) to authenticated;

create or replace function public.admin_motivos_encerramento(p_dias integer default 30)
returns table (tipo text, motivo text, total integer, ultimo timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select e.tipo, e.motivo, count(*)::integer, max(e.criado_em)
    from privado.encerramentos e
   where e.criado_em > now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 365)))
   group by e.tipo, e.motivo
   order by 3 desc
$$;
revoke execute on function public.admin_motivos_encerramento(integer) from public, anon, authenticated;
grant execute on function public.admin_motivos_encerramento(integer) to service_role;
