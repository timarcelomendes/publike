-- Os planos e os impulsos com valores e quantidades que fecham (17/11/2026, Marcelo: "revisite os planos e impulsos,
-- parece nao estar fazendo sentido os valores e quantidades lá"). As escolhas dele, na mesma hora:
--   * as faixas começam nas 20 vagas grátis, com os mesmos preços ("Pode, R$ 79 até 20 vagas");
--   * a campanha geral fica em R$ 30 ("Ficar em R$ 30"): os pacotes deixam de somar verba e os grupos desligam;
--   * o WhatsApp de quem contrata vai a 10 por dia ("10 por dia por empresa"), para os 300 por mês do plano caberem.
-- Pode rodar de novo: cada mudança confere se já foi feita.
--
-- 1. Os planos por faixa. As chaves ficam (empresa_5, empresa_20...); mudam a faixa e o nome:
--    * empresa_5 (R$ 79): de até 5 para até 20 vagas no ar, as mesmas do grátis, mais todas as ferramentas;
--    * empresa_20 (R$ 199): de até 20 para até 50 vagas no ar;
--    * empresa_50 (R$ 299): sai de venda (nenhuma conta passava de 9 vagas no ar; quem assinou continua);
--    * agencia_15 (R$ 99, 3 recrutadores): de até 15 para até 20 vagas no ar; agencia_200 (R$ 399) fica igual.
-- 2. O nome na cobrança (privado.nome_do_recurso) e o vínculo da volta do checkout pelo nome novo.
-- 3. O WhatsApp: o limite por dia de cada conta de quem contrata passa de 8 para 10.
-- 4. A campanha geral fica na base: os pacotes no ar e os próximos não somam verba por dia, e os grupos por função e
--    cidade desligam (o robô pausa os grupos na próxima volta; com a verba de hoje, nenhum estava pago).

-- 1. As faixas ---------------------------------------------------------------------------------------------------------

do $$
begin
  -- só na primeira vez: a faixa de entrada ainda era a de 5 vagas
  if exists (select 1 from privado.planos p where p.recurso = 'empresa_5' and p.limite_vagas = 5) then
    update privado.planos set limite_vagas = 20, atualizado_em = now() where recurso = 'empresa_5';
    update privado.planos set limite_vagas = 50, atualizado_em = now() where recurso = 'empresa_20';
    update privado.planos set ligado = false, atualizado_em = now() where recurso = 'empresa_50';
    update privado.planos set limite_vagas = 20, atualizado_em = now() where recurso = 'agencia_15';
  end if;
end
$$;

-- 2. O nome e o vínculo do checkout ------------------------------------------------------------------------------------

create or replace function privado.nome_do_recurso(p_recurso text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_recurso
           when 'copiloto' then 'recurso Triagem com IA'
           when 'combo' then 'combo Triagem + Teste Prático'
           when 'completo' then 'Plano Completo'
           when 'salarios' then 'recurso Consulta de salários'
           when 'video' then 'recurso Entrevista em vídeo'
           when 'automacoes' then 'recurso Automações personalizadas'
           when 'carreiras' then 'recurso Página de carreiras'
           when 'empresa_5' then 'Plano Empresa até 20 vagas'
           when 'empresa_20' then 'Plano Empresa até 50 vagas'
           when 'empresa_50' then 'Plano Empresa até 50 vagas (faixa antiga)'
           when 'agencia_15' then 'Plano Agência até 20 vagas'
           when 'agencia_200' then 'Plano Agência até 200 vagas'
           when 'impulso' then 'Impulso da vaga'
           else 'Teste Prático' end
$$;

-- a volta do checkout acha a assinatura pela descrição, que leva o nome do plano (NOME_PRODUTO no site): "até 50" é
-- agora a empresa_20, e o resto do Plano Empresa é a empresa_5 (a empresa_50 saiu de venda)
do $$
declare
  def text := pg_get_functiondef('public.servidor_pagamento_vincular(text,jsonb)'::regprocedure);
  antes constant text := $a$v_recurso := case when v_desc like '%plano empresa até 50 %' then 'empresa_50'
                      when v_desc like '%plano empresa até 20 %' then 'empresa_20'
                      when v_desc like '%plano empresa%' then 'empresa_5'$a$;
  depois constant text := $a$v_recurso := case when v_desc like '%plano empresa até 50 %' then 'empresa_20'
                      when v_desc like '%plano empresa%' then 'empresa_5'$a$;
  novo text;
begin
  if position(depois in def) > 0 then
    return; -- já trocada
  end if;
  novo := replace(def, antes, depois);
  if novo = def then
    raise exception 'Não achei o trecho a trocar em servidor_pagamento_vincular.';
  end if;
  execute novo;
end
$$;

-- 3. O WhatsApp de quem contrata: 10 por dia ---------------------------------------------------------------------------

alter table privado.config_whatsapp alter column por_conta_dia_empresa set default 10;
update privado.config_whatsapp set por_conta_dia_empresa = 10, atualizado_em = now()
 where id and por_conta_dia_empresa = 8;

-- 4. A campanha geral na base ------------------------------------------------------------------------------------------

do $$
begin
  -- só enquanto o máximo da campanha geral é a base (os pacotes não tinham para onde somar)
  if exists (select 1 from privado.config_impulso c
              where c.id and c.pacote_verba_dia > 0 and c.geral_maximo <= c.geral_base) then
    update privado.impulsos set verba_dia = 0
     where produto = 'candidatos' and situacao = 'no_ar' and coalesce(verba_dia, 0) > 0;
    update privado.config_impulso set pacote_verba_dia = 0, grupos_ligados = false where id;
  end if;
end
$$;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270715120000_planos_a_partir_de_20_vagas');
