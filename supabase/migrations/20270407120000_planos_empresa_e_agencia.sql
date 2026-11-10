-- Planos para empresa e para agência, por faixa de vagas no ar (10/11/2026; claude/plano-planos-empresa-e-agencia.md,
-- etapa 1). Rode depois de 20270406120000_carreiras_a_venda.sql. Pode rodar de novo.
--
-- O Plano Completo (R$ 129) sai de venda (quem assina continua). No lugar, dois planos que liberam tudo, como ele,
-- com o preço pela faixa de vagas no ar ao mesmo tempo:
--   * Plano Empresa: até 5 vagas (R$ 79 por mês, R$ 201 a cada 3 meses) e até 20 (R$ 199, R$ 507);
--   * Plano Agência, só para agência com o CNPJ verificado: até 15 vagas e 3 recrutadores (R$ 99, R$ 252) e até
--     200 vagas e 10 recrutadores (R$ 399, R$ 1.017). Preços agressivos de lançamento (pedido do Marcelo, 10/11).
--     Fica desligado até os recursos da agência ficarem prontos (etapa 2). Os recrutadores do plano são quem usa
--     os recursos pagos; a equipe grátis continua sem limite (a conferência entra na etapa 3).
-- Publicar nunca trava: quem passa da faixa recebe o aviso para mudar de plano.

-- 1. Os produtos nas três tabelas do pagamento, e a faixa de cada plano
alter table privado.planos drop constraint if exists planos_recurso_check;
alter table privado.planos add constraint planos_recurso_check
  check (recurso in ('copiloto', 'testes', 'combo', 'video', 'automacoes', 'completo', 'salarios', 'carreiras',
                     'empresa_5', 'empresa_20', 'agencia_15', 'agencia_200'));
alter table privado.assinaturas drop constraint if exists assinaturas_recurso_check;
alter table privado.assinaturas add constraint assinaturas_recurso_check
  check (recurso in ('copiloto', 'testes', 'combo', 'video', 'automacoes', 'completo', 'salarios', 'carreiras',
                     'empresa_5', 'empresa_20', 'agencia_15', 'agencia_200'));
alter table privado.cobrancas drop constraint if exists cobrancas_recurso_check;
alter table privado.cobrancas add constraint cobrancas_recurso_check
  check (recurso in ('copiloto', 'testes', 'combo', 'video', 'automacoes', 'completo', 'salarios', 'carreiras',
                     'empresa_5', 'empresa_20', 'agencia_15', 'agencia_200'));

alter table privado.planos add column if not exists limite_vagas integer check (limite_vagas is null or limite_vagas > 0);
alter table privado.planos add column if not exists limite_recrutadores integer
  check (limite_recrutadores is null or limite_recrutadores > 0);

insert into privado.planos (recurso, ciclo, valor, ligado, limite_vagas, limite_recrutadores) values
  ('empresa_5', 'MONTHLY', 79, true, 5, null), ('empresa_5', 'QUARTERLY', 201, true, 5, null),
  ('empresa_20', 'MONTHLY', 199, true, 20, null), ('empresa_20', 'QUARTERLY', 507, true, 20, null),
  ('agencia_15', 'MONTHLY', 99, false, 15, 3), ('agencia_15', 'QUARTERLY', 252, false, 15, 3),
  ('agencia_200', 'MONTHLY', 399, false, 200, 10), ('agencia_200', 'QUARTERLY', 1017, false, 200, 10)
on conflict (recurso, ciclo) do nothing;
update privado.planos set limite_recrutadores = case recurso when 'agencia_15' then 3 when 'agencia_200' then 10 end
 where recurso in ('agencia_15', 'agencia_200') and limite_recrutadores is null;
update privado.planos set limite_vagas = case recurso when 'empresa_5' then 5 when 'empresa_20' then 20
                                                      when 'agencia_15' then 15 when 'agencia_200' then 200 end
 where recurso in ('empresa_5', 'empresa_20', 'agencia_15', 'agencia_200') and limite_vagas is null;

-- o Plano Completo sai de venda (quem assina continua)
update privado.planos set ligado = false, atualizado_em = now() where recurso = 'completo';

-- 2. As regras novas
-- os produtos que liberam tudo, como o Plano Completo
create or replace function privado.libera_tudo(p_recurso text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_recurso in ('completo', 'empresa_5', 'empresa_20', 'agencia_15', 'agencia_200')
$$;

-- as vagas no ar ao mesmo tempo (no ar e em análise), a régua da faixa
create or replace function privado.vagas_no_ar(p_conta uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.anuncios a
   where a.autor_id = p_conta and a.tipo = 'vaga' and a.status in ('ativo', 'em_analise')
$$;

-- o Plano Agência é da agência com o CNPJ verificado pela equipe: privado.agencia_verificada (20261009250000)

revoke execute on function privado.libera_tudo(text), privado.vagas_no_ar(uuid) from public, anon, authenticated;

-- a conta: as vagas no ar e se é agência verificada (a tela de assinar escolhe o plano e a faixa)
create or replace function public.minha_faixa()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when (select public.conta_atual()) is null then null else jsonb_build_object(
    'vagas_no_ar', privado.vagas_no_ar((select public.conta_atual())),
    'agencia', privado.agencia_verificada((select public.conta_atual()))) end
$$;
revoke execute on function public.minha_faixa() from public, anon;
grant execute on function public.minha_faixa() to authenticated;

-- 3. As funções do pagamento: onde perguntavam pelo Plano Completo, perguntam a libera_tudo (cada troca confere
-- se já foi feita)
do $$
declare
  trocas constant text[][] := array[
    array['privado.nome_do_recurso(text)',
          $a$when 'completo' then 'Plano Completo'$a$,
          $a$when 'completo' then 'Plano Completo'
           when 'empresa_5' then 'Plano Empresa até 5 vagas'
           when 'empresa_20' then 'Plano Empresa até 20 vagas'
           when 'agencia_15' then 'Plano Agência até 15 vagas'
           when 'agencia_200' then 'Plano Agência até 200 vagas'$a$],
    array['privado.recalcular_recurso_pago(uuid,text)',
          $a$if p_recurso = 'completo' then$a$,
          $a$if privado.libera_tudo(p_recurso) then$a$],
    array['privado.recalcular_recurso_pago(uuid,text)',
          $a$(c.recurso in (p_recurso, 'completo') or$a$,
          $a$(c.recurso = p_recurso or privado.libera_tudo(c.recurso) or$a$],
    array['public.recursos_pagos()',
          $a$a.conta_id = conta and a.recurso = 'completo'$a$,
          $a$a.conta_id = conta and privado.libera_tudo(a.recurso)$a$],
    array['public.recursos_pagos()',
          $a$(a.recurso in (r, 'completo') or$a$,
          $a$(a.recurso = r or privado.libera_tudo(a.recurso) or$a$],
    -- a volta do checkout acha a assinatura pela descrição ("Plano Empresa até 20 vagas por 1 mês...")
    array['public.servidor_pagamento_vincular(text,jsonb)',
          $a$v_recurso := case when v_desc like '%carreira%' then 'carreiras'$a$,
          $a$v_recurso := case when v_desc like '%plano empresa até 20 %' then 'empresa_20'
                      when v_desc like '%plano empresa%' then 'empresa_5'
                      when v_desc like '%plano agência até 200 %' then 'agencia_200'
                      when v_desc like '%plano agência%' then 'agencia_15'
                      when v_desc like '%carreira%' then 'carreiras'$a$],
    -- o contexto do pagamento: a faixa de cada plano, e o Plano Agência só para agência verificada
    array['public.servidor_pagamento_contexto(text,uuid)',
          $a$'valor', pl.valor))
                          from privado.planos pl where pl.ligado and pl.valor is not null)$a$,
          $a$'valor', pl.valor, 'limite_vagas', pl.limite_vagas))
                          from privado.planos pl where pl.ligado and pl.valor is not null
                           and (pl.recurso not like 'agencia%' or privado.agencia_verificada(p_conta)))$a$],
    -- e as vagas no ar, para o servidor conferir a faixa escolhida
    array['public.servidor_pagamento_contexto(text,uuid)',
          $a$'pode', privado.pode_pagar(p_conta),$a$,
          $a$'pode', privado.pode_pagar(p_conta),
    'vagas_no_ar', privado.vagas_no_ar(p_conta),$a$],
    -- o que as telas leem: o mesmo
    array['public.pagamentos_da_conta()',
          $a$'valor', pl.valor) order by pl.recurso, pl.ciclo)
                          from privado.planos pl where pl.ligado and pl.valor is not null)$a$,
          $a$'valor', pl.valor, 'limite_vagas', pl.limite_vagas) order by pl.recurso, pl.ciclo)
                          from privado.planos pl where pl.ligado and pl.valor is not null
                           and (pl.recurso not like 'agencia%' or privado.agencia_verificada(conta)))$a$]
  ];
  marca constant text[] := array['empresa_5', 'libera_tudo(p_recurso)', 'libera_tudo(c.recurso)',
                                 'libera_tudo(a.recurso)', 'or privado.libera_tudo(a.recurso) or', 'empresa_20',
                                 'limite_vagas', 'vagas_no_ar', 'limite_vagas'];
  i int;
  def text;
  novo text;
begin
  for i in 1 .. array_length(trocas, 1) loop
    def := pg_get_functiondef(to_regprocedure(trocas[i][1]));
    if position(marca[i] in def) > 0 then
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

-- 4. Passou da faixa: o aviso no sino, uma vez a cada 30 dias por assinatura (as filas chamam)
create table if not exists privado.avisos_de_faixa (
  assinatura_id uuid primary key references privado.assinaturas (id) on delete cascade,
  avisado_em timestamptz not null default now()
);
alter table privado.avisos_de_faixa enable row level security;
revoke all on privado.avisos_de_faixa from public, anon, authenticated;

create or replace function public.servidor_avisar_faixas(p_chave text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  perform privado.exigir_servidor(p_chave);
  for r in
    select a.id, a.conta_id, a.recurso, pl.limite_vagas, privado.vagas_no_ar(a.conta_id) as no_ar
      from privado.assinaturas a
      join privado.planos pl on pl.recurso = a.recurso and pl.ciclo = a.ciclo
     where a.situacao = 'ativa' and pl.limite_vagas is not null
       and privado.vagas_no_ar(a.conta_id) > pl.limite_vagas
       and not exists (select 1 from privado.avisos_de_faixa x
                        where x.assinatura_id = a.id and x.avisado_em > now() - interval '30 days')
     limit 100
  loop
    insert into public.notificacoes (destinatario_id, tipo, texto, link)
    values (r.conta_id, 'pagamento',
            'Você tem ' || r.no_ar || ' vagas no ar, e o seu ' || privado.nome_do_recurso(r.recurso)
            || ' vai até ' || r.limite_vagas || '. Nada para de funcionar: mude para a faixa de cima em Assinatura.',
            '/painel/assinatura');
    insert into privado.avisos_de_faixa (assinatura_id) values (r.id)
    on conflict (assinatura_id) do update set avisado_em = now();
    n := n + 1;
  end loop;
  return n;
end
$$;
revoke execute on function public.servidor_avisar_faixas(text) from public;
grant execute on function public.servidor_avisar_faixas(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
