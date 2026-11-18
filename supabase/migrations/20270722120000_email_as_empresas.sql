-- O e-mail às empresas (18/11/2026). Pedido do Marcelo: levar as empresas a publicar no Publike ("as empresas que tem
-- vagas no Gupy publicar no publike, suas vagas com links"), por e-mail, "com um botao de sim", do marcelo@publike.org,
-- "na base do publike e nas empresas que temos na base da receita, com esse controle máximo de quantidades".
--
--   * privado.email_empresas: ligado (nasce desligado: o Marcelo aprova o texto e liga), quantos por dia, o horário
--     (dias úteis), o remetente, o assunto e o texto;
--   * privado.email_empresas_envios: um e-mail por endereço, para sempre (não manda de novo para o mesmo e-mail), com
--     o token do botão; a situação: na fila, enviando, enviado, falhou, sim, não;
--   * privado.email_empresas_sair: quem pediu para não receber (vale para qualquer público);
--   * os públicos: as contas de quem contrata no Publike sem vaga no ar ('publike'), as agências da base da Receita
--     ('agencias') e as empresas que abriram perto nos últimos 90 dias ('abriram'). Fica de fora o MEI (o e-mail dele
--     é de uma pessoa);
--   * o robô (servidor_email_empresas_pegar): um por vez, espaçado no horário, até o limite do dia; o envio sai pela
--     caixa do Marcelo (não pelo serviço dos avisos do site, que não aceita prospecção);
--   * o botão abre /empresas/resposta/<token>: "Sim, podem publicar" (com o link das vagas, se quiser) ou
--     "Não quero receber". O sim avisa a equipe por e-mail.
-- Pode rodar de novo.

-- 1. a configuração -------------------------------------------------------------------------------------------------

create table if not exists privado.email_empresas (
  id boolean primary key default true check (id),
  ligado boolean not null default false,
  por_dia integer not null default 25 check (por_dia between 1 and 200),
  hora_inicio integer not null default 9 check (hora_inicio between 0 and 23),
  hora_fim integer not null default 17 check (hora_fim between 1 and 24),
  remetente_nome text not null default 'Marcelo, do Publike',
  remetente_email text not null default 'marcelo@publike.org',
  assunto text not null default 'Vagas da {empresa} no Publike, de graça',
  texto text not null default 'Olá! Tudo bem?

Sou o Marcelo, do Publike, o site de vagas de Goiânia em que quem procura trabalho perto de casa curte a vaga e a empresa recebe o candidato.

Podemos publicar as vagas da {empresa} no Publike, de graça. Se vocês já usam a Gupy ou outro site, publicamos com o link para a candidatura de vocês. Vocês não precisam fazer nada: é só tocar no botão abaixo.

Se tiver alguma dúvida, é só responder este e-mail.',
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  check (hora_fim > hora_inicio)
);
insert into privado.email_empresas (id) values (true) on conflict (id) do nothing;
alter table privado.email_empresas enable row level security;
revoke all on privado.email_empresas from public, anon, authenticated;

create table if not exists privado.email_empresas_envios (
  id bigint generated always as identity primary key,
  token text not null unique
    default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  publico text not null check (publico in ('publike', 'agencias', 'abriram')),
  conta_id uuid references public.perfis (id) on delete set null,
  cnpj text,
  nome text not null,
  email text not null,
  situacao text not null default 'na_fila'
    check (situacao in ('na_fila', 'enviando', 'enviado', 'falhou', 'sim', 'nao')),
  prioridade integer not null default 0,
  erro text,
  criado_em timestamptz not null default now(),
  enviando_em timestamptz,
  enviado_em timestamptz,
  abriu_em timestamptz,
  respondeu_em timestamptz,
  -- o que a empresa deixou no sim
  link_vagas text,
  telefone text,
  observacao text
);
create unique index if not exists email_empresas_envios_email_idx on privado.email_empresas_envios (lower(btrim(email)));
create index if not exists email_empresas_envios_fila_idx on privado.email_empresas_envios (prioridade desc, id)
  where situacao = 'na_fila';
alter table privado.email_empresas_envios enable row level security;
revoke all on privado.email_empresas_envios from public, anon, authenticated;

create table if not exists privado.email_empresas_sair (
  email text primary key,
  em timestamptz not null default now()
);
alter table privado.email_empresas_sair enable row level security;
revoke all on privado.email_empresas_sair from public, anon, authenticated;

-- o e-mail que dá para mandar (o mesmo jeito do resto do Publike)
create or replace function privado.email_empresas_valido(p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(btrim(p_email), '') ~* '^[^@[:space:];,]+@[^@[:space:];,]+\.[^@[:space:];,]+$'
$$;
revoke all on function privado.email_empresas_valido(text) from public;

-- 2. o Admin --------------------------------------------------------------------------------------------------------

create or replace function privado.exigir_equipe_email_empresas()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
end
$$;
revoke all on function privado.exigir_equipe_email_empresas() from public;

-- quem de cada público ainda pode entrar na fila (o mesmo filtro de admin_email_empresas_por_na_fila)
create or replace function privado.email_empresas_candidatos(p_publico text)
returns table (publico text, conta_id uuid, cnpj text, nome text, email text, prioridade integer)
language sql
stable
security definer
set search_path = ''
as $$
  with todos as (
    -- as contas de quem contrata sem vaga no ar, que não desligaram os e-mails
    select 'publike'::text as publico, p.id as conta_id, p.cnpj, p.nome,
           coalesce(nullif(btrim(c.email), ''), u.email) as email, 30 as prioridade
      from public.perfis p
      left join public.contatos c on c.perfil_id = p.id
      left join auth.users u on u.id = p.id
     where p_publico = 'publike'
       and p.tipo <> 'pessoa'
       and (p.suspenso_ate is null or p.suspenso_ate < now())
       and c.receber_emails is not false
       and not exists (select 1 from public.anuncios a
                        where a.autor_id = p.id and a.status = 'ativo' and a.expira_em > now())
    union all
    -- as agências da base da Receita (as de Goiás), que ainda não têm conta
    select 'agencias', null, e.cnpj, e.nome, e.email, 20
      from privado.empresas_receita e
     where p_publico = 'agencias'
       and e.agencia and e.situacao = 'ativa'
    union all
    -- as empresas que abriram perto nos últimos 90 dias (sem o MEI)
    select 'abriram', null, e.cnpj, e.nome, e.email, 10
      from privado.empresas_receita e
     where p_publico = 'abriram'
       and not e.mei and e.na_praca and e.situacao = 'ativa'
       and e.data_abertura >= privado.ultima_abertura() - 90
  )
  select t.publico, t.conta_id, t.cnpj, t.nome, btrim(t.email), t.prioridade
    from todos t
   where privado.email_empresas_valido(t.email)
     and coalesce(btrim(t.nome), '') <> ''
     -- da Receita: sem conta no Publike e sem o "não convidar"
     and (t.publico = 'publike' or (
            not exists (select 1 from public.perfis pf where pf.cnpj = t.cnpj)
            and not exists (select 1 from privado.receita_sem_convite s where s.cnpj = t.cnpj)))
     and not exists (select 1 from privado.email_empresas_envios x where lower(btrim(x.email)) = lower(btrim(t.email)))
     and not exists (select 1 from privado.email_empresas_sair s where s.email = lower(btrim(t.email)))
$$;
revoke all on function privado.email_empresas_candidatos(text) from public;

create or replace function public.admin_email_empresas()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cfg privado.email_empresas;
  v_hoje timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  perform privado.exigir_equipe_email_empresas();
  select * into cfg from privado.email_empresas where id;
  return jsonb_build_object(
    'config', jsonb_build_object(
      'ligado', cfg.ligado, 'por_dia', cfg.por_dia, 'hora_inicio', cfg.hora_inicio, 'hora_fim', cfg.hora_fim,
      'remetente_nome', cfg.remetente_nome, 'remetente_email', cfg.remetente_email,
      'assunto', cfg.assunto, 'texto', cfg.texto, 'atualizado_em', cfg.atualizado_em),
    'numeros', (select jsonb_build_object(
                  'na_fila', count(*) filter (where e.situacao = 'na_fila'),
                  'enviados_hoje', count(*) filter (where e.enviado_em >= v_hoje),
                  'enviados', count(*) filter (where e.enviado_em is not null),
                  'abriram', count(*) filter (where e.abriu_em is not null),
                  'sim', count(*) filter (where e.situacao = 'sim'),
                  'nao', count(*) filter (where e.situacao = 'nao'),
                  'falharam', count(*) filter (where e.situacao = 'falhou'))
                  from privado.email_empresas_envios e),
    'por_publico', coalesce((select jsonb_object_agg(x.publico, jsonb_build_object(
                                'na_fila', x.na_fila, 'enviados', x.enviados, 'sim', x.sim, 'nao', x.nao,
                                'disponiveis', (select count(*) from privado.email_empresas_candidatos(x.publico))))
                               from (select p.publico,
                                            count(e.id) filter (where e.situacao = 'na_fila') as na_fila,
                                            count(e.id) filter (where e.enviado_em is not null) as enviados,
                                            count(e.id) filter (where e.situacao = 'sim') as sim,
                                            count(e.id) filter (where e.situacao = 'nao') as nao
                                       from unnest(array['publike', 'agencias', 'abriram']) as p(publico)
                                       left join privado.email_empresas_envios e on e.publico = p.publico
                                      group by p.publico) x), '{}'::jsonb),
    'sim', coalesce((select jsonb_agg(to_jsonb(y) order by y.respondeu_em desc)
                       from (select e.id, e.publico, e.conta_id, e.cnpj, e.nome, e.email, e.link_vagas, e.telefone,
                                    e.observacao, e.respondeu_em
                               from privado.email_empresas_envios e
                              where e.situacao = 'sim'
                              order by e.respondeu_em desc limit 100) y), '[]'::jsonb),
    'ultimos', coalesce((select jsonb_agg(to_jsonb(y) order by y.quando desc)
                           from (select e.id, e.publico, e.conta_id, e.nome, e.situacao, e.erro, e.enviado_em,
                                        e.abriu_em, e.respondeu_em,
                                        coalesce(e.respondeu_em, e.abriu_em, e.enviado_em, e.criado_em) as quando
                                   from privado.email_empresas_envios e
                                  where e.situacao <> 'na_fila'
                                  order by coalesce(e.respondeu_em, e.abriu_em, e.enviado_em, e.criado_em) desc
                                  limit 40) y), '[]'::jsonb),
    'proximos', coalesce((select jsonb_agg(to_jsonb(y) order by y.prioridade desc, y.id)
                            from (select e.id, e.publico, e.nome, e.prioridade
                                    from privado.email_empresas_envios e
                                   where e.situacao = 'na_fila'
                                   order by e.prioridade desc, e.id limit 10) y), '[]'::jsonb));
end
$$;
revoke execute on function public.admin_email_empresas() from public, anon;
grant execute on function public.admin_email_empresas() to authenticated, service_role;

create or replace function public.admin_email_empresas_salvar(
  p_ligado boolean, p_por_dia integer, p_hora_inicio integer, p_hora_fim integer,
  p_remetente_nome text, p_assunto text, p_texto text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_equipe_email_empresas();
  if coalesce(btrim(p_assunto), '') = '' or char_length(p_assunto) > 150 then
    raise exception 'Escreva o assunto (até 150 letras).' using errcode = '22023';
  end if;
  if coalesce(btrim(p_texto), '') = '' or char_length(p_texto) > 3000 then
    raise exception 'Escreva o texto (até 3.000 letras).' using errcode = '22023';
  end if;
  if coalesce(btrim(p_remetente_nome), '') = '' or char_length(p_remetente_nome) > 60 then
    raise exception 'Escreva o nome do remetente (até 60 letras).' using errcode = '22023';
  end if;
  if p_hora_fim <= p_hora_inicio then
    raise exception 'O fim do horário vem depois do começo.' using errcode = '22023';
  end if;
  update privado.email_empresas
     set ligado = coalesce(p_ligado, false),
         por_dia = least(greatest(coalesce(p_por_dia, 25), 1), 200),
         hora_inicio = least(greatest(coalesce(p_hora_inicio, 9), 0), 23),
         hora_fim = least(greatest(coalesce(p_hora_fim, 17), 1), 24),
         remetente_nome = btrim(p_remetente_nome),
         assunto = btrim(p_assunto),
         texto = btrim(p_texto),
         atualizado_em = now(),
         atualizado_por = (select auth.uid())
   where id;
  perform privado.registrar('email_empresas_salvar', 'config', null, 'E-mail às empresas',
                            jsonb_build_object('ligado', coalesce(p_ligado, false), 'por_dia', p_por_dia));
end
$$;
revoke execute on function public.admin_email_empresas_salvar(boolean, integer, integer, integer, text, text, text)
  from public, anon;
grant execute on function public.admin_email_empresas_salvar(boolean, integer, integer, integer, text, text, text)
  to authenticated, service_role;

-- pôr na fila até p_limite de um público (os de maior prioridade e, no Publike, as contas mais novas primeiro)
create or replace function public.admin_email_empresas_por_na_fila(p_publico text, p_limite integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  perform privado.exigir_equipe_email_empresas();
  if p_publico not in ('publike', 'agencias', 'abriram') then
    raise exception 'Público inválido.' using errcode = '22023';
  end if;
  insert into privado.email_empresas_envios (publico, conta_id, cnpj, nome, email, prioridade)
  select c.publico, c.conta_id, c.cnpj, left(btrim(c.nome), 120), lower(c.email), c.prioridade
    from (select distinct on (lower(x.email)) x.* from privado.email_empresas_candidatos(p_publico) x
           order by lower(x.email), x.nome) c
   limit least(greatest(coalesce(p_limite, 50), 1), 1000)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  perform privado.registrar('email_empresas_fila', 'config', p_publico, 'E-mail às empresas',
                            jsonb_build_object('quantos', v_n));
  return v_n;
end
$$;
revoke execute on function public.admin_email_empresas_por_na_fila(text, integer) from public, anon;
grant execute on function public.admin_email_empresas_por_na_fila(text, integer) to authenticated, service_role;

-- tirar da fila os que ainda não saíram (de um público, ou todos)
create or replace function public.admin_email_empresas_tirar_da_fila(p_publico text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  perform privado.exigir_equipe_email_empresas();
  delete from privado.email_empresas_envios e
   where e.situacao = 'na_fila' and (p_publico is null or e.publico = p_publico);
  get diagnostics v_n = row_count;
  return v_n;
end
$$;
revoke execute on function public.admin_email_empresas_tirar_da_fila(text) from public, anon;
grant execute on function public.admin_email_empresas_tirar_da_fila(text) to authenticated, service_role;

-- 3. o robô ---------------------------------------------------------------------------------------------------------

-- o próximo e-mail, se for a hora: dia útil, no horário, abaixo do limite do dia e espaçado (o dia dividido pelo
-- limite). Volatile: marca "enviando" (e exigir_servidor grava).
create or replace function public.servidor_email_empresas_pegar(p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cfg privado.email_empresas;
  v_agora timestamp := now() at time zone 'America/Sao_Paulo';
  v_hoje timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_espaco interval;
  v_e privado.email_empresas_envios;
begin
  perform privado.exigir_servidor(p_chave);
  -- o robô caiu no meio: não manda de novo (pode ter saído)
  update privado.email_empresas_envios e set situacao = 'falhou', erro = 'sem confirmação do envio'
   where e.situacao = 'enviando' and e.enviando_em < now() - interval '15 minutes';
  select * into cfg from privado.email_empresas where id;
  if not found or not cfg.ligado then
    return null;
  end if;
  if extract(isodow from v_agora) > 5
     or extract(hour from v_agora) < cfg.hora_inicio or extract(hour from v_agora) >= cfg.hora_fim then
    return null;
  end if;
  if (select count(*) from privado.email_empresas_envios e where e.enviado_em >= v_hoje
                                                              or e.enviando_em >= v_hoje) >= cfg.por_dia then
    return null;
  end if;
  v_espaco := make_interval(mins => greatest(((cfg.hora_fim - cfg.hora_inicio) * 60) / cfg.por_dia, 1));
  if exists (select 1 from privado.email_empresas_envios e
              where coalesce(e.enviado_em, e.enviando_em) > now() - v_espaco) then
    return null;
  end if;
  select * into v_e from privado.email_empresas_envios e
   where e.situacao = 'na_fila'
     and not exists (select 1 from privado.email_empresas_sair s where s.email = lower(btrim(e.email)))
   order by e.prioridade desc, e.id
   limit 1
   for update skip locked;
  if not found then
    return null;
  end if;
  update privado.email_empresas_envios set situacao = 'enviando', enviando_em = now() where id = v_e.id;
  return jsonb_build_object(
    'id', v_e.id, 'token', v_e.token, 'nome', v_e.nome, 'email', v_e.email,
    'assunto', cfg.assunto, 'texto', cfg.texto,
    'remetente_nome', cfg.remetente_nome, 'remetente_email', cfg.remetente_email);
end
$$;
revoke execute on function public.servidor_email_empresas_pegar(text) from public;
grant execute on function public.servidor_email_empresas_pegar(text) to anon, authenticated, service_role;

create or replace function public.servidor_email_empresas_marcar(p_chave text, p_id bigint, p_ok boolean, p_erro text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  update privado.email_empresas_envios e
     set situacao = case when p_ok then 'enviado' else 'falhou' end,
         enviado_em = case when p_ok then now() else e.enviado_em end,
         erro = case when p_ok then null else left(p_erro, 300) end
   where e.id = p_id and e.situacao = 'enviando';
end
$$;
revoke execute on function public.servidor_email_empresas_marcar(text, bigint, boolean, text) from public;
grant execute on function public.servidor_email_empresas_marcar(text, bigint, boolean, text)
  to anon, authenticated, service_role;

-- 4. a página do botão (sem conta) -----------------------------------------------------------------------------------

-- o que a página mostra; a primeira abertura fica registrada
create or replace function public.email_empresas_ver(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_e privado.email_empresas_envios;
begin
  if coalesce(char_length(p_token), 0) <> 64 then
    return null;
  end if;
  select * into v_e from privado.email_empresas_envios e where e.token = p_token;
  if not found then
    return null;
  end if;
  if v_e.abriu_em is null then
    update privado.email_empresas_envios set abriu_em = now() where id = v_e.id;
  end if;
  return jsonb_build_object('nome', v_e.nome, 'situacao', v_e.situacao, 'link_vagas', v_e.link_vagas);
end
$$;
revoke execute on function public.email_empresas_ver(text) from public;
grant execute on function public.email_empresas_ver(text) to anon, authenticated, service_role;

-- o sim (com o link das vagas, o telefone e um recado, se quiser) ou o "não quero receber"
create or replace function public.email_empresas_responder(
  p_token text, p_resposta text, p_link text default null, p_telefone text default null, p_observacao text default null)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_e privado.email_empresas_envios;
begin
  if coalesce(char_length(p_token), 0) <> 64 or p_resposta not in ('sim', 'nao') then
    raise exception 'Link inválido.' using errcode = '22023';
  end if;
  select * into v_e from privado.email_empresas_envios e where e.token = p_token for update;
  if not found then
    raise exception 'Link inválido.' using errcode = '22023';
  end if;
  if p_resposta = 'nao' then
    insert into privado.email_empresas_sair (email) values (lower(btrim(v_e.email))) on conflict do nothing;
    update privado.email_empresas_envios
       set situacao = 'nao', respondeu_em = coalesce(respondeu_em, now()), abriu_em = coalesce(abriu_em, now())
     where id = v_e.id;
    return 'nao';
  end if;
  -- já disse sim: só atualiza o que deixou (sem avisar a equipe de novo)
  update privado.email_empresas_envios
     set situacao = 'sim', respondeu_em = coalesce(respondeu_em, now()), abriu_em = coalesce(abriu_em, now()),
         link_vagas = coalesce(nullif(left(btrim(p_link), 300), ''), link_vagas),
         telefone = coalesce(nullif(left(btrim(p_telefone), 30), ''), telefone),
         observacao = coalesce(nullif(left(btrim(p_observacao), 500), ''), observacao)
   where id = v_e.id;
  -- o sair vale mais que o sim antigo: quem pediu para sair e volta a dizer sim, volta a receber
  delete from privado.email_empresas_sair s where s.email = lower(btrim(v_e.email));
  if v_e.situacao is distinct from 'sim' then
    perform privado.avisar_equipe('aviso_sistema', jsonb_build_object(
      'titulo', left(v_e.nome || ' disse sim no e-mail às empresas', 200),
      'detalhe', left('Pode publicar as vagas no Publike. ' ||
                      coalesce('Onde estão as vagas: ' || nullif(btrim(p_link), '') || '. ', '') ||
                      coalesce('Telefone: ' || nullif(btrim(p_telefone), '') || '. ', '') ||
                      coalesce('Recado: ' || nullif(btrim(p_observacao), '') || '. ', '') ||
                      'E-mail: ' || v_e.email || '.', 1000),
      'caminho', '/admin/email-empresas'));
  end if;
  return 'sim';
end
$$;
revoke execute on function public.email_empresas_responder(text, text, text, text, text) from public;
grant execute on function public.email_empresas_responder(text, text, text, text, text) to anon, authenticated, service_role;

-- 5. a tela na lista de Admin › Quem vê cada tela (só a equipe publike.org)
insert into privado.telas_do_admin (rota, somente_publike) values ('/admin/email-empresas', true)
on conflict (rota) do nothing;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270722120000_email_as_empresas');
