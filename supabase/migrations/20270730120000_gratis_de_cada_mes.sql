-- O grátis de cada mês (18/11/2026). Marcelo: "deixar um pouquinho de cada coisa no gratuito, o tira gosto [...]
-- os 15 dias gratis como premium [...] que o usuário saiba disso. Limites estabelecidos" e "entrevistas gravadas 5
-- no mes". Os 15 dias grátis continuam com tudo liberado. Fora deles (e antes deles, para quem ainda não
-- experimentou), toda conta que contrata (comércio, empresa, agência) tem, todo mês:
--   - Triagem com IA: a IA lê 5 candidatos (só quem se candidatou; buscar em Talentos fica com a assinatura);
--   - Entrevista em vídeo: 5 entrevistas gravadas e 1 ao vivo pelo Publike (pedir a todo novo candidato fica com
--     a assinatura);
--   - o Teste Prático (o teste da Publike da vaga) e as Automações (as 5 prontas) já tinham a parte grátis.
-- O mês é o de Goiânia (America/Sao_Paulo), do dia 1º às 0h. Os números ficam em privado.config_pagamentos e mudam
-- em Admin › Pagamentos (0 desliga). O que conta:
--   - Triagem: os candidatos lidos no mês nas vagas da conta, contando também o que foi lido nos 15 dias do mesmo
--     mês. Ler de novo a mesma pessoa na mesma vaga, no mesmo mês (os critérios mudaram), não conta outra vez.
--   - Gravadas: os pedidos do mês. Pedir de novo, no mesmo mês, a quem deixou vencer não conta outra vez; o pedido
--     cancelado continua contando.
--   - Ao vivo: as entrevistas pelo Publike do mês, como no limite dos planos (privado.limite_ao_vivo).
-- Pode rodar de novo.

-- 1. Os números --------------------------------------------------------------------------------------------------

alter table privado.config_pagamentos add column if not exists gratis_triagem_mes integer not null default 5;
alter table privado.config_pagamentos add column if not exists gratis_gravadas_mes integer not null default 5;
alter table privado.config_pagamentos add column if not exists gratis_ao_vivo_mes integer not null default 1;
alter table privado.config_pagamentos drop constraint if exists config_pagamentos_gratis_check;
alter table privado.config_pagamentos add constraint config_pagamentos_gratis_check
  check (gratis_triagem_mes between 0 and 1000 and gratis_gravadas_mes between 0 and 1000
         and gratis_ao_vivo_mes between 0 and 100);

-- o mês do grátis: de 1º às 0h, em Goiânia
create or replace function privado.gratis_inicio_do_mes()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
$$;

create or replace function privado.gratis_renova_em()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (date_trunc('month', now() at time zone 'America/Sao_Paulo') + interval '1 month') at time zone 'America/Sao_Paulo'
$$;

-- quanto a conta tem de graça por mês ('triagem', 'gravadas' ou 'ao_vivo'); 0 para quem não contrata
create or replace function privado.gratis_do_mes(p_conta uuid, p_o_que text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when p_conta is null or not privado.contrata(p_conta) then 0
           else coalesce(
             (select case p_o_que when 'triagem' then c.gratis_triagem_mes
                                  when 'gravadas' then c.gratis_gravadas_mes
                                  when 'ao_vivo' then c.gratis_ao_vivo_mes end
                from privado.config_pagamentos c where c.id),
             case p_o_que when 'triagem' then 5 when 'gravadas' then 5 when 'ao_vivo' then 1 else 0 end)
         end
$$;

-- os candidatos que a IA leu neste mês, nas vagas da conta (uma linha por pessoa e vaga)
create or replace function privado.triagem_lidos_no_mes(p_conta uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from privado.copiloto_avaliacoes l
    join public.anuncios a on a.id = l.anuncio_id
   where a.autor_id = p_conta and l.origem = 'candidato' and l.criado_em >= privado.gratis_inicio_do_mes()
$$;

-- as entrevistas gravadas pedidas neste mês, nas vagas da conta
create or replace function privado.gravadas_no_mes(p_conta uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.entrevistas_video e
    join public.anuncios a on a.id = e.anuncio_id
   where a.autor_id = p_conta and e.pedida_em >= privado.gratis_inicio_do_mes()
$$;

-- a Triagem da conta: 'paga' (a assinatura, os 15 dias ou liberada pelo Publike), 'gratis' (o grátis do mês) ou null
create or replace function privado.triagem_modo(p_conta uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when privado.copiloto_liberado(p_conta) then 'paga'
              when privado.gratis_do_mes(p_conta, 'triagem') > 0 then 'gratis' end
$$;

-- quantos candidatos a IA ainda lê de graça neste mês (null: a Triagem paga, sem esse limite)
create or replace function privado.triagem_restam(p_conta uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when privado.copiloto_liberado(p_conta) then null
              else greatest(0, privado.gratis_do_mes(p_conta, 'triagem') - privado.triagem_lidos_no_mes(p_conta)) end
$$;

-- a Entrevista em vídeo no grátis do mês (sem o recurso, e com gravadas ou ao vivo de graça)
create or replace function privado.video_gratis(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not privado.video_liberado(p_conta)
         and (privado.gratis_do_mes(p_conta, 'gravadas') > 0 or privado.gratis_do_mes(p_conta, 'ao_vivo') > 0)
$$;

-- a pessoa já foi lida neste mês nesta vaga (ler de novo não gasta outro)
create or replace function privado.triagem_lida_no_mes(p_anuncio uuid, p_perfil uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privado.copiloto_avaliacoes l
                  where l.anuncio_id = p_anuncio and l.perfil_id = p_perfil and l.origem = 'candidato'
                    and l.criado_em >= privado.gratis_inicio_do_mes())
$$;

revoke all on function privado.gratis_inicio_do_mes(), privado.gratis_renova_em(), privado.gratis_do_mes(uuid, text),
  privado.triagem_lidos_no_mes(uuid), privado.gravadas_no_mes(uuid), privado.triagem_modo(uuid),
  privado.triagem_restam(uuid), privado.video_gratis(uuid), privado.triagem_lida_no_mes(uuid, uuid)
  from public, anon, authenticated;

-- 2. A Triagem com IA -------------------------------------------------------------------------------------------

-- a vaga é da conta e a Triagem abre (paga ou no grátis do mês)
create or replace function privado.copiloto_minha_vaga(p_anuncio uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_conta_ativa();
  if not exists (select 1 from public.anuncios a
                  where a.id = p_anuncio and a.tipo = 'vaga' and a.autor_id = public.conta_atual()) then
    raise exception 'Vaga não encontrada.' using errcode = 'P0001';
  end if;
  if privado.triagem_modo(public.conta_atual()) is null then
    raise exception 'A Triagem com IA não está liberada para a sua conta.' using errcode = 'P0001',
      hint = 'copiloto_fechado';
  end if;
end
$$;

create or replace function public.copiloto_da_vaga(p_anuncio uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  conta uuid := public.conta_atual();
  modo text;
  c privado.copiloto_contas;
  v privado.copiloto_vagas;
begin
  if not exists (select 1 from public.anuncios a
                  where a.id = p_anuncio and a.tipo = 'vaga' and a.autor_id = conta) then
    raise exception 'Vaga não encontrada.' using errcode = 'P0001';
  end if;
  modo := privado.triagem_modo(conta);
  if modo is null then
    return jsonb_build_object('liberado', false);
  end if;
  select * into c from privado.copiloto_contas x where x.conta_id = conta;
  select * into v from privado.copiloto_vagas x where x.anuncio_id = p_anuncio;
  return jsonb_build_object(
    'liberado', modo = 'paga',
    'criterios', coalesce(v.criterios, '[]'::jsonb),
    'versao', coalesce(v.versao, ''),
    'triagem', coalesce(v.triagem, c.triagem, true),
    -- buscar em Talentos é da assinatura
    'busca', modo = 'paga' and coalesce(v.busca, c.busca, true),
    'atualizado_em', v.atualizado_em,
    'padrao_triagem', coalesce(c.triagem, true),
    'padrao_busca', modo = 'paga' and coalesce(c.busca, true),
    'automaticos', coalesce(v.automaticos, false),
    'teto', coalesce(v.teto_leitura, 50),
    'gratis', case when modo = 'gratis' then jsonb_build_object(
                'limite', privado.gratis_do_mes(conta, 'triagem'),
                'usados', privado.triagem_lidos_no_mes(conta),
                'renova_em', privado.gratis_renova_em()) end);
end
$$;

create or replace function public.copiloto_reservar(p_anuncio uuid, p_origem text, p_quantos integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := public.conta_atual();
  modo text;
  usados integer;
  pode integer;
  restam integer;
  ultimo privado.copiloto_registro;
begin
  perform privado.copiloto_minha_vaga(p_anuncio);
  if p_origem not in ('candidato', 'talento') or p_quantos not between 1 and 24 then
    raise exception 'Pedido inválido.' using errcode = 'P0001';
  end if;
  modo := privado.triagem_modo(conta);
  if modo = 'gratis' and p_origem <> 'candidato' then
    raise exception 'Buscar em Talentos vem com a assinatura da Triagem com IA.' using errcode = 'P0001',
      hint = 'triagem_paga';
  end if;
  if not coalesce((select c.ia_melhorar_texto from public.config_site c limit 1), false) then
    raise exception 'A ajuda da IA está desligada agora.' using errcode = 'P0001', hint = 'ia_desligada';
  end if;
  perform pg_advisory_xact_lock(hashtext('publike:copiloto:' || conta::text));
  select count(*) into usados from privado.limites_uso l
   where l.perfil_id = conta and l.acao = 'copiloto' and l.criado_em > now() - interval '24 hours';
  pode := least(p_quantos, 300 - usados);
  if pode <= 0 then
    raise exception 'O copiloto já leu 300 currículos hoje nesta conta. Amanhã ele continua.'
      using errcode = 'P0001', hint = 'limite_copiloto';
  end if;
  -- o grátis do mês: só o que ainda sobra
  if modo = 'gratis' then
    restam := privado.triagem_restam(conta);
    if restam <= 0 then
      raise exception 'Os % candidatos grátis deste mês já foram lidos. Assine a Triagem com IA para ler todos, ou espere o dia 1º do mês que vem.',
        privado.gratis_do_mes(conta, 'triagem') using errcode = 'P0001', hint = 'triagem_gratis_acabou';
    end if;
    pode := least(pode, restam);
  end if;
  insert into privado.limites_uso (perfil_id, acao) select conta, 'copiloto' from generate_series(1, pode);
  select * into ultimo from privado.copiloto_registro r where r.anuncio_id = p_anuncio
   order by r.criado_em desc, r.id desc limit 1;
  if found and ultimo.acao = 'avaliou' and ultimo.detalhe = p_origem and ultimo.criado_em > now() - interval '15 minutes' then
    update privado.copiloto_registro set quantos = quantos + pode, criado_em = now() where id = ultimo.id;
  else
    insert into privado.copiloto_registro (anuncio_id, conta_id, pessoa_id, acao, quantos, detalhe)
    values (p_anuncio, conta, (select auth.uid()), 'avaliou', pode, p_origem);
  end if;
  return pode;
end
$$;

create or replace function public.copiloto_guardar(
  p_anuncio uuid, p_perfil uuid, p_origem text, p_versao text, p_curriculo_em timestamptz, p_resultado jsonb,
  p_atende integer, p_obrigatorios_ok boolean, p_modelo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := public.conta_atual();
begin
  perform privado.copiloto_minha_vaga(p_anuncio);
  if p_origem = 'talento' then
    if privado.triagem_modo(conta) = 'gratis' then
      raise exception 'Buscar em Talentos vem com a assinatura da Triagem com IA.' using errcode = 'P0001',
        hint = 'triagem_paga';
    end if;
    if not exists (select 1 from public.curriculo_visivel v where v.perfil_id = p_perfil) then
      raise exception 'Essa pessoa não está mais em Talentos.' using errcode = 'P0001';
    end if;
  elsif p_origem = 'candidato' then
    if not exists (select 1 from public.curtidas k where k.anuncio_id = p_anuncio and k.perfil_id = p_perfil) then
      raise exception 'Candidato não encontrado.' using errcode = 'P0001';
    end if;
  else
    raise exception 'Pedido inválido.' using errcode = 'P0001';
  end if;
  -- o grátis do mês: uma pessoa nova só enquanto sobra (a trava junta as leituras que chegam ao mesmo tempo)
  if privado.triagem_modo(conta) = 'gratis' then
    perform pg_advisory_xact_lock(hashtext('publike:triagem_gratis:' || conta::text));
    if not privado.triagem_lida_no_mes(p_anuncio, p_perfil) and privado.triagem_restam(conta) <= 0 then
      raise exception 'Os % candidatos grátis deste mês já foram lidos. Assine a Triagem com IA para ler todos, ou espere o dia 1º do mês que vem.',
        privado.gratis_do_mes(conta, 'triagem') using errcode = 'P0001', hint = 'triagem_gratis_acabou';
    end if;
  end if;
  insert into privado.copiloto_avaliacoes
    (anuncio_id, perfil_id, origem, versao, curriculo_em, resultado, atende, obrigatorios_ok, modelo, criado_em)
  values (p_anuncio, p_perfil, p_origem, p_versao, p_curriculo_em, p_resultado, p_atende, p_obrigatorios_ok,
          left(p_modelo, 60), now())
  on conflict (anuncio_id, perfil_id) do update
    set origem = excluded.origem, versao = excluded.versao, curriculo_em = excluded.curriculo_em,
        resultado = excluded.resultado, atende = excluded.atende, obrigatorios_ok = excluded.obrigatorios_ok,
        modelo = excluded.modelo, criado_em = now();
end
$$;

create or replace function public.copiloto_ligar(p_anuncio uuid, p_triagem boolean, p_busca boolean, p_padrao boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.copiloto_minha_vaga(p_anuncio);
  if privado.triagem_modo(public.conta_atual()) = 'gratis' then
    if p_busca then
      raise exception 'Buscar em Talentos vem com a assinatura da Triagem com IA.' using errcode = 'P0001',
        hint = 'triagem_paga';
    end if;
    -- no grátis, só a leitura dos candidatos: a busca guardada fica como estava, para quando assinar
    insert into privado.copiloto_vagas (anuncio_id, triagem)
    values (p_anuncio, p_triagem)
    on conflict (anuncio_id) do update set triagem = excluded.triagem;
    if p_padrao then
      update privado.copiloto_contas set triagem = p_triagem where conta_id = public.conta_atual();
    end if;
  else
    insert into privado.copiloto_vagas (anuncio_id, triagem, busca)
    values (p_anuncio, p_triagem, p_busca)
    on conflict (anuncio_id) do update set triagem = excluded.triagem, busca = excluded.busca;
    if p_padrao then
      update privado.copiloto_contas set triagem = p_triagem, busca = p_busca where conta_id = public.conta_atual();
    end if;
  end if;
  insert into privado.copiloto_registro (anuncio_id, conta_id, pessoa_id, acao, detalhe)
  values (p_anuncio, public.conta_atual(), (select auth.uid()), 'ligou',
          concat_ws(',', case when p_busca then 'busca' end, case when p_triagem then 'triagem' end,
                    case when p_padrao then 'padrao' end));
end
$$;

-- salvar os critérios: a conta do grátis pode não ter a linha de privado.copiloto_contas (as escolhas de sempre)
create or replace function public.copiloto_salvar_criterios(p_anuncio uuid, p_criterios jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_versao text;
  c privado.copiloto_contas;
  obrigatorios integer;
begin
  perform privado.copiloto_minha_vaga(p_anuncio);
  perform privado.copiloto_conferir_criterios(p_criterios);
  v_versao := md5(p_criterios::text);
  select * into c from privado.copiloto_contas x where x.conta_id = public.conta_atual();
  insert into privado.copiloto_vagas (anuncio_id, criterios, versao, triagem, busca, atualizado_em, automaticos)
  values (p_anuncio, p_criterios, v_versao, coalesce(c.triagem, true), coalesce(c.busca, true), now(), false)
  on conflict (anuncio_id) do update
    set criterios = excluded.criterios, versao = excluded.versao, atualizado_em = now(), automaticos = false;
  select count(*) into obrigatorios from jsonb_array_elements(p_criterios) e where (e ->> 'obrigatorio')::boolean;
  insert into privado.copiloto_registro (anuncio_id, conta_id, pessoa_id, acao, quantos, detalhe)
  values (p_anuncio, public.conta_atual(), (select auth.uid()), 'criterios', jsonb_array_length(p_criterios),
          obrigatorios::text);
  return v_versao;
end
$$;

-- o aviso para quem se candidata: a vaga de quem usa a Triagem (paga ou no grátis do mês)
create or replace function public.vaga_usa_triagem(p_anuncio uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.anuncios a
      left join privado.copiloto_contas c on c.conta_id = a.autor_id
      left join privado.copiloto_vagas v on v.anuncio_id = a.id
     where a.id = p_anuncio and a.tipo = 'vaga' and a.status = 'ativo'
       and privado.triagem_modo(a.autor_id) is not null
       and coalesce(v.triagem, c.triagem, true))
$$;

-- o robô: os critérios das vagas novas, também no grátis do mês
create or replace function public.servidor_copiloto_vagas_sem_criterios(p_chave text, p_limite integer default 5)
returns table (anuncio_id uuid, conta_id uuid, vaga jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return query
    select a.id, a.autor_id,
           jsonb_build_object(
             'tipo', a.tipo, 'titulo', a.titulo, 'descricao', a.descricao, 'categoria', a.categoria,
             'regime', a.regime, 'pagamento_valor', a.pagamento_valor, 'pagamento_unidade', a.pagamento_unidade,
             'beneficios', a.beneficios, 'horario', a.horario, 'vagas', a.vagas, 'cidade', a.cidade,
             'bairro', a.bairro, 'ganhos_extras', a.ganhos_extras, 'escolaridade_minima', a.escolaridade_minima,
             'experiencia', a.experiencia, 'cnh', a.cnh, 'jornada', a.jornada, 'perguntas', a.perguntas)
      from public.anuncios a
      left join privado.copiloto_contas c on c.conta_id = a.autor_id
      left join privado.copiloto_vagas v on v.anuncio_id = a.id
     where a.tipo = 'vaga' and a.status = 'ativo' and a.criado_em > now() - interval '60 days'
       and privado.triagem_modo(a.autor_id) is not null
       and coalesce(v.triagem, c.triagem, true)
       and coalesce(jsonb_array_length(v.criterios), 0) = 0
     order by a.criado_em desc
     limit least(greatest(coalesce(p_limite, 5), 1), 20);
end
$$;

-- o robô: as vagas com candidato por ler. "restam": quantas leituras a conta ainda tem (as 300 de cada 24 horas e,
-- no grátis, o que sobra do mês); a conta do grátis sem nada sobrando fica de fora (não ocupa a vez das outras)
create or replace function public.servidor_copiloto_vagas_para_ler(p_chave text, p_limite integer default 5,
                                                                   p_anuncio uuid default null)
returns table (anuncio_id uuid, conta_id uuid, vaga jsonb, triagem_perguntas jsonb, criterios jsonb, versao text,
               teto integer, restam integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return query
    select a.id, a.autor_id,
           jsonb_build_object(
             'titulo', a.titulo, 'descricao', coalesce(a.descricao, ''), 'escolaridade_minima', a.escolaridade_minima,
             'experiencia', a.experiencia, 'cnh', a.cnh, 'cidade', a.cidade, 'bairro', a.bairro,
             'jornada', a.jornada, 'horario_detalhe', a.horario_detalhe, 'perguntas', a.perguntas),
           coalesce(vt.criterios, '{}'::jsonb), v.criterios, v.versao, v.teto_leitura,
           least(greatest(0, 300 - (select count(*)::integer from privado.limites_uso u
                                      where u.perfil_id = a.autor_id and u.acao = 'copiloto'
                                        and u.criado_em > now() - interval '24 hours')),
                 coalesce(privado.triagem_restam(a.autor_id), 300))
      from public.anuncios a
      left join privado.copiloto_contas c on c.conta_id = a.autor_id
      join privado.copiloto_vagas v on v.anuncio_id = a.id and jsonb_array_length(v.criterios) > 0
      left join public.vaga_triagem vt on vt.anuncio_id = a.id
     where a.tipo = 'vaga' and a.status = 'ativo'
       and (p_anuncio is null or a.id = p_anuncio)
       and privado.triagem_modo(a.autor_id) is not null
       and coalesce(privado.triagem_restam(a.autor_id), 1) > 0
       and coalesce(v.triagem, c.triagem, true)
       and exists (
         select 1 from public.curtidas k
           join public.curriculos cv on cv.perfil_id = k.perfil_id
           left join privado.copiloto_avaliacoes l on l.anuncio_id = a.id and l.perfil_id = k.perfil_id
          where k.anuncio_id = a.id and k.status <> 'dispensada'
            and (l.perfil_id is null or l.versao <> v.versao or l.curriculo_em <> cv.atualizado_em)
            and (v.fila_conferida_em is null or k.criado_em > v.fila_conferida_em
                 or cv.atualizado_em > v.fila_conferida_em or v.atualizado_em > v.fila_conferida_em
                 or vt.atualizado_em > v.fila_conferida_em))
     order by v.fila_conferida_em nulls first, a.criado_em
     limit least(greatest(coalesce(p_limite, 5), 1), 20);
end
$$;

-- o robô guarda a leitura: na conta do grátis, uma pessoa nova só enquanto sobra no mês
create or replace function public.servidor_copiloto_guardar(
  p_chave text, p_anuncio uuid, p_perfil uuid, p_versao text, p_curriculo_em timestamptz, p_resultado jsonb,
  p_atende integer, p_obrigatorios_ok boolean, p_modelo text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid;
  modo text;
  ultimo privado.copiloto_registro;
begin
  perform privado.exigir_servidor(p_chave);
  select a.autor_id into conta from public.anuncios a where a.id = p_anuncio and a.tipo = 'vaga';
  modo := privado.triagem_modo(conta);
  if conta is null or modo is null
     or not exists (select 1 from public.curtidas k where k.anuncio_id = p_anuncio and k.perfil_id = p_perfil)
     or jsonb_typeof(p_resultado) <> 'object' then
    return false;
  end if;
  if modo = 'gratis' then
    perform pg_advisory_xact_lock(hashtext('publike:triagem_gratis:' || conta::text));
    if not privado.triagem_lida_no_mes(p_anuncio, p_perfil) and privado.triagem_restam(conta) <= 0 then
      return false;
    end if;
  end if;
  insert into privado.copiloto_avaliacoes
    (anuncio_id, perfil_id, origem, versao, curriculo_em, resultado, atende, obrigatorios_ok, modelo, criado_em)
  values (p_anuncio, p_perfil, 'candidato', p_versao, p_curriculo_em, p_resultado, p_atende, p_obrigatorios_ok,
          left(p_modelo, 60), now())
  on conflict (anuncio_id, perfil_id) do update
    set origem = excluded.origem, versao = excluded.versao, curriculo_em = excluded.curriculo_em,
        resultado = excluded.resultado, atende = excluded.atende, obrigatorios_ok = excluded.obrigatorios_ok,
        modelo = excluded.modelo, criado_em = now();
  insert into privado.limites_uso (perfil_id, acao) values (conta, 'copiloto');
  select * into ultimo from privado.copiloto_registro r where r.anuncio_id = p_anuncio
   order by r.criado_em desc, r.id desc limit 1;
  if found and ultimo.acao = 'avaliou' and ultimo.detalhe = 'automatico'
     and ultimo.criado_em > now() - interval '15 minutes' then
    update privado.copiloto_registro set quantos = quantos + 1, criado_em = now() where id = ultimo.id;
  else
    insert into privado.copiloto_registro (anuncio_id, conta_id, pessoa_id, acao, quantos, detalhe)
    values (p_anuncio, conta, null, 'avaliou', 1, 'automatico');
  end if;
  return true;
end
$$;

-- o robô guarda os critérios que a IA montou: também no grátis do mês
create or replace function public.servidor_copiloto_criterios_automaticos(p_chave text, p_anuncio uuid, p_criterios jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid;
  c privado.copiloto_contas;
  v_versao text;
  obrigatorios integer;
begin
  perform privado.exigir_servidor(p_chave);
  select a.autor_id into conta from public.anuncios a where a.id = p_anuncio and a.tipo = 'vaga';
  if conta is null or privado.triagem_modo(conta) is null then
    return null;
  end if;
  if jsonb_typeof(p_criterios) <> 'array' or jsonb_array_length(p_criterios) = 0 then
    return null;
  end if;
  perform privado.copiloto_conferir_criterios(p_criterios);
  select * into c from privado.copiloto_contas x where x.conta_id = conta;
  v_versao := md5(p_criterios::text);
  insert into privado.copiloto_vagas (anuncio_id, criterios, versao, triagem, busca, atualizado_em, automaticos)
  values (p_anuncio, p_criterios, v_versao, coalesce(c.triagem, true), coalesce(c.busca, true), now(), true)
  on conflict (anuncio_id) do update
    set criterios = excluded.criterios, versao = excluded.versao, atualizado_em = now(), automaticos = true
    where jsonb_array_length(privado.copiloto_vagas.criterios) = 0;
  if not found then
    return null;
  end if;
  select count(*) into obrigatorios from jsonb_array_elements(p_criterios) e where (e ->> 'obrigatorio')::boolean;
  insert into privado.copiloto_registro (anuncio_id, conta_id, pessoa_id, acao, quantos, detalhe)
  values (p_anuncio, conta, null, 'criterios', jsonb_array_length(p_criterios), 'automatico:' || obrigatorios);
  return v_versao;
end
$$;

-- 3. A Entrevista em vídeo --------------------------------------------------------------------------------------

-- a Entrevista em vídeo abre: paga ou no grátis do mês (cada pedido confere o que sobra)
create or replace function privado.exigir_video()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not privado.video_liberado(public.conta_atual()) and not privado.video_gratis(public.conta_atual()) then
    raise exception 'A Entrevista em vídeo é um recurso pago. Experimente 15 dias grátis em Painel › Entrevista em vídeo.'
      using errcode = 'P0001', hint = 'video_fechado';
  end if;
end
$$;

create or replace function public.video_config(p_anuncio uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.anuncios := privado.minha_vaga_para_video(p_anuncio);
  c public.video_perguntas;
  conta uuid := public.conta_atual();
begin
  select * into c from public.video_perguntas v where v.anuncio_id = a.id;
  return jsonb_build_object(
    'perguntas', coalesce(c.perguntas, '[]'::jsonb),
    'segundos', coalesce(c.segundos, 90),
    'segunda_chance', coalesce(c.segunda_chance, true),
    'aceita_texto', coalesce(c.aceita_texto, true) or a.pcd = 'exclusiva',
    'pedir_a_todos', coalesce(c.pedir_a_todos, false),
    'dias', coalesce(c.dias, 5),
    'pcd', a.pcd = 'exclusiva',
    'liberado', privado.video_liberado(conta),
    'gratis', case when privado.video_gratis(conta) then jsonb_build_object(
                'limite', privado.gratis_do_mes(conta, 'gravadas'),
                'usados', privado.gravadas_no_mes(conta),
                'ao_vivo_limite', privado.gratis_do_mes(conta, 'ao_vivo'),
                'ao_vivo_usados', privado.ao_vivo_no_mes(conta, now()),
                'renova_em', privado.gratis_renova_em()) end);
end
$$;

create or replace function public.video_salvar_config(
  p_anuncio uuid, p_perguntas text[], p_segundos integer, p_segunda_chance boolean, p_aceita_texto boolean,
  p_pedir_a_todos boolean, p_dias integer default 5)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.anuncios := privado.minha_vaga_para_video(p_anuncio);
  v_lista jsonb := '[]'::jsonb;
  t text;
  i integer := 0;
begin
  perform privado.exigir_conta_ativa();
  perform privado.exigir_video();
  -- pedir a todo novo candidato é da assinatura
  if coalesce(p_pedir_a_todos, false) and not privado.video_liberado(public.conta_atual()) then
    raise exception 'Pedir a todo novo candidato vem com a assinatura da Entrevista em vídeo.' using errcode = 'P0001',
      hint = 'video_pago';
  end if;
  if coalesce(p_dias, 5) not in (2, 3, 5, 7, 10) then
    raise exception 'Escolha o prazo: 2, 3, 5, 7 ou 10 dias.' using errcode = '22023', hint = 'dias';
  end if;
  foreach t in array coalesce(p_perguntas, '{}') loop
    t := nullif(btrim(regexp_replace(coalesce(t, ''), '[[:space:]]+', ' ', 'g')), '');
    continue when t is null;
    if char_length(t) < 10 or char_length(t) > 300 then
      raise exception 'Cada pergunta tem de 10 a 300 letras.' using errcode = '22023', hint = 'perguntas';
    end if;
    if t ~* '(https?://|www\.|[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}|[0-9][0-9 ().-]{7,}[0-9])' then
      raise exception 'Tire telefone, e-mail e link das perguntas.' using errcode = '22023', hint = 'perguntas';
    end if;
    i := i + 1;
    v_lista := v_lista || jsonb_build_object('id', 'p' || i, 'texto', t);
  end loop;
  if i < 2 or i > 6 then
    raise exception 'Faça de 2 a 6 perguntas.' using errcode = '22023', hint = 'perguntas';
  end if;
  insert into public.video_perguntas (anuncio_id, perguntas, segundos, segunda_chance, aceita_texto, pedir_a_todos,
                                      dias, atualizado_em)
  values (a.id, v_lista, greatest(30, least(180, coalesce(p_segundos, 90))), coalesce(p_segunda_chance, true),
          coalesce(p_aceita_texto, true) or a.pcd = 'exclusiva', coalesce(p_pedir_a_todos, false), coalesce(p_dias, 5),
          now())
  on conflict (anuncio_id) do update
    set perguntas = excluded.perguntas, segundos = excluded.segundos, segunda_chance = excluded.segunda_chance,
        aceita_texto = excluded.aceita_texto, pedir_a_todos = excluded.pedir_a_todos, dias = excluded.dias,
        atualizado_em = now();
end
$$;

create or replace function public.video_pedir(p_anuncio uuid, p_perfis uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.anuncios := privado.minha_vaga_para_video(p_anuncio);
  conta uuid := public.conta_atual();
  p uuid;
  n integer := 0;
  v_limite integer;
  v_restam integer;
  v_novos integer;
begin
  perform privado.exigir_conta_ativa();
  perform privado.exigir_video();
  if cardinality(coalesce(p_perfis, '{}')) > 100 then
    raise exception 'Escolha até 100 pessoas de uma vez.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.video_perguntas v where v.anuncio_id = a.id and jsonb_array_length(v.perguntas) >= 2) then
    raise exception 'Monte as perguntas da vaga primeiro, na aba Entrevista em vídeo.' using errcode = 'P0001', hint = 'sem_perguntas';
  end if;
  -- o grátis do mês: as gravadas que sobram (a trava junta os pedidos que chegam ao mesmo tempo)
  if not privado.video_liberado(conta) then
    perform pg_advisory_xact_lock(hashtext('publike:video_gratis:' || conta::text));
    v_limite := privado.gratis_do_mes(conta, 'gravadas');
    if v_limite = 0 then
      raise exception 'A entrevista gravada vem com a assinatura da Entrevista em vídeo.' using errcode = 'P0001',
        hint = 'video_pago';
    end if;
    v_restam := greatest(0, v_limite - privado.gravadas_no_mes(conta));
    -- quem gasta um: o pedido novo, ou o de novo a quem tinha o pedido de um mês passado (vencido ou cancelado)
    select count(*) into v_novos
      from (select distinct x as perfil_id from unnest(coalesce(p_perfis, '{}')) x) q
      join public.curtidas k on k.anuncio_id = a.id and k.perfil_id = q.perfil_id and k.status in ('pendente', 'match')
      left join public.entrevistas_video e on e.anuncio_id = a.id and e.perfil_id = q.perfil_id
     where e.id is null or (e.situacao in ('vencida', 'cancelada') and e.pedida_em < privado.gratis_inicio_do_mes());
    if v_novos > v_restam then
      if v_restam = 0 then
        raise exception 'As % entrevistas gravadas grátis deste mês já foram pedidas. Assine a Entrevista em vídeo para pedir sem limite, ou espere o dia 1º do mês que vem.',
          v_limite using errcode = 'P0001', hint = 'video_gratis_acabou';
      end if;
      raise exception 'Este mês ainda dá para pedir % de graça. Marque até %, ou assine a Entrevista em vídeo para pedir sem limite.',
        case when v_restam = 1 then 'mais 1 entrevista gravada' else 'mais ' || v_restam || ' entrevistas gravadas' end,
        case when v_restam = 1 then '1 pessoa' else v_restam || ' pessoas' end
        using errcode = 'P0001', hint = 'video_gratis_poucas';
    end if;
  end if;
  perform privado.conferir_limite('etapa', 300, 'Você mexeu em muitos candidatos hoje. Tente de novo amanhã.');
  foreach p in array coalesce(p_perfis, '{}') loop
    if privado.video_pedir_um(a.id, p, conta) then
      n := n + 1;
    end if;
  end loop;
  return n;
end
$$;

-- 4. A entrevista ao vivo: 1 por mês no grátis (os planos continuam com 10, 20 ou 30, e os 15 dias com 3) ---------

create or replace function privado.limite_ao_vivo(p_conta uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with produtos as (
    select a.recurso from privado.assinaturas a where a.conta_id = p_conta and a.situacao = 'ativa'
    union
    select c.recurso from privado.cobrancas c
     where c.conta_id = p_conta and c.situacao = 'paga'
       and c.periodo_ate + case when c.compra_id is null then interval '3 days' else interval '0' end > now()
  ),
  limites as (
    select case recurso
             when 'empresa_5' then 10 when 'empresa_20' then 20 when 'empresa_50' then 30
             when 'agencia_15' then 20 when 'agencia_200' then 30
             when 'completo' then 30 when 'video' then 10
             else 0 end as n
      from produtos
    union all
    select 20 from privado.plano_agencia_cortesia x where x.conta_id = p_conta and (x.ate is null or x.ate > now())
    union all
    -- liberada sem prazo pelo Admin
    select 30 from privado.video_contas v where v.conta_id = p_conta and v.ate is null
    union all
    -- só os dias grátis (ou o que ainda vale do período pago, já contado acima)
    select 3 from privado.video_contas v where v.conta_id = p_conta and v.ate > now()
    union all
    -- o grátis de cada mês (migração 20270730120000)
    select privado.gratis_do_mes(p_conta, 'ao_vivo')
  )
  select coalesce(max(n), 0)::integer from limites
$$;

create or replace function privado.conferir_ao_vivo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta uuid;
  v_limite integer;
  v_usadas integer;
  v_mais text;
begin
  if new.formato is distinct from 'publike' or new.situacao = 'cancelada' then
    return new;
  end if;
  -- já era ao vivo, no mesmo mês, e não estava cancelada: não gasta outra
  if tg_op = 'UPDATE' and old.formato = 'publike' and old.situacao <> 'cancelada'
     and date_trunc('month', old.quando at time zone 'America/Sao_Paulo')
       = date_trunc('month', new.quando at time zone 'America/Sao_Paulo') then
    return new;
  end if;
  select a.autor_id into v_conta from public.anuncios a where a.id = new.anuncio_id;
  v_limite := privado.limite_ao_vivo(v_conta);
  if v_limite = 0 then
    raise exception 'A entrevista ao vivo pelo Publike vem com a Entrevista em vídeo. Marque por link de vídeo, telefone ou presencial.'
      using errcode = 'P0001', hint = 'ao_vivo_fechado';
  end if;
  v_usadas := privado.ao_vivo_no_mes(v_conta, new.quando, new.id);
  if v_usadas >= v_limite then
    -- no grátis do mês, o caminho para ter mais
    v_mais := case when not privado.video_liberado(v_conta) then ' Com a assinatura da Entrevista em vídeo, são 10 por mês.'
                   else '' end;
    if v_limite = 1 then
      raise exception 'A entrevista ao vivo pelo Publike deste mês já foi usada. Marque por link de vídeo, telefone ou presencial: ela volta no mês que vem.%',
        v_mais using errcode = 'P0001', hint = 'ao_vivo_no_limite';
    end if;
    raise exception 'As % entrevistas ao vivo pelo Publike deste mês já foram usadas. Marque por link de vídeo, telefone ou presencial: elas voltam no mês que vem.%',
      v_limite, v_mais using errcode = 'P0001', hint = 'ao_vivo_no_limite';
  end if;
  return new;
end
$$;

-- 5. O que as telas leem: o grátis da conta ---------------------------------------------------------------------

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
      select true, c.ate into tem, ate_ from privado.copiloto_contas c where c.conta_id = conta;
    elsif r = 'video' then
      select true, v.ate into tem, ate_ from privado.video_contas v where v.conta_id = conta;
    elsif r = 'automacoes' then
      select true, v.ate into tem, ate_ from privado.automacoes_contas v where v.conta_id = conta;
    elsif r = 'salarios' then
      select true, v.ate into tem, ate_ from privado.salarios_contas v where v.conta_id = conta;
    else
      select true, t.ate into tem, ate_ from privado.testes_contas t where t.conta_id = conta;
    end if;
    select * into e from privado.experimentos x where x.conta_id = conta and x.recurso = r;
    assina := exists (select 1 from privado.assinaturas a
                       where a.conta_id = conta and a.situacao = 'ativa'
                         and (a.recurso = r or privado.libera_tudo(a.recurso) or (a.recurso = 'combo' and r in ('copiloto', 'testes'))));
    saida := saida || jsonb_build_object(r, jsonb_build_object(
      'liberado', coalesce(tem, false) and (ate_ is null or ate_ > now()),
      'ate', case when coalesce(tem, false) then ate_ end,
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
    tem := null; ate_ := null; e := null;
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

-- 6. Admin › Pagamentos muda os números -------------------------------------------------------------------------

create or replace function public.admin_gratis_do_mes(p_triagem integer, p_gravadas integer, p_ao_vivo integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_triagem is null or p_gravadas is null or p_ao_vivo is null
     or p_triagem not between 0 and 1000 or p_gravadas not between 0 and 1000 or p_ao_vivo not between 0 and 100 then
    raise exception 'Use de 0 a 1000 (na ao vivo, de 0 a 100).' using errcode = '22023';
  end if;
  update privado.config_pagamentos
     set gratis_triagem_mes = p_triagem, gratis_gravadas_mes = p_gravadas, gratis_ao_vivo_mes = p_ao_vivo,
         atualizado_em = now()
   where id;
end
$$;
revoke all on function public.admin_gratis_do_mes(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_gratis_do_mes(integer, integer, integer) to service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270730120000_gratis_de_cada_mes');
