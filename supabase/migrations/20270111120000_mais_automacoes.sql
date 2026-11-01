-- Mais automações por vaga (pedido do usuário em 01/11/2026: "aumente as possibilidades"). Pode rodar de novo.
-- Rode depois de 20270110120000_proposta.sql. Novas regras, cada uma uma vez só por candidato e anotada no registro:
--   * Quando alguém se candidata: o recado de recebimento (o aviso novo `candidatura_recebida`); levar para Em análise
--     quem a Triagem com IA diz que atende os critérios obrigatórios; a entrevista em vídeo a todos (o liga-desliga
--     que já existia na aba do vídeo, agora também aqui).
--   * Quando você move: a mensagem pronta também nas etapas próprias (`sub:<id>`); os horários livres oferecidos
--     ao mover para Entrevista (o site calcula e chama `oferecer_horarios`; aqui só a anotação).
--   * Com o tempo: o retorno a quem ficou em Novos sem resposta há N dias (pelo /api/filas).
--   * Quando a vaga fecha: ao marcar como preenchida, quem ficou sai do processo sem um segundo aviso.
--   * As regras de uma vaga copiadas para as outras no ar e usadas nas vagas novas (`automacoes_conta`).
--   * escolher_horario recusa o horário que outra pessoa da mesma conta acabou de pegar.

-- 1. As colunas novas ------------------------------------------------------------------------------------------
alter table public.automacoes_vaga
  add column if not exists recado text check (recado is null or char_length(btrim(recado)) between 10 and 400),
  add column if not exists triagem_para_analise boolean not null default false,
  add column if not exists encerrar_dias smallint check (encerrar_dias between 3 and 60),
  add column if not exists encerrar_ao_preencher boolean not null default false,
  -- {"formato": "presencial" | "telefone" | "video" | "publike", "local": "...", "duracao": 30}
  add column if not exists horarios jsonb check (horarios is null or jsonb_typeof(horarios) = 'object');

alter table privado.automacoes_feitas drop constraint if exists automacoes_feitas_regra_check;
alter table privado.automacoes_feitas add constraint automacoes_feitas_regra_check
  check (regra in ('dispensar', 'mensagem', 'parado', 'recado', 'triagem', 'encerrar', 'preenchida', 'horarios'));

-- o padrão da conta: as regras de uma vaga (a origem) entram sozinhas em toda vaga nova
create table if not exists public.automacoes_conta (
  conta_id uuid primary key references public.perfis (id) on delete cascade,
  origem uuid references public.anuncios (id) on delete set null,
  regras jsonb not null check (jsonb_typeof(regras) = 'object'),
  atualizado_em timestamptz not null default now()
);
alter table public.automacoes_conta enable row level security;
revoke all on table public.automacoes_conta from public, anon, authenticated;

-- 2. As regras em json e a conferência ------------------------------------------------------------------------
create or replace function privado.regras_em_json(r public.automacoes_vaga)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'dispensar_eliminados', coalesce(r.dispensar_eliminados, false),
    'mensagens', coalesce(r.mensagens, '{}'::jsonb),
    'parado_dias', r.parado_dias,
    'recado', r.recado,
    'triagem_para_analise', coalesce(r.triagem_para_analise, false),
    'encerrar_dias', r.encerrar_dias,
    'encerrar_ao_preencher', coalesce(r.encerrar_ao_preencher, false),
    'horarios', r.horarios)
$$;

-- confere e grava as regras de uma vaga. p_estrito: um erro para o que não vale (a tela); sem ele, o que não vale
-- fica de fora (o padrão aplicado numa vaga nova, quando uma mensagem pronta já foi apagada)
create or replace function privado.aplicar_automacoes(p_anuncio uuid, p_conta uuid, p_eu uuid, p_regras jsonb,
                                                     p_estrito boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb := coalesce(p_regras, '{}'::jsonb);
  v_mensagens jsonb := '{}'::jsonb;
  k text;
  v text;
  v_parado integer;
  v_encerrar integer;
  v_recado text := nullif(btrim(coalesce(r ->> 'recado', '')), '');
  v_horarios jsonb;
  v_formato text;
  v_local text;
  v_duracao integer;
begin
  if jsonb_typeof(r) <> 'object' then
    raise exception 'Confira as automações.' using errcode = '22023';
  end if;
  -- a mensagem pronta por etapa: as de hoje e as próprias da conta
  if jsonb_typeof(r -> 'mensagens') = 'object' then
    for k, v in select * from jsonb_each_text(r -> 'mensagens') loop
      continue when coalesce(v, '') = '';
      if not (k in ('analise', 'entrevista', 'contratado')
              or (k ~ '^sub:[0-9a-f-]{36}$'
                  and exists (select 1 from public.etapas_da_conta e
                               where e.id::text = substr(k, 5) and e.conta_id = p_conta)))
         or v !~ '^[0-9a-f-]{36}$'
         or not exists (select 1 from public.modelos_mensagem m
                         where m.id::text = v and m.autor_id in (p_eu, p_conta)) then
        if p_estrito then
          raise exception 'Mensagem pronta não encontrada.' using errcode = '22023';
        end if;
        continue;
      end if;
      v_mensagens := v_mensagens || jsonb_build_object(k, v);
    end loop;
  end if;
  v_parado := nullif(r ->> 'parado_dias', '')::integer;
  if v_parado is not null and v_parado not between 2 and 30 then
    if p_estrito then raise exception 'O lembrete vai de 2 a 30 dias.' using errcode = '22023'; end if;
    v_parado := null;
  end if;
  v_encerrar := nullif(r ->> 'encerrar_dias', '')::integer;
  if v_encerrar is not null and v_encerrar not between 3 and 60 then
    if p_estrito then raise exception 'O retorno automático vai de 3 a 60 dias.' using errcode = '22023'; end if;
    v_encerrar := null;
  end if;
  if v_recado is not null and char_length(v_recado) not between 10 and 400 then
    if p_estrito then raise exception 'O recado tem de 10 a 400 letras.' using errcode = '22023'; end if;
    v_recado := null;
  end if;
  if jsonb_typeof(r -> 'horarios') = 'object' then
    v_formato := r -> 'horarios' ->> 'formato';
    v_local := nullif(left(btrim(coalesce(r -> 'horarios' ->> 'local', '')), 300), '');
    v_duracao := coalesce(nullif(r -> 'horarios' ->> 'duracao', '')::integer, 30);
    if v_formato not in ('presencial', 'telefone', 'video', 'publike') or v_duracao not between 15 and 180
       or (v_formato = 'presencial' and v_local is null)
       or (v_formato = 'video' and coalesce(v_local, '') !~* '^https://') then
      if p_estrito then
        raise exception 'Confira como vai ser a entrevista: o endereço ou o link da chamada.' using errcode = '22023';
      end if;
    else
      v_horarios := jsonb_build_object('formato', v_formato, 'local', v_local, 'duracao', v_duracao);
    end if;
  end if;
  insert into public.automacoes_vaga (anuncio_id, dispensar_eliminados, mensagens, parado_dias, recado,
                                      triagem_para_analise, encerrar_dias, encerrar_ao_preencher, horarios, atualizado_em)
  values (p_anuncio, coalesce((r ->> 'dispensar_eliminados')::boolean, false), v_mensagens, v_parado, v_recado,
          coalesce((r ->> 'triagem_para_analise')::boolean, false), v_encerrar,
          coalesce((r ->> 'encerrar_ao_preencher')::boolean, false), v_horarios, now())
  on conflict (anuncio_id) do update
    set dispensar_eliminados = excluded.dispensar_eliminados, mensagens = excluded.mensagens,
        parado_dias = excluded.parado_dias, recado = excluded.recado,
        triagem_para_analise = excluded.triagem_para_analise, encerrar_dias = excluded.encerrar_dias,
        encerrar_ao_preencher = excluded.encerrar_ao_preencher, horarios = excluded.horarios, atualizado_em = now();
end
$$;

-- 3. Salvar, copiar e o padrão das vagas novas ----------------------------------------------------------------
create or replace function public.salvar_regras_automacao(p_anuncio uuid, p_regras jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.anuncios := privado.minha_vaga_para_automacao(p_anuncio);
  x public.automacoes_vaga;
begin
  perform privado.exigir_conta_ativa();
  perform privado.aplicar_automacoes(a.id, a.autor_id, (select auth.uid()), p_regras, true);
  -- a entrevista em vídeo a todo novo candidato: o mesmo liga-desliga da aba do vídeo (com as perguntas montadas)
  if jsonb_typeof(p_regras -> 'video_a_todos') = 'boolean' and privado.video_liberado(a.autor_id) then
    update public.video_perguntas v set pedir_a_todos = (p_regras ->> 'video_a_todos')::boolean, atualizado_em = now()
     where v.anuncio_id = a.id and jsonb_array_length(v.perguntas) >= 2;
  end if;
  -- esta vaga é a origem do padrão: o padrão acompanha
  select * into x from public.automacoes_vaga y where y.anuncio_id = a.id;
  update public.automacoes_conta c set regras = privado.regras_em_json(x), atualizado_em = now()
   where c.conta_id = a.autor_id and c.origem = a.id;
end
$$;

create or replace function public.copiar_automacoes(p_anuncio uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.anuncios := privado.minha_vaga_para_automacao(p_anuncio);
  x public.automacoes_vaga;
  v record;
  n integer := 0;
begin
  perform privado.exigir_conta_ativa();
  select * into x from public.automacoes_vaga y where y.anuncio_id = a.id;
  for v in
    select o.id from public.anuncios o
     where o.autor_id = a.autor_id and o.tipo = 'vaga' and o.id <> a.id and o.status = 'ativo'
       and o.expira_em > now() and o.preenchida_em is null
  loop
    perform privado.aplicar_automacoes(v.id, a.autor_id, (select auth.uid()), privado.regras_em_json(x), false);
    n := n + 1;
  end loop;
  return n;
end
$$;

create or replace function public.usar_automacoes_nas_novas(p_anuncio uuid, p_usar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.anuncios := privado.minha_vaga_para_automacao(p_anuncio);
  x public.automacoes_vaga;
begin
  perform privado.exigir_conta_ativa();
  if not coalesce(p_usar, false) then
    delete from public.automacoes_conta c where c.conta_id = a.autor_id and c.origem = a.id;
    return;
  end if;
  select * into x from public.automacoes_vaga y where y.anuncio_id = a.id;
  insert into public.automacoes_conta (conta_id, origem, regras, atualizado_em)
  values (a.autor_id, a.id, privado.regras_em_json(x), now())
  on conflict (conta_id) do update set origem = excluded.origem, regras = excluded.regras, atualizado_em = now();
end
$$;

create or replace function privado.automacoes_na_vaga_nova()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_regras jsonb;
begin
  select c.regras into v_regras from public.automacoes_conta c where c.conta_id = new.autor_id;
  if v_regras is not null then
    begin
      perform privado.aplicar_automacoes(new.id, new.autor_id, coalesce((select auth.uid()), new.autor_id), v_regras,
                                         false);
    exception when others then
      -- nunca atrapalha publicar a vaga
      raise warning 'Publike: as automações padrão não entraram na vaga %: %', new.id, sqlerrm;
    end;
  end if;
  return null;
end
$$;
drop trigger if exists anuncios_zz_automacoes on public.anuncios;
create trigger anuncios_zz_automacoes after insert on public.anuncios
  for each row when (new.tipo = 'vaga') execute function privado.automacoes_na_vaga_nova();

-- 4. Quando alguém se candidata: a eliminatória (de antes) e o recado de recebimento ---------------------------
create or replace function privado.automacao_ao_curtir()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.automacoes_vaga;
  a public.anuncios;
  v_nome text;
begin
  select * into x from public.automacoes_vaga y where y.anuncio_id = new.anuncio_id;
  if not found then
    return null;
  end if;
  select * into a from public.anuncios z where z.id = new.anuncio_id;
  if a.tipo <> 'vaga' then
    return null;
  end if;
  if new.status = 'pendente' and privado.dispensa_eliminado(new.anuncio_id, new.respostas) then
    -- o gatilho curtidas_retorno põe o retorno na espera de 15 minutos, como no "Dispensar"
    update public.curtidas set status = 'dispensada', respondida_em = now()
     where anuncio_id = new.anuncio_id and perfil_id = new.perfil_id and status = 'pendente';
    insert into privado.automacoes_feitas (anuncio_id, perfil_id, regra)
    values (new.anuncio_id, new.perfil_id, 'dispensar')
    on conflict do nothing;
    return null;
  end if;
  if x.recado is not null and new.status in ('pendente', 'match') then
    insert into privado.automacoes_feitas (anuncio_id, perfil_id, regra)
    values (new.anuncio_id, new.perfil_id, 'recado')
    on conflict do nothing;
    if found then
      select p.nome into v_nome from public.perfis p where p.id = new.perfil_id;
      insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
      values (new.perfil_id, 'candidatura_recebida', a.id, a.autor_id,
              left(replace(replace(replace(x.recado,
                     '{nome}', coalesce(nullif(split_part(v_nome, ' ', 1), ''), 'tudo bem')),
                     '{vaga}', a.titulo),
                     '{empresa}', coalesce((select e.nome from public.perfis e where e.id = a.autor_id), 'a empresa')),
                   300));
    end if;
  end if;
  return null;
end
$$;

-- 5. A Triagem com IA leva para Em análise quem atende os obrigatórios -----------------------------------------
create or replace function privado.automacao_pela_triagem()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.anuncios;
begin
  if new.origem <> 'candidato' or not new.obrigatorios_ok then
    return null;
  end if;
  if not exists (select 1 from public.automacoes_vaga x where x.anuncio_id = new.anuncio_id and x.triagem_para_analise)
     or not exists (select 1 from privado.copiloto_vagas v, jsonb_array_elements(v.criterios) c
                     where v.anuncio_id = new.anuncio_id and jsonb_typeof(c) = 'object'
                       and coalesce((c ->> 'obrigatorio')::boolean, false))
     or not exists (select 1 from public.curtidas c where c.anuncio_id = new.anuncio_id and c.perfil_id = new.perfil_id
                       and c.status in ('pendente', 'match'))
     or coalesce((select e.etapa from public.etapas_candidatos e
                   where e.anuncio_id = new.anuncio_id and e.perfil_id = new.perfil_id), 'novo') <> 'novo' then
    return null;
  end if;
  insert into privado.automacoes_feitas (anuncio_id, perfil_id, regra)
  values (new.anuncio_id, new.perfil_id, 'triagem')
  on conflict do nothing;
  if not found then
    return null;
  end if;
  select * into a from public.anuncios z where z.id = new.anuncio_id;
  insert into public.etapas_candidatos (anuncio_id, perfil_id, etapa)
  values (new.anuncio_id, new.perfil_id, 'analise')
  on conflict (anuncio_id, perfil_id) do update set etapa = 'analise', atualizado_em = now()
   where public.etapas_candidatos.etapa = 'novo';
  -- o mesmo aviso de quando a empresa move
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (new.perfil_id, 'etapa', a.id, a.autor_id,
          '“' || a.titulo || '” agora está em: ' || public.rotulo_etapa_para_quem_curtiu('analise') || '.');
  return null;
end
$$;
drop trigger if exists copiloto_avaliacoes_automacao on privado.copiloto_avaliacoes;
create trigger copiloto_avaliacoes_automacao after insert or update on privado.copiloto_avaliacoes
  for each row execute function privado.automacao_pela_triagem();

-- 6. A mensagem ao mover, agora também nas etapas próprias ------------------------------------------------------
create or replace function public.automacao_mensagem_ao_mover(p_anuncio uuid, p_perfis uuid[], p_etapa text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.anuncios := privado.minha_vaga_para_automacao(p_anuncio);
  v_modelo text;
  v_empresa text;
  v_sub uuid;
  r record;
  n integer := 0;
begin
  if p_etapa ~ '^sub:[0-9a-f-]{36}$' then
    v_sub := substr(p_etapa, 5)::uuid;
  elsif p_etapa not in ('analise', 'entrevista', 'contratado') then
    return 0;
  end if;
  select m.texto into v_modelo
    from public.automacoes_vaga x
    join public.modelos_mensagem m on m.id::text = x.mensagens ->> p_etapa
   where x.anuncio_id = a.id;
  if v_modelo is null then
    return 0;
  end if;
  select p.nome into v_empresa from public.perfis p where p.id = a.autor_id;
  for r in
    select c.perfil_id, p.nome
      from public.curtidas c
      join public.perfis p on p.id = c.perfil_id
      join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
     where c.anuncio_id = a.id and c.perfil_id = any (coalesce(p_perfis, '{}')) and c.status = 'match'
       and (case when v_sub is null then e.etapa = p_etapa else e.subetapa = v_sub end)
  loop
    insert into privado.automacoes_feitas (anuncio_id, perfil_id, regra, detalhe)
    values (a.id, r.perfil_id, 'mensagem', p_etapa)
    on conflict do nothing;
    if found then
      perform public.enviar_mensagem(a.id, r.perfil_id,
        left(replace(replace(replace(v_modelo, '{nome}', coalesce(nullif(split_part(r.nome, ' ', 1), ''), r.nome)),
                             '{vaga}', a.titulo), '{empresa}', coalesce(v_empresa, '')), 2000));
      n := n + 1;
    end if;
  end loop;
  return n;
end
$$;

-- os horários livres oferecidos pelo site ao mover para Entrevista: a anotação (uma vez por pessoa)
create or replace function public.automacao_anotar_horarios(p_anuncio uuid, p_perfil uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.anuncios := privado.minha_vaga_para_automacao(p_anuncio);
begin
  if not exists (select 1 from public.automacoes_vaga x where x.anuncio_id = a.id and x.horarios is not null) then
    return false;
  end if;
  insert into privado.automacoes_feitas (anuncio_id, perfil_id, regra)
  values (a.id, p_perfil, 'horarios')
  on conflict do nothing;
  return found;
end
$$;

-- 7. Com o tempo: os parados (de antes) e o retorno a quem ficou em Novos sem resposta ---------------------------
create or replace function public.servidor_automacoes_parados(p_chave text, p_agora timestamptz default now())
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v record;
  c record;
  n integer := 0;
  v_novos integer;
  v_hora integer := extract(hour from (p_agora at time zone 'America/Sao_Paulo'))::integer;
begin
  perform privado.exigir_servidor(p_chave);
  if v_hora < 8 or v_hora >= 20 then
    return 0;
  end if;
  for v in
    select a.id, a.titulo, a.autor_id, x.parado_dias
      from public.automacoes_vaga x
      join public.anuncios a on a.id = x.anuncio_id
     where x.parado_dias is not null and a.tipo = 'vaga' and a.status = 'ativo' and a.preenchida_em is null
  loop
    with parados as (
      select k.perfil_id,
             greatest(k.criado_em, coalesce(k.respondida_em, k.criado_em),
                      coalesce((select max(h.em) from privado.historico_etapas h
                                 where h.anuncio_id = k.anuncio_id and h.perfil_id = k.perfil_id), k.criado_em)) as desde
        from public.curtidas k
        left join public.etapas_candidatos e on e.anuncio_id = k.anuncio_id and e.perfil_id = k.perfil_id
       where k.anuncio_id = v.id and k.status in ('pendente', 'match')
         and coalesce(e.etapa, 'novo') in ('novo', 'analise', 'entrevista')
    ), novos as (
      insert into privado.automacoes_feitas (anuncio_id, perfil_id, regra, detalhe)
      select v.id, p.perfil_id, 'parado', to_char(p.desde at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')
        from parados p
       where p.desde <= p_agora - make_interval(days => v.parado_dias)
      on conflict do nothing
      returning 1
    )
    select count(*) into v_novos from novos;
    if v_novos > 0 then
      insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto)
      values (v.autor_id, 'parados', v.id,
              left(case when v_novos = 1 then '1 candidato está parado'
                        else v_novos || ' candidatos estão parados' end
                   || ' há ' || v.parado_dias || ' dias ou mais em “' || v.titulo || '”. Mova no quadro ou dê o retorno.',
                   300));
      n := n + v_novos;
    end if;
  end loop;
  -- quem ficou em Novos esperando resposta há N dias: Não seguiu, com o retorno de sempre (15 minutos depois)
  for v in
    select a.id, x.encerrar_dias
      from public.automacoes_vaga x
      join public.anuncios a on a.id = x.anuncio_id
     where x.encerrar_dias is not null and a.tipo = 'vaga' and a.status <> 'removido'
  loop
    for c in
      select k.perfil_id
        from public.curtidas k
        left join public.etapas_candidatos e on e.anuncio_id = k.anuncio_id and e.perfil_id = k.perfil_id
       where k.anuncio_id = v.id and k.status = 'pendente' and k.aceita_em is null
         and k.criado_em <= p_agora - make_interval(days => v.encerrar_dias)
         and coalesce(e.etapa, 'novo') = 'novo'
    loop
      insert into privado.automacoes_feitas (anuncio_id, perfil_id, regra)
      values (v.id, c.perfil_id, 'encerrar')
      on conflict do nothing;
      if found then
        update public.curtidas set status = 'dispensada', respondida_em = now()
         where anuncio_id = v.id and perfil_id = c.perfil_id and status = 'pendente';
        n := n + 1;
      end if;
    end loop;
  end loop;
  return n;
end
$$;

-- 8. Quando a vaga fecha: quem ficou sai do processo (no fim da transação, depois do aviso da vaga preenchida) -----
create or replace function privado.automacao_ao_preencher()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.preenchida_em is null or old.preenchida_em is not null
     or not coalesce((select x.encerrar_ao_preencher from public.automacoes_vaga x where x.anuncio_id = new.id), false) then
    return null;
  end if;
  begin
    -- quem esperava resposta: Não seguiu, sem o retorno (já recebeu o aviso de que a vaga foi preenchida)
    with feitos as (
      update public.curtidas k set status = 'dispensada', respondida_em = now()
       where k.anuncio_id = new.id and k.status = 'pendente'
      returning k.perfil_id
    )
    insert into privado.automacoes_feitas (anuncio_id, perfil_id, regra)
    select new.id, f.perfil_id, 'preenchida' from feitos f
    on conflict do nothing;
    delete from privado.retornos_pendentes r
     where r.anuncio_id = new.id
       and exists (select 1 from privado.automacoes_feitas f
                    where f.anuncio_id = new.id and f.perfil_id = r.perfil_id and f.regra = 'preenchida');
    -- com match e fora de Contratados: Não seguiu
    with fora as (
      select k.perfil_id from public.curtidas k
        left join public.etapas_candidatos e on e.anuncio_id = k.anuncio_id and e.perfil_id = k.perfil_id
       where k.anuncio_id = new.id and k.status = 'match' and coalesce(e.etapa, 'novo') not in ('contratado', 'nao_seguiu')
    ), movidos as (
      insert into public.etapas_candidatos (anuncio_id, perfil_id, etapa)
      select new.id, f.perfil_id, 'nao_seguiu' from fora f
      on conflict (anuncio_id, perfil_id) do update set etapa = 'nao_seguiu', atualizado_em = now()
      returning perfil_id
    )
    insert into privado.automacoes_feitas (anuncio_id, perfil_id, regra)
    select new.id, m.perfil_id, 'preenchida' from movidos m
    on conflict do nothing;
  exception when others then
    -- nunca impede marcar a vaga como preenchida
    raise warning 'Publike: a automação da vaga preenchida % falhou: %', new.id, sqlerrm;
  end;
  return null;
end
$$;
drop trigger if exists anuncios_zz_automacao_preenchida on public.anuncios;
create constraint trigger anuncios_zz_automacao_preenchida
  after update of preenchida_em on public.anuncios
  deferrable initially deferred
  for each row when (old.preenchida_em is null and new.preenchida_em is not null)
  execute function privado.automacao_ao_preencher();

-- 9. Escolher o horário: não pega o que outra pessoa da mesma conta acabou de pegar ------------------------------
create or replace function public.escolher_horario(p_id uuid, p_quando timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select public.conta_atual());
  v public.entrevistas;
  v_autor uuid;
  v_titulo text;
  v_nome text;
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  select * into v from public.entrevistas e where e.id = p_id and e.perfil_id = eu;
  if v.id is null or v.situacao <> 'escolher' then
    raise exception 'Esta entrevista não está esperando a sua escolha.' using errcode = 'P0001';
  end if;
  if p_quando is null or not (p_quando = any(v.opcoes)) then
    raise exception 'Escolha um dos horários oferecidos.' using errcode = '22023';
  end if;
  if p_quando < now() then
    raise exception 'Esse horário já passou. Escolha outro ou peça outros horários.' using errcode = '22023';
  end if;
  select a.autor_id, a.titulo into v_autor, v_titulo from public.anuncios a where a.id = v.anuncio_id;
  if exists (select 1 from public.entrevistas x
               join public.anuncios a on a.id = x.anuncio_id
              where a.autor_id = v_autor and x.id <> v.id and x.situacao in ('marcada', 'confirmada')
                and x.quando < p_quando + make_interval(mins => v.duracao_min)
                and x.quando + make_interval(mins => x.duracao_min) > p_quando) then
    raise exception 'Esse horário acabou de ser escolhido por outra pessoa. Escolha outro.' using errcode = 'P0001';
  end if;
  update public.entrevistas set quando = p_quando, situacao = 'confirmada', atualizado_em = now() where id = p_id;
  select split_part(p.nome, ' ', 1) into v_nome from public.perfis p where p.id = eu;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (v_autor, 'entrevista_resposta', v.anuncio_id, eu,
          left(coalesce(v_nome, 'O candidato') || ' escolheu ' || privado.data_da_entrevista(p_quando)
               || ' para a entrevista de “' || v_titulo || '”.', 300));
end
$$;

-- 10. O que a tela lê ------------------------------------------------------------------------------------------
create or replace function public.automacoes_da_vaga(p_anuncio uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.anuncios := privado.minha_vaga_para_automacao(p_anuncio);
  r public.automacoes_vaga;
  v public.video_perguntas;
  c public.automacoes_conta;
begin
  select * into r from public.automacoes_vaga x where x.anuncio_id = a.id;
  select * into v from public.video_perguntas x where x.anuncio_id = a.id;
  select * into c from public.automacoes_conta x where x.conta_id = a.autor_id;
  return privado.regras_em_json(r) || jsonb_build_object(
    'tem_eliminatoria', exists (
      select 1 from public.vaga_triagem t, jsonb_each(t.criterios) k
       where t.anuncio_id = a.id and jsonb_typeof(k.value) = 'object'
         and coalesce((k.value ->> 'eliminatoria')::boolean, false)),
    'triagem', jsonb_build_object(
      'liberada', privado.copiloto_liberado(a.autor_id),
      'obrigatorios', (select count(*) from privado.copiloto_vagas cv, jsonb_array_elements(cv.criterios) k
                        where cv.anuncio_id = a.id and jsonb_typeof(k) = 'object'
                          and coalesce((k ->> 'obrigatorio')::boolean, false))),
    'video', jsonb_build_object(
      'liberado', privado.video_liberado(a.autor_id),
      'perguntas', coalesce(jsonb_array_length(v.perguntas), 0),
      'a_todos', coalesce(v.pedir_a_todos, false)),
    'testes', (select count(*) from privado.avaliacoes_da_vaga d where d.anuncio_id = a.id),
    'retorno_ligado', coalesce((select rc.ligado from privado.retorno_contas rc where rc.conta_id = a.autor_id), true),
    'tem_horarios', exists (select 1 from public.horarios_livres h
                             where h.conta_id = a.autor_id and jsonb_array_length(h.faixas) > 0),
    'padrao', case when c.conta_id is null then null
                   else jsonb_build_object('origem', c.origem,
                                           'titulo', (select o.titulo from public.anuncios o where o.id = c.origem)) end,
    'outras_no_ar', (select count(*) from public.anuncios o
                      where o.autor_id = a.autor_id and o.tipo = 'vaga' and o.id <> a.id and o.status = 'ativo'
                        and o.expira_em > now() and o.preenchida_em is null),
    'contagem', coalesce((select jsonb_object_agg(q.regra, q.n)
                            from (select f.regra, count(*) as n from privado.automacoes_feitas f
                                   where f.anuncio_id = a.id group by f.regra) q), '{}'::jsonb),
    'registro', coalesce((
      select jsonb_agg(jsonb_build_object('perfil_id', f.perfil_id, 'nome', p.nome, 'regra', f.regra,
                                          'detalhe', f.detalhe, 'feito_em', f.feito_em) order by f.feito_em desc)
        from (select * from privado.automacoes_feitas f where f.anuncio_id = a.id order by f.feito_em desc limit 40) f
        join public.perfis p on p.id = f.perfil_id), '[]'::jsonb));
end
$$;

-- 11. O aviso novo `candidatura_recebida` (o mesmo da 20270110120000, com ele) ----------------------------------
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('curtida', 'match', 'em_analise', 'removido', 'liberado', 'avaliacao', 'avaliacao_retida',
                  'match_desfeito', 'etapa', 'mensagem', 'seguindo', 'recomendacao', 'contratacao',
                  'entrevista', 'entrevista_resposta', 'aceite_curriculo', 'curriculo_recebido', 'busca',
                  'convite', 'vaga_preenchida', 'finalistas', 'convite_candidato', 'equipe', 'conexao',
                  'recado_no_ar', 'recado_retido', 'recado_forca',
                  'convite_curriculo', 'convite_empresa', 'convite_agencia', 'convite_servicos', 'convite_vitrine',
                  'curriculo_publico', 'visita', 'visitas_do_dia', 'visitas_novidade',
                  'avaliacao_liberada', 'avaliacao_removida', 'mensagem_equipe',
                  'vagas_semana', 'talentos_semana', 'comunicado', 'noticias_do_dia',
                  'teste_pedido', 'teste_feito', 'lembrete_curtida', 'sem_resposta', 'pagamento',
                  'dispensada', 'entrevista_lembrete',
                  'video_pedido', 'video_enviado', 'parados', 'proposta', 'proposta_resposta', 'candidatura_recebida'));

create or replace function privado.grupo_do_aviso(p_tipo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_tipo = 'mensagem' then 'mensagens'
    when p_tipo in ('curtida', 'match', 'match_desfeito', 'etapa', 'contratacao', 'entrevista', 'entrevista_resposta',
                    'aceite_curriculo', 'curriculo_recebido', 'convite', 'convite_candidato', 'finalistas',
                    'vaga_preenchida', 'recomendacao', 'avaliacao', 'teste_pedido', 'teste_feito',
                    'lembrete_curtida', 'sem_resposta', 'dispensada', 'entrevista_lembrete',
                    'video_pedido', 'video_enviado', 'parados', 'proposta', 'proposta_resposta', 'candidatura_recebida') then 'andamento'
    when p_tipo = 'conexao' then 'conexoes'
    when p_tipo in ('busca', 'seguindo') then 'vagas_novas'
    when p_tipo in ('vagas_semana', 'talentos_semana') then 'semana'
    when p_tipo in ('convite_curriculo', 'convite_empresa', 'convite_agencia', 'convite_servicos',
                    'convite_vitrine') then 'convites'
    when p_tipo = 'noticias_do_dia' then 'noticias'
    else null
  end
$$;

drop trigger if exists notificacoes_para_celular on public.notificacoes;
create trigger notificacoes_para_celular
  after insert on public.notificacoes
  for each row
  when (new.tipo in ('curtida', 'match', 'mensagem', 'conexao', 'em_analise', 'removido', 'liberado',
                     'etapa', 'entrevista', 'entrevista_resposta', 'contratacao', 'aceite_curriculo',
                     'curriculo_recebido', 'convite', 'convite_candidato', 'finalistas', 'vaga_preenchida',
                     'seguindo', 'busca', 'avaliacao', 'recado_retido', 'mensagem_equipe', 'equipe',
                     'vagas_semana', 'talentos_semana', 'noticias_do_dia', 'teste_pedido', 'teste_feito',
                     'lembrete_curtida', 'sem_resposta', 'pagamento', 'dispensada', 'entrevista_lembrete',
                     'video_pedido', 'video_enviado', 'parados', 'proposta', 'proposta_resposta', 'candidatura_recebida'))
  execute function privado.notificacao_para_celular();

CREATE OR REPLACE FUNCTION privado.notificacao_por_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_titulo text;
  v_nota text;
  v_quem text;
  v_autor uuid;
  v_motivo text;
  v_futuro boolean;
  v_depois text;
  v_entrevista jsonb;
  v_status text;
  v_categoria text;
begin
  select a.titulo, a.nota_moderacao, a.autor_id, a.status, a.categoria into v_titulo, v_nota, v_autor, v_status, v_categoria
    from public.anuncios a where a.id = new.anuncio_id;
  select p.nome into v_quem from public.perfis p where p.id = new.ator_id;
  if new.tipo = 'match_desfeito' then
    select public.rotulo_motivo_desfeito(d.motivo), d.futuro into v_motivo, v_futuro
      from public.matches_desfeitos d
     where d.anuncio_id = new.anuncio_id and d.desfeito_por = new.ator_id
     order by d.id desc limit 1;
    if v_futuro then
      v_depois := coalesce(v_quem, 'A outra pessoa') || ' disse que topa negociar com você em outro momento. '
                  || case when new.destinatario_id = v_autor
                          then 'Se quiser, dá para dar match de novo na lista de interessados.'
                          else 'Se ainda tiver interesse, dá para curtir o anúncio de novo.' end;
    end if;
  end if;
  if new.tipo in ('etapa', 'seguindo', 'recomendacao', 'contratacao', 'entrevista', 'entrevista_resposta', 'busca',
                  'convite', 'vaga_preenchida', 'finalistas', 'convite_candidato', 'equipe', 'conexao',
                  'liberado', 'lembrete_curtida', 'sem_resposta', 'dispensada', 'entrevista_lembrete',
                  'video_pedido', 'video_enviado', 'parados', 'proposta', 'proposta_resposta', 'candidatura_recebida') then
    v_motivo := new.texto;
  end if;
  -- entrevista: os dados para o convite de agenda (.ics) que vai anexo no e-mail
  if new.tipo in ('entrevista', 'entrevista_resposta', 'entrevista_lembrete') then
    select jsonb_build_object(
             'id', e.id,
             'quando', e.quando,
             'duracao_min', e.duracao_min,
             'formato', e.formato,
             'local', e.local,
             'obs', e.obs,
             'situacao', e.situacao,
             'atualizado_em', e.atualizado_em,
             'anuncio_id', e.anuncio_id,
             'perfil_id', e.perfil_id,
             'vaga', a.titulo,
             'empresa', pa.nome,
             'candidato', pc.nome,
             'para', case when new.destinatario_id = a.autor_id then 'empresa' else 'candidato' end)
      into v_entrevista
      from public.entrevistas e
      join public.anuncios a on a.id = e.anuncio_id
      join public.perfis pa on pa.id = a.autor_id
      join public.perfis pc on pc.id = e.perfil_id
     where e.anuncio_id = new.anuncio_id
       and e.perfil_id = case when new.destinatario_id = a.autor_id then new.ator_id else new.destinatario_id end
     order by e.atualizado_em desc
     limit 1;
  end if;
  perform privado.enfileirar_email(new.destinatario_id, new.tipo, jsonb_build_object(
    'quem', coalesce(v_quem, 'Alguém'),
    'titulo', coalesce(v_titulo, ''),
    'motivo', coalesce(v_motivo, v_nota, ''),
    'depois', coalesce(v_depois, ''),
    'caminho', case new.tipo
                 -- a ficha de quem curtiu na Caixa de entrada, com o Aceitar e o Dispensar (o serviço volta para o anúncio)
                 when 'curtida' then '/painel/caixa?aba=responder&c=' || new.anuncio_id || ':' || new.ator_id
                 when 'lembrete_curtida' then '/painel/caixa?aba=responder&vaga=' || new.anuncio_id
                 when 'sem_resposta' then '/?tipo=vaga&categoria=' || coalesce(v_categoria, 'outros')
                 when 'dispensada' then '/anuncio/' || new.anuncio_id || '/parecidas'
                 when 'match' then '/painel/matches'
                 when 'liberado' then
                   case when v_status = 'ativo' then '/anuncio/' || new.anuncio_id else '/painel/anuncios' end
                 when 'removido' then '/privacidade#regras'
                 when 'avaliacao' then '/painel/avaliacoes'
                 when 'avaliacao_retida' then '/privacidade#regras'
                 when 'match_desfeito' then
                   case when new.destinatario_id = v_autor then '/painel/anuncio/' || new.anuncio_id
                        else '/anuncio/' || new.anuncio_id end
                 when 'etapa' then '/painel/curtidas'
                 when 'mensagem' then coalesce('/painel/conversas/' || new.ator_id, '/painel/conversas')
                 when 'seguindo' then '/anuncio/' || new.anuncio_id
                 when 'busca' then '/anuncio/' || new.anuncio_id
                 when 'convite' then '/anuncio/' || new.anuncio_id
                 when 'vaga_preenchida' then '/?tipo=vaga'
                 when 'recomendacao' then '/perfil/' || new.destinatario_id || '#recomendacoes'
                 when 'contratacao' then
                   case when new.destinatario_id = v_autor then '/painel/anuncio/' || new.anuncio_id
                        else '/painel/curtidas' end
                 when 'entrevista' then '/anuncio/' || new.anuncio_id
                 when 'entrevista_resposta' then '/painel/anuncio/' || new.anuncio_id || '/quadro'
                 when 'video_pedido' then '/entrevista-video/' || new.anuncio_id
                 when 'video_enviado' then '/painel/anuncio/' || new.anuncio_id || '/quadro?candidato=' || new.ator_id
                 when 'parados' then '/painel/anuncio/' || new.anuncio_id || '/quadro'
                 when 'proposta' then '/proposta/' || new.anuncio_id
                 when 'candidatura_recebida' then '/painel/curtidas'
                 when 'proposta_resposta' then '/painel/anuncio/' || new.anuncio_id || '/quadro?candidato=' || new.ator_id
                 when 'entrevista_lembrete' then
                   case when new.destinatario_id = v_autor then '/painel/anuncio/' || new.anuncio_id || '/quadro?candidato=' || new.ator_id
                        else '/anuncio/' || new.anuncio_id end
                 when 'aceite_curriculo' then '/perfil/curriculo?next=%2Fanuncio%2F' || new.anuncio_id
                 when 'curriculo_recebido' then '/painel/anuncio/' || new.anuncio_id || '#candidato-' || new.ator_id
                 when 'finalistas' then '/painel/anuncio/' || new.anuncio_id || '/finalistas'
                 when 'convite_candidato' then '/painel/anuncio/' || new.anuncio_id || '/convidar'
                 when 'equipe' then '/painel/equipe'
                 when 'conexao' then '/painel/conexoes/' || new.ator_id
                 else '/painel'
               end)
    || case when v_entrevista is null then '{}'::jsonb else jsonb_build_object('entrevista', v_entrevista) end);
  return null;
end
$function$;

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('candidatura_recebida', 'usuarios', 22, 'Candidatura recebida',
     'Para quem se candidatou: o recado automático da empresa (a automação "Confirmar o recebimento").',
     array['nome', 'quem', 'titulo', 'motivo', 'link'],
     'Recebemos a sua candidatura para “{{titulo}}”',
     '{{motivo}}',
     'Ver as minhas candidaturas')
  ) as v(chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do nothing;

-- 12. Permissões ---------------------------------------------------------------------------------------------
revoke all on function privado.regras_em_json(public.automacoes_vaga),
                       privado.aplicar_automacoes(uuid, uuid, uuid, jsonb, boolean)
  from public, anon, authenticated;
revoke all on function public.salvar_regras_automacao(uuid, jsonb), public.copiar_automacoes(uuid),
                       public.usar_automacoes_nas_novas(uuid, boolean), public.automacao_anotar_horarios(uuid, uuid)
  from public, anon;
grant execute on function public.salvar_regras_automacao(uuid, jsonb), public.copiar_automacoes(uuid),
                          public.usar_automacoes_nas_novas(uuid, boolean), public.automacao_anotar_horarios(uuid, uuid)
  to authenticated;

notify pgrst, 'reload schema';
