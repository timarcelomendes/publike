-- O processo da empresa e o padrão das vagas novas (08/11/2026; claude/plano-etapas-obrigatorias-e-configuracoes.md).
-- Pode rodar de novo. Rode depois de 20270314120000_chat_nas_curtidas.sql.
--
-- 1. processo_da_conta: as regras que a empresa liga em Configurações › Processo (todas desligadas no padrão):
--    a. para contratar, passar pela Entrevista;
--    b. para contratar, a proposta aceita;
--    c. para ir à Entrevista, o teste "Antes da entrevista" da vaga feito;
--    d. ao tirar do processo (Dispensar ou Não seguiu), o motivo: não, opcional ou obrigatório;
--    e. agência: contratar só quem o cliente escolheu nos finalistas.
--    O banco confere onde a pessoa muda de etapa. Quem administra pode pular uma regra para uma pessoa, dizendo o
--    motivo (pular_regra); o pulo fica anotado e aparece na Trilha. O recrutador não pula.
-- 2. curtidas.motivo_saida: por que a pessoa saiu do processo. Vira um número nos Resultados (numeros_saidas) e, em
--    "a vaga fechou" e "outro candidato", uma frase a mais no retorno para a pessoa.
-- 3. A proposta curta: "Contratar sem proposta" também pede os documentos da admissão (pedir_documentos).
-- 4. padroes_da_conta: o padrão das vagas novas (currículo, contato direto, como conversam, perguntas, teste) e da
--    contratação (proposta, documentos, taxa e garantia da agência); aplicar_padroes leva para as vagas no ar.
-- 5. A colocação da agência só de quem está em Contratados.

-- 1. As regras do processo ---------------------------------------------------------------------------------------
create table if not exists public.processo_da_conta (
  conta_id uuid primary key references public.perfis (id) on delete cascade,
  jeito text not null default 'simples' check (jeito in ('simples', 'entrevista', 'completo', 'proprio')),
  entrevista_para_contratar boolean not null default false,
  proposta_para_contratar boolean not null default false,
  teste_antes_da_entrevista boolean not null default false,
  motivo_ao_tirar text not null default 'nao' check (motivo_ao_tirar in ('nao', 'opcional', 'obrigatorio')),
  ok_do_cliente boolean not null default false,
  atualizado_em timestamptz not null default now()
);
alter table public.processo_da_conta enable row level security;
revoke all on public.processo_da_conta from public, anon, authenticated;

create or replace function privado.regras_da_conta(p_conta uuid)
returns public.processo_da_conta
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select x from public.processo_da_conta x where x.conta_id = p_conta),
    row(p_conta, 'simples', false, false, false, 'nao', false, now())::public.processo_da_conta)
$$;

create or replace function public.processo_da_conta()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.processo_da_conta;
begin
  if (select public.conta_atual()) is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  r := privado.regras_da_conta((select public.conta_atual()));
  return jsonb_build_object(
    'jeito', r.jeito, 'entrevista_para_contratar', r.entrevista_para_contratar,
    'proposta_para_contratar', r.proposta_para_contratar, 'teste_antes_da_entrevista', r.teste_antes_da_entrevista,
    'motivo_ao_tirar', r.motivo_ao_tirar, 'ok_do_cliente', r.ok_do_cliente,
    'administra', (select public.papel_na_conta()) in ('dono', 'admin'));
end
$$;

create or replace function public.salvar_processo(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta uuid := (select public.conta_atual());
  v_motivo text := coalesce(p ->> 'motivo_ao_tirar', 'nao');
  v_jeito text := coalesce(p ->> 'jeito', 'proprio');
begin
  perform privado.exigir_conta_ativa();
  if v_conta is null or not exists (select 1 from public.perfis x where x.id = v_conta and x.tipo in ('empresa', 'comercio', 'agencia')) then
    raise exception 'O processo é de quem contrata.' using errcode = '42501';
  end if;
  if (select public.papel_na_conta()) not in ('dono', 'admin') then
    raise exception 'Só quem administra a conta muda o processo.' using errcode = '42501';
  end if;
  if v_motivo not in ('nao', 'opcional', 'obrigatorio') or v_jeito not in ('simples', 'entrevista', 'completo', 'proprio') then
    raise exception 'Confira as escolhas.' using errcode = '22023';
  end if;
  insert into public.processo_da_conta as x (conta_id, jeito, entrevista_para_contratar, proposta_para_contratar,
                                             teste_antes_da_entrevista, motivo_ao_tirar, ok_do_cliente, atualizado_em)
  values (v_conta, v_jeito, coalesce((p ->> 'entrevista_para_contratar')::boolean, false),
          coalesce((p ->> 'proposta_para_contratar')::boolean, false),
          coalesce((p ->> 'teste_antes_da_entrevista')::boolean, false), v_motivo,
          coalesce((p ->> 'ok_do_cliente')::boolean, false), now())
  on conflict (conta_id) do update
    set jeito = excluded.jeito, entrevista_para_contratar = excluded.entrevista_para_contratar,
        proposta_para_contratar = excluded.proposta_para_contratar,
        teste_antes_da_entrevista = excluded.teste_antes_da_entrevista, motivo_ao_tirar = excluded.motivo_ao_tirar,
        ok_do_cliente = excluded.ok_do_cliente, atualizado_em = now();
end
$$;

-- os pulos: quem administra deixa uma pessoa passar sem a regra, com o motivo
create table if not exists privado.pulos_de_etapa (
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  regra text not null check (regra in ('entrevista', 'proposta', 'teste', 'cliente')),
  motivo text not null check (char_length(motivo) between 3 and 200),
  quem uuid references public.perfis (id) on delete set null,
  em timestamptz not null default now(),
  primary key (anuncio_id, perfil_id, regra)
);

create or replace function public.pular_regra(p_anuncio uuid, p_perfil uuid, p_regra text, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := left(btrim(regexp_replace(coalesce(p_motivo, ''), '\s+', ' ', 'g')), 200);
begin
  perform privado.exigir_conta_ativa();
  if not exists (select 1 from public.anuncios a join public.curtidas c on c.anuncio_id = a.id
                  where a.id = p_anuncio and c.perfil_id = p_perfil and a.autor_id = (select public.conta_atual())) then
    raise exception 'Essa pessoa não se candidatou a uma vaga sua.' using errcode = '42501';
  end if;
  if (select public.papel_na_conta()) not in ('dono', 'admin') then
    raise exception 'Só quem administra a conta pula uma etapa obrigatória.' using errcode = '42501', hint = 'so_admin';
  end if;
  if p_regra not in ('entrevista', 'proposta', 'teste', 'cliente') then
    raise exception 'Regra inválida.' using errcode = '22023';
  end if;
  if char_length(v_motivo) < 3 then
    raise exception 'Diga em poucas palavras por que vai pular.' using errcode = '22023', hint = 'motivo';
  end if;
  insert into privado.pulos_de_etapa (anuncio_id, perfil_id, regra, motivo, quem)
  values (p_anuncio, p_perfil, p_regra, v_motivo, (select auth.uid()))
  on conflict (anuncio_id, perfil_id, regra) do update set motivo = excluded.motivo, quem = excluded.quem, em = now();
end
$$;

-- confere as regras da conta antes de levar alguém para Entrevista, Contratado ou mandar a proposta
create or replace function privado.conferir_regras(p_anuncio uuid, p_perfil uuid, p_destino text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.anuncios;
  r public.processo_da_conta;
  pulou text[];
begin
  select * into a from public.anuncios x where x.id = p_anuncio;
  if a.id is null or a.tipo <> 'vaga' then
    return;
  end if;
  r := privado.regras_da_conta(a.autor_id);
  select coalesce(array_agg(p.regra), '{}') into pulou
    from privado.pulos_de_etapa p where p.anuncio_id = p_anuncio and p.perfil_id = p_perfil;

  if p_destino in ('contratado', 'proposta') and r.entrevista_para_contratar and not ('entrevista' = any (pulou))
     and not exists (select 1 from public.entrevistas x where x.anuncio_id = p_anuncio and x.perfil_id = p_perfil)
     and not exists (select 1 from privado.historico_etapas h where h.anuncio_id = p_anuncio and h.perfil_id = p_perfil
                        and h.o_que = 'etapa:entrevista') then
    raise exception 'Para contratar, a pessoa passa antes pela entrevista. Marque a entrevista ou pule, dizendo o motivo.'
      using errcode = 'P0001', hint = 'regra_entrevista';
  end if;
  if p_destino = 'contratado' and r.proposta_para_contratar and not ('proposta' = any (pulou))
     and not exists (select 1 from public.propostas x where x.anuncio_id = p_anuncio and x.perfil_id = p_perfil
                        and x.situacao = 'aceita') then
    raise exception 'Para contratar, mande a proposta: quem aceita vai sozinho para Contratados.'
      using errcode = 'P0001', hint = 'regra_proposta';
  end if;
  if p_destino = 'entrevista' and r.teste_antes_da_entrevista and not ('teste' = any (pulou))
     and exists (select 1 from privado.avaliacoes_da_vaga t
                  where t.anuncio_id = p_anuncio and t.obrigatoria
                    and not exists (select 1 from privado.avaliacoes_pedidas f
                                     where f.anuncio_id = p_anuncio and f.perfil_id = p_perfil
                                       and f.modelo_id = t.modelo_id and f.status = 'feita')) then
    raise exception 'Falta o teste da vaga: ele vem antes da entrevista. Peça o teste ou pule, dizendo o motivo.'
      using errcode = 'P0001', hint = 'regra_teste';
  end if;
  if p_destino = 'contratado' and r.ok_do_cliente and not ('cliente' = any (pulou))
     and exists (select 1 from public.perfis x where x.id = a.autor_id and x.tipo = 'agencia')
     and not exists (select 1 from public.finalistas f where f.anuncio_id = p_anuncio and f.perfil_id = p_perfil
                        and f.decisao = 'entrevistar') then
    raise exception 'O cliente ainda não escolheu esta pessoa nos finalistas. Mande para o cliente ou pule, dizendo o motivo.'
      using errcode = 'P0001', hint = 'regra_cliente';
  end if;
end
$$;

-- 2. O motivo de saída ---------------------------------------------------------------------------------------------
alter table public.curtidas add column if not exists motivo_saida text
  check (motivo_saida is null or motivo_saida in ('nao_respondeu', 'requisito', 'faltou', 'outra_vaga',
                                                  'outro_candidato', 'vaga_fechou', 'outro'));

create or replace function public.marcar_motivo_saida(p_anuncio uuid, p_perfis uuid[], p_motivo text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform privado.exigir_conta_ativa();
  if p_motivo is not null and p_motivo not in ('nao_respondeu', 'requisito', 'faltou', 'outra_vaga', 'outro_candidato',
                                                'vaga_fechou', 'outro') then
    raise exception 'Escolha um motivo da lista.' using errcode = '22023';
  end if;
  update public.curtidas c set motivo_saida = p_motivo
    from public.anuncios a
   where a.id = c.anuncio_id and c.anuncio_id = p_anuncio and c.perfil_id = any ((coalesce(p_perfis, '{}'))[1:200])
     and a.autor_id = (select public.conta_atual());
  get diagnostics n = row_count;
  return n;
end
$$;

-- o motivo obrigatório (se a conta ligou) ao tirar alguém do processo
create or replace function privado.conferir_motivo_saida(p_anuncio uuid, p_perfil uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (privado.regras_da_conta((select a.autor_id from public.anuncios a where a.id = p_anuncio))).motivo_ao_tirar = 'obrigatorio'
     and exists (select 1 from public.curtidas c where c.anuncio_id = p_anuncio and c.perfil_id = p_perfil
                    and c.motivo_saida is null) then
    raise exception 'Escolha o motivo para tirar a pessoa do processo.' using errcode = 'P0001', hint = 'motivo_saida';
  end if;
end
$$;

-- os Resultados: por que as pessoas saíram
create or replace function public.numeros_saidas(p_dias integer default null, p_anuncio uuid default null)
returns table (motivo text, pessoas integer)
language sql
stable
security definer
set search_path = ''
as $$
  select c.motivo_saida, count(*)::integer
    from public.curtidas c
    join public.anuncios a on a.id = c.anuncio_id
   where a.autor_id = (select public.conta_atual()) and a.tipo = 'vaga' and c.motivo_saida is not null
     and (p_anuncio is null or a.id = p_anuncio)
     and (p_dias is null or c.criado_em >= now() - make_interval(days => p_dias))
   group by c.motivo_saida
   order by count(*) desc
$$;

-- 3. A proposta curta ---------------------------------------------------------------------------------------------
alter table public.propostas add column if not exists curta boolean not null default false;

-- "Contratar sem proposta" e pedir os documentos: uma proposta já aceita, só com o início e a lista
create or replace function public.pedir_documentos(p_anuncio uuid, p_perfil uuid, p_inicio date, p_documentos text[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.anuncios;
  v_atual public.propostas;
  v_id uuid;
  v_docs text[];
  v_empresa text;
begin
  perform privado.exigir_conta_ativa();
  select * into a from public.anuncios x where x.id = p_anuncio and x.autor_id = (select public.conta_atual());
  if a.id is null or a.tipo <> 'vaga' then
    raise exception 'Vaga não encontrada.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.curtidas c where c.anuncio_id = a.id and c.perfil_id = p_perfil and c.status = 'match') then
    raise exception 'Os documentos são de quem já deu match.' using errcode = 'P0001';
  end if;
  if p_inicio is null or p_inicio < (now() at time zone 'America/Sao_Paulo')::date - 30 then
    raise exception 'Confira o dia em que a pessoa começa.' using errcode = '22023', hint = 'inicio';
  end if;
  select coalesce(array_agg(left(btrim(d), 60)) filter (where btrim(d) <> ''), '{}') into v_docs
    from unnest(coalesce(p_documentos, '{}')) d;
  if cardinality(v_docs) = 0 then
    raise exception 'Escolha pelo menos um documento.' using errcode = '22023', hint = 'documentos';
  end if;
  select * into v_atual from public.propostas p where p.anuncio_id = a.id and p.perfil_id = p_perfil;
  if found and v_atual.situacao = 'enviada' then
    raise exception 'Já tem uma proposta esperando a resposta da pessoa.' using errcode = 'P0001';
  end if;
  if not found or v_atual.situacao <> 'aceita' then
    perform privado.conferir_regras(a.id, p_perfil, 'contratado');
  end if;
  insert into public.propostas (anuncio_id, perfil_id, salario, inicio, documentos, situacao, enviada_em, respondida_em,
                                enviada_por, curta)
  values (a.id, p_perfil, 'Combinado com a empresa', p_inicio, v_docs[1:12], 'aceita', now(), now(), (select auth.uid()), true)
  on conflict (anuncio_id, perfil_id) do update
    set inicio = excluded.inicio, documentos = excluded.documentos,
        situacao = 'aceita', respondida_em = coalesce(public.propostas.respondida_em, now()),
        curta = public.propostas.curta or public.propostas.situacao <> 'aceita'
  returning id into v_id;
  insert into public.etapas_candidatos (anuncio_id, perfil_id, etapa)
  values (a.id, p_perfil, 'contratado')
  on conflict (anuncio_id, perfil_id) do update set etapa = 'contratado', atualizado_em = now()
   where public.etapas_candidatos.etapa <> 'contratado';
  select p.nome into v_empresa from public.perfis p where p.id = a.autor_id;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto, link)
  values (p_perfil, 'documentos_admissao', a.id, a.autor_id,
          left(coalesce(v_empresa, 'A empresa') || ' pediu os documentos da sua admissão para “' || a.titulo
               || '”. Mande a foto pelo Publike ou leve no primeiro dia (' || to_char(p_inicio, 'DD/MM') || ').', 300),
          '/proposta/' || a.id || '#documentos');
  return v_id;
end
$$;

-- 4. O padrão das vagas novas e da contratação --------------------------------------------------------------------
create table if not exists public.padroes_da_conta (
  conta_id uuid primary key references public.perfis (id) on delete cascade,
  curriculo text not null default 'regime' check (curriculo in ('regime', 'sempre', 'nunca')),
  contato_direto boolean not null default false,
  contato_por text not null default 'ambos' check (contato_por in ('ambos', 'chat')),
  -- as perguntas como o formulário da vaga guarda (com a resposta procurada e a eliminatória)
  perguntas jsonb not null default '[]'::jsonb check (jsonb_typeof(perguntas) = 'array' and jsonb_array_length(perguntas) <= 8),
  -- quem responder diferente numa eliminatória: só marcar ou tirar do processo (a automação da vaga)
  tirar_eliminados boolean not null default false,
  -- o teste da Publike que combina com a vaga: opcional (como hoje), antes da entrevista ou nenhum
  teste text not null default 'opcional' check (teste in ('opcional', 'antes', 'nenhum')),
  -- a proposta padrão: horario, beneficios, apresentar_onde, apresentar_hora
  proposta jsonb not null default '{}'::jsonb check (jsonb_typeof(proposta) = 'object'),
  documentos text[] check (documentos is null or cardinality(documentos) <= 12),
  -- agência: a taxa e a garantia padrão das colocações
  taxa numeric(10, 2) check (taxa is null or taxa between 0 and 1000000),
  garantia_dias integer check (garantia_dias is null or garantia_dias between 0 and 365),
  atualizado_em timestamptz not null default now()
);
alter table public.padroes_da_conta enable row level security;
revoke all on public.padroes_da_conta from public, anon, authenticated;

create or replace function public.padroes_da_conta()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  x public.padroes_da_conta;
begin
  if (select public.conta_atual()) is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  select * into x from public.padroes_da_conta p where p.conta_id = (select public.conta_atual());
  return jsonb_build_object(
    'curriculo', coalesce(x.curriculo, 'regime'), 'contato_direto', coalesce(x.contato_direto, false),
    'contato_por', coalesce(x.contato_por, 'ambos'), 'perguntas', coalesce(x.perguntas, '[]'::jsonb),
    'tirar_eliminados', coalesce(x.tirar_eliminados, false), 'teste', coalesce(x.teste, 'opcional'),
    'proposta', coalesce(x.proposta, '{}'::jsonb), 'documentos', to_jsonb(x.documentos),
    'taxa', x.taxa, 'garantia_dias', x.garantia_dias,
    'administra', (select public.papel_na_conta()) in ('dono', 'admin'));
end
$$;

-- salva só as chaves que vierem (a aba Candidatura e a aba Contratação salvam cada uma a sua parte)
create or replace function public.salvar_padroes(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta uuid := (select public.conta_atual());
  d text;
begin
  perform privado.exigir_conta_ativa();
  if v_conta is null or not exists (select 1 from public.perfis x where x.id = v_conta and x.tipo in ('empresa', 'comercio', 'agencia')) then
    raise exception 'O padrão das vagas é de quem contrata.' using errcode = '42501';
  end if;
  if (select public.papel_na_conta()) not in ('dono', 'admin') then
    raise exception 'Só quem administra a conta muda o padrão.' using errcode = '42501';
  end if;
  if p ? 'documentos' and jsonb_typeof(p -> 'documentos') = 'array' then
    for d in select jsonb_array_elements_text(p -> 'documentos') loop
      if privado.documento_proibido(d) is not null then
        raise exception '%', privado.documento_proibido(d) using errcode = '22023';
      end if;
    end loop;
  end if;
  insert into public.padroes_da_conta (conta_id) values (v_conta) on conflict (conta_id) do nothing;
  update public.padroes_da_conta x set
    curriculo = case when p ? 'curriculo' then p ->> 'curriculo' else x.curriculo end,
    contato_direto = case when p ? 'contato_direto' then (p ->> 'contato_direto')::boolean else x.contato_direto end,
    contato_por = case when p ? 'contato_por' then p ->> 'contato_por' else x.contato_por end,
    perguntas = case when p ? 'perguntas' then p -> 'perguntas' else x.perguntas end,
    tirar_eliminados = case when p ? 'tirar_eliminados' then (p ->> 'tirar_eliminados')::boolean else x.tirar_eliminados end,
    teste = case when p ? 'teste' then p ->> 'teste' else x.teste end,
    proposta = case when p ? 'proposta' then p -> 'proposta' else x.proposta end,
    documentos = case when p ? 'documentos' then
                   (select array_agg(left(btrim(e), 60)) from jsonb_array_elements_text(p -> 'documentos') e
                     where btrim(e) <> '')
                 else x.documentos end,
    taxa = case when p ? 'taxa' then nullif(p ->> 'taxa', '')::numeric else x.taxa end,
    garantia_dias = case when p ? 'garantia_dias' then nullif(p ->> 'garantia_dias', '')::integer else x.garantia_dias end,
    atualizado_em = now()
   where x.conta_id = v_conta;
end
$$;

-- leva o padrão para as vagas no ar da conta: 'curriculo', 'contato_direto', 'contato_por'. Devolve quantas mudaram.
create or replace function public.aplicar_padroes(p_o_que text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta uuid := (select public.conta_atual());
  x public.padroes_da_conta;
  n integer;
begin
  perform privado.exigir_conta_ativa();
  if (select public.papel_na_conta()) not in ('dono', 'admin') then
    raise exception 'Só quem administra a conta muda as vagas de uma vez.' using errcode = '42501';
  end if;
  select * into x from public.padroes_da_conta p where p.conta_id = v_conta;
  if x.conta_id is null then
    raise exception 'Salve o padrão primeiro.' using errcode = 'P0001';
  end if;
  update public.anuncios a set
    pede_curriculo = case when 'curriculo' = any (p_o_que) then
                       case x.curriculo when 'sempre' then true when 'nunca' then false
                         else a.regime in ('clt', 'aprendiz', 'estagio', 'trainee', 'temporario') end
                     else a.pede_curriculo end,
    contato_direto = case when 'contato_direto' = any (p_o_que) then x.contato_direto else a.contato_direto end,
    contato_por = case when 'contato_por' = any (p_o_que) then x.contato_por else a.contato_por end
   where a.autor_id = v_conta and a.tipo = 'vaga' and a.status = 'ativo'
     and ((('curriculo' = any (p_o_que)) and a.pede_curriculo is distinct from
            (case x.curriculo when 'sempre' then true when 'nunca' then false
               else a.regime in ('clt', 'aprendiz', 'estagio', 'trainee', 'temporario') end))
       or (('contato_direto' = any (p_o_que)) and a.contato_direto is distinct from x.contato_direto)
       or (('contato_por' = any (p_o_que)) and a.contato_por is distinct from x.contato_por));
  get diagnostics n = row_count;
  return n;
end
$$;

-- "Quem responder diferente: tirar do processo" na própria vaga (a automação dispensar_eliminados)
create or replace function public.marcar_dispensar_eliminados(p_anuncio uuid, p_ligado boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.anuncios a where a.id = p_anuncio and a.autor_id = (select public.conta_atual())) then
    raise exception 'Vaga não encontrada.' using errcode = '42501';
  end if;
  insert into public.automacoes_vaga (anuncio_id, dispensar_eliminados) values (p_anuncio, coalesce(p_ligado, false))
  on conflict (anuncio_id) do update set dispensar_eliminados = excluded.dispensar_eliminados, atualizado_em = now();
end
$$;

-- 5. As funções de hoje, com as regras (as definições de agora, com as mudanças marcadas) ------------------------

CREATE OR REPLACE FUNCTION public.salvar_etapa_candidato(p_anuncio uuid, p_perfil uuid, p_etapa text, p_nota text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_tipo text;
  v_titulo text;
  v_antes text;
  v_status text;
  v_permitidas text[];
  v_aviso text;
begin
  if (select public.conta_atual()) is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if public.minha_conta_suspensa() then
    raise exception 'Sua conta está suspensa. Se achar que é um engano, fale com a gente.'
      using errcode = 'P0001', hint = 'conta_suspensa';
  end if;
  select a.tipo, a.titulo, c.status into v_tipo, v_titulo, v_status
    from public.curtidas c
    join public.anuncios a on a.id = c.anuncio_id
   where c.anuncio_id = p_anuncio
     and c.perfil_id = p_perfil
     and a.autor_id = (select public.conta_atual());
  if v_tipo is null then
    raise exception 'Essa pessoa não curtiu um anúncio seu.' using errcode = '42501';
  end if;
  if p_etapa is null
     or (v_tipo = 'vaga' and p_etapa not in ('novo', 'analise', 'entrevista', 'contratado', 'nao_seguiu'))
     or (v_tipo = 'servico' and p_etapa not in ('novo', 'orcamento', 'agendado', 'concluido', 'nao_seguiu')) then
    raise exception 'Escolha uma etapa da lista.' using errcode = '22023';
  end if;
  if char_length(v_nota) > 1000 then
    raise exception 'A anotação passa de 1000 letras.' using errcode = '22023';
  end if;

  select e.etapa into v_antes
    from public.etapas_candidatos e
   where e.anuncio_id = p_anuncio and e.perfil_id = p_perfil;

  -- Entrevista e Contratado (no serviço, Orçamento, Agendado e Concluído) só depois do match;
  -- dispensado ou match desfeito não muda de etapa. A anotação continua livre.
  v_permitidas := case
    when v_status = 'match' then
      case when v_tipo = 'vaga' then array['novo', 'analise', 'entrevista', 'contratado', 'nao_seguiu']
           else array['novo', 'orcamento', 'agendado', 'concluido', 'nao_seguiu'] end
    when v_status = 'pendente' then
      case when v_tipo = 'vaga' then array['novo', 'analise'] else array['novo'] end
    else array[]::text[]
  end;
  if p_etapa is distinct from coalesce(v_antes, 'novo') then
    if not (p_etapa = any (v_permitidas)) then
      raise exception 'Essa etapa só pode ser marcada depois do match.' using errcode = 'P0001', hint = 'etapa_sem_match';
    end if;
    perform privado.conferir_limite('etapa', 300, 'Você mudou muitas etapas hoje. Tente de novo amanhã.');
  end if;

  -- as regras do processo da conta (migração 20270315120000)
  if p_etapa is distinct from coalesce(v_antes, 'novo') and v_tipo = 'vaga' then
    if p_etapa in ('entrevista', 'contratado') then
      perform privado.conferir_regras(p_anuncio, p_perfil, p_etapa);
    elsif p_etapa = 'nao_seguiu' then
      perform privado.conferir_motivo_saida(p_anuncio, p_perfil);
    end if;
  end if;
  if p_etapa <> 'nao_seguiu' then
    update public.curtidas set motivo_saida = null
     where anuncio_id = p_anuncio and perfil_id = p_perfil and motivo_saida is not null;
  end if;

  insert into public.etapas_candidatos (anuncio_id, perfil_id, etapa, nota)
  values (p_anuncio, p_perfil, p_etapa, v_nota)
  on conflict (anuncio_id, perfil_id) do update
    set etapa = excluded.etapa,
        nota = excluded.nota,
        atualizado_em = case when public.etapas_candidatos.etapa is distinct from excluded.etapa
                             then now() else public.etapas_candidatos.atualizado_em end;

  if coalesce(v_antes, 'novo') <> p_etapa and p_etapa <> 'novo' then
    -- vaga encerrada depois do match: o retorno da conta (migração 20261230120000), se estiver ligado
    v_aviso := case when p_etapa = 'nao_seguiu' and v_tipo = 'vaga'
                         and privado.montar_retorno((select auth.uid()), p_perfil, p_anuncio) is not null
                    then privado.montar_retorno((select auth.uid()), p_perfil, p_anuncio)
                    when p_etapa = 'nao_seguiu'
                    then case when v_tipo = 'vaga' then 'O processo de “' else 'O pedido “' end
                         || v_titulo || '” foi encerrado. Obrigado pelo interesse!'
                    else '“' || v_titulo || '” agora está em: ' || public.rotulo_etapa_para_quem_curtiu(p_etapa) || '.'
               end;
    -- mudou de novo em menos de uma hora e a pessoa ainda não viu: troca o aviso, sem outro e-mail
    update public.notificacoes n
       set texto = v_aviso, criado_em = now()
     where n.destinatario_id = p_perfil and n.tipo = 'etapa' and n.anuncio_id = p_anuncio
       and not n.lida and n.criado_em > now() - interval '1 hour';
    if not found then
      insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
      values (p_perfil, 'etapa', p_anuncio, (select public.conta_atual()), v_aviso);
    end if;
  end if;
end
$function$;

CREATE OR REPLACE FUNCTION public.responder_curtida(p_anuncio uuid, p_perfil uuid, p_decisao text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  atual text;
  situacao text;
  pede boolean;
  v_titulo text;
  v_aceita timestamptz;
  nome text;
  quem text;
begin
  perform privado.exigir_conta_ativa();
  if p_decisao not in ('match', 'dispensada', 'pendente') then
    raise exception 'Resposta inválida.' using errcode = '22023';
  end if;
  if exists (select 1 from public.perfis p where p.id = p_perfil and p.suspenso_ate > now()) then
    raise exception 'Essa pessoa está com a conta suspensa.' using errcode = 'P0001';
  end if;
  select c.status, a.status, a.tipo = 'vaga' and a.pede_curriculo, a.titulo, c.aceita_em
    into atual, situacao, pede, v_titulo, v_aceita
    from public.curtidas c
    join public.anuncios a on a.id = c.anuncio_id
   where c.anuncio_id = p_anuncio
     and c.perfil_id = p_perfil
     and a.autor_id = (select public.conta_atual())
     for update of c;
  if not found then
    raise exception 'Curtida não encontrada.' using errcode = 'P0002';
  end if;
  if situacao in ('em_analise', 'removido') then
    raise exception 'Este anúncio está com a moderação. Responda depois que ele for liberado.'
      using errcode = 'P0001', hint = 'com_moderacao';
  end if;
  if atual = 'match' then
    raise exception 'Este match já aconteceu. Para desistir, use “Desfazer match”.' using errcode = 'P0001', hint = 'match_feito';
  end if;
  if p_decisao = 'match' and privado.bloqueado_com(p_perfil) then
    select split_part(p.nome, ' ', 1) into nome from public.perfis p where p.id = p_perfil;
    raise exception '% preferiu não negociar de novo com você.', coalesce(nome, 'Essa pessoa')
      using errcode = 'P0001', hint = 'bloqueado';
  end if;
  if atual = 'desfeito' and p_decisao <> 'match' then
    raise exception 'Este match foi desfeito. Dá para dar match de novo ou deixar como está.'
      using errcode = 'P0001', hint = 'match_desfeito';
  end if;

  -- Vaga que pede currículo e a pessoa ainda não mandou: o aceite fica guardado e
  -- ela recebe o pedido do currículo (uma vez só). O match sai quando o currículo
  -- chegar (gatilho curriculos_libera_aceites).
  if p_decisao = 'match' and pede
     and not exists (select 1 from public.curriculos cv where cv.perfil_id = p_perfil) then
    update public.curtidas
       set status = 'pendente',
           aceita_em = coalesce(v_aceita, now()),
           respondida_em = null,
           desfeito_por = null, desfeito_motivo = null, desfeito_em = null, desfeito_futuro = null
     where anuncio_id = p_anuncio and perfil_id = p_perfil;
    delete from public.bloqueios b where b.perfil_id = (select public.conta_atual()) and b.bloqueado_id = p_perfil;
    if v_aceita is null then
      select p.nome into quem from public.perfis p where p.id = (select public.conta_atual());
      insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
      values (p_perfil, 'aceite_curriculo', p_anuncio, (select public.conta_atual()),
              left(coalesce(quem, 'Quem publicou') || ' aceitou você em “' || v_titulo
                   || '”. Falta só o seu currículo: mande e o contato de vocês aparece na hora.', 300));
    end if;
    return 'aceita';
  end if;

  -- o motivo, se a conta pede (migração 20270315120000); voltar ou aceitar limpa o motivo
  if p_decisao = 'dispensada' then
    perform privado.conferir_motivo_saida(p_anuncio, p_perfil);
  end if;
  update public.curtidas
     set status = p_decisao,
         aceita_em = null,
         motivo_saida = case when p_decisao = 'dispensada' then motivo_saida end,
         respondida_em = case when p_decisao = 'pendente' then null else now() end,
         desfeito_por = null, desfeito_motivo = null, desfeito_em = null, desfeito_futuro = null
   where anuncio_id = p_anuncio and perfil_id = p_perfil;
  -- quem dá match de novo desfaz o próprio bloqueio
  if p_decisao = 'match' then
    delete from public.bloqueios b where b.perfil_id = (select public.conta_atual()) and b.bloqueado_id = p_perfil;
  end if;
  return p_decisao;
end
$function$;

CREATE OR REPLACE FUNCTION public.marcar_entrevista(p_anuncio uuid, p_perfil uuid, p_quando timestamp with time zone, p_formato text, p_local text DEFAULT NULL::text, p_obs text DEFAULT NULL::text, p_duracao integer DEFAULT 30)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  eu uuid := (select public.conta_atual());
  v_titulo text;
  v_status text;
  v_id uuid;
  v_local text := nullif(btrim(coalesce(p_local, '')), '');
  v_obs text := nullif(btrim(coalesce(p_obs, '')), '');
  v_texto text;
  v_remarcou boolean := false;
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  select a.titulo, c.status into v_titulo, v_status
    from public.curtidas c
    join public.anuncios a on a.id = c.anuncio_id
   where c.anuncio_id = p_anuncio and c.perfil_id = p_perfil and a.autor_id = eu and a.tipo = 'vaga';
  if v_titulo is null then
    raise exception 'Essa pessoa não se candidatou a uma vaga sua.' using errcode = '42501';
  end if;
  if v_status <> 'match' then
    raise exception 'Curta de volta primeiro: a entrevista vem depois do match.' using errcode = 'P0001', hint = 'sem_match';
  end if;
  -- o teste antes da entrevista, se a conta pede (migração 20270315120000)
  perform privado.conferir_regras(p_anuncio, p_perfil, 'entrevista');
  if p_formato not in ('presencial', 'video', 'telefone', 'publike') then
    raise exception 'Escolha como vai ser a entrevista.' using errcode = '22023';
  end if;
  -- a chamada pelo Publike é da Entrevista em vídeo (recurso pago)
  if p_formato = 'publike' then
    perform privado.exigir_video();
    v_local := null;
  end if;
  if p_quando is null or p_quando < now() - interval '1 hour' or p_quando > now() + interval '120 days' then
    raise exception 'Escolha uma data a partir de hoje.' using errcode = '22023';
  end if;
  if p_formato = 'video' and (v_local is null or v_local !~* '^https://') then
    raise exception 'Cole o link da chamada de vídeo (começa com https://).' using errcode = '22023', hint = 'local';
  end if;
  if p_formato = 'presencial' and v_local is null then
    raise exception 'Diga o endereço da entrevista.' using errcode = '22023', hint = 'local';
  end if;
  if char_length(v_local) > 300 or char_length(v_obs) > 500 then
    raise exception 'O texto ficou longo demais.' using errcode = '22023';
  end if;
  perform privado.conferir_limite('etapa', 300, 'Você mexeu em muitos candidatos hoje. Tente de novo amanhã.');

  update public.entrevistas
     set quando = p_quando, formato = p_formato, local = v_local, obs = v_obs, opcoes = null,
         duracao_min = greatest(10, least(480, coalesce(p_duracao, 30))),
         situacao = 'marcada', atualizado_em = now()
   where anuncio_id = p_anuncio and perfil_id = p_perfil and situacao in ('marcada', 'confirmada', 'remarcar', 'escolher')
  returning id into v_id;
  v_remarcou := v_id is not null;
  if v_id is null then
    insert into public.entrevistas (anuncio_id, perfil_id, quando, formato, local, obs, duracao_min)
    values (p_anuncio, p_perfil, p_quando, p_formato, v_local, v_obs, greatest(10, least(480, coalesce(p_duracao, 30))))
    returning id into v_id;
  end if;

  -- a etapa vai para Entrevista (a anotação fica como está)
  insert into public.etapas_candidatos (anuncio_id, perfil_id, etapa)
  values (p_anuncio, p_perfil, 'entrevista')
  on conflict (anuncio_id, perfil_id) do update
    set etapa = 'entrevista',
        atualizado_em = case when public.etapas_candidatos.etapa <> 'entrevista' then now()
                             else public.etapas_candidatos.atualizado_em end;

  v_texto := case when v_remarcou then 'Entrevista remarcada' else 'Entrevista marcada' end
             || ' para “' || v_titulo || '”: ' || privado.data_da_entrevista(p_quando)
             || case p_formato when 'presencial' then ', em ' || v_local
                               when 'video' then ', por vídeo: ' || v_local
                               when 'publike' then ', por vídeo pelo Publike (o botão de entrar aparece na página da vaga)'
                               else ', por telefone' end
             || '.' || coalesce(' ' || v_obs, '')
             || ' Confirme aqui na conversa ou na página da vaga.';

  -- a mensagem de antes desta entrevista perde os botões (só a nova é confirmada)
  update public.mensagens m
     set entrevista = m.entrevista || '{"estado": "substituida"}'::jsonb
   where m.entrevista ->> 'id' = v_id::text and m.entrevista ->> 'estado' <> 'substituida';
  insert into public.mensagens (anuncio_id, perfil_id, autor_id, texto, entrevista)
  values (p_anuncio, p_perfil, eu, left(v_texto, 2000),
          jsonb_build_object('id', v_id, 'tipo', 'marcada', 'quando', p_quando, 'formato', p_formato,
                             'local', v_local, 'obs', v_obs, 'duracao', greatest(10, least(480, coalesce(p_duracao, 30))),
                             'vaga', v_titulo, 'estado', 'aberta'));
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (p_perfil, 'entrevista', p_anuncio, eu,
          left(case when v_remarcou then 'Entrevista remarcada' else 'Entrevista marcada' end
               || ' para “' || v_titulo || '”: ' || privado.data_da_entrevista(p_quando) || '.', 300));
  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.oferecer_horarios(p_anuncio uuid, p_perfil uuid, p_opcoes timestamp with time zone[], p_formato text, p_local text DEFAULT NULL::text, p_obs text DEFAULT NULL::text, p_duracao integer DEFAULT 30)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  eu uuid := (select public.conta_atual());
  v_titulo text;
  v_status text;
  v_id uuid;
  v_opcoes timestamptz[];
  v_local text := nullif(btrim(coalesce(p_local, '')), '');
  v_obs text := nullif(btrim(coalesce(p_obs, '')), '');
  v_lista text;
  v_texto text;
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  select a.titulo, c.status into v_titulo, v_status
    from public.curtidas c
    join public.anuncios a on a.id = c.anuncio_id
   where c.anuncio_id = p_anuncio and c.perfil_id = p_perfil and a.autor_id = eu and a.tipo = 'vaga';
  if v_titulo is null then
    raise exception 'Essa pessoa não se candidatou a uma vaga sua.' using errcode = '42501';
  end if;
  if v_status <> 'match' then
    raise exception 'Curta de volta primeiro: a entrevista vem depois do match.' using errcode = 'P0001', hint = 'sem_match';
  end if;
  -- o teste antes da entrevista, se a conta pede (migração 20270315120000)
  perform privado.conferir_regras(p_anuncio, p_perfil, 'entrevista');
  select array_agg(distinct o order by o) into v_opcoes from unnest(coalesce(p_opcoes, '{}')) o where o is not null;
  if coalesce(cardinality(v_opcoes), 0) < 2 or cardinality(v_opcoes) > 5 then
    raise exception 'Ofereça de 2 a 5 horários diferentes.' using errcode = '22023', hint = 'opcoes';
  end if;
  if v_opcoes[1] < now() or v_opcoes[cardinality(v_opcoes)] > now() + interval '120 days' then
    raise exception 'Os horários precisam ser daqui para a frente (até 120 dias).' using errcode = '22023', hint = 'opcoes';
  end if;
  if p_formato not in ('presencial', 'video', 'telefone', 'publike') then
    raise exception 'Escolha como vai ser a entrevista.' using errcode = '22023';
  end if;
  if p_formato = 'publike' then
    perform privado.exigir_video();
    v_local := null;
  end if;
  if p_formato = 'video' and (v_local is null or v_local !~* '^https://') then
    raise exception 'Cole o link da chamada de vídeo (começa com https://).' using errcode = '22023', hint = 'local';
  end if;
  if p_formato = 'presencial' and v_local is null then
    raise exception 'Diga o endereço da entrevista.' using errcode = '22023', hint = 'local';
  end if;
  if char_length(v_local) > 300 or char_length(v_obs) > 500 then
    raise exception 'O texto ficou longo demais.' using errcode = '22023';
  end if;
  perform privado.conferir_limite('etapa', 300, 'Você mexeu em muitos candidatos hoje. Tente de novo amanhã.');

  update public.entrevistas
     set quando = v_opcoes[1], opcoes = v_opcoes, formato = p_formato, local = v_local, obs = v_obs,
         duracao_min = greatest(10, least(480, coalesce(p_duracao, 30))),
         situacao = 'escolher', atualizado_em = now()
   where anuncio_id = p_anuncio and perfil_id = p_perfil and situacao in ('marcada', 'confirmada', 'remarcar', 'escolher')
  returning id into v_id;
  if v_id is null then
    insert into public.entrevistas (anuncio_id, perfil_id, quando, opcoes, formato, local, obs, duracao_min, situacao)
    values (p_anuncio, p_perfil, v_opcoes[1], v_opcoes, p_formato, v_local, v_obs,
            greatest(10, least(480, coalesce(p_duracao, 30))), 'escolher')
    returning id into v_id;
  end if;

  insert into public.etapas_candidatos (anuncio_id, perfil_id, etapa)
  values (p_anuncio, p_perfil, 'entrevista')
  on conflict (anuncio_id, perfil_id) do update
    set etapa = 'entrevista',
        atualizado_em = case when public.etapas_candidatos.etapa <> 'entrevista' then now()
                             else public.etapas_candidatos.atualizado_em end;

  select string_agg(privado.data_da_entrevista(o), '; ' order by o) into v_lista from unnest(v_opcoes) o;
  v_texto := 'Escolha o horário da entrevista para “' || v_titulo || '”: ' || v_lista
             || case p_formato when 'presencial' then '. Em ' || v_local
                               when 'video' then '. Por vídeo: ' || v_local
                               when 'publike' then '. Por vídeo pelo Publike'
                               else '. Por telefone' end
             || '.' || coalesce(' ' || v_obs, '')
             || ' Escolha aqui na conversa ou na página da vaga.';
  -- a mensagem de antes desta entrevista perde os botões (só a nova é confirmada)
  update public.mensagens m
     set entrevista = m.entrevista || '{"estado": "substituida"}'::jsonb
   where m.entrevista ->> 'id' = v_id::text and m.entrevista ->> 'estado' <> 'substituida';
  insert into public.mensagens (anuncio_id, perfil_id, autor_id, texto, entrevista)
  values (p_anuncio, p_perfil, eu, left(v_texto, 2000),
          jsonb_build_object('id', v_id, 'tipo', 'horarios', 'opcoes', to_jsonb(v_opcoes), 'formato', p_formato,
                             'local', v_local, 'obs', v_obs, 'duracao', greatest(10, least(480, coalesce(p_duracao, 30))),
                             'vaga', v_titulo, 'estado', 'aberta'));
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (p_perfil, 'entrevista', p_anuncio, eu,
          left('Escolha o horário da sua entrevista para “' || v_titulo || '”: '
               || cardinality(v_opcoes) || ' opções.', 300));
  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.fazer_proposta(p_anuncio uuid, p_perfil uuid, p_dados jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.anuncios;
  v_atual public.propostas;
  v_id uuid;
  v_inicio date;
  v_hora time;
  v_docs text[];
  v_empresa text;
begin
  perform privado.exigir_conta_ativa();
  select * into a from public.anuncios x where x.id = p_anuncio and x.autor_id = public.conta_atual();
  if not found or a.tipo <> 'vaga' then
    raise exception 'Vaga não encontrada.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.curtidas c where c.anuncio_id = a.id and c.perfil_id = p_perfil and c.status = 'match') then
    raise exception 'A proposta vai para quem já deu match.' using errcode = 'P0001';
  end if;
  -- a entrevista antes da proposta, se a conta pede (migração 20270315120000)
  perform privado.conferir_regras(a.id, p_perfil, 'proposta');
  select * into v_atual from public.propostas p where p.anuncio_id = a.id and p.perfil_id = p_perfil;
  if found and v_atual.situacao = 'aceita' then
    raise exception 'Esta pessoa já aceitou a proposta.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_dados ->> 'salario', ''))) < 2 then
    raise exception 'Escreva o salário.' using errcode = '22023';
  end if;
  begin
    v_inicio := (p_dados ->> 'inicio')::date;
    v_hora := nullif(p_dados ->> 'apresentar_hora', '')::time;
  exception when others then
    raise exception 'Confira a data de início e a hora.' using errcode = '22023';
  end;
  if v_inicio is null or v_inicio < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'O início não pode ser no passado.' using errcode = '22023';
  end if;
  select coalesce(array_agg(left(btrim(d), 60)) filter (where btrim(d) <> ''), '{}') into v_docs
    from jsonb_array_elements_text(coalesce(p_dados -> 'documentos', '[]'::jsonb)) d;
  insert into public.propostas (anuncio_id, perfil_id, salario, inicio, horario, beneficios, recado,
                                apresentar_onde, apresentar_hora, documentos, situacao, motivo_recusa, enviada_em,
                                respondida_em, enviada_por)
  values (a.id, p_perfil, left(btrim(p_dados ->> 'salario'), 80), v_inicio,
          nullif(left(btrim(coalesce(p_dados ->> 'horario', '')), 120), ''),
          nullif(left(btrim(coalesce(p_dados ->> 'beneficios', '')), 300), ''),
          nullif(left(btrim(coalesce(p_dados ->> 'recado', '')), 600), ''),
          nullif(left(btrim(coalesce(p_dados ->> 'apresentar_onde', '')), 300), ''),
          v_hora, v_docs[1:12], 'enviada', null, now(), null, (select auth.uid()))
  on conflict (anuncio_id, perfil_id) do update
    set salario = excluded.salario, inicio = excluded.inicio, horario = excluded.horario,
        beneficios = excluded.beneficios, recado = excluded.recado, apresentar_onde = excluded.apresentar_onde,
        apresentar_hora = excluded.apresentar_hora, documentos = excluded.documentos, situacao = 'enviada',
        motivo_recusa = null, enviada_em = now(), respondida_em = null, enviada_por = excluded.enviada_por
  returning id into v_id;
  select p.nome into v_empresa from public.perfis p where p.id = a.autor_id;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (p_perfil, 'proposta', a.id, a.autor_id,
          left(coalesce(v_empresa, 'A empresa')
               || case when v_atual.id is null then ' mandou uma proposta' else ' mudou a proposta' end
               || ' para a vaga “' || a.titulo || '”. Veja e responda pelo Publike.', 300));
  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.salvar_colocacao(p_anuncio uuid, p_perfil uuid, p_inicio date, p_taxa numeric DEFAULT NULL::numeric, p_paga boolean DEFAULT false, p_garantia_dias integer DEFAULT 90, p_saiu_em date DEFAULT NULL::date, p_nota text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  eu uuid := (select public.conta_atual());
  v_status text;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  select c.status into v_status
    from public.curtidas c
    join public.anuncios a on a.id = c.anuncio_id
   where c.anuncio_id = p_anuncio and c.perfil_id = p_perfil and a.autor_id = eu and a.tipo = 'vaga';
  if v_status is null then
    raise exception 'Essa pessoa não se candidatou a uma vaga sua.' using errcode = '42501';
  end if;
  if v_status <> 'match' then
    raise exception 'A colocação é de quem deu match e foi contratado.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.etapas_candidatos e where e.anuncio_id = p_anuncio and e.perfil_id = p_perfil
                    and e.etapa = 'contratado') then
    raise exception 'A colocação é de quem está em Contratados. Leve a pessoa para Contratados antes.'
      using errcode = 'P0001', hint = 'sem_contratado';
  end if;
  if p_inicio is null or p_inicio < date '2000-01-01' or p_inicio > current_date + 365 then
    raise exception 'Confira o dia em que a pessoa começou.' using errcode = '22023', hint = 'inicio';
  end if;
  if p_taxa is not null and (p_taxa < 0 or p_taxa > 10000000) then
    raise exception 'Confira o valor da taxa.' using errcode = '22023', hint = 'taxa';
  end if;
  if p_garantia_dias is null or p_garantia_dias < 0 or p_garantia_dias > 365 then
    raise exception 'A garantia vai de 0 a 365 dias.' using errcode = '22023', hint = 'garantia';
  end if;
  if p_saiu_em is not null and p_saiu_em < p_inicio then
    raise exception 'A saída vem depois do começo.' using errcode = '22023', hint = 'saiu_em';
  end if;
  if char_length(v_nota) > 500 then
    raise exception 'A anotação passa de 500 letras.' using errcode = '22023', hint = 'nota';
  end if;
  insert into public.colocacoes as k (anuncio_id, perfil_id, inicio, taxa, paga, garantia_dias, saiu_em, nota)
  values (p_anuncio, p_perfil, p_inicio, round(p_taxa, 2), coalesce(p_paga, false), p_garantia_dias, p_saiu_em, v_nota)
  on conflict (anuncio_id, perfil_id) do update
    set inicio = excluded.inicio,
        taxa = excluded.taxa,
        paga = excluded.paga,
        garantia_dias = excluded.garantia_dias,
        saiu_em = excluded.saiu_em,
        nota = excluded.nota,
        atualizado_em = now();
end
$function$;

CREATE OR REPLACE FUNCTION privado.montar_retorno(p_conta uuid, p_perfil uuid, p_anuncio uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r privado.retorno_contas;
  v_texto text;
begin
  select * into r from privado.retorno_contas x where x.conta_id = p_conta;
  if found and not r.ligado then
    return null;
  end if;
  v_texto := coalesce(r.texto, privado.retorno_padrao());
  v_texto := replace(v_texto, '{nome}', coalesce((select split_part(p.nome, ' ', 1) from public.perfis p where p.id = p_perfil), ''));
  v_texto := replace(v_texto, '{vaga}', coalesce((select a.titulo from public.anuncios a where a.id = p_anuncio), 'a vaga'));
  v_texto := replace(v_texto, '{empresa}', coalesce((select p.nome from public.perfis p where p.id = p_conta), 'a empresa'));
  -- o motivo que a pessoa pode saber (migração 20270315120000)
  v_texto := v_texto || coalesce(
    (select case c.motivo_saida
              when 'vaga_fechou' then ' A vaga foi fechada.'
              when 'outro_candidato' then ' Seguimos com outra pessoa para esta vaga.'
            end
       from public.curtidas c where c.anuncio_id = p_anuncio and c.perfil_id = p_perfil), '');
  return left(v_texto, 600);
end
$function$;

CREATE OR REPLACE FUNCTION public.trilha_da_vaga(p_anuncio uuid)
 RETURNS TABLE(perfil_id uuid, o_que text, em timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists (select 1 from public.anuncios a where a.id = p_anuncio and a.autor_id = public.conta_atual()) then
    raise exception 'Vaga não encontrada.' using errcode = '42501';
  end if;
  return query
  select x.perfil_id, x.o_que, x.em from (
    select c.perfil_id, 'curtiu'::text as o_que, c.criado_em as em
      from public.curtidas c where c.anuncio_id = p_anuncio
    union all
    select c.perfil_id, 'aceita', c.aceita_em
      from public.curtidas c where c.anuncio_id = p_anuncio and c.aceita_em is not null
    union all
    select c.perfil_id, 'resposta:' || c.status, c.respondida_em
      from public.curtidas c
     where c.anuncio_id = p_anuncio and c.respondida_em is not null and c.status <> 'pendente'
    union all
    select h.perfil_id, h.o_que, h.em
      from privado.historico_etapas h
     where h.anuncio_id = p_anuncio
       and (h.o_que like 'etapa:%' or h.o_que like 'sub:%' or h.o_que like 'curtida:%')
    union all
    -- quem pulou uma etapa obrigatória, com o motivo (migração 20270315120000)
    select p.perfil_id, 'pulou:' || p.regra || ':' || p.motivo, p.em
      from privado.pulos_de_etapa p
     where p.anuncio_id = p_anuncio
  ) x
  order by x.em;
end
$function$;

CREATE OR REPLACE FUNCTION privado.proposta_em_json(p propostas)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'id', p.id, 'anuncio_id', p.anuncio_id, 'perfil_id', p.perfil_id, 'salario', p.salario, 'inicio', p.inicio,
    'horario', p.horario, 'beneficios', p.beneficios, 'recado', p.recado, 'apresentar_onde', p.apresentar_onde,
    'apresentar_hora', to_char(p.apresentar_hora, 'HH24:MI'), 'documentos', to_jsonb(p.documentos),
    'situacao', p.situacao, 'motivo_recusa', p.motivo_recusa, 'enviada_em', p.enviada_em,
    'respondida_em', p.respondida_em, 'curta', p.curta)
$function$;

-- as permissões
revoke execute on function privado.regras_da_conta(uuid), privado.conferir_regras(uuid, uuid, text),
  privado.conferir_motivo_saida(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.processo_da_conta(), public.salvar_processo(jsonb), public.pular_regra(uuid, uuid, text, text),
  public.marcar_motivo_saida(uuid, uuid[], text), public.numeros_saidas(integer, uuid),
  public.pedir_documentos(uuid, uuid, date, text[]), public.padroes_da_conta(), public.salvar_padroes(jsonb),
  public.aplicar_padroes(text[]), public.marcar_dispensar_eliminados(uuid, boolean) from public, anon;
grant execute on function public.processo_da_conta(), public.salvar_processo(jsonb), public.pular_regra(uuid, uuid, text, text),
  public.marcar_motivo_saida(uuid, uuid[], text), public.numeros_saidas(integer, uuid),
  public.pedir_documentos(uuid, uuid, date, text[]), public.padroes_da_conta(), public.salvar_padroes(jsonb),
  public.aplicar_padroes(text[]), public.marcar_dispensar_eliminados(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
