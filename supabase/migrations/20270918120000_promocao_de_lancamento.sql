-- A promoção de lançamento (23/11/2026; Marcelo: "gostaria que o usuário tivesse a liberação, mas que fique sempre
-- claro que é momentâneo, uma promoção de lançamento"; escolhas: as contas que a equipe escolher, sempre com data de
-- fim, e a equipe publike.org libera também pelo site, com tudo no registro da equipe).
--   * Os recursos pagos (Triagem, Teste Prático, Entrevista em vídeo, Automações e Salários) ganham `promocao_ate`: a
--     liberação vale como promoção enquanto `ate = promocao_ate`. A assinatura, os 15 dias e o Liberar sem prazo do
--     Admin mudam o `ate` e a marca some sozinha.
--   * `equipe_liberar_promocao` (Admin › Recursos pagos): libera até o fim do dia escolhido (até 90 dias), sem mexer em
--     quem assina, em quem já tem sem prazo ou em quem já tem até mais tarde; a conta recebe o aviso no sino (e o
--     e-mail e o celular, pelas filas) dizendo que é promoção de lançamento e até quando.
--   * `equipe_tirar_promocao`: acaba agora.
--   * `equipe_buscar_contas`: acha a conta que contrata pelo nome, CNPJ ou e-mail.
--   * `recursos_pagos()` diz `promocao` em cada recurso (o selo "Promoção até 23/12" e a faixa da página).
--   * `servidor_avisar_liberacoes` também avisa 3 dias antes do fim da promoção, uma vez.
--   * `admin_recursos_pagos` abre também para a equipe publike.org, no site, e mostra "Promoção de lançamento".
-- Pode rodar de novo.

alter table privado.copiloto_contas add column if not exists promocao_ate timestamptz;
alter table privado.copiloto_contas add column if not exists promocao_avisada_em timestamptz;
alter table privado.testes_contas add column if not exists promocao_ate timestamptz;
alter table privado.testes_contas add column if not exists promocao_avisada_em timestamptz;
alter table privado.video_contas add column if not exists promocao_ate timestamptz;
alter table privado.video_contas add column if not exists promocao_avisada_em timestamptz;
alter table privado.automacoes_contas add column if not exists promocao_ate timestamptz;
alter table privado.automacoes_contas add column if not exists promocao_avisada_em timestamptz;
alter table privado.salarios_contas add column if not exists promocao_ate timestamptz;
alter table privado.salarios_contas add column if not exists promocao_avisada_em timestamptz;

-- o nome do recurso nas frases ("a Triagem com IA")
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
         end
$$;

-- a liberação de um recurso da conta: o ate, a promoção e se existe a linha
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
  end if;
  existe := coalesce(existe, false);
end
$$;

-- grava a liberação (nova ou por cima da que acabou ou acaba antes)
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
  end if;
end
$$;

-- a assinatura valendo que já cobre o recurso
create or replace function privado.assina_o_recurso(p_conta uuid, p_recurso text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from privado.assinaturas a
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
    if r not in ('copiloto', 'testes', 'video', 'automacoes', 'salarios') then
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
                                  else '/painel/salarios' end;
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

-- achar a conta que contrata: nome, CNPJ (só os números) ou e-mail
create or replace function public.equipe_buscar_contas(p_busca text)
returns table (id uuid, nome text, tipo text, email text, cnpj text)
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
    select p.id, p.nome, p.tipo, u.email::text, p.cnpj
      from public.perfis p
      left join auth.users u on u.id = p.id
     where p.tipo in ('comercio', 'empresa', 'agencia')
       and (p.nome ilike '%' || q || '%'
            or (char_length(d) >= 5 and regexp_replace(coalesce(p.cnpj, ''), '\D', '', 'g') like d || '%')
            or (position('@' in q) > 0 and u.email ilike q || '%'))
     order by (p.nome ilike q || '%') desc, char_length(p.nome), p.nome
     limit 10;
end
$$;
revoke execute on function public.equipe_buscar_contas(text) from public, anon;
grant execute on function public.equipe_buscar_contas(text) to authenticated, service_role;

create or replace function public.recursos_pagos()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  conta uuid := public.conta_atual();
  contrata boolean;
  pagar boolean;
  r text;
  ate_ timestamptz;
  promo_ timestamptz;
  tem boolean;
  e privado.experimentos;
  assina boolean;
  combo boolean;
  completo boolean;
  saida jsonb := '{}'::jsonb;
begin
  if (select auth.uid()) is null or conta is null then
    return null;
  end if;
  select p.tipo in ('comercio', 'empresa', 'agencia') into contrata from public.perfis p where p.id = conta;
  pagar := privado.pode_pagar(conta);
  -- o combo valendo (ou o Pix do combo esperando a 1ª fatura)
  combo := exists (select 1 from privado.assinaturas a
                    where a.conta_id = conta and a.recurso = 'combo'
                      and (a.situacao = 'ativa' or (a.situacao = 'pendente' and a.asaas_id is not null)));
  -- o Plano Completo valendo (ou o Pix dele esperando a 1ª fatura): vale pelos quatro
  completo := exists (select 1 from privado.assinaturas a
                       where a.conta_id = conta and privado.libera_tudo(a.recurso)
                         and (a.situacao = 'ativa' or (a.situacao = 'pendente' and a.asaas_id is not null)));
  foreach r in array array['copiloto', 'testes', 'video', 'automacoes', 'salarios'] loop
    if r = 'copiloto' then
      select true, c.ate, c.promocao_ate into tem, ate_, promo_ from privado.copiloto_contas c where c.conta_id = conta;
    elsif r = 'video' then
      select true, v.ate, v.promocao_ate into tem, ate_, promo_ from privado.video_contas v where v.conta_id = conta;
    elsif r = 'automacoes' then
      select true, v.ate, v.promocao_ate into tem, ate_, promo_ from privado.automacoes_contas v where v.conta_id = conta;
    elsif r = 'salarios' then
      select true, v.ate, v.promocao_ate into tem, ate_, promo_ from privado.salarios_contas v where v.conta_id = conta;
    else
      select true, t.ate, t.promocao_ate into tem, ate_, promo_ from privado.testes_contas t where t.conta_id = conta;
    end if;
    select * into e from privado.experimentos x where x.conta_id = conta and x.recurso = r;
    assina := exists (select 1 from privado.assinaturas a
                       where a.conta_id = conta and a.situacao = 'ativa'
                         and (a.recurso = r or privado.libera_tudo(a.recurso) or (a.recurso = 'combo' and r in ('copiloto', 'testes'))));
    saida := saida || jsonb_build_object(r, jsonb_build_object(
      'liberado', coalesce(tem, false) and (ate_ is null or ate_ > now()),
      'ate', case when coalesce(tem, false) then ate_ end,
      -- a promoção de lançamento (migração 20270918120000): liberada pela equipe até uma data, sem custo
      'promocao', coalesce(tem, false) and promo_ is not null and ate_ = promo_ and ate_ > now(),
      'experimentou', e.conta_id is not null,
      'fim_experimento', e.fim,
      'quer_continuar', e.quer_continuar_em is not null,
      -- a Consulta de salários não tem dias grátis: tem as consultas grátis (as de boas-vindas e as das vagas)
      'pode_experimentar', coalesce(contrata, false) and e.conta_id is null and r <> 'salarios'
                           and not (coalesce(tem, false) and (ate_ is null or ate_ > now())),
      'assinante', assina,
      -- assinar: quem pode pagar, sem a liberação sem prazo e sem assinatura valendo (nem o combo), com plano à venda
      'pode_assinar', pagar and not assina and not (combo and r in ('copiloto', 'testes')) and not completo
                      and not (coalesce(tem, false) and ate_ is null)
                      -- o Pix já assinado, esperando a 1ª fatura
                      and not exists (select 1 from privado.assinaturas a
                                       where a.conta_id = conta and a.recurso = r and a.situacao = 'pendente'
                                         and a.asaas_id is not null)
                      and exists (select 1 from privado.planos pl
                                   where pl.recurso = r and pl.ligado and pl.valor is not null)));
    tem := null; ate_ := null; promo_ := null; e := null;
  end loop;
  -- o grátis de cada mês (migração 20270730120000): o que a conta tem e já usou, fora dos dias liberados
  if privado.triagem_modo(conta) = 'gratis' then
    saida := jsonb_set(saida, '{copiloto,gratis}', jsonb_build_object(
      'limite', privado.gratis_do_mes(conta, 'triagem'),
      'usados', privado.triagem_lidos_no_mes(conta),
      'renova_em', privado.gratis_renova_em()));
  end if;
  if privado.video_gratis(conta) then
    saida := jsonb_set(saida, '{video,gratis}', jsonb_build_object(
      'limite', privado.gratis_do_mes(conta, 'gravadas'),
      'usados', privado.gravadas_no_mes(conta),
      'ao_vivo_limite', privado.gratis_do_mes(conta, 'ao_vivo'),
      'ao_vivo_usados', privado.ao_vivo_no_mes(conta, now()),
      'renova_em', privado.gratis_renova_em()));
  end if;
  return saida;
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
    union all select 'contato_no_convite', x.conta_id, x.inicio, x.ate, x.pessoa_id, null from privado.contato_no_convite_contas x
    union all select 'visoes', x.conta_id, x.inicio, x.ate, x.pessoa_id, null from privado.visoes_contas x
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
revoke execute on function public.admin_recursos_pagos() from public, anon;
grant execute on function public.admin_recursos_pagos() to authenticated, service_role;

-- o robô das filas: a página de carreiras liberada pela meta e, 3 dias antes do fim, o aviso da promoção (uma vez)
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
    v_avisadas := v_avisadas + 1;
  end loop;
  return v_avisadas;
end
$$;
revoke execute on function public.servidor_avisar_liberacoes(text) from public;
grant execute on function public.servidor_avisar_liberacoes(text) to anon, authenticated, service_role;

-- a tela no site: só a equipe publike.org (Admin › Quem vê cada tela)
insert into privado.telas_do_admin (rota, somente_publike) values ('/admin/recursos-pagos', true)
on conflict (rota) do nothing;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270918120000_promocao_de_lancamento');
