-- A reputação de quem contrata (07/11/2026, claude/plano-reputacao-de-quem-contrata.md): responde, acompanha e dá
-- retorno ao candidato, nos últimos 90 dias, comparada com as outras contas (sem citar ninguém). O painel lê a da
-- própria conta (minha_reputacao) e o e-mail da semana lê a de várias (servidor_reputacao).
-- Rode depois de 20270226120000_porta_de_entrada.sql. Pode rodar de novo.

-- Os números de cada conta (todas, com p_contas null). As bases:
--   * responder: as curtidas com mais de 48 h (ou já respondidas); o Publike fechando sozinho não conta como resposta;
--   * horas: a mediana até a resposta, sem o contato direto (na hora) e sem o Publike;
--   * acompanhar: os matches com mais de 3 dias; vale mudar a etapa, tocar no contato ou mandar mensagem;
--   * retorno: as candidaturas que terminaram (vaga fora do ar, ou mais de 30 dias); vale o "não foi dessa vez" de
--     alguém (não do Publike) ou a etapa Contratado ou Não seguiu.
create or replace function privado.reputacao(p_contas uuid[])
returns table (conta_id uuid, curtidas integer, base_resposta integer, respondidas integer, horas numeric,
               base_acompanha integer, acompanhados integer, base_retorno integer, com_retorno integer)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select a.autor_id as conta, c.anuncio_id, c.perfil_id, c.status, c.aceita_em, c.criado_em, c.respondida_em,
           c.respondida_por, e.etapa,
           (a.status <> 'ativo' or a.preenchida_em is not null or a.expira_em < now()) as vaga_fora
      from public.curtidas c
      join public.anuncios a on a.id = c.anuncio_id and a.tipo = 'vaga'
      left join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
     where c.criado_em > now() - interval '90 days'
       and (p_contas is null or a.autor_id = any (p_contas))
  ), m as (
    select c.*,
           (c.status <> 'pendente' or c.aceita_em is not null) and coalesce(c.respondida_por, '') <> 'publike' as respondeu,
           (c.status in ('match', 'desfeito') or c.aceita_em is not null) as deu_match
      from c
  )
  select m.conta,
         count(*)::integer,
         count(*) filter (where m.criado_em < now() - interval '48 hours' or m.respondeu)::integer,
         count(*) filter (where m.respondeu)::integer,
         (percentile_cont(0.5) within group (order by extract(epoch from (m.respondida_em - m.criado_em)) / 3600)
            filter (where m.respondeu and m.respondida_em is not null
                      and coalesce(m.respondida_por, '') not in ('direto', 'publike')))::numeric,
         count(*) filter (where m.deu_match and coalesce(m.aceita_em, m.respondida_em, m.criado_em) < now() - interval '3 days')::integer,
         count(*) filter (
           where m.deu_match and coalesce(m.aceita_em, m.respondida_em, m.criado_em) < now() - interval '3 days'
             and (coalesce(m.etapa, 'novo') <> 'novo'
                  or exists (select 1 from privado.historico_etapas h
                              where h.anuncio_id = m.anuncio_id and h.perfil_id = m.perfil_id
                                and h.o_que like 'contato:%')
                  or exists (select 1 from public.mensagens g
                               join public.conversas v on v.id = g.conversa_id
                              where g.autor_id = m.conta and not g.automatica and g.criado_em >= m.criado_em
                                and (v.conta_a = m.perfil_id or v.conta_b = m.perfil_id)))
         )::integer,
         count(*) filter (where m.vaga_fora or m.criado_em < now() - interval '30 days')::integer,
         count(*) filter (
           where (m.vaga_fora or m.criado_em < now() - interval '30 days')
             and ((m.status = 'dispensada' and coalesce(m.respondida_por, '') <> 'publike')
                  or m.etapa in ('contratado', 'nao_seguiu'))
         )::integer
    from m
   group by m.conta
$$;

-- As contas pedidas, com as taxas e a comparação com as outras (as com 5 curtidas ou mais). melhor_*: a parte das
-- outras contas que ficou abaixo (0 a 1); null quando a base é pequena (menos de 3 casos) ou não há com quem comparar.
create or replace function privado.reputacao_comparada(p_contas uuid[])
returns table (conta_id uuid, curtidas integer,
               responde numeric, base_resposta integer, horas numeric, acompanha numeric, base_acompanha integer,
               retorno numeric, base_retorno integer,
               melhor_responde numeric, melhor_rapidez numeric, melhor_acompanha numeric, melhor_retorno numeric,
               comparadas integer)
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select r.*,
           case when r.base_resposta >= 3 then r.respondidas::numeric / r.base_resposta end as tx_resp,
           case when r.base_acompanha >= 3 then r.acompanhados::numeric / r.base_acompanha end as tx_acomp,
           case when r.base_retorno >= 3 then r.com_retorno::numeric / r.base_retorno end as tx_ret
      from privado.reputacao(null) r
     where r.curtidas >= 5
  ), eu as (
    select * from t where t.conta_id = any (coalesce(p_contas, '{}'))
  )
  select eu.conta_id, eu.curtidas,
         round(eu.tx_resp, 3), eu.base_resposta, round(eu.horas, 1), round(eu.tx_acomp, 3), eu.base_acompanha,
         round(eu.tx_ret, 3), eu.base_retorno,
         (select round(count(*) filter (where o.tx_resp < eu.tx_resp)::numeric / nullif(count(*), 0), 2)
            from t o where o.conta_id <> eu.conta_id and o.tx_resp is not null and eu.tx_resp is not null),
         (select round(count(*) filter (where o.horas > eu.horas)::numeric / nullif(count(*), 0), 2)
            from t o where o.conta_id <> eu.conta_id and o.horas is not null and eu.horas is not null),
         (select round(count(*) filter (where o.tx_acomp < eu.tx_acomp)::numeric / nullif(count(*), 0), 2)
            from t o where o.conta_id <> eu.conta_id and o.tx_acomp is not null and eu.tx_acomp is not null),
         (select round(count(*) filter (where o.tx_ret < eu.tx_ret)::numeric / nullif(count(*), 0), 2)
            from t o where o.conta_id <> eu.conta_id and o.tx_ret is not null and eu.tx_ret is not null),
         (select count(*)::integer from t o where o.conta_id <> eu.conta_id)
    from eu
$$;

revoke all on function privado.reputacao(uuid[]), privado.reputacao_comparada(uuid[]) from public, anon, authenticated;

-- A reputação da conta de quem entrou (a da agência, para a equipe). Sem 5 curtidas, só o total.
create or replace function public.minha_reputacao()
returns table (curtidas integer,
               responde numeric, base_resposta integer, horas numeric, acompanha numeric, base_acompanha integer,
               retorno numeric, base_retorno integer,
               melhor_responde numeric, melhor_rapidez numeric, melhor_acompanha numeric, melhor_retorno numeric,
               comparadas integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  conta uuid := public.conta_atual();
begin
  if (select auth.uid()) is null or conta is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  return query
  select r.curtidas, r.responde, r.base_resposta, r.horas, r.acompanha, r.base_acompanha, r.retorno, r.base_retorno,
         r.melhor_responde, r.melhor_rapidez, r.melhor_acompanha, r.melhor_retorno, r.comparadas
    from privado.reputacao_comparada(array[conta]) r;
  if not found then
    -- abaixo de 5 curtidas: só quantas já tem, para o painel dizer quanto falta
    return query
    select coalesce((select x.curtidas from privado.reputacao(array[conta]) x), 0),
           null::numeric, 0, null::numeric, null::numeric, 0, null::numeric, 0,
           null::numeric, null::numeric, null::numeric, null::numeric, 0;
  end if;
end
$$;

revoke execute on function public.minha_reputacao() from public, anon;
grant execute on function public.minha_reputacao() to authenticated;

-- A reputação de várias contas, para o e-mail da semana (o servidor do site, com a chave do servidor).
create or replace function public.servidor_reputacao(p_chave text, p_contas uuid[])
returns table (conta_id uuid, curtidas integer,
               responde numeric, base_resposta integer, horas numeric, acompanha numeric, base_acompanha integer,
               retorno numeric, base_retorno integer,
               melhor_responde numeric, melhor_rapidez numeric, melhor_acompanha numeric, melhor_retorno numeric,
               comparadas integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return query select * from privado.reputacao_comparada(p_contas);
end
$$;

revoke execute on function public.servidor_reputacao(text, uuid[]) from public;
grant execute on function public.servidor_reputacao(text, uuid[]) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
