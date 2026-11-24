-- A promoção de lançamento também para as Visões das vagas e o Contato no convite (24/11/2026; Marcelo: "adicione
-- Recrutadores, visões das vagas e contato no convite" e "uma opção, tudo, que habilita tudo de uma vez"). Os
-- recrutadores ficam de fora: a equipe já vai até 30 pessoas em qualquer conta (o limite dos planos de agência não
-- trava nada).
--   * `visoes_contas` e `contato_no_convite_contas` ganham `promocao_ate` e `promocao_avisada_em`; a promoção vale
--     enquanto `ate = promocao_ate`, como nos outros recursos.
--   * Os 15 dias grátis delas contavam a linha da conta como "já testou". Agora só conta quem testou (`pessoa_id`): a
--     conta que teve só a promoção ainda pode testar os 15 dias depois que ela acaba.
--   * No Contato no convite, a promoção dá os 30 contatos por dia do plano (os 15 dias dão 5).
--   * `minhas_visoes_das_vagas` e `meu_contato_no_convite` dizem `promocao`; a busca da equipe conta os sete recursos.
-- Pode rodar de novo.

alter table privado.visoes_contas add column if not exists promocao_ate timestamptz;
alter table privado.visoes_contas add column if not exists promocao_avisada_em timestamptz;
alter table privado.contato_no_convite_contas add column if not exists promocao_ate timestamptz;
alter table privado.contato_no_convite_contas add column if not exists promocao_avisada_em timestamptz;

create or replace function privado.nome_do_recurso_pago(p_recurso text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_recurso
           when 'copiloto' then 'a Triagem com IA'
           when 'testes' then 'o Teste Prático'
           when 'video' then 'a Entrevista em vídeo'
           when 'automacoes' then 'as Automações personalizadas'
           when 'salarios' then 'a Consulta de salários'
           when 'visoes' then 'as Visões das vagas'
           when 'contato_no_convite' then 'o Contato no convite'
         end
$$;

create or replace function privado.liberacao_do_recurso(p_conta uuid, p_recurso text,
  out existe boolean, out ate timestamptz, out promocao_ate timestamptz)
language plpgsql
stable
set search_path = ''
as $$
begin
  existe := false;
  if p_recurso = 'copiloto' then
    select true, x.ate, x.promocao_ate into existe, ate, promocao_ate from privado.copiloto_contas x where x.conta_id = p_conta;
  elsif p_recurso = 'testes' then
    select true, x.ate, x.promocao_ate into existe, ate, promocao_ate from privado.testes_contas x where x.conta_id = p_conta;
  elsif p_recurso = 'video' then
    select true, x.ate, x.promocao_ate into existe, ate, promocao_ate from privado.video_contas x where x.conta_id = p_conta;
  elsif p_recurso = 'automacoes' then
    select true, x.ate, x.promocao_ate into existe, ate, promocao_ate from privado.automacoes_contas x where x.conta_id = p_conta;
  elsif p_recurso = 'salarios' then
    select true, x.ate, x.promocao_ate into existe, ate, promocao_ate from privado.salarios_contas x where x.conta_id = p_conta;
  elsif p_recurso = 'visoes' then
    select true, x.ate, x.promocao_ate into existe, ate, promocao_ate from privado.visoes_contas x where x.conta_id = p_conta;
  elsif p_recurso = 'contato_no_convite' then
    select true, x.ate, x.promocao_ate into existe, ate, promocao_ate from privado.contato_no_convite_contas x where x.conta_id = p_conta;
  end if;
  existe := coalesce(existe, false);
end
$$;

create or replace function privado.gravar_promocao(p_conta uuid, p_recurso text, p_fim timestamptz)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  if p_recurso = 'copiloto' then
    insert into privado.copiloto_contas as x (conta_id, ate, promocao_ate) values (p_conta, p_fim, p_fim)
    on conflict (conta_id) do update set ate = p_fim, promocao_ate = p_fim, promocao_avisada_em = null,
      liberado_em = case when x.ate is not null and x.ate <= now() then now() else x.liberado_em end;
  elsif p_recurso = 'testes' then
    insert into privado.testes_contas as x (conta_id, ate, promocao_ate) values (p_conta, p_fim, p_fim)
    on conflict (conta_id) do update set ate = p_fim, promocao_ate = p_fim, promocao_avisada_em = null,
      liberado_em = case when x.ate is not null and x.ate <= now() then now() else x.liberado_em end;
  elsif p_recurso = 'video' then
    insert into privado.video_contas as x (conta_id, ate, promocao_ate) values (p_conta, p_fim, p_fim)
    on conflict (conta_id) do update set ate = p_fim, promocao_ate = p_fim, promocao_avisada_em = null,
      liberado_em = case when x.ate is not null and x.ate <= now() then now() else x.liberado_em end;
  elsif p_recurso = 'automacoes' then
    insert into privado.automacoes_contas as x (conta_id, ate, promocao_ate) values (p_conta, p_fim, p_fim)
    on conflict (conta_id) do update set ate = p_fim, promocao_ate = p_fim, promocao_avisada_em = null,
      liberado_em = case when x.ate is not null and x.ate <= now() then now() else x.liberado_em end;
  elsif p_recurso = 'salarios' then
    insert into privado.salarios_contas as x (conta_id, ate, promocao_ate) values (p_conta, p_fim, p_fim)
    on conflict (conta_id) do update set ate = p_fim, promocao_ate = p_fim, promocao_avisada_em = null,
      liberado_em = case when x.ate is not null and x.ate <= now() then now() else x.liberado_em end;
  elsif p_recurso = 'visoes' then
    insert into privado.visoes_contas as x (conta_id, ate, promocao_ate) values (p_conta, p_fim, p_fim)
    on conflict (conta_id) do update set ate = p_fim, promocao_ate = p_fim, promocao_avisada_em = null,
      inicio = case when x.ate is not null and x.ate <= now() then now() else x.inicio end;
  elsif p_recurso = 'contato_no_convite' then
    insert into privado.contato_no_convite_contas as x (conta_id, ate, promocao_ate) values (p_conta, p_fim, p_fim)
    on conflict (conta_id) do update set ate = p_fim, promocao_ate = p_fim, promocao_avisada_em = null,
      inicio = case when x.ate is not null and x.ate <= now() then now() else x.inicio end;
  end if;
end
$$;

create or replace function privado.assina_o_recurso(p_conta uuid, p_recurso text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (p_recurso = 'visoes' and privado.visoes_com_plano(p_conta))
      or (p_recurso = 'contato_no_convite' and privado.contato_no_convite_com_plano(p_conta))
      or exists (select 1 from privado.assinaturas a
                  where a.conta_id = p_conta and a.situacao = 'ativa'
                    and (a.recurso = p_recurso or privado.libera_tudo(a.recurso)
                         or (a.recurso = 'combo' and p_recurso in ('copiloto', 'testes'))))
$$;

create or replace function public.equipe_liberar_promocao(p_conta uuid, p_recursos text[], p_ate date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_fim timestamptz;
  v_nome text;
  v_tipo text;
  r text;
  l record;
  v_liberados text[] := '{}';
  v_pulados jsonb := '[]'::jsonb;
  v_lista text;
  v_link text;
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike libera recursos.' using errcode = '42501';
  end if;
  select p.nome, p.tipo into v_nome, v_tipo from public.perfis p where p.id = p_conta;
  if v_nome is null then
    raise exception 'Conta não encontrada.' using errcode = 'P0002';
  end if;
  if v_tipo not in ('comercio', 'empresa', 'agencia') then
    raise exception 'Só conta que contrata (comércio, empresa ou agência) usa os recursos pagos.' using errcode = 'P0001';
  end if;
  if p_ate is null or p_ate <= v_hoje or p_ate > v_hoje + 90 then
    raise exception 'Escolha uma data de amanhã até 90 dias.' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_recursos), 0) = 0 then
    raise exception 'Escolha ao menos um recurso.' using errcode = '22023';
  end if;
  -- até o fim do dia escolhido, em Goiânia
  v_fim := ((p_ate + 1)::timestamp - interval '1 second') at time zone 'America/Sao_Paulo';

  foreach r in array (select array_agg(distinct x) from unnest(p_recursos) x) loop
    if r not in ('copiloto', 'testes', 'video', 'automacoes', 'salarios', 'visoes', 'contato_no_convite') then
      raise exception 'Recurso inválido.' using errcode = '22023';
    end if;
    select * into l from privado.liberacao_do_recurso(p_conta, r);
    if privado.assina_o_recurso(p_conta, r) then
      v_pulados := v_pulados || jsonb_build_object('recurso', r, 'motivo', 'assina');
    elsif l.existe and l.ate is null then
      v_pulados := v_pulados || jsonb_build_object('recurso', r, 'motivo', 'sem_prazo');
    elsif l.existe and l.ate > v_fim and l.promocao_ate is distinct from l.ate then
      v_pulados := v_pulados || jsonb_build_object('recurso', r, 'motivo', 'ate_mais_tarde', 'ate', l.ate);
    else
      perform privado.gravar_promocao(p_conta, r, v_fim);
      v_liberados := v_liberados || r;
    end if;
  end loop;

  if cardinality(v_liberados) > 0 then
    select string_agg(privado.nome_do_recurso_pago(x), ', ' order by o) into v_lista
      from unnest(v_liberados) with ordinality as t(x, o);
    -- "a Triagem com IA, o Teste Prático" → "a Triagem com IA e o Teste Prático"
    v_lista := regexp_replace(v_lista, ', ([^,]+)$', ' e \1');
    v_link := case v_liberados[1] when 'copiloto' then '/painel/copiloto' when 'testes' then '/painel/testes'
                                  when 'video' then '/painel/video' when 'automacoes' then '/painel/automacoes'
                                  when 'salarios' then '/painel/salarios' when 'visoes' then '/painel/anuncios'
                                  else '/talentos' end;
    insert into public.notificacoes (destinatario_id, tipo, texto, link)
    values (p_conta, 'liberacao',
            left('Promoção de lançamento: o Publike liberou para você ' || v_lista || ', sem custo, até '
                 || to_char(p_ate, 'DD/MM') || '. Depois dessa data, o que você fizer fica guardado.', 300),
            v_link);
    perform privado.registrar('liberar_promocao', 'usuario', p_conta::text, v_nome,
                              jsonb_build_object('recursos', to_jsonb(v_liberados), 'ate', p_ate));
  end if;

  return jsonb_build_object('liberados', to_jsonb(v_liberados), 'pulados', v_pulados, 'ate', v_fim);
end
$$;

revoke execute on function public.equipe_liberar_promocao(uuid, text[], date) from public, anon;
grant execute on function public.equipe_liberar_promocao(uuid, text[], date) to authenticated, service_role;

create or replace function public.equipe_tirar_promocao(p_conta uuid, p_recurso text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer := 0;
  v_nome text;
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike tira recursos.' using errcode = '42501';
  end if;
  -- só a promoção valendo: a assinatura, os 15 dias e o sem prazo ficam
  if p_recurso = 'copiloto' then
    update privado.copiloto_contas x set ate = now(), promocao_ate = now()
     where x.conta_id = p_conta and x.promocao_ate = x.ate and x.ate > now();
  elsif p_recurso = 'testes' then
    update privado.testes_contas x set ate = now(), promocao_ate = now()
     where x.conta_id = p_conta and x.promocao_ate = x.ate and x.ate > now();
  elsif p_recurso = 'video' then
    update privado.video_contas x set ate = now(), promocao_ate = now()
     where x.conta_id = p_conta and x.promocao_ate = x.ate and x.ate > now();
  elsif p_recurso = 'automacoes' then
    update privado.automacoes_contas x set ate = now(), promocao_ate = now()
     where x.conta_id = p_conta and x.promocao_ate = x.ate and x.ate > now();
  elsif p_recurso = 'salarios' then
    update privado.salarios_contas x set ate = now(), promocao_ate = now()
     where x.conta_id = p_conta and x.promocao_ate = x.ate and x.ate > now();
  elsif p_recurso = 'visoes' then
    update privado.visoes_contas x set ate = now(), promocao_ate = now()
     where x.conta_id = p_conta and x.promocao_ate = x.ate and x.ate > now();
  elsif p_recurso = 'contato_no_convite' then
    update privado.contato_no_convite_contas x set ate = now(), promocao_ate = now()
     where x.conta_id = p_conta and x.promocao_ate = x.ate and x.ate > now();
  else
    raise exception 'Recurso inválido.' using errcode = '22023';
  end if;
  get diagnostics n = row_count;
  if n > 0 then
    select p.nome into v_nome from public.perfis p where p.id = p_conta;
    perform privado.registrar('tirar_promocao', 'usuario', p_conta::text, coalesce(v_nome, ''),
                              jsonb_build_object('recurso', p_recurso));
  end if;
  return n > 0;
end
$$;

revoke execute on function public.equipe_tirar_promocao(uuid, text) from public, anon;
grant execute on function public.equipe_tirar_promocao(uuid, text) to authenticated, service_role;

create or replace function public.equipe_buscar_contas(p_busca text)
returns table (id uuid, nome text, tipo text, email text, cnpj text, ja_tem text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text := btrim(coalesce(p_busca, ''));
  d text := regexp_replace(coalesce(p_busca, ''), '\D', '', 'g');
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike busca contas.' using errcode = '42501';
  end if;
  if char_length(q) < 2 then
    return;
  end if;
  return query
    select x.id, x.nome, x.tipo, x.email, x.cnpj, x.ja_tem
      from (
        select p.id, p.nome, p.tipo, u.email::text email, p.cnpj,
               array_remove(array[
                 case when privado.copiloto_liberado(p.id) or privado.assina_o_recurso(p.id, 'copiloto') then 'copiloto' end,
                 case when privado.testes_liberado(p.id) or privado.assina_o_recurso(p.id, 'testes') then 'testes' end,
                 case when privado.video_liberado(p.id) or privado.assina_o_recurso(p.id, 'video') then 'video' end,
                 case when privado.automacoes_liberado(p.id) or privado.assina_o_recurso(p.id, 'automacoes') then 'automacoes' end,
                 case when privado.salarios_liberado(p.id) or privado.assina_o_recurso(p.id, 'salarios') then 'salarios' end,
                 case when privado.visoes_com_plano(p.id)
                        or exists (select 1 from privado.visoes_contas v where v.conta_id = p.id and (v.ate is null or v.ate > now()))
                      then 'visoes' end,
                 case when privado.contato_no_convite_liberado(p.id) then 'contato_no_convite' end
               ], null) ja_tem
          from public.perfis p
          left join auth.users u on u.id = p.id
         where p.tipo in ('comercio', 'empresa', 'agencia')
           and (p.nome ilike '%' || q || '%'
                or (char_length(d) >= 5 and regexp_replace(coalesce(p.cnpj, ''), '\D', '', 'g') like d || '%')
                or (position('@' in q) > 0 and u.email ilike q || '%'))
         order by (p.nome ilike q || '%') desc, char_length(p.nome), p.nome
         limit 30
      ) x
     where cardinality(x.ja_tem) < 7
     limit 10;
end
$$;

create or replace function public.admin_recursos_pagos()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inicio timestamptz := privado.gratis_inicio_do_mes();
  v_lim_triagem integer := coalesce((select c.gratis_triagem_mes from privado.config_pagamentos c where c.id), 5);
  v_lim_gravadas integer := coalesce((select c.gratis_gravadas_mes from privado.config_pagamentos c where c.id), 5);
  v jsonb;
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike vê os recursos pagos.' using errcode = '42501';
  end if;

  with lib as (
    select 'copiloto'::text recurso, x.conta_id, x.liberado_em desde, x.ate, null::uuid pessoa_id, x.promocao_ate from privado.copiloto_contas x
    union all select 'testes', x.conta_id, x.liberado_em, x.ate, null, x.promocao_ate from privado.testes_contas x
    union all select 'video', x.conta_id, x.liberado_em, x.ate, null, x.promocao_ate from privado.video_contas x
    union all select 'automacoes', x.conta_id, x.liberado_em, x.ate, null, x.promocao_ate from privado.automacoes_contas x
    union all select 'salarios', x.conta_id, x.liberado_em, x.ate, null, x.promocao_ate from privado.salarios_contas x
    union all select 'contato_no_convite', x.conta_id, x.inicio, x.ate, x.pessoa_id, x.promocao_ate from privado.contato_no_convite_contas x
    union all select 'visoes', x.conta_id, x.inicio, x.ate, x.pessoa_id, x.promocao_ate from privado.visoes_contas x
  ), lib_como as (
    select l.*,
           -- a assinatura que cobre o recurso e valeu junto com a liberação
           (select a.id from privado.assinaturas a
             where a.conta_id = l.conta_id
               and (a.recurso = l.recurso
                    or (a.recurso = 'combo' and l.recurso in ('copiloto', 'testes'))
                    or (a.recurso in ('completo', 'empresa_5', 'empresa_20', 'empresa_50', 'agencia_15', 'agencia_200')
                        and l.recurso in ('copiloto', 'testes', 'video', 'automacoes', 'salarios')))
               and a.situacao in ('ativa', 'cancelada')
               and a.criada_em <= coalesce(l.ate, now()) + interval '1 day'
               and (a.cancelada_em is null or a.cancelada_em >= l.desde - interval '1 day')
             order by (a.situacao = 'ativa') desc, a.criada_em desc limit 1) assinatura_id,
           -- os 15 dias: o experimento que acaba junto com a liberação (Visões e Contato no convite: pedidos pela pessoa)
           exists (select 1 from privado.experimentos e
                    where e.conta_id = l.conta_id and e.recurso = l.recurso and l.ate is not null
                      and e.fim between l.ate - interval '1 day' and l.ate + interval '1 day')
             or (l.recurso in ('visoes', 'contato_no_convite') and l.pessoa_id is not null and l.ate is not null) quinze
      from lib l
  ), liberados as (
    select l.recurso, l.conta_id, p.nome, p.tipo, l.desde, l.ate,
           (l.ate is null or l.ate > now()) ativo,
           case when l.promocao_ate is not null and l.ate = l.promocao_ate then 'promocao'
                when l.quinze then '15_dias' when l.assinatura_id is not null then 'assinatura' else 'publike' end como,
           a.sandbox, a.valor, a.ciclo, a.situacao situacao_assinatura,
           exists (select 1 from privado.pagamentos_teste t where t.conta_id = l.conta_id) conta_de_teste,
           case l.recurso
             when 'copiloto' then (select count(*) from privado.copiloto_avaliacoes x join public.anuncios n on n.id = x.anuncio_id
                                    where n.autor_id = l.conta_id and x.criado_em >= v_inicio)
             when 'video' then (select count(*) from public.entrevistas_video e join public.anuncios n on n.id = e.anuncio_id
                                 where n.autor_id = l.conta_id and e.pedida_em >= v_inicio)
           end uso_no_mes
      from lib_como l
      join public.perfis p on p.id = l.conta_id
      left join privado.assinaturas a on a.id = l.assinatura_id and not l.quinze
  ), triagem as (
    select n.autor_id conta_id, count(*) lidos
      from privado.copiloto_avaliacoes x join public.anuncios n on n.id = x.anuncio_id
     where x.origem = 'candidato' and x.criado_em >= v_inicio
     group by n.autor_id
  ), gravadas as (
    select n.autor_id conta_id, count(*) pedidas, count(*) filter (where e.enviada_em is not null) enviadas
      from public.entrevistas_video e join public.anuncios n on n.id = e.anuncio_id
     where e.pedida_em >= v_inicio
     group by n.autor_id
  ), gratis as (
    select coalesce(t.conta_id, g.conta_id) conta_id, coalesce(t.lidos, 0) lidos,
           coalesce(g.pedidas, 0) pedidas, coalesce(g.enviadas, 0) enviadas
      from triagem t full join gravadas g on g.conta_id = t.conta_id
  ), gratis_contas as (
    select g.conta_id, p.nome, p.tipo,
           case when privado.copiloto_liberado(g.conta_id) then null else g.lidos end lidos,
           case when privado.video_liberado(g.conta_id) then null else g.pedidas end pedidas,
           g.enviadas,
           exists (select 1 from privado.pagamentos_teste t where t.conta_id = g.conta_id) conta_de_teste
      from gratis g join public.perfis p on p.id = g.conta_id
     where privado.contrata(g.conta_id)
  ), impulsos as (
    select i.conta_id, p.nome, p.tipo, count(*) total,
           count(*) filter (where i.origem = 'compra') compra,
           count(*) filter (where i.origem = 'credito') credito,
           count(*) filter (where i.origem = 'cortesia') cortesia,
           count(*) filter (where i.origem = 'admin') admin,
           count(*) filter (where i.automatico) automaticos,
           coalesce(sum(i.valor) filter (where not i.sandbox and i.origem = 'compra'), 0) valor,
           coalesce(sum(i.gasto), 0) gasto,
           max(i.criado_em) ultimo
      from privado.impulsos i join public.perfis p on p.id = i.conta_id
     where i.criado_em > now() - interval '60 days'
     group by i.conta_id, p.nome, p.tipo
  )
  select jsonb_build_object(
    'mes_desde', v_inicio,
    'limite_triagem', v_lim_triagem,
    'limite_gravadas', v_lim_gravadas,
    'liberados', coalesce((select jsonb_agg(to_jsonb(l) order by l.ativo desc, l.desde desc) from liberados l), '[]'::jsonb),
    'assinaturas', coalesce((select jsonb_agg(jsonb_build_object(
                                'conta_id', a.conta_id, 'nome', p.nome, 'recurso', a.recurso, 'ciclo', a.ciclo,
                                'valor', a.valor, 'forma', a.forma, 'situacao', a.situacao, 'sandbox', a.sandbox,
                                'criada_em', a.criada_em, 'cancelada_em', a.cancelada_em,
                                'conta_de_teste', exists (select 1 from privado.pagamentos_teste t where t.conta_id = a.conta_id))
                              order by (a.situacao = 'ativa') desc, a.sandbox, a.criada_em desc)
                               from (select * from privado.assinaturas order by criada_em desc limit 200) a
                               join public.perfis p on p.id = a.conta_id), '[]'::jsonb),
    'gratis', coalesce((select jsonb_agg(to_jsonb(g) order by coalesce(g.lidos, 0) + coalesce(g.pedidas, 0) desc, g.nome)
                          from gratis_contas g
                         where coalesce(g.lidos, 0) > 0 or coalesce(g.pedidas, 0) > 0), '[]'::jsonb),
    'impulsos', coalesce((select jsonb_agg(to_jsonb(i) order by i.total desc, i.ultimo desc) from impulsos i), '[]'::jsonb)
  ) into v;
  return v;
end
$$;

create or replace function public.servidor_avisar_liberacoes(p_chave text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_conta uuid;
  v_avisadas integer := 0;
  p record;
begin
  perform privado.exigir_servidor(p_chave);
  for v_conta in
    select pf.id from public.perfis pf
     where pf.tipo <> 'pessoa'
       and not exists (select 1 from privado.liberacoes_avisadas l
                        where l.conta_id = pf.id and l.funcionalidade = 'pagina_de_vagas')
       and privado.vagas_publicadas(pf.id) > 10
     limit 50
  loop
    if privado.avisar_liberacao(v_conta, 'pagina_de_vagas', false) then
      v_avisadas := v_avisadas + 1;
    end if;
  end loop;

  -- a promoção de lançamento acabando: uma notificação por conta, com os recursos que acabam
  for p in
    with acabando as (
      select 'copiloto' r, x.conta_id, x.ate from privado.copiloto_contas x
       where x.promocao_ate = x.ate and x.promocao_avisada_em is null and x.ate > now() and x.ate <= now() + interval '3 days'
      union all select 'testes', x.conta_id, x.ate from privado.testes_contas x
       where x.promocao_ate = x.ate and x.promocao_avisada_em is null and x.ate > now() and x.ate <= now() + interval '3 days'
      union all select 'video', x.conta_id, x.ate from privado.video_contas x
       where x.promocao_ate = x.ate and x.promocao_avisada_em is null and x.ate > now() and x.ate <= now() + interval '3 days'
      union all select 'automacoes', x.conta_id, x.ate from privado.automacoes_contas x
       where x.promocao_ate = x.ate and x.promocao_avisada_em is null and x.ate > now() and x.ate <= now() + interval '3 days'
      union all select 'salarios', x.conta_id, x.ate from privado.salarios_contas x
       where x.promocao_ate = x.ate and x.promocao_avisada_em is null and x.ate > now() and x.ate <= now() + interval '3 days'
      union all select 'visoes', x.conta_id, x.ate from privado.visoes_contas x
       where x.promocao_ate = x.ate and x.promocao_avisada_em is null and x.ate > now() and x.ate <= now() + interval '3 days'
      union all select 'contato_no_convite', x.conta_id, x.ate from privado.contato_no_convite_contas x
       where x.promocao_ate = x.ate and x.promocao_avisada_em is null and x.ate > now() and x.ate <= now() + interval '3 days'
    )
    select a.conta_id, min(a.ate) ate, array_agg(a.r order by a.r) recursos
      from acabando a
     where not privado.assina_o_recurso(a.conta_id, a.r)
     group by a.conta_id
     limit 50
  loop
    insert into public.notificacoes (destinatario_id, tipo, texto, link)
    values (p.conta_id, 'liberacao',
            left('A promoção de lançamento acaba em ' || to_char(p.ate at time zone 'America/Sao_Paulo', 'DD/MM') || ': '
                 || regexp_replace((select string_agg(privado.nome_do_recurso_pago(x), ', ') from unnest(p.recursos) x),
                                   ', ([^,]+)$', ' e \1')
                 || '. Para continuar usando, assine o que precisar. O que você fez fica guardado.', 300),
            '/painel/planos');
    update privado.copiloto_contas set promocao_avisada_em = now() where conta_id = p.conta_id and 'copiloto' = any (p.recursos);
    update privado.testes_contas set promocao_avisada_em = now() where conta_id = p.conta_id and 'testes' = any (p.recursos);
    update privado.video_contas set promocao_avisada_em = now() where conta_id = p.conta_id and 'video' = any (p.recursos);
    update privado.automacoes_contas set promocao_avisada_em = now() where conta_id = p.conta_id and 'automacoes' = any (p.recursos);
    update privado.salarios_contas set promocao_avisada_em = now() where conta_id = p.conta_id and 'salarios' = any (p.recursos);
    update privado.visoes_contas set promocao_avisada_em = now() where conta_id = p.conta_id and 'visoes' = any (p.recursos);
    update privado.contato_no_convite_contas set promocao_avisada_em = now()
     where conta_id = p.conta_id and 'contato_no_convite' = any (p.recursos);
    v_avisadas := v_avisadas + 1;
  end loop;
  return v_avisadas;
end
$$;


-- o Contato no convite na promoção: os 30 contatos por dia do plano
create or replace function privado.contato_no_convite_limite(p_conta uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when privado.contato_no_convite_com_plano(p_conta)
                or exists (select 1 from privado.contato_no_convite_contas x
                            where x.conta_id = p_conta
                              and (x.ate is null or (x.promocao_ate = x.ate and x.ate > now())))
              then 30 else 5 end
$$;

-- o estado para a conta: "testou" só quando alguém testou os 15 dias; e a promoção
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
      'testou', v.pessoa_id is not null,
      'sem_prazo', v.conta_id is not null and v.ate is null,
      'ate', case when v.ate > now() then v.ate end,
      'promocao', coalesce(v.promocao_ate = v.ate and v.ate > now(), false))
      from (select 1) um
      left join privado.visoes_contas v on v.conta_id = public.conta_atual())
  end
$$;

create or replace function public.meu_contato_no_convite()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when (select auth.uid()) is null then null else (
    select jsonb_build_object(
      'plano', privado.contato_no_convite_com_plano(public.conta_atual()),
      'testou', x.pessoa_id is not null,
      'sem_prazo', x.conta_id is not null and x.ate is null,
      'ate', case when x.ate > now() then x.ate end,
      'promocao', coalesce(x.promocao_ate = x.ate and x.ate > now(), false),
      'limite', privado.contato_no_convite_limite(public.conta_atual()),
      'hoje', privado.contato_no_convite_hoje(public.conta_atual()),
      'vale_em', (select r.vale_em from privado.contato_no_convite_regra r))
      from (select 1) um
      left join privado.contato_no_convite_contas x on x.conta_id = public.conta_atual())
  end
$$;

-- os 15 dias grátis: só uma vez por conta, mas a promoção (ou a liberação que já acabou) não conta como teste
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
  if exists (select 1 from privado.visoes_contas v
              where v.conta_id = conta and (v.pessoa_id is not null or v.ate is null or v.ate > now())) then
    raise exception 'Sua conta já usou os 15 dias grátis das visões. Elas continuam nos planos.'
      using errcode = 'P0001', hint = 'ja_testou';
  end if;
  insert into privado.visoes_contas as v (conta_id, ate, pessoa_id) values (conta, v_fim, (select auth.uid()))
  on conflict (conta_id) do update set ate = v_fim, pessoa_id = (select auth.uid()), inicio = now(), promocao_ate = null;
  return v_fim;
end
$$;

create or replace function public.testar_contato_no_convite()
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
  if privado.contato_no_convite_com_plano(conta) then
    raise exception 'O contato no convite já vem no seu plano.' using errcode = 'P0001';
  end if;
  if exists (select 1 from privado.contato_no_convite_contas x
              where x.conta_id = conta and (x.pessoa_id is not null or x.ate is null or x.ate > now())) then
    raise exception 'Sua conta já usou os 15 dias grátis do contato no convite. Ele continua nos planos.'
      using errcode = 'P0001', hint = 'ja_testou';
  end if;
  insert into privado.contato_no_convite_contas as x (conta_id, ate, pessoa_id) values (conta, v_fim, (select auth.uid()))
  on conflict (conta_id) do update set ate = v_fim, pessoa_id = (select auth.uid()), inicio = now(), promocao_ate = null;
  return v_fim;
end
$$;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270918140000_promocao_visoes_e_contato');
