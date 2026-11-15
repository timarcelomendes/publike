-- O resto das fases D e E da base da Receita (claude/plano-base-de-empresas-da-receita.md, partes 1, 2 e 6; 15/11/2026,
-- Marcelo: "faça o que falta"):
--   * "Abriu perto de você": os comércios que abriram há pouco (fora o MEI), a até 3 km de casa, nos ramos que mais
--     contratam as funções do currículo. Um cartão no feed e um parágrafo no e-mail das vagas da semana. Nunca diz
--     que há vaga: diz que é lugar novo e costuma contratar.
--   * A rota do currículo: "Alguém te chamou?" uma semana depois (aviso 'rota_pergunta') e a resposta; o aviso de
--     cópia aberta ('copia_aberta') também por e-mail e no celular.
--   * Os números do mês para as matérias (os negócios que abriram e o que mais contratou), para o Admin › Notícias.
--   * Os números da rota no Admin › Base da Receita.
-- Pode rodar de novo.

-- 1. "Abriu perto": as funções (CBO) → os ramos → os comércios novos perto do ponto -------------------------------

create or replace function privado.abriu_perto(
  p_lat double precision, p_lng double precision, p_cbos text[], p_dias integer, p_raio_km numeric, p_limite integer
)
returns table (cnpj text, nome text, ramo text, bairro text, cidade text, abertura date, distancia_m integer, cbo text)
language sql
stable
security definer
set search_path = ''
as $$
  with ponto as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography as g
  ), ramos as (
    -- de cada função, os ramos que mais a contratam (até 8)
    select distinct on (x.cnae) x.cnae, x.cbo
      from (select f.cnae, f.cbo, f.contratacoes,
                   row_number() over (partition by f.cbo order by f.contratacoes desc) as n
              from privado.ramos_funcoes f
             where f.cbo = any(p_cbos) and f.contratacoes >= 3) x
     where x.n <= 8
     order by x.cnae, x.contratacoes desc
  )
  select e.cnpj, e.nome, r2.nome, e.bairro, e.cidade, e.data_abertura,
         round(extensions.st_distance(e.local, p.g))::integer, ramos.cbo
    from privado.empresas_receita e
    join ramos on ramos.cnae = e.cnae
    cross join ponto p
    left join privado.ramos_do_publike r2 on r2.cnae = e.cnae
   where e.situacao = 'ativa' and not e.mei and e.local is not null
     and e.data_abertura >= (now() at time zone 'America/Sao_Paulo')::date - least(greatest(p_dias, 1), 120)
     and extensions.st_dwithin(e.local, p.g, least(greatest(p_raio_km, 0.5), 10) * 1000)
   order by e.data_abertura desc, extensions.st_distance(e.local, p.g)
   limit least(greatest(coalesce(p_limite, 3), 1), 10)
$$;
revoke all on function privado.abriu_perto(double precision, double precision, text[], integer, numeric, integer) from public;

-- o cartão do feed: a casa de quem está vendo (as funções vêm do currículo, lidas no site)
create or replace function public.abriu_perto_de_mim(p_cbos text[], p_dias integer default 30, p_limite integer default 3)
returns table (cnpj text, nome text, ramo text, bairro text, cidade text, abertura date, distancia_m integer, cbo text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.*
    from public.casas c
    cross join lateral privado.abriu_perto(
      extensions.st_y(c.local::extensions.geometry), extensions.st_x(c.local::extensions.geometry),
      p_cbos, p_dias, 3, p_limite) a
   where c.perfil_id = auth.uid() and c.local is not null
$$;
revoke execute on function public.abriu_perto_de_mim(text[], integer, integer) from public, anon;
grant execute on function public.abriu_perto_de_mim(text[], integer, integer) to authenticated, service_role;

-- o e-mail da semana: o robô pergunta por várias pessoas de uma vez ({perfil_id, cbos}) e recebe até 2 lugares de cada
-- (dos últimos 10 dias, para não repetir de uma semana para a outra)
create or replace function public.servidor_abriu_perto(p_chave text, p_pessoas jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v jsonb := '{}'::jsonb;
  pessoa jsonb;
  lugares jsonb;
begin
  perform privado.exigir_servidor(p_chave);
  if jsonb_typeof(p_pessoas) is distinct from 'array' or jsonb_array_length(p_pessoas) > 500 then
    raise exception 'Mande até 500 pessoas.' using errcode = '22023';
  end if;
  for pessoa in select * from jsonb_array_elements(p_pessoas) loop
    select jsonb_agg(jsonb_build_object('nome', a.nome, 'ramo', a.ramo, 'bairro', a.bairro, 'distancia_m', a.distancia_m))
      into lugares
      from public.casas c
      cross join lateral privado.abriu_perto(
        extensions.st_y(c.local::extensions.geometry), extensions.st_x(c.local::extensions.geometry),
        array(select jsonb_array_elements_text(pessoa -> 'cbos')), 10, 3, 2) a
     where c.perfil_id = (pessoa ->> 'perfil_id')::uuid and c.local is not null;
    if lugares is not null then
      v := v || jsonb_build_object(pessoa ->> 'perfil_id', lugares);
    end if;
  end loop;
  return v;
end
$$;
revoke execute on function public.servidor_abriu_perto(text, jsonb) from public;
grant execute on function public.servidor_abriu_perto(text, jsonb) to anon, authenticated, service_role;

-- 2. A rota: "Alguém te chamou?" uma semana depois ------------------------------------------------------------

alter table privado.rotas_curriculo add column if not exists perguntado_em timestamptz;
alter table privado.rotas_curriculo add column if not exists chamou text check (chamou in ('sim', 'nao', 'ainda_nao'));
alter table privado.rotas_curriculo add column if not exists respondido_em timestamptz;

do $$
declare
  d text;
  f text;
  t text;
  antes text;
begin
  -- o tipo novo 'rota_pergunta'
  select pg_get_constraintdef(c.oid) into d from pg_constraint c
   where c.conrelid = 'public.notificacoes'::regclass and c.conname = 'notificacoes_tipo_check';
  if strpos(d, '''rota_pergunta''') = 0 then
    if strpos(d, '''copia_aberta''::text') = 0 then
      raise exception 'notificacoes_tipo_check sem copia_aberta (rode antes a 20270605120000): %', d;
    end if;
    d := replace(d, '''copia_aberta''::text', '''copia_aberta''::text, ''rota_pergunta''::text');
    alter table public.notificacoes drop constraint notificacoes_tipo_check;
    execute 'alter table public.notificacoes add constraint notificacoes_tipo_check ' || d;
  end if;

  f := pg_get_functiondef('privado.grupo_do_aviso(text)'::regprocedure);
  if strpos(f, '''rota_pergunta''') = 0 then
    antes := f;
    f := replace(f, '''copia_aberta'') then ''andamento''', '''copia_aberta'', ''rota_pergunta'') then ''andamento''');
    if f = antes then
      raise exception 'privado.grupo_do_aviso mudou: não achei o copia_aberta';
    end if;
    execute f;
  end if;

  -- os dois avisos da rota também por e-mail (o texto do aviso vai no corpo)
  f := pg_get_functiondef('privado.notificacao_por_email()'::regprocedure);
  if strpos(f, '''copia_aberta''') = 0 then
    antes := f;
    f := replace(f, '''vaga_vence'', ''vaga_venceu'') then',
                 '''vaga_vence'', ''vaga_venceu'', ''copia_aberta'', ''rota_pergunta'') then');
    if f = antes then
      raise exception 'privado.notificacao_por_email mudou: não achei a lista do motivo';
    end if;
    antes := f;
    f := replace(f, 'when ''vaga_venceu'' then coalesce(new.link, ''/painel/anuncio/'' || new.anuncio_id || ''/renovar'')',
                 'when ''vaga_venceu'' then coalesce(new.link, ''/painel/anuncio/'' || new.anuncio_id || ''/renovar'')'
                 || chr(10) || '                 when ''copia_aberta'' then coalesce(new.link, ''/rota-do-curriculo'')'
                 || chr(10) || '                 when ''rota_pergunta'' then coalesce(new.link, ''/rota-do-curriculo'')');
    if f = antes then
      raise exception 'privado.notificacao_por_email mudou: não achei o caminho do vaga_venceu';
    end if;
    execute f;
  end if;

  -- e no celular
  select pg_get_triggerdef(g.oid) into t from pg_trigger g
   where g.tgrelid = 'public.notificacoes'::regclass and g.tgname = 'notificacoes_para_celular';
  if strpos(t, '''copia_aberta''') = 0 then
    if strpos(t, '''vaga_venceu''::text]') = 0 then
      raise exception 'notificacoes_para_celular mudou: %', t;
    end if;
    t := replace(t, '''vaga_venceu''::text]', '''vaga_venceu''::text, ''copia_aberta''::text, ''rota_pergunta''::text]');
    drop trigger notificacoes_para_celular on public.notificacoes;
    execute t;
  end if;
end
$$;

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('copia_aberta', 'usuarios', 58, 'Rota do currículo: cópia aberta',
     'Para quem procura: abriram pelo QR code a cópia do currículo que a pessoa deixou num comércio (só a primeira vez).',
     array['nome', 'motivo', 'link'],
     'Abriram o seu currículo',
     E'Oi, {{nome}}.\n\n{{motivo}} Fique de olho no WhatsApp.',
     'Ver a minha rota'),
    ('rota_pergunta', 'usuarios', 59, 'Rota do currículo: alguém te chamou?',
     'Para quem procura: uma semana depois de entregar as cópias da rota, a pergunta "Alguém te chamou?".',
     array['nome', 'motivo', 'link'],
     'Alguém te chamou?',
     E'Oi, {{nome}}.\n\n{{motivo}}',
     'Responder')
  ) as v(chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do update
  set nome = excluded.nome, descricao = excluded.descricao, variaveis = excluded.variaveis,
      assunto = case when modelos_email.assunto = modelos_email.assunto_padrao then excluded.assunto
                     else modelos_email.assunto end,
      corpo = case when modelos_email.corpo = modelos_email.corpo_padrao then excluded.corpo
                   else modelos_email.corpo end,
      botao = case when modelos_email.botao = modelos_email.botao_padrao then excluded.botao
                   else modelos_email.botao end,
      assunto_padrao = excluded.assunto_padrao, corpo_padrao = excluded.corpo_padrao,
      botao_padrao = excluded.botao_padrao;

-- o robô das filas: as rotas de 7 a 14 dias com pelo menos uma cópia entregue, das 8h às 20h, uma vez por rota
create or replace function public.servidor_perguntar_rotas(p_chave text, p_limite integer default 100)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  hora integer := extract(hour from now() at time zone 'America/Sao_Paulo');
  r record;
  n integer := 0;
begin
  perform privado.exigir_servidor(p_chave);
  if hora < 8 or hora >= 20 then
    return 0;
  end if;
  for r in
    select x.id, x.perfil_id, x.funcao,
           (select count(*) from privado.copias_curriculo c where c.rota_id = x.id and c.entregue_em is not null) as entregues
      from privado.rotas_curriculo x
     where x.perguntado_em is null and x.chamou is null
       and x.criada_em <= now() - interval '7 days' and x.criada_em > now() - interval '14 days'
       and exists (select 1 from privado.copias_curriculo c where c.rota_id = x.id and c.entregue_em is not null)
     order by x.criada_em
     limit least(greatest(coalesce(p_limite, 100), 1), 500)
  loop
    update privado.rotas_curriculo set perguntado_em = now() where id = r.id;
    insert into public.notificacoes (destinatario_id, tipo, texto, link)
    values (r.perfil_id, 'rota_pergunta',
            'Faz uma semana que você entregou ' ||
            case when r.entregues = 1 then '1 currículo' else r.entregues || ' currículos' end ||
            ' de ' || lower(r.funcao) || '. Alguém te chamou?',
            '/rota-do-curriculo/' || r.id || '#chamou');
    n := n + 1;
  end loop;
  return n;
end
$$;
revoke execute on function public.servidor_perguntar_rotas(text, integer) from public;
grant execute on function public.servidor_perguntar_rotas(text, integer) to anon, authenticated, service_role;

create or replace function public.responder_rota_curriculo(p_rota uuid, p_resposta text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_resposta not in ('sim', 'nao', 'ainda_nao') then
    raise exception 'Resposta inválida.' using errcode = '22023';
  end if;
  update privado.rotas_curriculo r
     set chamou = p_resposta, respondido_em = now()
   where r.id = p_rota and r.perfil_id = auth.uid();
  return found;
end
$$;
revoke execute on function public.responder_rota_curriculo(uuid, text) from public, anon;
grant execute on function public.responder_rota_curriculo(uuid, text) to authenticated, service_role;

-- a rota minha devolve também a pergunta e a resposta
create or replace function public.minha_rota_curriculo(p_rota uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'id', r.id, 'funcao', r.funcao, 'raio_km', r.raio_km, 'criada_em', r.criada_em, 'curriculo', r.curriculo,
           'perguntar', r.chamou is null and (r.perguntado_em is not null or r.criada_em <= now() - interval '7 days'),
           'chamou', r.chamou,
           'copias', coalesce((select jsonb_agg(jsonb_build_object(
                         'codigo', c.codigo, 'cnpj', c.cnpj, 'nome', c.nome_local, 'endereco', c.endereco,
                         'bairro', c.bairro, 'cidade', c.cidade, 'distancia_m', c.distancia_m,
                         'entregue_em', c.entregue_em, 'desligada', c.desligada, 'aberturas', c.aberturas,
                         'aberta_em', c.aberta_em) order by c.ordem)
                         from privado.copias_curriculo c where c.rota_id = r.id), '[]'::jsonb))
    from privado.rotas_curriculo r
   where r.id = p_rota and r.perfil_id = auth.uid()
$$;

-- 3. Os números do mês para as matérias (Admin › Notícias): os negócios que abriram e o que mais contratou ---------

create or replace function public.admin_numeros_do_mes_receita(p_mes date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ini date := date_trunc('month', coalesce(p_mes, (now() at time zone 'America/Sao_Paulo')::date - interval '1 month'))::date;
  v_fim date := (v_ini + interval '1 month')::date;
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'mes', v_ini,
    -- o que mais contratou em Goiânia e região (Caged, 12 meses): as funções e a faixa de salário
    'mais_contratadas', coalesce((select jsonb_agg(jsonb_build_object('cbo', s.cbo, 'contratacoes', s.n, 'p25', s.p25,
                                                                   'p50', s.p50, 'p75', s.p75, 'de', s.de, 'ate', s.ate)
                                                   order by s.n desc)
                                    from (select * from privado.salarios_mercado m where m.regiao = 'goiania'
                                           order by m.n desc limit 10) s), '[]'::jsonb),
    'por_cidade', coalesce((select jsonb_agg(jsonb_build_object(
          'cidade', x.cidade, 'empresas', x.empresas, 'meis', coalesce(m.meis, 0),
          'bairros', (select jsonb_agg(jsonb_build_object('bairro', b.bairro, 'quantas', b.n) order by b.n desc)
                        from (select coalesce(e.bairro, '(sem bairro)') as bairro, count(*) as n
                                from privado.empresas_receita e
                               where e.cidade = x.cidade and e.na_praca and not e.mei
                                 and e.data_abertura >= v_ini and e.data_abertura < v_fim
                               group by 1 order by 2 desc limit 5) b),
          'ramos', (select jsonb_agg(jsonb_build_object('ramo', coalesce(r.nome, b.cnae), 'quantas', b.n) order by b.n desc)
                      from (select e.cnae, count(*) as n
                              from privado.empresas_receita e
                             where e.cidade = x.cidade and e.na_praca and not e.mei
                               and e.data_abertura >= v_ini and e.data_abertura < v_fim
                             group by 1 order by 2 desc limit 5) b
                      left join privado.ramos_do_publike r on r.cnae = b.cnae),
          -- os destaques: só empresas (nunca MEI), dos ramos que contratam (os que aparecem no Caged)
          'destaques', (select jsonb_agg(jsonb_build_object('nome', d.nome, 'ramo', d.ramo, 'bairro', d.bairro))
                          from (select e.nome, r.nome as ramo, e.bairro
                                  from privado.empresas_receita e
                                  left join privado.ramos_do_publike r on r.cnae = e.cnae
                                 where e.cidade = x.cidade and e.na_praca and not e.mei and e.matriz
                                   and e.data_abertura >= v_ini and e.data_abertura < v_fim
                                   and exists (select 1 from privado.ramos_funcoes f where f.cnae = e.cnae)
                                   and e.nome <> coalesce(r.nome, '')
                                 order by e.porte = 'demais' desc, e.porte = 'pequena' desc, e.data_abertura desc
                                 limit 10) d))
        order by x.empresas desc)
      from (select e.cidade, count(*) as empresas
              from privado.empresas_receita e
             where e.na_praca and not e.mei and e.data_abertura >= v_ini and e.data_abertura < v_fim
             group by e.cidade) x
      left join (select m.cidade, sum(m.quantos) as meis from privado.mei_por_bairro m
                  where m.mes_abertura = v_ini group by m.cidade) m on m.cidade = x.cidade), '[]'::jsonb));
end
$$;
revoke execute on function public.admin_numeros_do_mes_receita(date) from public, anon;
grant execute on function public.admin_numeros_do_mes_receita(date) to authenticated, service_role;

-- 4. O Admin › Base da Receita: os números da rota do currículo ---------------------------------------------------

create or replace function public.admin_numeros_da_rota()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'rotas', (select count(*) from privado.rotas_curriculo),
    'rotas_7_dias', (select count(*) from privado.rotas_curriculo where criada_em > now() - interval '7 days'),
    'pessoas', (select count(distinct perfil_id) from privado.rotas_curriculo),
    'copias', (select count(*) from privado.copias_curriculo),
    'entregues', (select count(*) from privado.copias_curriculo where entregue_em is not null),
    'abertas', (select count(*) from privado.copias_curriculo where aberturas > 0),
    'chamaram', (select count(*) from privado.rotas_curriculo where chamou = 'sim'),
    'responderam', (select count(*) from privado.rotas_curriculo where chamou is not null),
    -- os comércios que abriram o QR e depois publicaram vaga (pelo CNPJ da conta)
    'publicaram', (select count(distinct c.cnpj) from privado.copias_curriculo c
                    join public.perfis p on p.cnpj = c.cnpj
                    join public.anuncios a on a.autor_id = p.id and a.tipo = 'vaga' and a.criado_em > c.aberta_em
                   where c.aberta_em is not null));
end
$$;
revoke execute on function public.admin_numeros_da_rota() from public, anon;
grant execute on function public.admin_numeros_da_rota() to authenticated, service_role;

-- 5. As matérias do mês viram rascunho em Admin › Notícias (a pessoa da equipe revisa e aprova) ------------------

create or replace function public.admin_rascunhos_receita(p_itens jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  item jsonb;
  novos integer := 0;
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  for item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) limit 4 loop
    insert into public.noticias (slug, titulo, resumo, corpo, pratico, tema, cidade, fonte_nome, fonte_url, fonte_data)
    values (item ->> 'slug', btrim(item ->> 'titulo'), btrim(item ->> 'resumo'), btrim(item ->> 'corpo'),
            nullif(btrim(item ->> 'pratico'), ''), coalesce(item ->> 'tema', 'mercado'), nullif(btrim(item ->> 'cidade'), ''),
            btrim(item ->> 'fonte_nome'), btrim(item ->> 'fonte_url'), nullif(item ->> 'fonte_data', '')::date)
    on conflict do nothing;
    if found then
      novos := novos + 1;
    end if;
  end loop;
  return novos;
end
$$;
revoke execute on function public.admin_rascunhos_receita(jsonb) from public, anon;
grant execute on function public.admin_rascunhos_receita(jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
