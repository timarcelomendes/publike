-- 20 vagas no ar grátis para todos; acima disso, um plano (10/11/2026, decisão do Marcelo). Rode depois de
-- 20270412120000_prazo_para_mudar_de_faixa.sql. Pode rodar de novo.
--
-- Até 20 anúncios no ar, o Publike é grátis para qualquer conta, sem os recursos pagos. Passou de 20, a conta precisa
-- de um plano por faixa: o limite vira o do plano (Plano Empresa até 50, Plano Agência até 200). A agência
-- verificada também fica em 20 sem plano (antes, 200 grátis). Os planos de até 5 e até 20 vagas continuam, para
-- quem quer os recursos pagos com poucas vagas. Entra o Plano Empresa até 50 vagas: R$ 299 por mês, R$ 762 a cada 3
-- meses. Quem já tem mais de 20 no ar não perde nada: o limite só barra o próximo anúncio.

-- 1. O produto novo nas três tabelas do pagamento
alter table privado.planos drop constraint if exists planos_recurso_check;
alter table privado.planos add constraint planos_recurso_check
  check (recurso in ('copiloto', 'testes', 'combo', 'video', 'automacoes', 'completo', 'salarios', 'carreiras',
                     'empresa_5', 'empresa_20', 'empresa_50', 'agencia_15', 'agencia_200'));
alter table privado.assinaturas drop constraint if exists assinaturas_recurso_check;
alter table privado.assinaturas add constraint assinaturas_recurso_check
  check (recurso in ('copiloto', 'testes', 'combo', 'video', 'automacoes', 'completo', 'salarios', 'carreiras',
                     'empresa_5', 'empresa_20', 'empresa_50', 'agencia_15', 'agencia_200'));
alter table privado.cobrancas drop constraint if exists cobrancas_recurso_check;
alter table privado.cobrancas add constraint cobrancas_recurso_check
  check (recurso in ('copiloto', 'testes', 'combo', 'video', 'automacoes', 'completo', 'salarios', 'carreiras',
                     'empresa_5', 'empresa_20', 'empresa_50', 'agencia_15', 'agencia_200'));

insert into privado.planos (recurso, ciclo, valor, ligado, limite_vagas, limite_recrutadores) values
  ('empresa_50', 'MONTHLY', 299, true, 50, null), ('empresa_50', 'QUARTERLY', 762, true, 50, null)
on conflict (recurso, ciclo) do nothing;

create or replace function privado.libera_tudo(p_recurso text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_recurso in ('completo', 'empresa_5', 'empresa_20', 'empresa_50', 'agencia_15', 'agencia_200')
$$;
revoke execute on function privado.libera_tudo(text) from public, anon, authenticated;

-- 2. O nome na cobrança e o vínculo da volta do checkout (cada troca confere se já foi feita)
do $$
declare
  trocas constant text[][] := array[
    array['privado.nome_do_recurso(text)',
          $a$when 'empresa_20' then 'Plano Empresa até 20 vagas'$a$,
          $a$when 'empresa_20' then 'Plano Empresa até 20 vagas'
           when 'empresa_50' then 'Plano Empresa até 50 vagas'$a$],
    array['public.servidor_pagamento_vincular(text,jsonb)',
          $a$v_recurso := case when v_desc like '%plano empresa até 20 %' then 'empresa_20'$a$,
          $a$v_recurso := case when v_desc like '%plano empresa até 50 %' then 'empresa_50'
                      when v_desc like '%plano empresa até 20 %' then 'empresa_20'$a$]
  ];
  i int;
  def text;
  novo text;
begin
  for i in 1 .. array_length(trocas, 1) loop
    def := pg_get_functiondef(to_regprocedure(trocas[i][1]));
    if position('empresa_50' in def) > 0 then
      continue; -- já trocada
    end if;
    novo := replace(def, trocas[i][2], trocas[i][3]);
    if novo = def then
      raise exception 'Não achei o trecho a trocar em % (troca %).', trocas[i][1], i;
    end if;
    execute novo;
  end loop;
end
$$;

-- 3. Quantos anúncios a conta pode ter no ar: 20 sem plano; com um plano por faixa valendo (a assinatura ativa ou a
-- cobrança paga do período, mais 3 dias), o maior entre 20 e a faixa do plano; com a cortesia do Plano Agência, 200
create or replace function privado.limite_no_ar(p_conta uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    20,
    coalesce((select max(pl.limite_vagas)
                from privado.assinaturas a
                join privado.planos pl on pl.recurso = a.recurso and pl.ciclo = a.ciclo
               where a.conta_id = p_conta and a.situacao = 'ativa' and pl.limite_vagas is not null), 0),
    coalesce((select max(pl.limite_vagas)
                from privado.cobrancas c
                join privado.planos pl on pl.recurso = c.recurso and pl.limite_vagas is not null
               where c.conta_id = p_conta and c.situacao = 'paga'
                 and c.periodo_ate + interval '3 days' >= now()), 0),
    case when exists (select 1 from privado.plano_agencia_cortesia x
                       where x.conta_id = p_conta and (x.ate is null or x.ate > now())) then 200 else 0 end)
$$;
revoke execute on function privado.limite_no_ar(uuid) from public, anon, authenticated;

-- 4. A trava ao publicar ou reativar: o limite da conta, e o caminho para o plano na mensagem
create or replace function privado.conferir_ativos(p_ignorar uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select public.conta_atual());
  limite integer;
begin
  if usuario is null then
    return;
  end if;
  limite := privado.limite_no_ar(usuario);
  perform pg_advisory_xact_lock(hashtext('publike:ativos:' || usuario::text));
  if (select count(*) from public.anuncios a
       where a.autor_id = usuario and a.id <> p_ignorar
         and a.status in ('ativo', 'pausado', 'em_analise')) >= limite then
    if limite <= 20 then
      raise exception 'Você já tem % anúncios no ar, o limite grátis. Para publicar mais, assine um plano em Painel › Planos, ou encerre algum anúncio.', limite
        using errcode = 'P0001', hint = 'limite_ativos';
    end if;
    raise exception 'Você já tem % anúncios no ar, o limite do seu plano. Para publicar mais, mude de faixa em Painel › Planos, ou encerre algum anúncio.', limite
      using errcode = 'P0001', hint = 'limite_ativos';
  end if;
end
$$;

-- 5. A conta: também o limite de anúncios no ar, para as telas
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
    'limite_no_ar', privado.limite_no_ar(c.id),
    'passou', (select jsonb_build_object(
                 'plano', p.recurso, 'limite', p.limite_vagas,
                 'prazo', coalesce(p.prazo, (now() at time zone 'America/Sao_Paulo')::date + 30))
                 from p where privado.vagas_no_ar(c.id) > p.limite_vagas)) end
    from c
$$;
revoke execute on function public.minha_faixa() from public, anon;
grant execute on function public.minha_faixa() to authenticated;

notify pgrst, 'reload schema';
