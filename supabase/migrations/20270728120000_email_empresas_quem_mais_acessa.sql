-- E-mail às empresas: primeiro quem mais entra no Publike (18/11/2026). Marcelo: "da para priorizar os que mais
-- acessam?". A fila saía na ordem em que entrou (e o "Pôr na fila" escolhia pela ordem do e-mail). Agora, dentro de cada
-- público (as contas do Publike, as agências, as que abriram perto), sai primeiro a conta que entrou no Publike em mais
-- dias dos últimos 30 (privado.contas_ativas) e, no empate, a que entrou por último. As da Receita não têm conta: ficam
-- na ordem de antes. A conta da equipe (o e-mail @publike.org) sai da fila e não entra mais.
-- Pode rodar de novo.

create index if not exists contas_ativas_conta_dia_idx on privado.contas_ativas (conta_id, dia desc);

-- quantos dias a conta entrou no Publike nos últimos 30 (sem conta: 0) e o último dia
create or replace function privado.email_empresas_dias_ativos(p_conta uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_conta is null then 0 else
    (select count(*)::integer from privado.contas_ativas c
      where c.conta_id = p_conta
        and c.dia >= (now() at time zone 'America/Sao_Paulo')::date - 30)
  end
$$;
revoke all on function privado.email_empresas_dias_ativos(uuid) from public;

create or replace function privado.email_empresas_ultimo_acesso(p_conta uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_conta is null then null else
    (select max(c.dia) from privado.contas_ativas c where c.conta_id = p_conta)
  end
$$;
revoke all on function privado.email_empresas_ultimo_acesso(uuid) from public;

-- as contas da equipe não entram como público ----------------------------------------------------------------------

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
     -- os endereços da equipe (a conta Publike) não recebem o convite
     and lower(btrim(t.email)) not like '%@publike.org'
     -- da Receita: sem conta no Publike e sem o "não convidar"
     and (t.publico = 'publike' or (
            not exists (select 1 from public.perfis pf where pf.cnpj = t.cnpj)
            and not exists (select 1 from privado.receita_sem_convite s where s.cnpj = t.cnpj)))
     and not exists (select 1 from privado.email_empresas_envios x where lower(btrim(x.email)) = lower(btrim(t.email)))
     and not exists (select 1 from privado.email_empresas_sair s where s.email = lower(btrim(t.email)))
$$;
revoke all on function privado.email_empresas_candidatos(text) from public;

-- pôr na fila: quem mais entra primeiro ----------------------------------------------------------------------------

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
   -- quem mais entrou no Publike nos últimos 30 dias primeiro (as da Receita não têm conta: pelo nome)
   order by privado.email_empresas_dias_ativos(c.conta_id) desc,
            privado.email_empresas_ultimo_acesso(c.conta_id) desc nulls last, c.nome
   limit least(greatest(coalesce(p_limite, 50), 1), 1000)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  perform privado.registrar('email_empresas_fila', 'config', p_publico, 'E-mail às empresas',
                            jsonb_build_object('quantos', v_n));
  return v_n;
end
$$;

-- o robô e a tela na mesma ordem ----------------------------------------------------------------------------------

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
  -- a caixa caiu há pouco: espera
  if cfg.parado_ate is not null and cfg.parado_ate > now() then
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
   -- o público (Publike, agências, abriram perto) e, dentro dele, quem mais entrou no Publike nos últimos 30 dias
   order by e.prioridade desc, privado.email_empresas_dias_ativos(e.conta_id) desc,
            privado.email_empresas_ultimo_acesso(e.conta_id) desc nulls last, e.id
   limit 1
   for update of e skip locked;
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
    'proximos', coalesce((select jsonb_agg(to_jsonb(y) order by y.ordem)
                            from (select e.id, e.publico, e.nome, e.prioridade,
                                         privado.email_empresas_dias_ativos(e.conta_id) as dias_ativos,
                                         row_number() over (order by e.prioridade desc,
                                                              privado.email_empresas_dias_ativos(e.conta_id) desc,
                                                              privado.email_empresas_ultimo_acesso(e.conta_id) desc nulls last,
                                                              e.id) as ordem
                                    from privado.email_empresas_envios e
                                   where e.situacao = 'na_fila'
                                   order by ordem limit 10) y), '[]'::jsonb));
end
$$;
revoke execute on function public.admin_email_empresas() from public, anon;
grant execute on function public.admin_email_empresas() to authenticated, service_role;

-- a conta da equipe sai da fila (nunca saiu e-mail para ela)
delete from privado.email_empresas_envios
 where situacao = 'na_fila' and lower(btrim(email)) like '%@publike.org';

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270728120000_email_empresas_quem_mais_acessa');
