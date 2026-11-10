-- 30 dias para mudar de faixa (10/11/2026, pedido do Marcelo). Rode depois de 20270411120000_dossie_do_finalista.sql.
-- Pode rodar de novo.
--
-- Quem assina um plano por faixa e passa das vagas no ar da faixa ganha 30 dias para mudar para a de cima. Nada trava,
-- nem depois do prazo (por enquanto). O aviso vai no sino quando passa e de novo quando faltam 7 dias. Voltou para
-- dentro da faixa: o prazo some, e se passar de novo, conta outros 30 dias. As telas de Assinatura e Planos mostram o
-- prazo (minha_faixa().passou).

-- 1. Quando passou e até quando pode mudar (uma linha por assinatura que passou)
alter table privado.avisos_de_faixa add column if not exists passou_em timestamptz not null default now();
alter table privado.avisos_de_faixa add column if not exists prazo date;
alter table privado.avisos_de_faixa add column if not exists lembrado_em timestamptz;
update privado.avisos_de_faixa
   set prazo = ((passou_em at time zone 'America/Sao_Paulo')::date + 30)
 where prazo is null;
alter table privado.avisos_de_faixa alter column prazo set not null;

-- 2. As filas, uma vez por dia: avisa quem passou, lembra a 7 dias do fim e limpa quem voltou para dentro da faixa
create or replace function public.servidor_avisar_faixas(p_chave text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_prazo date;
begin
  perform privado.exigir_servidor(p_chave);

  -- voltou para dentro da faixa (ou a assinatura acabou): sem prazo
  delete from privado.avisos_de_faixa x
   using privado.assinaturas a, privado.planos pl
   where a.id = x.assinatura_id and pl.recurso = a.recurso and pl.ciclo = a.ciclo
     and (a.situacao <> 'ativa' or pl.limite_vagas is null or privado.vagas_no_ar(a.conta_id) <= pl.limite_vagas);

  for r in
    select a.id, a.conta_id, a.recurso, pl.limite_vagas, privado.vagas_no_ar(a.conta_id) as no_ar,
           x.assinatura_id as ja, x.prazo, x.lembrado_em
      from privado.assinaturas a
      join privado.planos pl on pl.recurso = a.recurso and pl.ciclo = a.ciclo
      left join privado.avisos_de_faixa x on x.assinatura_id = a.id
     where a.situacao = 'ativa' and pl.limite_vagas is not null
       and privado.vagas_no_ar(a.conta_id) > pl.limite_vagas
       and (x.assinatura_id is null or (x.lembrado_em is null and x.prazo - 7 <= hoje))
     limit 100
  loop
    if r.ja is null then
      v_prazo := hoje + 30;
      insert into privado.avisos_de_faixa (assinatura_id, passou_em, prazo, avisado_em)
      values (r.id, now(), v_prazo, now())
      on conflict (assinatura_id) do update set passou_em = now(), prazo = v_prazo, avisado_em = now(), lembrado_em = null;
      insert into public.notificacoes (destinatario_id, tipo, texto, link)
      values (r.conta_id, 'pagamento',
              left('Você tem ' || r.no_ar || ' vagas no ar, e o seu plano vai até ' || r.limite_vagas
                   || '. Você tem até ' || to_char(v_prazo, 'DD/MM')
                   || ' para mudar para a faixa de cima. Nada para de funcionar.', 300),
              '/painel/planos');
    else
      update privado.avisos_de_faixa set lembrado_em = now() where assinatura_id = r.id;
      insert into public.notificacoes (destinatario_id, tipo, texto, link)
      values (r.conta_id, 'pagamento',
              left('Faltam ' || greatest(r.prazo - hoje, 0) || ' dias para mudar de faixa: você tem ' || r.no_ar
                   || ' vagas no ar, e o seu plano vai até ' || r.limite_vagas || '. O prazo vai até '
                   || to_char(r.prazo, 'DD/MM') || '.', 300),
              '/painel/planos');
    end if;
    n := n + 1;
  end loop;
  return n;
end
$$;
revoke execute on function public.servidor_avisar_faixas(text) from public;
grant execute on function public.servidor_avisar_faixas(text) to anon, authenticated, service_role;

-- 3. A conta: as vagas no ar, se é agência verificada e, se o plano ficou pequeno, até quando dá para mudar (antes do
-- primeiro aviso das filas, o prazo conta de hoje)
create or replace function public.minha_faixa()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with c as (select public.conta_atual() as id),
  p as (
    select a.recurso, pl.limite_vagas, x.prazo
      from c
      join privado.assinaturas a on a.conta_id = c.id and a.situacao = 'ativa'
      join privado.planos pl on pl.recurso = a.recurso and pl.ciclo = a.ciclo and pl.limite_vagas is not null
      left join privado.avisos_de_faixa x on x.assinatura_id = a.id
     order by pl.limite_vagas desc
     limit 1
  )
  select case when c.id is null then null else jsonb_build_object(
    'vagas_no_ar', privado.vagas_no_ar(c.id),
    'agencia', privado.agencia_verificada(c.id),
    'passou', (select jsonb_build_object(
                 'plano', p.recurso, 'limite', p.limite_vagas,
                 'prazo', coalesce(p.prazo, (now() at time zone 'America/Sao_Paulo')::date + 30))
                 from p where privado.vagas_no_ar(c.id) > p.limite_vagas)) end
    from c
$$;
revoke execute on function public.minha_faixa() from public, anon;
grant execute on function public.minha_faixa() to authenticated;

notify pgrst, 'reload schema';
