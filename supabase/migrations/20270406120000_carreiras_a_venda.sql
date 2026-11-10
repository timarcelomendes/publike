-- A Página de carreiras à venda (10/11/2026). Pode rodar de novo.
--
-- A página personalizada (cor, capa, "Por que trabalhar aqui", endereço curto) já era restrita: libera com mais de
-- 10 vagas publicadas, com qualquer assinatura paga ou por cortesia da equipe. Quem contrata pouco não chegava lá
-- sem assinar um recurso que talvez nem use. Decisões do Marcelo (10/11/2026):
--   * libera A PARTIR de 10 vagas publicadas (antes, mais de 10);
--   * qualquer assinatura continua liberando;
--   * a página sozinha vira um produto pago, 'carreiras', a R$ 19,90 por mês (o preço muda em Admin › Pagamentos).
-- A cobrança paga já liberava a página (privado.pagina_de_vagas_liberada olha as cobranças pagas): aqui o produto
-- entra nas listas do pagamento, no nome da cobrança, no vínculo do checkout e no "já liberado" do contexto.

-- 1. O produto nas três tabelas do pagamento
alter table privado.planos drop constraint if exists planos_recurso_check;
alter table privado.planos add constraint planos_recurso_check
  check (recurso in ('copiloto', 'testes', 'combo', 'video', 'automacoes', 'completo', 'salarios', 'carreiras'));
alter table privado.assinaturas drop constraint if exists assinaturas_recurso_check;
alter table privado.assinaturas add constraint assinaturas_recurso_check
  check (recurso in ('copiloto', 'testes', 'combo', 'video', 'automacoes', 'completo', 'salarios', 'carreiras'));
alter table privado.cobrancas drop constraint if exists cobrancas_recurso_check;
alter table privado.cobrancas add constraint cobrancas_recurso_check
  check (recurso in ('copiloto', 'testes', 'combo', 'video', 'automacoes', 'completo', 'salarios', 'carreiras'));

-- o mensal a R$ 19,90, já à venda (só aparece para as contas com o pagamento aberto); o trimestral sem preço
insert into privado.planos (recurso, ciclo, valor, ligado)
values ('carreiras', 'MONTHLY', 19.90, true), ('carreiras', 'QUARTERLY', null, false)
on conflict (recurso, ciclo) do nothing;

-- 2. As funções do pagamento que listam os produtos (cada troca confere se já foi feita)
do $$
declare
  trocas constant text[][] := array[
    -- o nome na cobrança e na nota
    array['privado.nome_do_recurso(text)',
          $a$when 'salarios' then 'recurso Consulta de salários'$a$,
          $a$when 'carreiras' then 'recurso Página de carreiras'
           when 'salarios' then 'recurso Consulta de salários'$a$],
    -- a página não tem tabela de liberação: olha as cobranças pagas direto (e o "else" iria para o Teste Prático)
    array['privado.recalcular_recurso_pago(uuid,text)',
          $a$if p_recurso = 'combo' then$a$,
          $a$if p_recurso = 'carreiras' then
    return; -- a Página de carreiras olha as cobranças pagas direto (privado.pagina_de_vagas_liberada)
  end if;
  if p_recurso = 'combo' then$a$],
    -- a volta do checkout acha a assinatura pela descrição
    array['public.servidor_pagamento_vincular(text,jsonb)',
          $a$v_recurso := case when v_desc like '%sal_rio%' then 'salarios'$a$,
          $a$v_recurso := case when v_desc like '%carreira%' then 'carreiras'
                      when v_desc like '%sal_rio%' then 'salarios'$a$],
    -- "já está liberado": com a página liberada (pelas vagas, por cortesia ou por outra assinatura), não vende
    array['public.servidor_pagamento_contexto(text,uuid)',
          $a$'salarios', exists (select 1 from privado.salarios_contas v where v.conta_id = p_conta and v.ate is null)),$a$,
          $a$'salarios', exists (select 1 from privado.salarios_contas v where v.conta_id = p_conta and v.ate is null),
      'carreiras', privado.pagina_de_vagas_liberada(p_conta)),$a$],
    -- a partir de 10 vagas publicadas
    array['privado.pagina_de_vagas_liberada(uuid)',
          $a$privado.vagas_publicadas(p_conta) > 10$a$,
          $a$privado.vagas_publicadas(p_conta) >= 10$a$],
    -- o aviso "Sua página de carreiras está liberada", na 10ª vaga
    array['public.servidor_avisar_liberacoes(text)',
          $a$and privado.vagas_publicadas(p.id) > 10$a$,
          $a$and privado.vagas_publicadas(p.id) >= 10$a$]
  ];
  marca constant text[] := array['''carreiras''', '''carreiras''', '''carreiras''', '''carreiras''', '>= 10', '>= 10'];
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
      raise exception 'Não achei o trecho a trocar em %.', trocas[i][1];
    end if;
    execute novo;
  end loop;
end
$$;

-- 3. O texto da recusa ao salvar a página bloqueada
do $$
declare
  def text;
begin
  for def in
    select pg_get_functiondef(p.oid) from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('salvar_pagina_de_vagas', 'salvar_banner_e_destaques')
  loop
    if position('mais de 10 vagas publicadas ou com uma assinatura' in def) > 0 then
      execute replace(def, 'mais de 10 vagas publicadas ou com uma assinatura',
                      '10 vagas publicadas, com a assinatura da Página de carreiras ou com qualquer outra');
    end if;
  end loop;
end
$$;

notify pgrst, 'reload schema';
