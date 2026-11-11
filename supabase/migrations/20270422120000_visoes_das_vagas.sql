-- As visões de Vagas (11/11/2026, claude/plano-visoes-das-vagas.md). A Lista e "Pelo que pede você" são grátis; o
-- Mosaico (quantos chegam por dia em cada vaga) e a Linha do tempo (quando entrou, quando sai, as entrevistas) vêm nos
-- planos, com 15 dias grátis para testar, uma vez por conta (regra do Marcelo: todo pago nasce com 15 dias grátis).
-- Sem plano, a tela mostra uma prévia com as vagas da própria conta e o botão dos 15 dias. Pode rodar de novo.

-- quem testou (a linha fica depois do fim, para não repetir); `ate` null: liberada sem prazo pelo Admin
create table if not exists privado.visoes_contas (
  conta_id uuid primary key references public.perfis (id) on delete cascade,
  inicio timestamptz not null default now(),
  ate timestamptz,
  -- quem da conta tocou em "Testar 15 dias grátis" (na agência, alguém da equipe)
  pessoa_id uuid references public.perfis (id) on delete set null
);
alter table privado.visoes_contas enable row level security;
revoke all on privado.visoes_contas from public, anon, authenticated;

-- um plano valendo (assinatura ou 30 dias pagos) ou a cortesia do Plano Agência
create or replace function privado.visoes_com_plano(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privado.assinaturas a
                  where a.conta_id = p_conta and a.situacao = 'ativa' and privado.libera_tudo(a.recurso))
      or exists (select 1 from privado.cobrancas c
                  where c.conta_id = p_conta and c.situacao = 'paga' and privado.libera_tudo(c.recurso)
                    and c.periodo_ate + case when c.compra_id is null then interval '3 days' else interval '0' end > now())
      or exists (select 1 from privado.plano_agencia_cortesia x
                  where x.conta_id = p_conta and (x.ate is null or x.ate > now()))
$$;
revoke execute on function privado.visoes_com_plano(uuid) from public, anon, authenticated;

-- para a tela: o plano, os dias grátis (até quando) e se a conta já testou
create or replace function public.minhas_visoes_das_vagas()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when (select auth.uid()) is null then null else (
    select jsonb_build_object(
      'plano', privado.visoes_com_plano(public.conta_atual()),
      'testou', v.conta_id is not null,
      'sem_prazo', v.conta_id is not null and v.ate is null,
      'ate', case when v.ate > now() then v.ate end)
      from (select 1) um
      left join privado.visoes_contas v on v.conta_id = public.conta_atual())
  end
$$;
revoke execute on function public.minhas_visoes_das_vagas() from public, anon;
grant execute on function public.minhas_visoes_das_vagas() to authenticated;

-- "Testar 15 dias grátis": uma vez por conta, só para quem contrata
create or replace function public.testar_visoes_das_vagas()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := public.conta_atual();
  v_fim timestamptz := now() + interval '15 days';
begin
  perform privado.exigir_conta_ativa();
  if not exists (select 1 from public.perfis p where p.id = conta and p.tipo in ('comercio', 'empresa', 'agencia')) then
    raise exception 'Os 15 dias grátis são para contas de comércio, empresa ou agência.' using errcode = 'P0001';
  end if;
  if privado.visoes_com_plano(conta) then
    raise exception 'As visões já vêm no seu plano.' using errcode = 'P0001';
  end if;
  if exists (select 1 from privado.visoes_contas v where v.conta_id = conta) then
    raise exception 'Sua conta já usou os 15 dias grátis das visões. Elas continuam nos planos.'
      using errcode = 'P0001', hint = 'ja_testou';
  end if;
  insert into privado.visoes_contas (conta_id, ate, pessoa_id) values (conta, v_fim, (select auth.uid()));
  return v_fim;
end
$$;
revoke execute on function public.testar_visoes_das_vagas() from public, anon;
grant execute on function public.testar_visoes_das_vagas() to authenticated;

notify pgrst, 'reload schema';
