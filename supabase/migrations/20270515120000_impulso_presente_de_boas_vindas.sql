-- O aviso do impulso pelo admin vira o presente de boas-vindas (13/11/2026, pedido do Marcelo: "esse sino pode ser
-- acompanhado de que é um brinde para novos usuários.. e mostrar a funcionalidade de algum modo"). Antes: "O Publike
-- vai impulsionar a vaga ... no Google", com o link para a lista de vagas quando eram várias. Agora o aviso diz que é
-- presente e leva sempre à página do impulso da vaga (/painel/impulsionar/<vaga>), que mostra o anúncio como sai no
-- Google, o "Como funciona" e os números. Continua só no sino. Só muda o texto e o link do aviso em
-- admin_impulsionar_cliente (o resto é o de 20270430120000). Pode rodar de novo.

create or replace function public.admin_impulsionar_cliente(p_conta uuid, p_anuncios uuid[], p_dias integer,
                                                            p_verba numeric, p_avisar boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.perfis;
  k privado.impulso_campanhas;
  a public.anuncios;
  v_ids uuid[];
  v_n integer;
  v_motivo text;
  v_juntou boolean := false;
  v_titulos text;
begin
  perform privado.exigir_impulsos_admin();
  select array_agg(distinct x) into v_ids from unnest(coalesce(p_anuncios, '{}'::uuid[])) x where x is not null;
  v_n := coalesce(cardinality(v_ids), 0);
  if v_n < 1 or v_n > 50 then
    return jsonb_build_object('erro', 'Escolha de 1 a 50 vagas.');
  end if;
  if p_verba is null or p_verba < v_n or p_verba > 5000 then
    return jsonb_build_object('erro', 'A verba vai de R$ 1 por vaga a R$ 5.000.');
  end if;
  select * into p from public.perfis where id = p_conta;
  if p.id is null then
    return jsonb_build_object('erro', 'Não achamos o cliente.');
  end if;
  perform pg_advisory_xact_lock(hashtext('impulso:' || p_conta));
  for a in select * from public.anuncios x where x.id = any(v_ids) loop
    v_motivo := privado.impulso_motivo_vaga(p_conta, a.id);
    if v_motivo is not null then
      return jsonb_build_object('erro', '"' || left(a.titulo, 60) || '": ' || v_motivo);
    end if;
  end loop;
  if (select count(*) from public.anuncios x where x.id = any(v_ids)) <> v_n then
    return jsonb_build_object('erro', 'Uma das vagas não existe mais. Atualize a lista.');
  end if;
  select * into k from privado.impulso_campanhas
   where conta_id = p_conta and situacao in ('pago', 'em_revisao', 'no_ar') for update;
  if k.id is not null then
    update privado.impulso_campanhas set verba = least(verba + round(p_verba, 2), 5000), avisar = avisar or p_avisar
     where id = k.id
    returning * into k;
    v_juntou := true;
  else
    if p_dias is null or p_dias < 1 or p_dias > 30 then
      return jsonb_build_object('erro', 'O impulso vai de 1 a 30 dias.');
    end if;
    insert into privado.impulso_campanhas (conta_id, nome, dias, verba, avisar)
    values (p_conta, left(coalesce(nullif(trim(p.nome), ''), 'Cliente'), 120), p_dias, round(p_verba, 2),
            coalesce(p_avisar, true))
    returning * into k;
  end if;
  -- cada vaga leva a parte dela da verba (para as contas do mês); no Google a verba é uma só
  insert into privado.impulsos (conta_id, anuncio_id, titulo, origem, dias, valor, verba, campanha_cliente_id, ate)
  select p_conta, x.id, x.titulo, 'admin', k.dias, 0, greatest(round(p_verba / v_n, 2), 0.01), k.id,
         case when k.situacao = 'no_ar' then k.ate end
    from public.anuncios x where x.id = any(v_ids);
  select string_agg('"' || left(x.titulo, 60) || '"', ', ' order by x.titulo) into v_titulos
    from public.anuncios x where x.id = any(v_ids);
  perform privado.registrar('impulsionar_cliente', 'usuario', p_conta::text, left(p.nome, 120),
                            jsonb_build_object('campanha', k.id, 'vagas', v_ids, 'dias', k.dias,
                                               'verba', round(p_verba, 2), 'juntou', v_juntou, 'avisar', p_avisar));
  if p_avisar then
    -- o presente de boas-vindas (o "Mais um presente" quando as vagas entram na campanha que já corre) e o link para a
    -- página do impulso da vaga, com o anúncio como sai no Google e o "Como funciona" (com várias vagas, a de uma delas)
    perform privado.avisar_pagamento(p_conta,
      case when v_juntou then 'Mais um presente do Publike: ' else 'Presente de boas-vindas do Publike: ' end
      || case when v_n = 1 then 'a vaga ' || v_titulos || ' vai aparecer no Google para quem procura emprego perto dela'
              else v_n || ' vagas suas vão aparecer no Google para quem procura emprego perto delas' end
      || case when v_juntou and k.ate is not null then ', até ' || privado.data_br(k.ate)
              else ', por ' || k.dias || case when k.dias = 1 then ' dia' else ' dias' end end
      || ', sem custo para você. Veja como o anúncio sai e acompanhe quantos viram, clicaram e curtiram.',
      '/painel/impulsionar/' || v_ids[1]);
  end if;
  return jsonb_build_object('ok', true, 'id', k.id, 'vagas', v_n, 'juntou', v_juntou);
end
$$;

notify pgrst, 'reload schema';
