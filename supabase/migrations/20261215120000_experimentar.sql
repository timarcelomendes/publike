-- Copiloto e Testes Publike viram recursos pagos, com 15 dias grátis (decisão do usuário, 29/10/2026).
-- Pode rodar de novo.
--
-- A conta que contrata (comércio, empresa ou agência) toca em "Experimentar 15 dias grátis" e o recurso abre
-- na hora; no 16º dia ele fecha sozinho (a coluna `ate`). Cada conta experimenta cada recurso uma vez só.
-- O admin continua liberando sem prazo (Admin › Usuários › conta), como antes. Os Testes deixam de ser
-- abertos a todos: sem o recurso, a empresa não põe teste na vaga nem manda teste, e a vaga deixa de pedir
-- os testes que já tinha. Os resultados que já chegaram continuam à vista. Quem procura emprego nunca paga.

-- 1. Tabelas ------------------------------------------------------------------------------------

alter table privado.copiloto_contas add column if not exists ate timestamptz;

create table if not exists privado.testes_contas (
  conta_id uuid primary key references public.perfis (id) on delete cascade,
  liberado_em timestamptz not null default now(),
  -- null: sem prazo (liberado pelo admin); com data: os 15 dias grátis
  ate timestamptz
);

-- o registro dos 15 dias grátis: fica mesmo depois que o prazo acaba, para não repetir
create table if not exists privado.experimentos (
  conta_id uuid not null references public.perfis (id) on delete cascade,
  recurso text not null check (recurso in ('copiloto', 'testes')),
  inicio timestamptz not null default now(),
  fim timestamptz not null,
  pessoa_id uuid references public.perfis (id) on delete set null,
  -- a conta tocou em "Quero continuar" (para o Publike entrar em contato)
  quer_continuar_em timestamptz,
  primary key (conta_id, recurso)
);
create index if not exists experimentos_inicio on privado.experimentos (inicio desc);

alter table privado.testes_contas enable row level security;
alter table privado.experimentos enable row level security;
revoke all on privado.testes_contas, privado.experimentos from public, anon, authenticated;


-- 2. Quem tem o recurso ------------------------------------------------------------------------

create or replace function privado.copiloto_liberado(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privado.copiloto_contas c
                  where c.conta_id = p_conta and (c.ate is null or c.ate > now()))
$$;

create or replace function privado.testes_liberado(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privado.testes_contas t
                  where t.conta_id = p_conta and (t.ate is null or t.ate > now()))
$$;

create or replace function privado.exigir_testes()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not privado.testes_liberado(public.conta_atual()) then
    raise exception 'Os Testes Publike são um recurso pago. Experimente 15 dias grátis em Painel › Testes Publike.'
      using errcode = 'P0001', hint = 'testes_fechado';
  end if;
end
$$;

create or replace function public.testes_liberado()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and privado.testes_liberado(public.conta_atual())
$$;

-- o estado dos dois recursos para a conta atual (as páginas do painel leem daqui)
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
  r text;
  ate_ timestamptz;
  tem boolean;
  e privado.experimentos;
  saida jsonb := '{}'::jsonb;
begin
  if (select auth.uid()) is null or conta is null then
    return null;
  end if;
  select p.tipo in ('comercio', 'empresa', 'agencia') into contrata from public.perfis p where p.id = conta;
  foreach r in array array['copiloto', 'testes'] loop
    if r = 'copiloto' then
      select true, c.ate into tem, ate_ from privado.copiloto_contas c where c.conta_id = conta;
    else
      select true, t.ate into tem, ate_ from privado.testes_contas t where t.conta_id = conta;
    end if;
    select * into e from privado.experimentos x where x.conta_id = conta and x.recurso = r;
    saida := saida || jsonb_build_object(r, jsonb_build_object(
      'liberado', coalesce(tem, false) and (ate_ is null or ate_ > now()),
      'ate', case when coalesce(tem, false) then ate_ end,
      'experimentou', e.conta_id is not null,
      'fim_experimento', e.fim,
      'quer_continuar', e.quer_continuar_em is not null,
      'pode_experimentar', coalesce(contrata, false) and e.conta_id is null
                           and not (coalesce(tem, false) and (ate_ is null or ate_ > now()))));
    tem := null; ate_ := null; e := null;
  end loop;
  return saida;
end
$$;

-- os 15 dias grátis: abre o recurso na hora e devolve até quando
create or replace function public.experimentar_recurso(p_recurso text)
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
  if p_recurso not in ('copiloto', 'testes') then
    raise exception 'Pedido inválido.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.perfis p where p.id = conta and p.tipo in ('comercio', 'empresa', 'agencia')) then
    raise exception 'Os 15 dias grátis são para contas de comércio, empresa ou agência.' using errcode = 'P0001';
  end if;
  if (p_recurso = 'copiloto' and privado.copiloto_liberado(conta))
     or (p_recurso = 'testes' and privado.testes_liberado(conta)) then
    raise exception 'Este recurso já está liberado para a sua conta.' using errcode = 'P0001';
  end if;
  if exists (select 1 from privado.experimentos x where x.conta_id = conta and x.recurso = p_recurso) then
    raise exception 'Sua conta já usou os 15 dias grátis. Toque em “Quero continuar” e a gente fala com você.'
      using errcode = 'P0001', hint = 'ja_experimentou';
  end if;
  insert into privado.experimentos (conta_id, recurso, fim, pessoa_id)
  values (conta, p_recurso, v_fim, (select p.id from public.perfis p where p.id = (select auth.uid())));
  if p_recurso = 'copiloto' then
    insert into privado.copiloto_contas (conta_id, liberado_em, ate) values (conta, now(), v_fim)
    on conflict (conta_id) do update set liberado_em = now(), ate = excluded.ate;
  else
    insert into privado.testes_contas (conta_id, liberado_em, ate) values (conta, now(), v_fim)
    on conflict (conta_id) do update set liberado_em = now(), ate = excluded.ate;
  end if;
  return v_fim;
end
$$;

-- "Quero continuar": avisa o Publike (Admin › IA) que a conta quer seguir com o recurso
create or replace function public.quero_continuar(p_recurso text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_conta_ativa();
  update privado.experimentos set quer_continuar_em = coalesce(quer_continuar_em, now())
   where conta_id = public.conta_atual() and recurso = p_recurso;
  if not found then
    raise exception 'Experimente os 15 dias grátis primeiro.' using errcode = 'P0001';
  end if;
end
$$;


-- 3. Admin ----------------------------------------------------------------------------------------

-- liberar sem prazo (também tira o prazo de quem estava nos 15 dias)
create or replace function public.admin_liberar_copiloto(p_conta uuid, p_liberar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_liberar then
    if not exists (select 1 from public.perfis p where p.id = p_conta) then
      raise exception 'Conta não encontrada.' using errcode = 'P0001';
    end if;
    insert into privado.copiloto_contas (conta_id) values (p_conta)
    on conflict (conta_id) do update set ate = null;
  else
    delete from privado.copiloto_contas where conta_id = p_conta;
  end if;
end
$$;

create or replace function public.admin_liberar_testes(p_conta uuid, p_liberar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_liberar then
    if not exists (select 1 from public.perfis p where p.id = p_conta) then
      raise exception 'Conta não encontrada.' using errcode = 'P0001';
    end if;
    insert into privado.testes_contas (conta_id) values (p_conta)
    on conflict (conta_id) do update set ate = null;
  else
    delete from privado.testes_contas where conta_id = p_conta;
  end if;
end
$$;

-- o estado de uma conta, para a página dela no admin
create or replace function public.admin_recursos_da_conta(p_conta uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'copiloto', (select jsonb_build_object('ate', c.ate, 'liberado', c.ate is null or c.ate > now())
                   from privado.copiloto_contas c where c.conta_id = p_conta),
    'testes', (select jsonb_build_object('ate', t.ate, 'liberado', t.ate is null or t.ate > now())
                 from privado.testes_contas t where t.conta_id = p_conta),
    'experimentos', coalesce((select jsonb_agg(jsonb_build_object('recurso', e.recurso, 'inicio', e.inicio,
                                'fim', e.fim, 'quer_continuar_em', e.quer_continuar_em) order by e.inicio)
                                from privado.experimentos e where e.conta_id = p_conta), '[]'::jsonb))
$$;

-- só quem tem o Copiloto agora (o prazo dos 15 dias conta)
create or replace function public.admin_copiloto_contas()
returns table (
  conta_id uuid, nome text, tipo text, liberado_em timestamptz, vagas integer, leituras_30d integer,
  convites_30d integer)
language sql
stable
security definer
set search_path = ''
as $$
  select c.conta_id, p.nome, p.tipo, c.liberado_em,
         (select count(*)::int from privado.copiloto_vagas v join public.anuncios a on a.id = v.anuncio_id
           where a.autor_id = c.conta_id),
         (select coalesce(sum(r.quantos), 0)::int from privado.copiloto_registro r
           where r.conta_id = c.conta_id and r.acao = 'avaliou' and r.criado_em > now() - interval '30 days'),
         (select count(*)::int from privado.copiloto_registro r
           where r.conta_id = c.conta_id and r.acao = 'convidou' and r.criado_em > now() - interval '30 days')
    from privado.copiloto_contas c
    join public.perfis p on p.id = c.conta_id
   where c.ate is null or c.ate > now()
   order by c.liberado_em desc
$$;

-- quem pediu os 15 dias grátis, do mais novo para o mais velho
create or replace function public.admin_experimentos()
returns table (conta_id uuid, nome text, tipo text, recurso text, inicio timestamptz, fim timestamptz,
               quer_continuar_em timestamptz, ativo boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select e.conta_id, p.nome, p.tipo, e.recurso, e.inicio, e.fim, e.quer_continuar_em, e.fim > now()
    from privado.experimentos e
    join public.perfis p on p.id = e.conta_id
   order by e.quer_continuar_em desc nulls last, e.inicio desc
   limit 200
$$;


-- 4. As funções que passam a pedir o recurso -----------------------------------------------------
create or replace function public.copiloto_da_vaga(p_anuncio uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c privado.copiloto_contas;
  v privado.copiloto_vagas;
begin
  if not exists (select 1 from public.anuncios a
                  where a.id = p_anuncio and a.tipo = 'vaga' and a.autor_id = public.conta_atual()) then
    raise exception 'Vaga não encontrada.' using errcode = 'P0001';
  end if;
  select * into c from privado.copiloto_contas x
   where x.conta_id = public.conta_atual() and (x.ate is null or x.ate > now());
  if not found then
    return jsonb_build_object('liberado', false);
  end if;
  select * into v from privado.copiloto_vagas x where x.anuncio_id = p_anuncio;
  return jsonb_build_object(
    'liberado', true,
    'criterios', coalesce(v.criterios, '[]'::jsonb),
    'versao', coalesce(v.versao, ''),
    'triagem', coalesce(v.triagem, c.triagem),
    'busca', coalesce(v.busca, c.busca),
    'atualizado_em', v.atualizado_em,
    'padrao_triagem', c.triagem,
    'padrao_busca', c.busca);
end
$$;

create or replace function public.avaliacoes_biblioteca()
returns table (id uuid, tipo text, area text, titulo text, descricao text, questoes integer, da_casa boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.tipo, m.area, m.titulo, m.descricao, jsonb_array_length(m.questoes), m.conta_id is not null
    from privado.avaliacoes_modelos m
   where (select auth.uid()) is not null and m.apagado_em is null
     and privado.testes_liberado(public.conta_atual())
     and ((m.conta_id is null and m.publicado) or m.conta_id = public.conta_atual())
   order by m.conta_id is null, m.tipo, m.titulo
$$;

create or replace function public.avaliacao_modelo(p_modelo uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', m.id, 'tipo', m.tipo, 'area', m.area, 'titulo', m.titulo, 'descricao', m.descricao,
                            'questoes', m.questoes, 'da_casa', m.conta_id is not null)
    from privado.avaliacoes_modelos m
   where m.id = p_modelo and (select auth.uid()) is not null and m.apagado_em is null
     and privado.testes_liberado(public.conta_atual())
     and ((m.conta_id is null and m.publicado) or m.conta_id = public.conta_atual())
$$;

create or replace function public.avaliacao_salvar_da_casa(p_id uuid, p_titulo text, p_descricao text, p_questoes jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := public.conta_atual();
  v_id uuid;
begin
  perform privado.exigir_conta_ativa();
  perform privado.exigir_testes();
  if char_length(coalesce(trim(p_titulo), '')) not between 3 and 90 then
    raise exception 'Dê um nome ao teste (de 3 a 90 letras).' using errcode = 'P0001';
  end if;
  if privado.copiloto_criterio_proibido(p_titulo) then
    raise exception 'O nome do teste não pode falar disso.' using errcode = 'P0001';
  end if;
  perform privado.conferir_questoes('pratico', p_questoes);
  if p_id is null then
    if (select count(*) from privado.avaliacoes_modelos m where m.conta_id = conta and m.apagado_em is null) >= 30 then
      raise exception 'A conta já tem 30 testes da casa. Apague um para criar outro.' using errcode = 'P0001';
    end if;
    insert into privado.avaliacoes_modelos (tipo, titulo, descricao, questoes, conta_id, publicado)
    values ('pratico', trim(p_titulo), nullif(trim(coalesce(p_descricao, '')), ''), p_questoes, conta, true)
    returning id into v_id;
  else
    update privado.avaliacoes_modelos
       set titulo = trim(p_titulo), descricao = nullif(trim(coalesce(p_descricao, '')), ''), questoes = p_questoes,
           atualizado_em = now()
     where id = p_id and conta_id = conta and apagado_em is null
    returning id into v_id;
    if v_id is null then
      raise exception 'Teste não encontrado.' using errcode = 'P0001';
    end if;
    if exists (select 1 from privado.avaliacoes_pedidas a where a.modelo_id = p_id and a.status = 'feita') then
      raise exception 'Este teste já foi feito por alguém: crie um novo em vez de mudar as questões.'
        using errcode = 'P0001';
    end if;
  end if;
  return v_id;
end
$$;

create or replace function public.avaliacoes_salvar_na_vaga(p_anuncio uuid, p_itens jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
begin
  perform privado.minha_vaga_qualquer(p_anuncio);
  -- tirar os testes da vaga continua livre; pôr um teste pede o recurso
  if jsonb_typeof(p_itens) = 'array' and jsonb_array_length(p_itens) > 0 then
    perform privado.exigir_testes();
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 3 then
    raise exception 'Escolha até 3 testes por vaga.' using errcode = 'P0001';
  end if;
  for item in select * from jsonb_array_elements(p_itens) loop
    if not privado.modelo_disponivel((item ->> 'modelo_id')::uuid, public.conta_atual()) then
      raise exception 'Este teste não está disponível.' using errcode = 'P0001';
    end if;
  end loop;
  delete from privado.avaliacoes_da_vaga v
   where v.anuncio_id = p_anuncio
     and v.modelo_id not in (select (x ->> 'modelo_id')::uuid from jsonb_array_elements(p_itens) x);
  insert into privado.avaliacoes_da_vaga (anuncio_id, modelo_id, obrigatoria)
  select p_anuncio, (x ->> 'modelo_id')::uuid, coalesce((x ->> 'obrigatoria')::boolean, false)
    from jsonb_array_elements(p_itens) x
  on conflict (anuncio_id, modelo_id) do update set obrigatoria = excluded.obrigatoria;
end
$$;

create or replace function public.avaliacao_pedir(p_anuncio uuid, p_perfil uuid, p_modelo uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_titulo text;
  v_teste text;
  quem text;
begin
  perform privado.minha_vaga_qualquer(p_anuncio);
  perform privado.exigir_testes();
  if not privado.modelo_disponivel(p_modelo, public.conta_atual()) then
    raise exception 'Este teste não está disponível.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.curtidas k where k.anuncio_id = p_anuncio and k.perfil_id = p_perfil) then
    raise exception 'Só dá para mandar o teste para quem curtiu a vaga.' using errcode = 'P0001';
  end if;
  if exists (select 1 from privado.avaliacoes_pedidas a
              where a.anuncio_id = p_anuncio and a.perfil_id = p_perfil and a.modelo_id = p_modelo) then
    raise exception 'Essa pessoa já recebeu este teste.' using errcode = 'P0001';
  end if;
  perform privado.conferir_limite('teste', 200, 'Você já mandou 200 testes hoje. Tente de novo amanhã.');
  insert into privado.avaliacoes_pedidas (anuncio_id, perfil_id, modelo_id, origem)
  values (p_anuncio, p_perfil, p_modelo, 'pedido') returning id into v_id;
  select a.titulo into v_titulo from public.anuncios a where a.id = p_anuncio;
  select m.titulo into v_teste from privado.avaliacoes_modelos m where m.id = p_modelo;
  select p.nome into quem from public.perfis p where p.id = public.conta_atual();
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (p_perfil, 'teste_pedido', p_anuncio, public.conta_atual(),
          left(coalesce(quem, 'A empresa') || ' pediu um teste para a vaga “' || v_titulo || '”: ' || v_teste
               || '. Você tem 3 dias para fazer.', 300));
  return v_id;
end
$$;

create or replace function public.avaliacoes_da_vaga(p_anuncio uuid)
returns table (modelo_id uuid, tipo text, titulo text, descricao text, questoes integer, obrigatoria boolean,
               da_casa boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.tipo, m.titulo, m.descricao, jsonb_array_length(m.questoes), v.obrigatoria, m.conta_id is not null
    from privado.avaliacoes_da_vaga v
    join privado.avaliacoes_modelos m on m.id = v.modelo_id
    join public.anuncios a on a.id = v.anuncio_id
   where v.anuncio_id = p_anuncio and m.apagado_em is null
     and (a.autor_id = public.conta_atual() or (a.status = 'ativo' and privado.testes_liberado(a.autor_id)))
   order by v.criado_em
$$;

create or replace function public.avaliacao_da_vaga_para_mim(p_anuncio uuid, p_modelo uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
  v_id uuid;
begin
  perform privado.exigir_conta_ativa();
  if not exists (select 1 from privado.avaliacoes_da_vaga v join public.anuncios a on a.id = v.anuncio_id
                  where v.anuncio_id = p_anuncio and v.modelo_id = p_modelo and privado.testes_liberado(a.autor_id)) then
    raise exception 'Este teste não está nesta vaga.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.curtidas k where k.anuncio_id = p_anuncio and k.perfil_id = eu) then
    raise exception 'Curta a vaga primeiro: o teste vai junto com a sua candidatura.' using errcode = 'P0001';
  end if;
  select a.id into v_id from privado.avaliacoes_pedidas a
   where a.anuncio_id = p_anuncio and a.perfil_id = eu and a.modelo_id = p_modelo;
  if v_id is null then
    insert into privado.avaliacoes_pedidas (anuncio_id, perfil_id, modelo_id, origem)
    values (p_anuncio, eu, p_modelo, 'vaga') returning id into v_id;
  end if;
  return v_id;
end
$$;


-- 5. Permissões ------------------------------------------------------------------------------------

revoke execute on function privado.testes_liberado(uuid), privado.exigir_testes() from public, anon, authenticated;
revoke execute on function public.testes_liberado(), public.recursos_pagos(), public.experimentar_recurso(text),
  public.quero_continuar(text) from public, anon;
grant execute on function public.testes_liberado(), public.recursos_pagos(), public.experimentar_recurso(text),
  public.quero_continuar(text) to authenticated;
revoke execute on function public.admin_liberar_testes(uuid, boolean), public.admin_recursos_da_conta(uuid),
  public.admin_experimentos() from public, anon, authenticated;
grant execute on function public.admin_liberar_testes(uuid, boolean), public.admin_recursos_da_conta(uuid),
  public.admin_experimentos() to service_role;
