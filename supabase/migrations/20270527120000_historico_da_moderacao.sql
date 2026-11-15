-- Admin › Denúncias › Histórico (15/11/2026, Marcelo: "Preciso de uma aba histórico"). O que aconteceu com os anúncios
-- na moderação nos últimos dias: removidos, liberados, denúncias dispensadas, remoções agendadas (e as que não precisaram
-- acontecer), textos corrigidos, perguntas a quem publicou e os anúncios que a IA reteve. E "Reabrir denúncias", para
-- desfazer um "Dispensar denúncias" tocado sem querer (14/11: "cliquei em dispensar, indevidaemnte").
--
-- Só a equipe (admin e moderadores). Pode rodar de novo.

create or replace function public.moderacao_historico(p_dias integer default 30, p_limite integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  desde timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 365)));
  limite integer := greatest(1, least(coalesce(p_limite, 200), 500));
begin
  perform privado.exigir_equipe();
  return coalesce((
    with ev as (
      -- o que a equipe (ou o robô da remoção agendada) fez
      select g.criado_em as em, g.acao, g.alvo_id::uuid as anuncio_id,
             case when g.detalhes ->> 'agendada' = 'true' then 'Remoção agendada'
                  else coalesce(p.nome, 'Equipe') end as quem,
             coalesce(g.detalhes ->> 'nota', g.detalhes ->> 'texto') as nota,
             g.detalhes
        from public.registro_equipe g
        left join public.perfis p on p.id = g.autor_id
       where g.alvo_tipo = 'anuncio'
         and g.acao in ('remover_anuncio', 'liberar_anuncio', 'agendar_remocao', 'cancelar_remocao', 'editar_anuncio',
                        'perguntar_anunciante', 'encerrar_repetido', 'reabrir_denuncias')
         and g.criado_em >= desde
         and g.alvo_id ~ '^[0-9a-f-]{36}$'
      union all
      -- a remoção agendada que não precisou acontecer (ninguém mais esperando resposta)
      select r.resolvida_em, 'remocao_nao_precisou', r.anuncio_id, 'Remoção agendada', r.nota, '{}'::jsonb
        from privado.remocoes_agendadas r
       where r.situacao = 'respondeu' and r.resolvida_em >= desde
      union all
      -- o que a IA reteve
      select m.criado_em, 'retido_ia', m.anuncio_id, 'IA', m.explicacao, '{}'::jsonb
        from public.moderacao_ia m
       where m.decisao = 'retido' and m.criado_em >= desde
    )
    select jsonb_agg(x order by x.em desc)
      from (
        select ev.em, ev.acao, ev.anuncio_id, ev.quem, ev.nota,
               ev.detalhes -> 'horas' as horas,
               a.titulo, a.status, a.tipo, pa.nome as autor,
               (select count(*) from public.denuncias d where d.anuncio_id = ev.anuncio_id) as denuncias,
               (select count(*) from public.denuncias d
                 where d.anuncio_id = ev.anuncio_id and d.status = 'improcedente') as dispensadas,
               (select count(*) from public.denuncias d
                 where d.anuncio_id = ev.anuncio_id and d.status = 'aberta') as abertas,
               (select coalesce(array_agg(distinct d.motivo), '{}') from public.denuncias d
                 where d.anuncio_id = ev.anuncio_id) as motivos
          from ev
          join public.anuncios a on a.id = ev.anuncio_id
          left join public.perfis pa on pa.id = a.autor_id
         order by ev.em desc
         limit limite
      ) x
  ), '[]'::jsonb);
end
$$;
revoke execute on function public.moderacao_historico(integer, integer) from public, anon;
grant execute on function public.moderacao_historico(integer, integer) to authenticated, service_role;

-- Desfaz o "Dispensar denúncias": as dispensadas voltam a abertas e o anúncio volta para a fila.
create or replace function public.reabrir_denuncias(p_anuncio uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_titulo text;
  n integer;
begin
  perform privado.exigir_equipe();
  select a.titulo into v_titulo from public.anuncios a where a.id = p_anuncio;
  if not found then
    raise exception 'Anúncio não encontrado.' using errcode = 'P0002';
  end if;
  update public.denuncias set status = 'aberta' where anuncio_id = p_anuncio and status = 'improcedente';
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'Este anúncio não tem denúncias dispensadas.' using errcode = 'P0001';
  end if;
  perform privado.registrar('reabrir_denuncias', 'anuncio', p_anuncio::text, v_titulo, jsonb_build_object('total', n));
  return n;
end
$$;
revoke execute on function public.reabrir_denuncias(uuid) from public, anon;
grant execute on function public.reabrir_denuncias(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
