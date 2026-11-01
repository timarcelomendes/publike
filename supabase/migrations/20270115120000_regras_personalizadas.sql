-- As Automações personalizadas: a empresa monta as próprias regras (claude/plano-regras-personalizadas.md). Pode
-- rodar de novo. Rode depois de 20270114120000_automacoes_sob_medida.sql.
--   Quando [algo acontece], se [a pessoa atende isto], então [o Publike faz aquilo], em [esta vaga, todas ou as
--   vagas de um cliente]. Montar e ligar é do recurso pago `automacoes` (15 dias grátis); as 5 automações prontas
--   (automacoes_vaga) continuam grátis.
--   Por dentro: os gatilhos do banco anotam cada acontecimento em privado.regras_eventos; o servidor do site lê a
--   fila (servidor_regras_pendentes), confere as condições (o % que combina e a distância só existem no código do
--   site) e pede ao banco para agir (servidor_regra_agir), que confere de novo e age como a conta (as mesmas funções
--   da tela), uma vez por pessoa em cada regra.

-- 1. As regras e o que elas fizeram ------------------------------------------------------------------------------
create table if not exists public.regras (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.perfis (id) on delete cascade,
  nome text not null check (char_length(nome) between 2 and 80),
  ligada boolean not null default false,
  -- só age em quem chega depois de ligada (o "rodar para quem já está" é à parte)
  ligada_em timestamptz,
  vale_em text not null check (vale_em in ('vaga', 'todas', 'cliente')),
  anuncio_id uuid references public.anuncios (id) on delete cascade,
  cliente_id uuid,
  gatilho jsonb not null,
  condicoes jsonb not null default '[]'::jsonb,
  acoes jsonb not null,
  -- o modelo de onde veio (só para os números)
  modelo text check (modelo is null or modelo ~ '^[a-z-]{2,40}$'),
  criada_por uuid,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  check (vale_em <> 'vaga' or anuncio_id is not null),
  check (vale_em <> 'cliente' or cliente_id is not null)
);
create index if not exists regras_conta on public.regras (conta_id) where ligada;
alter table public.regras enable row level security;
drop policy if exists "a conta vê as suas regras" on public.regras;
create policy "a conta vê as suas regras" on public.regras
  for select to authenticated using (conta_id = (select public.conta_atual()));
revoke all on public.regras from anon;
grant select on public.regras to authenticated;

create table if not exists privado.regras_eventos (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('candidatou', 'entrou_etapa', 'parado', 'triagem', 'teste_feito',
                                     'teste_vencido', 'video_enviado', 'entrevista_passou')),
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  -- a etapa (entrou_etapa, parado); regra_id: o evento é só dessa regra (os de tempo e o "rodar agora")
  dados jsonb not null default '{}'::jsonb,
  regra_id uuid references public.regras (id) on delete cascade,
  -- quantas regras seguidas levaram a este evento (uma regra pode puxar outra, até 3)
  profundidade smallint not null default 0,
  criado_em timestamptz not null default now(),
  processado_em timestamptz
);
create index if not exists regras_eventos_fila on privado.regras_eventos (id) where processado_em is null;
-- os de tempo uma vez por regra e pessoa
create unique index if not exists regras_eventos_tempo on privado.regras_eventos (regra_id, anuncio_id, perfil_id, tipo)
  where regra_id is not null and tipo in ('parado', 'teste_vencido', 'entrevista_passou');
alter table privado.regras_eventos enable row level security;

create table if not exists privado.regras_feitas (
  id bigint generated always as identity primary key,
  regra_id uuid not null references public.regras (id) on delete cascade,
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  -- o que fez (as ações, com o resultado de cada uma) e como a pessoa estava antes (para o Desfazer)
  feitas jsonb not null default '[]'::jsonb,
  antes jsonb not null default '{}'::jsonb,
  feito_em timestamptz not null default now(),
  desfeito_em timestamptz,
  unique (regra_id, anuncio_id, perfil_id)
);
create index if not exists regras_feitas_vaga on privado.regras_feitas (anuncio_id, feito_em desc);
alter table privado.regras_feitas enable row level security;

-- as mensagens com "esperar" (e as de fora das 8h às 20h)
create table if not exists privado.regras_agendadas (
  id bigint generated always as identity primary key,
  feita_id bigint not null references privado.regras_feitas (id) on delete cascade,
  anuncio_id uuid not null,
  perfil_id uuid not null,
  texto text not null,
  quando timestamptz not null,
  -- como a pessoa estava ao agendar: se mudar de etapa ou for dispensada antes, não sai
  etapa text,
  feita_em timestamptz,
  cancelada_em timestamptz
);
create index if not exists regras_agendadas_fila on privado.regras_agendadas (quando)
  where feita_em is null and cancelada_em is null;
alter table privado.regras_agendadas enable row level security;

-- o porquê da dispensa automática, para o retorno dizer (sai junto com o retorno)
create table if not exists privado.regras_motivos (
  anuncio_id uuid not null,
  perfil_id uuid not null,
  texto text not null,
  criado_em timestamptz not null default now(),
  primary key (anuncio_id, perfil_id)
);
alter table privado.regras_motivos enable row level security;
revoke all on privado.regras_eventos, privado.regras_feitas, privado.regras_agendadas, privado.regras_motivos
  from public, anon, authenticated;

-- 2. Conferir uma regra ---------------------------------------------------------------------------------------------
-- A regra que chega da tela: devolve a limpa ou um erro claro. As listas são fechadas (não há campo livre para
-- condição: idade, sexo, estado civil, filhos e parecidos não existem aqui). A IA (a Triagem) nunca dispensa.
create or replace function privado.regra_limpa(p jsonb, p_conta uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  g jsonb := coalesce(p -> 'gatilho', '{}'::jsonb);
  v_tipo text := g ->> 'tipo';
  v_gatilho jsonb;
  c jsonb;
  ac jsonb;
  v_conds jsonb := '[]'::jsonb;
  v_acoes jsonb := '[]'::jsonb;
  v_campo text;
  v_op text;
  v_num numeric;
  v_dispensa boolean := false;
  v_ia boolean := false;
  v_txt text;
  v_vale text := coalesce(p ->> 'vale_em', 'vaga');
begin
  -- quando
  if v_tipo = 'candidatou' or v_tipo in ('triagem', 'teste_feito', 'teste_vencido', 'video_enviado') then
    v_gatilho := jsonb_build_object('tipo', v_tipo);
  elsif v_tipo = 'entrou_etapa' then
    if coalesce(g ->> 'etapa', '') not in ('analise', 'entrevista', 'contratado', 'nao_seguiu') then
      raise exception 'Escolha a etapa da regra.' using errcode = '22023';
    end if;
    v_gatilho := jsonb_build_object('tipo', v_tipo, 'etapa', g ->> 'etapa');
  elsif v_tipo = 'parado' then
    if coalesce(g ->> 'etapa', '') not in ('novos', 'analise', 'entrevista')
       or coalesce(nullif(g ->> 'dias', '')::integer, 0) not between 1 and 30 then
      raise exception 'Escolha a etapa e de 1 a 30 dias.' using errcode = '22023';
    end if;
    v_gatilho := jsonb_build_object('tipo', v_tipo, 'etapa', g ->> 'etapa', 'dias', (g ->> 'dias')::integer);
  elsif v_tipo = 'entrevista_passou' then
    if coalesce(nullif(g ->> 'horas', '')::integer, 0) not between 1 and 72 then
      raise exception 'Escolha de 1 a 72 horas depois da entrevista.' using errcode = '22023';
    end if;
    v_gatilho := jsonb_build_object('tipo', v_tipo, 'horas', (g ->> 'horas')::integer);
  else
    raise exception 'Escolha quando a regra age.' using errcode = '22023';
  end if;

  -- se
  if jsonb_typeof(p -> 'condicoes') = 'array' then
    if jsonb_array_length(p -> 'condicoes') > 5 then
      raise exception 'Até 5 condições por regra.' using errcode = '22023';
    end if;
    for c in select * from jsonb_array_elements(p -> 'condicoes') loop
      v_campo := c ->> 'campo';
      v_op := c ->> 'op';
      if v_campo = 'pergunta' then
        v_txt := left(btrim(coalesce(c ->> 'pergunta', '')), 120);
        if v_txt = '' or v_op not in ('em', 'fora', 'maior_igual', 'menor_igual') then
          raise exception 'Confira a pergunta da condição.' using errcode = '22023';
        end if;
        if v_op in ('em', 'fora') and (jsonb_typeof(c -> 'valores') <> 'array'
                                       or jsonb_array_length(c -> 'valores') not between 1 and 8) then
          raise exception 'Escolha a resposta da pergunta “%”.', v_txt using errcode = '22023';
        end if;
        if v_op in ('maior_igual', 'menor_igual') and jsonb_typeof(c -> 'valor') <> 'number' then
          raise exception 'Escolha o número da pergunta “%”.', v_txt using errcode = '22023';
        end if;
        v_conds := v_conds || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'campo', 'pergunta', 'pergunta', v_txt, 'op', v_op,
          'valores', case when v_op in ('em', 'fora') then c -> 'valores' end,
          'valor', case when v_op in ('maior_igual', 'menor_igual') then c -> 'valor' end)));
      elsif v_campo in ('teste', 'combina') then
        v_num := nullif(c ->> 'valor', '')::numeric;
        if v_op not in ('maior_igual', 'menor') or v_num is null or v_num not between 0 and 100 then
          raise exception 'Confira a porcentagem da condição.' using errcode = '22023';
        end if;
        v_conds := v_conds || jsonb_build_array(jsonb_build_object('campo', v_campo, 'op', v_op, 'valor', round(v_num)));
      elsif v_campo = 'distancia' then
        v_num := nullif(c ->> 'valor', '')::numeric;
        if v_op not in ('ate', 'mais_de') or v_num is null or v_num not between 1 and 200 then
          raise exception 'Confira a distância da condição (de 1 a 200 km).' using errcode = '22023';
        end if;
        v_conds := v_conds || jsonb_build_array(jsonb_build_object('campo', v_campo, 'op', v_op, 'valor', round(v_num)));
      elsif v_campo = 'triagem' and v_op in ('atende', 'nao_atende') then
        v_ia := true;
        v_conds := v_conds || jsonb_build_array(jsonb_build_object('campo', v_campo, 'op', v_op));
      elsif v_campo = 'curriculo' and v_op in ('tem', 'nao_tem') then
        v_conds := v_conds || jsonb_build_array(jsonb_build_object('campo', v_campo, 'op', v_op));
      elsif v_campo = 'origem' and v_op in ('publike', 'chamado') then
        v_conds := v_conds || jsonb_build_array(jsonb_build_object('campo', v_campo, 'op', v_op));
      else
        raise exception 'Condição não encontrada.' using errcode = '22023';
      end if;
    end loop;
  end if;

  -- então
  if jsonb_typeof(p -> 'acoes') <> 'array' or jsonb_array_length(p -> 'acoes') not between 1 and 4 then
    raise exception 'Escolha de 1 a 4 ações.' using errcode = '22023';
  end if;
  for ac in select * from jsonb_array_elements(p -> 'acoes') loop
    v_tipo := ac ->> 'tipo';
    if v_tipo = 'mover' then
      if coalesce(ac ->> 'etapa', '') not in ('analise', 'entrevista', 'contratado', 'nao_seguiu') then
        raise exception 'Escolha para qual etapa mover.' using errcode = '22023';
      end if;
      v_dispensa := v_dispensa or ac ->> 'etapa' = 'nao_seguiu';
      v_acoes := v_acoes || jsonb_build_array(jsonb_build_object('tipo', 'mover', 'etapa', ac ->> 'etapa'));
    elsif v_tipo in ('aceitar', 'dispensar', 'video') then
      v_dispensa := v_dispensa or v_tipo = 'dispensar';
      v_acoes := v_acoes || jsonb_build_array(jsonb_build_object('tipo', v_tipo));
    elsif v_tipo = 'mensagem' then
      v_txt := btrim(coalesce(ac ->> 'texto', ''));
      if char_length(v_txt) not between 10 and 1500 then
        raise exception 'A mensagem tem de 10 a 1.500 letras.' using errcode = '22023';
      end if;
      if coalesce(ac ->> 'esperar', 'agora') not in ('agora', '1h', 'amanha') then
        raise exception 'Escolha quando a mensagem sai.' using errcode = '22023';
      end if;
      v_acoes := v_acoes || jsonb_build_array(jsonb_build_object('tipo', 'mensagem', 'texto', v_txt,
                                                                'esperar', coalesce(ac ->> 'esperar', 'agora')));
    elsif v_tipo = 'teste' then
      if coalesce(ac ->> 'modelo', '') !~ '^[0-9a-f-]{36}$'
         or not exists (select 1 from privado.avaliacoes_modelos m
                         where m.id = (ac ->> 'modelo')::uuid and (m.conta_id is null or m.conta_id = p_conta)) then
        raise exception 'Escolha o teste.' using errcode = '22023';
      end if;
      v_acoes := v_acoes || jsonb_build_array(jsonb_build_object('tipo', 'teste', 'modelo', ac ->> 'modelo'));
    elsif v_tipo = 'horarios' then
      if coalesce(ac ->> 'formato', '') not in ('presencial', 'telefone', 'video', 'publike')
         or coalesce(nullif(ac ->> 'duracao', '')::integer, 30) not between 15 and 180
         or (ac ->> 'formato' = 'presencial' and nullif(btrim(coalesce(ac ->> 'local', '')), '') is null)
         or (ac ->> 'formato' = 'video' and coalesce(ac ->> 'local', '') !~* '^https://') then
        raise exception 'Confira como vai ser a entrevista: o endereço ou o link da chamada.' using errcode = '22023';
      end if;
      v_acoes := v_acoes || jsonb_build_array(jsonb_build_object('tipo', 'horarios', 'formato', ac ->> 'formato',
        'local', nullif(left(btrim(coalesce(ac ->> 'local', '')), 300), ''),
        'duracao', coalesce(nullif(ac ->> 'duracao', '')::integer, 30)));
    elsif v_tipo = 'avisar' then
      if coalesce(ac ->> 'quem', 'eu') <> 'eu'
         and not exists (select 1 from public.equipe_agencia e
                          where e.agencia_id = p_conta and e.membro_id::text = ac ->> 'quem') then
        raise exception 'Escolha quem recebe o aviso.' using errcode = '22023';
      end if;
      v_acoes := v_acoes || jsonb_build_array(jsonb_build_object('tipo', 'avisar', 'quem', coalesce(ac ->> 'quem', 'eu')));
    else
      raise exception 'Ação não encontrada.' using errcode = '22023';
    end if;
  end loop;

  -- os cuidados da dispensa
  if v_dispensa then
    if v_ia then
      raise exception 'A Triagem com IA não dispensa ninguém: use ela para levar adiante ou avisar.'
        using errcode = 'P0001', hint = 'regra_ia_dispensa';
    end if;
    if jsonb_array_length(v_conds) = 0 and v_gatilho ->> 'tipo' not in ('parado', 'teste_vencido') then
      raise exception 'Para dispensar, a regra precisa de pelo menos uma condição.' using errcode = 'P0001';
    end if;
    for c in select * from jsonb_array_elements(v_conds) where value ->> 'campo' = 'pergunta' loop
      if privado.copiloto_criterio_proibido(c ->> 'pergunta') then
        raise exception 'A pergunta “%” fala de um tema que não pode decidir uma vaga (como idade, filhos ou estado civil).',
          c ->> 'pergunta' using errcode = 'P0001', hint = 'regra_proibida';
      end if;
    end loop;
  end if;

  if v_vale not in ('vaga', 'todas', 'cliente') then
    raise exception 'Escolha onde a regra vale.' using errcode = '22023';
  end if;
  return jsonb_build_object('gatilho', v_gatilho, 'condicoes', v_conds, 'acoes', v_acoes, 'vale_em', v_vale);
end
$$;

-- 3. Salvar, ligar, apagar e rodar para quem já está (a tela) -------------------------------------------------------
create or replace function public.salvar_regra(p_id uuid, p_regra jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := public.conta_atual();
  x jsonb;
  v_nome text := left(btrim(coalesce(p_regra ->> 'nome', '')), 80);
  v_anuncio uuid;
  v_cliente uuid;
  v_id uuid;
begin
  perform privado.exigir_conta_ativa();
  if not exists (select 1 from public.perfis p where p.id = conta and p.tipo in ('comercio', 'empresa', 'agencia')) then
    raise exception 'As regras são para contas de comércio, empresa ou agência.' using errcode = 'P0001';
  end if;
  if not privado.automacoes_liberado(conta) then
    raise exception 'Montar as suas regras é das Automações personalizadas. Experimente 15 dias grátis.'
      using errcode = 'P0001', hint = 'automacoes_fechado';
  end if;
  x := privado.regra_limpa(p_regra, conta);
  if char_length(v_nome) < 2 then
    raise exception 'Dê um nome à regra.' using errcode = '22023';
  end if;
  if x ->> 'vale_em' = 'vaga' then
    select a.id into v_anuncio from public.anuncios a
     where a.id::text = p_regra ->> 'anuncio_id' and a.autor_id = conta and a.tipo = 'vaga';
    if v_anuncio is null then
      raise exception 'Vaga não encontrada.' using errcode = 'P0002';
    end if;
  elsif x ->> 'vale_em' = 'cliente' then
    select c.id into v_cliente from public.clientes_agencia c
     where c.id::text = p_regra ->> 'cliente_id' and c.agencia_id = conta;
    if v_cliente is null then
      raise exception 'Cliente não encontrado.' using errcode = 'P0002';
    end if;
  end if;
  if p_id is null then
    if (select count(*) from public.regras r where r.conta_id = conta) >= 100 then
      raise exception 'Até 100 regras por conta. Apague as que não usa mais.' using errcode = 'P0001';
    end if;
    insert into public.regras (conta_id, nome, vale_em, anuncio_id, cliente_id, gatilho, condicoes, acoes, modelo,
                               criada_por)
    values (conta, v_nome, x ->> 'vale_em', v_anuncio, v_cliente, x -> 'gatilho', x -> 'condicoes', x -> 'acoes',
            nullif(p_regra ->> 'modelo', ''), (select auth.uid()))
    returning id into v_id;
  else
    update public.regras r
       set nome = v_nome, vale_em = x ->> 'vale_em', anuncio_id = v_anuncio, cliente_id = v_cliente,
           gatilho = x -> 'gatilho', condicoes = x -> 'condicoes', acoes = x -> 'acoes', atualizada_em = now()
     where r.id = p_id and r.conta_id = conta
    returning r.id into v_id;
    if v_id is null then
      raise exception 'Regra não encontrada.' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end
$$;

create or replace function public.ligar_regra(p_id uuid, p_ligar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := public.conta_atual();
begin
  perform privado.exigir_conta_ativa();
  if coalesce(p_ligar, false) then
    if not privado.automacoes_liberado(conta) then
      raise exception 'Ligar as suas regras é das Automações personalizadas. Experimente 15 dias grátis.'
        using errcode = 'P0001', hint = 'automacoes_fechado';
    end if;
    if (select count(*) from public.regras r where r.conta_id = conta and r.ligada and r.id <> p_id) >= 30 then
      raise exception 'Até 30 regras ligadas por conta.' using errcode = 'P0001';
    end if;
  end if;
  update public.regras r
     set ligada = coalesce(p_ligar, false),
         ligada_em = case when coalesce(p_ligar, false) and not r.ligada then now() else r.ligada_em end,
         atualizada_em = now()
   where r.id = p_id and r.conta_id = conta;
  if not found then
    raise exception 'Regra não encontrada.' using errcode = 'P0002';
  end if;
end
$$;

create or replace function public.apagar_regra(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_conta_ativa();
  delete from public.regras r where r.id = p_id and r.conta_id = public.conta_atual();
end
$$;

-- as vagas em que a regra vale (no ar ou não; a regra só age onde há candidato)
create or replace function privado.vagas_da_regra(r public.regras)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.id from public.anuncios a
   where a.autor_id = r.conta_id and a.tipo = 'vaga'
     and (r.vale_em = 'todas' or (r.vale_em = 'vaga' and a.id = r.anuncio_id)
          or (r.vale_em = 'cliente' and a.cliente_id = r.cliente_id))
$$;

-- "Também para quem já está": põe na fila quem já está na situação do gatilho (a regra age uma vez por pessoa)
create or replace function public.regra_rodar_agora(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.regras;
  n integer := 0;
  v_tipo text;
begin
  perform privado.exigir_conta_ativa();
  select * into r from public.regras x where x.id = p_id and x.conta_id = public.conta_atual();
  if r.id is null then
    raise exception 'Regra não encontrada.' using errcode = 'P0002';
  end if;
  if not r.ligada or not privado.automacoes_liberado(r.conta_id) then
    raise exception 'Ligue a regra primeiro.' using errcode = 'P0001';
  end if;
  v_tipo := r.gatilho ->> 'tipo';
  if v_tipo in ('parado', 'teste_vencido', 'entrevista_passou') then
    -- os de tempo já olham para todos na próxima volta da tarefa
    return 0;
  end if;
  insert into privado.regras_eventos (tipo, anuncio_id, perfil_id, dados, regra_id)
  select v_tipo, c.anuncio_id, c.perfil_id,
         case when v_tipo = 'entrou_etapa' then jsonb_build_object('etapa', r.gatilho ->> 'etapa') else '{}'::jsonb end,
         r.id
    from public.curtidas c
    left join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
   where c.anuncio_id in (select privado.vagas_da_regra(r))
     and not exists (select 1 from privado.regras_feitas f
                      where f.regra_id = r.id and f.anuncio_id = c.anuncio_id and f.perfil_id = c.perfil_id)
     and case v_tipo
           when 'candidatou' then c.status in ('pendente', 'match')
           when 'entrou_etapa' then
             case r.gatilho ->> 'etapa'
               when 'nao_seguiu' then c.status = 'dispensada' or e.etapa = 'nao_seguiu'
               else c.status = 'match' and e.etapa = r.gatilho ->> 'etapa' end
           when 'triagem' then exists (select 1 from privado.copiloto_avaliacoes k
                                        where k.anuncio_id = c.anuncio_id and k.perfil_id = c.perfil_id
                                          and k.origem = 'candidato')
           when 'teste_feito' then exists (select 1 from privado.avaliacoes_pedidas t
                                            where t.anuncio_id = c.anuncio_id and t.perfil_id = c.perfil_id
                                              and t.status = 'feita')
           when 'video_enviado' then exists (select 1 from public.entrevistas_video v
                                              where v.anuncio_id = c.anuncio_id and v.perfil_id = c.perfil_id
                                                and v.enviada_em is not null)
           else false end
   limit 500;
  get diagnostics n = row_count;
  return n;
end
$$;

-- o que as regras fizeram numa vaga (ou com uma pessoa): o registro, a ficha e o Desfazer
create or replace function public.regras_feitas_da_vaga(p_anuncio uuid, p_perfil uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id, 'regra_id', f.regra_id, 'regra', r.nome, 'perfil_id', f.perfil_id, 'nome', p.nome,
           'feitas', f.feitas, 'antes', f.antes, 'feito_em', f.feito_em, 'desfeito_em', f.desfeito_em)
           order by f.feito_em desc), '[]'::jsonb)
    from (select * from privado.regras_feitas x
           where x.anuncio_id = p_anuncio and (p_perfil is null or x.perfil_id = p_perfil)
           order by x.feito_em desc limit 60) f
    join public.regras r on r.id = f.regra_id
    join public.perfis p on p.id = f.perfil_id
    join public.anuncios a on a.id = f.anuncio_id
   where a.autor_id = public.conta_atual()
$$;

-- o Desfazer: o site volta a etapa (com a ação de mover, sem mensagem); aqui, a anotação e as mensagens que esperavam
create or replace function public.regra_marcar_desfeita(p_feita bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f privado.regras_feitas;
begin
  perform privado.exigir_conta_ativa();
  select x.* into f from privado.regras_feitas x
    join public.anuncios a on a.id = x.anuncio_id
   where x.id = p_feita and a.autor_id = public.conta_atual();
  if f.id is null then
    raise exception 'Não encontramos o que a regra fez.' using errcode = 'P0002';
  end if;
  update privado.regras_feitas set desfeito_em = now() where id = f.id;
  update privado.regras_agendadas set cancelada_em = now()
   where feita_id = f.id and feita_em is null and cancelada_em is null;
  delete from privado.regras_motivos m where m.anuncio_id = f.anuncio_id and m.perfil_id = f.perfil_id;
  return jsonb_build_object('anuncio_id', f.anuncio_id, 'perfil_id', f.perfil_id, 'antes', f.antes);
end
$$;

-- a prévia da tela ("nos últimos 30 dias, esta regra pegaria 4 das 12 candidaturas"): o que o site não tem na mão
create or replace function public.regras_previa_dados(p_anuncios uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'anuncio_id', c.anuncio_id, 'perfil_id', c.perfil_id, 'status', c.status, 'curtido_em', c.criado_em,
           'etapa', e.etapa, 'etapa_em', e.atualizado_em,
           'teste', (select max(round(t.pontos * 100.0 / nullif(t.maximo, 0))) from privado.avaliacoes_pedidas t
                      where t.anuncio_id = c.anuncio_id and t.perfil_id = c.perfil_id and t.status = 'feita'),
           'teste_vencido', exists (select 1 from privado.avaliacoes_pedidas t
                                     where t.anuncio_id = c.anuncio_id and t.perfil_id = c.perfil_id
                                       and t.status = 'pedida' and t.prazo < now()),
           'triagem', (select k.obrigatorios_ok from privado.copiloto_avaliacoes k
                        where k.anuncio_id = c.anuncio_id and k.perfil_id = c.perfil_id and k.origem = 'candidato'
                        order by k.criado_em desc limit 1),
           'video', exists (select 1 from public.entrevistas_video v
                             where v.anuncio_id = c.anuncio_id and v.perfil_id = c.perfil_id and v.enviada_em is not null),
           'entrevista_em', (select max(x.quando) from public.entrevistas x
                              where x.anuncio_id = c.anuncio_id and x.perfil_id = c.perfil_id
                                and x.situacao in ('marcada', 'confirmada') and x.quando < now()),
           'origem', case when exists (select 1 from public.convites_candidato k
                                        where k.anuncio_id = c.anuncio_id and k.perfil_id = c.perfil_id)
                            or exists (select 1 from public.convites_vaga k
                                        where k.anuncio_id = c.anuncio_id and k.perfil_id = c.perfil_id)
                          then 'chamado' else 'publike' end)), '[]'::jsonb)
    from public.curtidas c
    join public.anuncios a on a.id = c.anuncio_id
    left join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
   where c.anuncio_id = any (coalesce(p_anuncios, '{}')) and a.autor_id = public.conta_atual() and a.tipo = 'vaga'
$$;
revoke all on function public.regras_previa_dados(uuid[]) from public, anon;
grant execute on function public.regras_previa_dados(uuid[]) to authenticated;

-- quantas vezes cada regra da conta agiu (sem os desfeitos)
create or replace function public.regras_agiram()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(q.regra_id, q.n), '{}'::jsonb)
    from (select f.regra_id, count(*) as n from privado.regras_feitas f
            join public.regras r on r.id = f.regra_id
           where r.conta_id = public.conta_atual() and f.desfeito_em is null
           group by f.regra_id) q
$$;
revoke all on function public.regras_agiram() from public, anon;
grant execute on function public.regras_agiram() to authenticated;

-- 4. Anotar os acontecimentos (os gatilhos do banco) ---------------------------------------------------------------
-- Só para quem tem regra ligada; uma regra que age pode puxar outra até 3 passos (publike.regra_profundidade).
create or replace function privado.regras_anotar(p_tipo text, p_anuncio uuid, p_perfil uuid, p_dados jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prof integer := coalesce(nullif(current_setting('publike.regra_profundidade', true), '')::integer, 0);
begin
  if v_prof >= 3 then
    return;
  end if;
  if not exists (select 1 from public.anuncios a join public.regras r on r.conta_id = a.autor_id and r.ligada
                  where a.id = p_anuncio and a.tipo = 'vaga') then
    return;
  end if;
  insert into privado.regras_eventos (tipo, anuncio_id, perfil_id, dados, profundidade)
  values (p_tipo, p_anuncio, p_perfil, coalesce(p_dados, '{}'::jsonb), v_prof);
exception when others then
  -- nunca impede a ação de quem usa o site
  raise warning 'Publike: não deu para anotar o evento das regras: %', sqlerrm;
end
$$;

create or replace function privado.regras_ao_curtir()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform privado.regras_anotar('candidatou', new.anuncio_id, new.perfil_id, '{}'::jsonb);
  elsif new.status = 'dispensada' and old.status is distinct from 'dispensada' then
    perform privado.regras_anotar('entrou_etapa', new.anuncio_id, new.perfil_id, '{"etapa": "nao_seguiu"}'::jsonb);
  end if;
  return null;
end
$$;
drop trigger if exists curtidas_zzzz_regras on public.curtidas;
create trigger curtidas_zzzz_regras after insert or update of status on public.curtidas
  for each row execute function privado.regras_ao_curtir();

create or replace function privado.regras_ao_mudar_etapa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.etapa in ('analise', 'entrevista', 'contratado', 'nao_seguiu')
     and (tg_op = 'INSERT' or new.etapa is distinct from old.etapa) then
    perform privado.regras_anotar('entrou_etapa', new.anuncio_id, new.perfil_id, jsonb_build_object('etapa', new.etapa));
  end if;
  return null;
end
$$;
drop trigger if exists etapas_zzzz_regras on public.etapas_candidatos;
create trigger etapas_zzzz_regras after insert or update of etapa on public.etapas_candidatos
  for each row execute function privado.regras_ao_mudar_etapa();

create or replace function privado.regras_ao_ler_triagem()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.origem = 'candidato' then
    perform privado.regras_anotar('triagem', new.anuncio_id, new.perfil_id, '{}'::jsonb);
  end if;
  return null;
end
$$;
drop trigger if exists copiloto_avaliacoes_regras on privado.copiloto_avaliacoes;
create trigger copiloto_avaliacoes_regras after insert or update on privado.copiloto_avaliacoes
  for each row execute function privado.regras_ao_ler_triagem();

create or replace function privado.regras_ao_fazer_teste()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'feita' and old.status is distinct from 'feita' then
    perform privado.regras_anotar('teste_feito', new.anuncio_id, new.perfil_id, '{}'::jsonb);
  end if;
  return null;
end
$$;
drop trigger if exists avaliacoes_pedidas_regras on privado.avaliacoes_pedidas;
create trigger avaliacoes_pedidas_regras after update of status on privado.avaliacoes_pedidas
  for each row execute function privado.regras_ao_fazer_teste();

create or replace function privado.regras_ao_mandar_video()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.enviada_em is not null and old.enviada_em is null then
    perform privado.regras_anotar('video_enviado', new.anuncio_id, new.perfil_id, '{}'::jsonb);
  end if;
  return null;
end
$$;
drop trigger if exists entrevistas_video_regras on public.entrevistas_video;
create trigger entrevistas_video_regras after update of enviada_em on public.entrevistas_video
  for each row execute function privado.regras_ao_mandar_video();

-- 5. O servidor do site: ler a fila, os horários livres e agir ---------------------------------------------------
-- A fila com o que o site precisa para conferir as condições: as regras que valem, a vaga, a pessoa, o currículo,
-- a nota do teste, a Triagem e de onde veio. Os eventos sem regra que valha saem da fila sem voltar.
create or replace function public.servidor_regras_pendentes(p_chave text, p_limite integer default 40)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev record;
  v_regras jsonb;
  saida jsonb := '[]'::jsonb;
begin
  perform privado.exigir_servidor(p_chave);
  for ev in
    with escolhidos as (
      select e.id from privado.regras_eventos e
       where e.processado_em is null
       order by e.id
       limit least(greatest(coalesce(p_limite, 40), 1), 200)
       for update skip locked)
    update privado.regras_eventos e set processado_em = now()
      from escolhidos s
     where e.id = s.id
    returning e.*
  loop
    select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'nome', r.nome, 'conta_id', r.conta_id,
                                                 'gatilho', r.gatilho, 'condicoes', r.condicoes, 'acoes', r.acoes)
                              order by r.criada_em), '[]'::jsonb)
      into v_regras
      from public.regras r
      join public.anuncios a on a.id = ev.anuncio_id and a.autor_id = r.conta_id
     where r.ligada
       and privado.automacoes_liberado(r.conta_id)
       and (ev.regra_id is null or ev.regra_id = r.id)
       -- só em quem chegou depois de ligada (o "rodar agora" e os de tempo trazem a regra)
       and (ev.regra_id is not null or ev.criado_em >= coalesce(r.ligada_em, r.criada_em))
       and (r.vale_em = 'todas' or (r.vale_em = 'vaga' and r.anuncio_id = a.id)
            or (r.vale_em = 'cliente' and r.cliente_id = a.cliente_id))
       and r.gatilho ->> 'tipo' = ev.tipo
       and (ev.tipo not in ('entrou_etapa', 'parado') or r.gatilho ->> 'etapa' = ev.dados ->> 'etapa')
       and not exists (select 1 from privado.regras_feitas f
                        where f.regra_id = r.id and f.anuncio_id = ev.anuncio_id and f.perfil_id = ev.perfil_id);
    continue when jsonb_array_length(v_regras) = 0;
    saida := saida || jsonb_build_array(jsonb_build_object(
      'evento', jsonb_build_object('id', ev.id, 'tipo', ev.tipo, 'anuncio_id', ev.anuncio_id,
                                   'perfil_id', ev.perfil_id, 'dados', ev.dados, 'profundidade', ev.profundidade),
      'regras', v_regras,
      'vaga', (select jsonb_build_object('id', a.id, 'titulo', a.titulo, 'descricao', a.descricao,
                                         'escolaridade_minima', a.escolaridade_minima, 'experiencia', a.experiencia,
                                         'cnh', a.cnh, 'cidade', a.cidade, 'bairro', a.bairro, 'jornada', a.jornada,
                                         'horario_detalhe', a.horario_detalhe, 'perguntas', a.perguntas,
                                         'conta_id', a.autor_id, 'endereco', a.endereco)
                 from public.anuncios a where a.id = ev.anuncio_id),
      'candidato', (select jsonb_build_object(
                      'nome', p.nome, 'cidade', p.cidade, 'bairro', p.bairro, 'status', c.status,
                      'respostas', coalesce(c.respostas, '{}'::jsonb),
                      'etapa', (select e.etapa from public.etapas_candidatos e
                                 where e.anuncio_id = ev.anuncio_id and e.perfil_id = ev.perfil_id),
                      'origem', case when exists (select 1 from public.convites_candidato k
                                                   where k.anuncio_id = ev.anuncio_id and k.perfil_id = ev.perfil_id)
                                       or exists (select 1 from public.convites_vaga k
                                                   where k.anuncio_id = ev.anuncio_id and k.perfil_id = ev.perfil_id)
                                     then 'chamado' else 'publike' end)
                      from public.perfis p
                      left join public.curtidas c on c.anuncio_id = ev.anuncio_id and c.perfil_id = p.id
                     where p.id = ev.perfil_id),
      'curriculo', (select jsonb_build_object('escolaridade', cv.escolaridade, 'curso', cv.curso,
                                              'experiencias', cv.experiencias, 'cursos', cv.cursos, 'cnh', cv.cnh,
                                              'disponibilidade', cv.disponibilidade, 'titulo', cv.titulo,
                                              'habilidades', cv.habilidades, 'estudos', cv.estudos)
                      from public.curriculos cv where cv.perfil_id = ev.perfil_id),
      'teste', (select max(round(t.pontos * 100.0 / nullif(t.maximo, 0)))
                  from privado.avaliacoes_pedidas t
                 where t.anuncio_id = ev.anuncio_id and t.perfil_id = ev.perfil_id and t.status = 'feita'),
      'triagem', (select k.obrigatorios_ok from privado.copiloto_avaliacoes k
                   where k.anuncio_id = ev.anuncio_id and k.perfil_id = ev.perfil_id and k.origem = 'candidato'
                   order by k.criado_em desc limit 1)));
  end loop;
  return saida;
end
$$;

-- os horários livres da conta e os ocupados (para o site montar as opções da ação "oferecer os horários")
create or replace function public.servidor_regra_horarios(p_chave text, p_conta uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  perform set_config('request.jwt.claims', json_build_object('sub', p_conta, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_conta::text, true);
  return jsonb_build_object(
    'faixas', public.meus_horarios_livres(),
    'ocupados', coalesce((select jsonb_agg(jsonb_build_object('inicio', o.inicio, 'fim', o.fim))
                            from public.horarios_ocupados(21) o), '[]'::jsonb));
end
$$;

-- a mensagem: na conversa, para quem foi aceito; senão, um recado no sino (como o "Confirmar que a candidatura chegou")
create or replace function privado.regra_mandar(p_anuncio uuid, p_perfil uuid, p_texto text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.anuncios;
  v_nome text;
  v_texto text;
  v_status text;
begin
  select * into a from public.anuncios x where x.id = p_anuncio;
  select p.nome into v_nome from public.perfis p where p.id = p_perfil;
  select c.status into v_status from public.curtidas c where c.anuncio_id = p_anuncio and c.perfil_id = p_perfil;
  v_texto := replace(replace(replace(p_texto,
               '{nome}', coalesce(nullif(split_part(v_nome, ' ', 1), ''), 'tudo bem')),
               '{vaga}', a.titulo),
               '{empresa}', coalesce((select e.nome from public.perfis e where e.id = a.autor_id), 'a empresa'));
  if v_status = 'match' then
    perform public.enviar_mensagem(p_anuncio, p_perfil, left(v_texto, 2000));
    return 'conversa';
  elsif v_status = 'pendente' then
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    values (p_perfil, 'candidatura_recebida', p_anuncio, a.autor_id, left(v_texto, 300));
    return 'recado';
  end if;
  return 'pulada';
end
$$;

-- agir: confere de novo, anota (uma vez por pessoa) e faz as ações escolhidas (os índices de `acoes` que o site
-- deixou depois de resolver os conflitos), como a conta: as mesmas funções da tela, com as mesmas regras.
create or replace function public.servidor_regra_agir(p_chave text, p_regra uuid, p_evento bigint, p_anuncio uuid,
                                                      p_perfil uuid, p_indices integer[], p_extras jsonb default '{}')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.regras;
  a public.anuncios;
  c public.curtidas;
  v_etapa text;
  v_nota text;
  v_feita bigint;
  ac jsonb;
  i integer;
  v_feitas jsonb := '[]'::jsonb;
  v_res text;
  v_decisao text;
  v_prof integer := coalesce((select e.profundidade from privado.regras_eventos e where e.id = p_evento), 0);
  v_quando timestamptz;
  v_hora integer;
  v_opcoes timestamptz[];
  v_motivo text;
begin
  perform privado.exigir_servidor(p_chave);
  select * into r from public.regras x where x.id = p_regra;
  select * into a from public.anuncios x where x.id = p_anuncio;
  select * into c from public.curtidas x where x.anuncio_id = p_anuncio and x.perfil_id = p_perfil;
  if r.id is null or not r.ligada or a.id is null or a.autor_id <> r.conta_id or c.anuncio_id is null
     or not privado.automacoes_liberado(r.conta_id)
     or p_anuncio not in (select privado.vagas_da_regra(r)) then
    return jsonb_build_object('ok', false, 'motivo', 'nao_vale');
  end if;
  select e.etapa, e.nota into v_etapa, v_nota from public.etapas_candidatos e
   where e.anuncio_id = p_anuncio and e.perfil_id = p_perfil;
  insert into privado.regras_feitas (regra_id, anuncio_id, perfil_id, antes)
  values (r.id, p_anuncio, p_perfil, jsonb_build_object('status', c.status, 'etapa', coalesce(v_etapa, 'novo')))
  on conflict (regra_id, anuncio_id, perfil_id) do nothing
  returning id into v_feita;
  if v_feita is null then
    return jsonb_build_object('ok', false, 'motivo', 'ja_feita');
  end if;
  -- agir como a conta (as funções da tela conferem tudo de novo); o que a regra fizer pode puxar outra regra
  perform set_config('request.jwt.claims', json_build_object('sub', r.conta_id, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', r.conta_id::text, true);
  perform set_config('publike.regra_profundidade', (v_prof + 1)::text, true);

  for i in select unnest(coalesce(p_indices, '{}')) loop
    ac := r.acoes -> (i - 1);
    continue when ac is null;
    begin
      select * into c from public.curtidas x where x.anuncio_id = p_anuncio and x.perfil_id = p_perfil;
      select e.etapa, e.nota into v_etapa, v_nota from public.etapas_candidatos e
       where e.anuncio_id = p_anuncio and e.perfil_id = p_perfil;
      v_res := 'feita';
      case ac ->> 'tipo'
        when 'mover', 'aceitar', 'dispensar' then
          -- como o mover da tela: quem espera e vai para Entrevista ou Contratado é aceito antes; Não seguiu dispensa
          v_etapa := case ac ->> 'tipo' when 'aceitar' then null when 'dispensar' then 'nao_seguiu'
                     else ac ->> 'etapa' end;
          v_decisao := case
            when ac ->> 'tipo' = 'aceitar' then case when c.status in ('pendente', 'dispensada', 'desfeito') then 'match' end
            when v_etapa = 'nao_seguiu' then case when c.status = 'pendente' then 'dispensada' end
            when v_etapa in ('entrevista', 'contratado') then
              case when c.status in ('pendente', 'dispensada', 'desfeito') then 'match' end
            else case when c.status = 'dispensada' then 'pendente' end end;
          if v_etapa = 'nao_seguiu' then
            v_motivo := nullif(p_extras ->> 'motivo', '');
            if v_motivo is not null then
              insert into privado.regras_motivos (anuncio_id, perfil_id, texto)
              values (p_anuncio, p_perfil, left(v_motivo, 200))
              on conflict (anuncio_id, perfil_id) do update set texto = excluded.texto, criado_em = now();
            end if;
          end if;
          if (v_etapa = 'nao_seguiu' and v_decisao is null and c.status <> 'match')
             or (ac ->> 'tipo' = 'aceitar' and v_decisao is null) then
            -- já dispensada, ou já aceita: nada a fazer
            v_res := 'pulada';
          else
            if v_decisao is not null then
              v_res := coalesce(public.responder_curtida(p_anuncio, p_perfil, v_decisao), 'feita');
            end if;
            -- como na tela: aceito esperando o currículo fica sem etapa; dispensar já encerra
            if v_etapa is not null and v_res <> 'aceita' and not (v_etapa = 'nao_seguiu' and v_decisao = 'dispensada') then
              perform public.salvar_etapa_candidato(p_anuncio, p_perfil, v_etapa, v_nota);
            end if;
            v_res := case when v_res = 'aceita' then 'aceita' else 'feita' end;
          end if;
        when 'mensagem' then
          v_quando := case ac ->> 'esperar' when '1h' then now() + interval '1 hour'
                        when 'amanha' then (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '1 day 9 hours')
                                           at time zone 'America/Sao_Paulo'
                        else now() end;
          v_hora := extract(hour from (v_quando at time zone 'America/Sao_Paulo'))::integer;
          if v_hora < 8 then
            v_quando := (date_trunc('day', v_quando at time zone 'America/Sao_Paulo') + interval '8 hours')
                        at time zone 'America/Sao_Paulo';
          elsif v_hora >= 20 then
            v_quando := (date_trunc('day', v_quando at time zone 'America/Sao_Paulo') + interval '1 day 8 hours')
                        at time zone 'America/Sao_Paulo';
          end if;
          if v_quando <= now() + interval '1 minute' then
            v_res := privado.regra_mandar(p_anuncio, p_perfil, ac ->> 'texto');
          else
            insert into privado.regras_agendadas (feita_id, anuncio_id, perfil_id, texto, quando, etapa)
            values (v_feita, p_anuncio, p_perfil, ac ->> 'texto', v_quando,
                    case when c.status = 'dispensada' then 'nao_seguiu' else coalesce(v_etapa, 'novo') end);
            v_res := 'agendada';
          end if;
        when 'teste' then
          perform public.avaliacao_pedir(p_anuncio, p_perfil, (ac ->> 'modelo')::uuid);
        when 'video' then
          perform public.video_pedir(p_anuncio, array[p_perfil]);
        when 'horarios' then
          if c.status <> 'match' or jsonb_typeof(p_extras -> 'horarios') <> 'array' then
            v_res := 'pulada';
          else
            select array_agg(x::timestamptz) into v_opcoes from jsonb_array_elements_text(p_extras -> 'horarios') x;
            perform public.oferecer_horarios(p_anuncio, p_perfil, v_opcoes, ac ->> 'formato', ac ->> 'local', null,
                                             coalesce((ac ->> 'duracao')::integer, 30));
          end if;
        when 'avisar' then
          insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto, link)
          values (case when ac ->> 'quem' = 'eu' then r.conta_id else (ac ->> 'quem')::uuid end, 'parados',
                  p_anuncio, p_perfil,
                  left('Regra “' || r.nome || '”: ' || coalesce((select p.nome from public.perfis p where p.id = p_perfil), 'alguém')
                       || ', de ' || a.titulo || '. Abra para decidir.', 300),
                  '/painel/caixa?c=' || p_anuncio || ':' || p_perfil);
        else
          v_res := 'pulada';
      end case;
    exception when others then
      v_res := 'falhou: ' || left(sqlerrm, 160);
    end;
    v_feitas := v_feitas || jsonb_build_array(jsonb_build_object('tipo', ac ->> 'tipo', 'resultado', v_res,
                                                                 'etapa', ac ->> 'etapa'));
  end loop;
  update privado.regras_feitas set feitas = v_feitas where id = v_feita;
  return jsonb_build_object('ok', true, 'feita', v_feita, 'feitas', v_feitas);
end
$$;

-- 6. Com o tempo: os parados, o teste vencido, depois da entrevista e as mensagens que esperavam ---------------------
create or replace function public.servidor_regras_tempo(p_chave text, p_agora timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.regras;
  m record;
  n_eventos integer := 0;
  n_msgs integer := 0;
  k integer;
  v_hora integer := extract(hour from (p_agora at time zone 'America/Sao_Paulo'))::integer;
  v_etapa text;
  v_status text;
begin
  perform privado.exigir_servidor(p_chave);
  for r in
    select x.* from public.regras x
     where x.ligada and x.gatilho ->> 'tipo' in ('parado', 'teste_vencido', 'entrevista_passou')
       and privado.automacoes_liberado(x.conta_id)
  loop
    if r.gatilho ->> 'tipo' = 'parado' then
      insert into privado.regras_eventos (tipo, anuncio_id, perfil_id, dados, regra_id)
      select 'parado', c.anuncio_id, c.perfil_id, jsonb_build_object('etapa', r.gatilho ->> 'etapa'), r.id
        from public.curtidas c
        left join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
       where c.anuncio_id in (select privado.vagas_da_regra(r))
         and case r.gatilho ->> 'etapa'
               when 'novos' then c.status = 'pendente' and e.etapa is null
                                 and c.criado_em <= p_agora - make_interval(days => (r.gatilho ->> 'dias')::integer)
               else c.status = 'match' and e.etapa = r.gatilho ->> 'etapa'
                    and e.atualizado_em <= p_agora - make_interval(days => (r.gatilho ->> 'dias')::integer) end
         and greatest(c.criado_em, coalesce(e.atualizado_em, c.criado_em)) >= p_agora - interval '60 days'
      on conflict do nothing;
    elsif r.gatilho ->> 'tipo' = 'teste_vencido' then
      insert into privado.regras_eventos (tipo, anuncio_id, perfil_id, regra_id)
      select distinct 'teste_vencido', t.anuncio_id, t.perfil_id, r.id
        from privado.avaliacoes_pedidas t
        join public.curtidas c on c.anuncio_id = t.anuncio_id and c.perfil_id = t.perfil_id
       where t.anuncio_id in (select privado.vagas_da_regra(r))
         and t.status = 'pedida' and t.prazo < p_agora and t.prazo >= p_agora - interval '7 days'
         and c.status in ('pendente', 'match')
      on conflict do nothing;
    else
      insert into privado.regras_eventos (tipo, anuncio_id, perfil_id, regra_id)
      select distinct 'entrevista_passou', e.anuncio_id, e.perfil_id, r.id
        from public.entrevistas e
       where e.anuncio_id in (select privado.vagas_da_regra(r))
         and e.situacao in ('marcada', 'confirmada')
         and e.quando + make_interval(hours => (r.gatilho ->> 'horas')::integer) <= p_agora
         and e.quando >= p_agora - interval '7 days'
      on conflict do nothing;
    end if;
    get diagnostics k = row_count;
    n_eventos := n_eventos + k;
  end loop;

  -- as mensagens que esperavam (das 8h às 20h): não saem se a pessoa mudou de etapa ou foi dispensada
  if v_hora >= 8 and v_hora < 20 then
    for m in
      select g.*, f.regra_id, r2.conta_id
        from privado.regras_agendadas g
        join privado.regras_feitas f on f.id = g.feita_id
        join public.regras r2 on r2.id = f.regra_id
       where g.feita_em is null and g.cancelada_em is null and g.quando <= p_agora
       order by g.quando
       limit 200
    loop
      select c.status, e.etapa into v_status, v_etapa
        from public.curtidas c
        left join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
       where c.anuncio_id = m.anuncio_id and c.perfil_id = m.perfil_id;
      if v_status is null or v_status in ('desfeito')
         or (case when v_status = 'dispensada' then 'nao_seguiu' else coalesce(v_etapa, 'novo') end)
            is distinct from m.etapa then
        update privado.regras_agendadas set cancelada_em = p_agora where id = m.id;
        continue;
      end if;
      perform set_config('request.jwt.claims', json_build_object('sub', m.conta_id, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', m.conta_id::text, true);
      begin
        perform privado.regra_mandar(m.anuncio_id, m.perfil_id, m.texto);
        update privado.regras_agendadas set feita_em = p_agora where id = m.id;
        n_msgs := n_msgs + 1;
      exception when others then
        update privado.regras_agendadas set cancelada_em = p_agora where id = m.id;
      end;
    end loop;
  end if;
  -- a fila não cresce para sempre
  delete from privado.regras_eventos e where e.processado_em < p_agora - interval '30 days';
  return jsonb_build_object('eventos', n_eventos, 'mensagens', n_msgs);
end
$$;

-- 7. O retorno da dispensa automática diz o porquê e convida a responder se houve engano -------------------------
create or replace function public.servidor_retornos(p_chave text, p_agora timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_texto text;
  v_motivo text;
  v_hora integer := extract(hour from (p_agora at time zone 'America/Sao_Paulo'))::integer;
  feitos integer := 0;
begin
  perform privado.exigir_servidor(p_chave);
  if v_hora < 8 or v_hora >= 20 then
    return 0;
  end if;
  for r in
    select p.anuncio_id, p.perfil_id, a.autor_id, c.status
      from privado.retornos_pendentes p
      join public.anuncios a on a.id = p.anuncio_id
      left join public.curtidas c on c.anuncio_id = p.anuncio_id and c.perfil_id = p.perfil_id
     where p.enviar_em <= p_agora
     order by p.enviar_em
     limit 200
  loop
    delete from privado.retornos_pendentes p where p.anuncio_id = r.anuncio_id and p.perfil_id = r.perfil_id;
    delete from privado.regras_motivos m where m.anuncio_id = r.anuncio_id and m.perfil_id = r.perfil_id
    returning m.texto into v_motivo;
    if r.status is distinct from 'dispensada' then
      continue;
    end if;
    v_texto := privado.montar_retorno(r.autor_id, r.perfil_id, r.anuncio_id);
    if v_texto is null then
      continue;
    end if;
    if v_motivo is not null then
      -- a LGPD (art. 20): quem foi dispensado sem uma pessoa olhar pode pedir que olhem
      v_texto := left(v_texto || ' Esta resposta foi automática (' || v_motivo
                      || '). Se houve engano, responda e a empresa olha de novo.', 600);
    end if;
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto, link)
    values (r.perfil_id, 'dispensada', r.anuncio_id, r.autor_id, v_texto, '/anuncio/' || r.anuncio_id || '/parecidas');
    feitos := feitos + 1;
  end loop;
  return feitos;
end
$$;

-- o nome nos avisos de pagamento
create or replace function privado.nome_do_recurso(p_recurso text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case p_recurso
           when 'copiloto' then 'recurso Triagem com IA'
           when 'combo' then 'combo Triagem + Teste Prático'
           when 'video' then 'recurso Entrevista em vídeo'
           when 'automacoes' then 'recurso Automações personalizadas'
           else 'Teste Prático' end
$function$;

-- 8. Permissões ------------------------------------------------------------------------------------------------------
revoke all on function privado.regra_limpa(jsonb, uuid), privado.vagas_da_regra(public.regras),
                       privado.regras_anotar(text, uuid, uuid, jsonb), privado.regra_mandar(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.salvar_regra(uuid, jsonb), public.ligar_regra(uuid, boolean), public.apagar_regra(uuid),
                       public.regra_rodar_agora(uuid), public.regras_feitas_da_vaga(uuid, uuid),
                       public.regra_marcar_desfeita(bigint)
  from public, anon;
grant execute on function public.salvar_regra(uuid, jsonb), public.ligar_regra(uuid, boolean), public.apagar_regra(uuid),
                          public.regra_rodar_agora(uuid), public.regras_feitas_da_vaga(uuid, uuid),
                          public.regra_marcar_desfeita(bigint)
  to authenticated;
revoke all on function public.servidor_regras_pendentes(text, integer), public.servidor_regra_horarios(text, uuid),
                       public.servidor_regra_agir(text, uuid, bigint, uuid, uuid, integer[], jsonb),
                       public.servidor_regras_tempo(text, timestamptz), public.servidor_retornos(text, timestamptz)
  from public;
grant execute on function public.servidor_regras_pendentes(text, integer), public.servidor_regra_horarios(text, uuid),
                          public.servidor_regra_agir(text, uuid, bigint, uuid, uuid, integer[], jsonb),
                          public.servidor_regras_tempo(text, timestamptz), public.servidor_retornos(text, timestamptz)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
