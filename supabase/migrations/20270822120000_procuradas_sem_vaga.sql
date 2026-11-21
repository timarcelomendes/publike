-- Procuradas sem vaga (21/11/2026; Marcelo: "empresas que já tiveram vagas ou são agências de emprego... serem
-- notificadas"). O atendimento do WhatsApp registra cada função que a pessoa procurou e não tinha vaga no ar (só a
-- função, a cidade e a região; quem procurou fica guardado só como uma impressão, para contar pessoas sem repetir).
-- Uma vez por semana, com o envio ligado em Admin › Procuradas sem vaga:
--   * a empresa que já publicou vaga da função nos últimos 12 meses, e não tem vaga dela no ar, recebe "N pessoas
--     procuraram vaga de X no Publike e não acharam", com o "Publicar de novo" (a vaga de antes já preenchida);
--   * a agência de emprego recebe a lista das funções procuradas sem vaga.
-- Só funções com pelo menos 3 pessoas (o mínimo muda no Admin), no sino, no celular e por e-mail (o modelo
-- 'procura_na_regiao', editável em Admin › E-mails). Nunca mais de uma vez por semana por conta, e para depois de 3
-- semanas seguidas sem publicar nada. Começa desligado. Pode rodar de novo.

-- 1. O registro ------------------------------------------------------------------------------------------------------

create table if not exists privado.procuras_sem_vaga (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  dia date not null default (now() at time zone 'America/Sao_Paulo')::date,
  origem text not null default 'whatsapp' check (origem in ('whatsapp', 'site')),
  -- a função como a pessoa disse (para mostrar) e sem acento, em minúsculas (para juntar)
  funcao text not null check (char_length(funcao) between 3 and 60),
  funcao_norma text not null,
  cidade text check (cidade is null or char_length(cidade) <= 60),
  regiao text check (regiao is null or char_length(regiao) <= 60),
  -- a impressão de quem procurou (md5 da conversa), só para contar pessoas
  quem text not null
);
create unique index if not exists procuras_sem_vaga_uma_por_dia on privado.procuras_sem_vaga (quem, funcao_norma, dia);
create index if not exists procuras_sem_vaga_criado_idx on privado.procuras_sem_vaga (criado_em desc);
alter table privado.procuras_sem_vaga enable row level security;
revoke all on privado.procuras_sem_vaga from public, anon, authenticated;

-- o servidor do site (o atendimento do WhatsApp) registra as funções sem vaga de uma resposta
create or replace function public.servidor_procura_sem_vaga(
  p_chave text, p_funcoes text[], p_cidade text, p_regiao text, p_quem text, p_origem text default 'whatsapp'
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  f text;
  n integer := 0;
  k integer;
begin
  perform privado.exigir_servidor(p_chave);
  if coalesce(btrim(p_quem), '') = '' then
    return 0;
  end if;
  foreach f in array coalesce(p_funcoes, '{}') loop
    f := left(regexp_replace(btrim(coalesce(f, '')), '\s+', ' ', 'g'), 60);
    continue when char_length(f) < 3;
    insert into privado.procuras_sem_vaga (origem, funcao, funcao_norma, cidade, regiao, quem)
    values (case when p_origem = 'site' then 'site' else 'whatsapp' end, f, lower(public.sem_acento(f)),
            nullif(left(btrim(coalesce(p_cidade, '')), 60), ''), nullif(left(btrim(coalesce(p_regiao, '')), 60), ''),
            md5('procura|' || p_quem))
    on conflict do nothing;
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end
$$;

-- 2. A configuração e os avisos mandados -------------------------------------------------------------------------------

create table if not exists privado.config_procuradas (
  id boolean primary key default true check (id),
  ligado boolean not null default false,
  minimo integer not null default 3 check (minimo between 1 and 50),
  dias integer not null default 7 check (dias between 1 and 30),
  atualizado_em timestamptz not null default now()
);
insert into privado.config_procuradas (id) values (true) on conflict (id) do nothing;
alter table privado.config_procuradas enable row level security;
revoke all on privado.config_procuradas from public, anon, authenticated;

create table if not exists privado.procuras_avisadas (
  conta_id uuid not null references public.perfis (id) on delete cascade,
  semana date not null,
  funcoes text[] not null,
  criado_em timestamptz not null default now(),
  primary key (conta_id, semana)
);
alter table privado.procuras_avisadas enable row level security;
revoke all on privado.procuras_avisadas from public, anon, authenticated;

-- 3. O título da vaga é da função? (o mesmo jeito do atendimento: cada palavra da função, pelo começo, no título) ------

create or replace function privado.titulo_da_funcao(p_titulo text, p_funcao text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select count(*) > 0
         and bool_and(position(left(w, greatest(5, char_length(w) - 3)) in lower(public.sem_acento(coalesce(p_titulo, '')))) > 0)
    from unnest(regexp_split_to_array(lower(public.sem_acento(coalesce(p_funcao, ''))), '[^a-z0-9]+')) w
   where char_length(w) > 2 and w not in ('dos', 'das', 'para', 'com', 'uma', 'umas', 'uns')
$$;

-- 4. As funções procuradas sem vaga e quem recebe --------------------------------------------------------------------

-- as funções com pelo menos p_minimo pessoas nos últimos p_dias (o nome mais dito, as cidades e as regiões)
create or replace function privado.procuradas_sem_vaga(p_dias integer, p_minimo integer)
returns table (funcao_norma text, funcao text, pessoas integer, cidades text[], regioes text[])
language sql
stable
security definer
set search_path = ''
as $$
  select p.funcao_norma,
         (select lower(x.funcao) from privado.procuras_sem_vaga x
           where x.funcao_norma = p.funcao_norma and x.criado_em > now() - make_interval(days => p_dias)
           group by x.funcao order by count(*) desc, x.funcao limit 1),
         count(distinct p.quem)::integer,
         coalesce(array_agg(distinct p.cidade) filter (where p.cidade is not null), '{}'),
         coalesce(array_agg(distinct p.regiao) filter (where p.regiao is not null), '{}')
    from privado.procuras_sem_vaga p
   where p.criado_em > now() - make_interval(days => p_dias)
   group by p.funcao_norma
  having count(distinct p.quem) >= p_minimo
   order by count(distinct p.quem) desc, p.funcao_norma
$$;

-- "pedreiro (5 pessoas), servente (3 pessoas) e zelador (3 pessoas)"
create or replace function privado.lista_de_procuradas(p_itens jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  with i as (
    select row_number() over () as n, count(*) over () as total,
           (e ->> 'funcao') || ' (' || (e ->> 'pessoas') || case when (e ->> 'pessoas')::integer = 1 then ' pessoa)' else ' pessoas)' end as t
      from jsonb_array_elements(p_itens) e
  )
  select coalesce(string_agg(case when n = 1 then t when n = total then ' e ' || t else ', ' || t end, '' order by n), '')
    from i
$$;

-- cada conta que recebe, com o texto do aviso (a prévia do Admin e o envio usam a mesma conta)
create or replace function privado.procuradas_destinatarios(p_dias integer, p_minimo integer)
returns table (conta_id uuid, nome text, tipo text, anuncio_id uuid, funcoes text[], texto text)
language sql
stable
security definer
set search_path = ''
as $$
  with f as (
    select * from privado.procuradas_sem_vaga(p_dias, p_minimo)
  ),
  -- as empresas que já publicaram vaga da função (12 meses) e não têm vaga dela no ar
  empresas as (
    select a.autor_id as conta_id, f.funcao, f.pessoas, f.cidades,
           (array_agg(a.id order by a.criado_em desc))[1] as anuncio_id
      from f
      join public.anuncios a on a.tipo = 'vaga' and a.criado_em > now() - interval '12 months'
                            and privado.titulo_da_funcao(a.titulo, f.funcao)
      join public.perfis p on p.id = a.autor_id and p.tipo in ('comercio', 'empresa')
     where (p.suspenso_ate is null or p.suspenso_ate <= now())
       and (cardinality(f.cidades) = 0 or a.cidade = any (f.cidades) or p.cidade = any (f.cidades))
       and not exists (select 1 from public.anuncios b
                        where b.autor_id = a.autor_id and b.tipo = 'vaga' and b.status = 'ativo' and b.expira_em > now()
                          and privado.titulo_da_funcao(b.titulo, f.funcao))
     group by a.autor_id, f.funcao, f.pessoas, f.cidades
  ),
  -- as agências de emprego (todas as funções)
  agencias as (
    select p.id as conta_id, f.funcao, f.pessoas, f.cidades, null::uuid as anuncio_id
      from f
      join public.perfis p on p.tipo = 'agencia'
     where (p.suspenso_ate is null or p.suspenso_ate <= now())
  ),
  todas as (
    select e.*, 'empresa' as tipo from empresas e
    union all
    select g.*, 'agencia' from agencias g
  ),
  por_conta as (
    select t.conta_id, t.tipo,
           (array_agg(t.anuncio_id order by t.pessoas desc) filter (where t.anuncio_id is not null))[1] as anuncio_id,
           array_agg(t.funcao order by t.pessoas desc, t.funcao) as funcoes,
           jsonb_agg(jsonb_build_object('funcao', t.funcao, 'pessoas', t.pessoas) order by t.pessoas desc, t.funcao) as itens,
           (select array_agg(distinct c) from todas t2, unnest(t2.cidades) c where t2.conta_id = t.conta_id) as cidades
      from todas t
     group by t.conta_id, t.tipo
  )
  select c.conta_id, p.nome, c.tipo, c.anuncio_id, c.funcoes[1:5],
         case
           when c.tipo = 'agencia' then
             'Nos últimos ' || p_dias || ' dias, estas funções foram procuradas no Publike e não tinham vaga no ar: '
             || privado.lista_de_procuradas((select jsonb_agg(x) from (select x from jsonb_array_elements(c.itens) x limit 5) y))
             || '. Se vocês têm vagas assim, publiquem aqui: a vaga aparece para quem procura essa função perto de casa.'
           when jsonb_array_length(c.itens) = 1 then
             'Nos últimos ' || p_dias || ' dias, ' || (c.itens -> 0 ->> 'pessoas')
             || case when (c.itens -> 0 ->> 'pessoas')::integer = 1 then ' pessoa procurou' else ' pessoas procuraram' end
             || ' vaga de '
             || (c.itens -> 0 ->> 'funcao') || ' no Publike'
             || case when cardinality(c.cidades) between 1 and 2 then ', em ' || array_to_string(c.cidades, ' e ') else '' end
             || ', e não havia vaga de ' || (c.itens -> 0 ->> 'funcao') || ' no ar. Vocês já anunciaram essa vaga aqui: se'
             || ' estiverem contratando, publiquem de novo, com a vaga de antes já preenchida.'
           else
             'Nos últimos ' || p_dias || ' dias, pessoas procuraram no Publike vagas que vocês já anunciaram aqui, e não'
             || ' havia nenhuma no ar: '
             || privado.lista_de_procuradas((select jsonb_agg(x) from (select x from jsonb_array_elements(c.itens) x limit 5) y))
             || '. Se estiverem contratando, publiquem de novo, com a vaga de antes já preenchida.'
         end
    from por_conta c
    join public.perfis p on p.id = c.conta_id
   order by c.tipo desc, jsonb_array_length(c.itens) desc, p.nome
$$;

-- 5. O aviso novo 'procura_na_regiao' (no grupo da semana; sino, celular e e-mail) -----------------------------------

do $$
declare
  d text;
  f text;
  t text;
  antes text;
begin
  select pg_get_constraintdef(c.oid) into d from pg_constraint c
   where c.conrelid = 'public.notificacoes'::regclass and c.conname = 'notificacoes_tipo_check';
  if strpos(d, '''procura_na_regiao''') = 0 then
    if strpos(d, '''interesse_local''::text') = 0 then
      raise exception 'notificacoes_tipo_check sem interesse_local (rode antes a 20270615120000): %', d;
    end if;
    d := replace(d, '''interesse_local''::text', '''interesse_local''::text, ''procura_na_regiao''::text');
    alter table public.notificacoes drop constraint notificacoes_tipo_check;
    execute 'alter table public.notificacoes add constraint notificacoes_tipo_check ' || d;
  end if;

  f := pg_get_functiondef('privado.grupo_do_aviso(text)'::regprocedure);
  if strpos(f, '''procura_na_regiao''') = 0 then
    antes := f;
    f := replace(f, '''talentos_reativar'', ''resumo_vagas'') then ''semana''',
                 '''talentos_reativar'', ''resumo_vagas'', ''procura_na_regiao'') then ''semana''');
    if f = antes then
      raise exception 'privado.grupo_do_aviso mudou: não achei a lista da semana';
    end if;
    execute f;
  end if;

  f := pg_get_functiondef('privado.notificacao_por_email()'::regprocedure);
  if strpos(f, '''procura_na_regiao''') = 0 then
    antes := f;
    f := replace(f, '''rota_pergunta'', ''interesse_local'') then', '''rota_pergunta'', ''interesse_local'', ''procura_na_regiao'') then');
    if f = antes then
      raise exception 'privado.notificacao_por_email mudou: não achei a lista do motivo';
    end if;
    antes := f;
    f := replace(f, 'when ''interesse_local'' then coalesce(new.link, ''/talentos'')',
                 'when ''interesse_local'' then coalesce(new.link, ''/talentos'')'
                 || chr(10) || '                 when ''procura_na_regiao'' then coalesce(new.link, ''/publicar'')');
    if f = antes then
      raise exception 'privado.notificacao_por_email mudou: não achei o caminho do interesse_local';
    end if;
    execute f;
  end if;

  select pg_get_triggerdef(g.oid) into t from pg_trigger g
   where g.tgrelid = 'public.notificacoes'::regclass and g.tgname = 'notificacoes_para_celular';
  if strpos(t, '''procura_na_regiao''') = 0 then
    if strpos(t, '''interesse_local''::text]') = 0 then
      raise exception 'notificacoes_para_celular mudou: %', t;
    end if;
    t := replace(t, '''interesse_local''::text]', '''interesse_local''::text, ''procura_na_regiao''::text]');
    drop trigger notificacoes_para_celular on public.notificacoes;
    execute t;
  end if;
end
$$;

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('procura_na_regiao', 'usuarios', 61, 'Procuraram e não acharam vaga',
     'Para quem contrata, uma vez por semana: as funções que as pessoas procuraram no Publike sem vaga no ar. Vai para a empresa que já anunciou a função e para as agências (Admin › Procuradas sem vaga).',
     array['nome', 'motivo', 'link'],
     'Gente procurando vaga que vocês já anunciaram',
     E'Oi, {{nome}}.\n\n{{motivo}}',
     'Publicar a vaga')
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

-- 6. O envio da semana (pela tarefa das filas) --------------------------------------------------------------------------

drop function if exists public.servidor_avisar_procuradas(text, integer);

-- p_agora: o "Mandar agora" do Admin (fora do horário e mesmo com o envio automático desligado)
create or replace function public.servidor_avisar_procuradas(p_chave text, p_limite integer default 50, p_agora boolean default false)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cfg privado.config_procuradas;
  agora_br timestamp := now() at time zone 'America/Sao_Paulo';
  v_semana date := date_trunc('week', now() at time zone 'America/Sao_Paulo')::date;
  r record;
  n integer := 0;
begin
  perform privado.exigir_servidor(p_chave);
  select * into cfg from privado.config_procuradas where id;
  if not found then
    return 0;
  end if;
  if not coalesce(p_agora, false) then
    if not cfg.ligado then
      return 0;
    end if;
    -- de segunda a sexta, das 9h às 18h
    if extract(isodow from agora_br) > 5 or extract(hour from agora_br) not between 9 and 17 then
      return 0;
    end if;
  end if;
  for r in
    select d.* from privado.procuradas_destinatarios(cfg.dias, cfg.minimo) d
     where not exists (select 1 from privado.procuras_avisadas v where v.conta_id = d.conta_id and v.semana = v_semana)
       -- 3 semanas seguidas sem publicar nada: para
       and not ((select count(*) from privado.procuras_avisadas v
                  where v.conta_id = d.conta_id and v.criado_em > now() - interval '22 days') >= 3
                and not exists (select 1 from public.anuncios a
                                 where a.autor_id = d.conta_id and a.criado_em > now() - interval '22 days'))
     limit greatest(1, least(coalesce(p_limite, 50), 200))
  loop
    insert into privado.procuras_avisadas (conta_id, semana, funcoes) values (r.conta_id, v_semana, r.funcoes)
    on conflict do nothing;
    continue when not found;
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, texto, link)
    values (r.conta_id, 'procura_na_regiao', r.anuncio_id, r.texto,
            case when r.anuncio_id is not null then '/publicar?copiar=' || r.anuncio_id else '/publicar' end);
    n := n + 1;
  end loop;
  return n;
end
$$;

-- 7. O Admin ---------------------------------------------------------------------------------------------------------

create or replace function public.admin_procuradas(p_dias integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cfg privado.config_procuradas;
  v_dias integer;
begin
  perform privado.exigir_admin();
  select * into cfg from privado.config_procuradas where id;
  v_dias := coalesce(p_dias, cfg.dias, 7);
  return jsonb_build_object(
    'config', jsonb_build_object('ligado', coalesce(cfg.ligado, false), 'minimo', coalesce(cfg.minimo, 3), 'dias', coalesce(cfg.dias, 7)),
    'dias', v_dias,
    -- todas as funções sem vaga no período (com 1 pessoa ou mais), as mais procuradas primeiro
    'funcoes', coalesce((select jsonb_agg(jsonb_build_object('funcao', f.funcao, 'pessoas', f.pessoas, 'cidades', f.cidades,
                                                             'regioes', f.regioes) order by f.pessoas desc, f.funcao)
                           from privado.procuradas_sem_vaga(v_dias, 1) f), '[]'::jsonb),
    -- quem receberia agora, com o texto
    'destinatarios', coalesce((select jsonb_agg(jsonb_build_object('conta_id', d.conta_id, 'nome', d.nome, 'tipo', d.tipo,
                                                                   'funcoes', d.funcoes, 'texto', d.texto,
                                                                   'avisada_na_semana', exists (
                                                                     select 1 from privado.procuras_avisadas v
                                                                      where v.conta_id = d.conta_id
                                                                        and v.semana = date_trunc('week', now() at time zone 'America/Sao_Paulo')::date)))
                                 from privado.procuradas_destinatarios(cfg.dias, cfg.minimo) d), '[]'::jsonb),
    -- os avisos mandados nas últimas 4 semanas
    'avisadas', coalesce((select jsonb_agg(jsonb_build_object('semana', v.semana, 'nome', p.nome, 'conta_id', v.conta_id,
                                                              'funcoes', v.funcoes) order by v.criado_em desc)
                            from privado.procuras_avisadas v join public.perfis p on p.id = v.conta_id
                           where v.criado_em > now() - interval '28 days'), '[]'::jsonb),
    'registros', (select count(*) from privado.procuras_sem_vaga p where p.criado_em > now() - make_interval(days => v_dias))
  );
end
$$;

create or replace function public.admin_procuradas_config(p_ligado boolean, p_minimo integer, p_dias integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  update privado.config_procuradas
     set ligado = coalesce(p_ligado, ligado),
         minimo = coalesce(least(greatest(p_minimo, 1), 50), minimo),
         dias = coalesce(least(greatest(p_dias, 1), 30), dias),
         atualizado_em = now()
   where id;
end
$$;

revoke all on function privado.procuradas_sem_vaga(integer, integer), privado.procuradas_destinatarios(integer, integer),
  privado.titulo_da_funcao(text, text), privado.lista_de_procuradas(jsonb) from public, anon, authenticated;
revoke execute on function public.servidor_procura_sem_vaga(text, text[], text, text, text, text),
  public.servidor_avisar_procuradas(text, integer, boolean) from public;
grant execute on function public.servidor_procura_sem_vaga(text, text[], text, text, text, text),
  public.servidor_avisar_procuradas(text, integer, boolean) to anon, authenticated, service_role;
revoke execute on function public.admin_procuradas(integer), public.admin_procuradas_config(boolean, integer, integer)
  from public, anon, authenticated;
grant execute on function public.admin_procuradas(integer), public.admin_procuradas_config(boolean, integer, integer)
  to service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270822120000_procuradas_sem_vaga');
