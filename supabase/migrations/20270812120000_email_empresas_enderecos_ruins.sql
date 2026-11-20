-- Os e-mails que não existem (20/11/2026; Marcelo: "temos algum mecanismo que consiga validar se o e-mail existe [...]
-- tivemos alguns emails inexistentes e isso prejudica a qualidade" e "os e-mails estão vindo muitos ruins", com o aviso
-- do mailer-daemon de 123@gmail.com: "550 5.1.1 The email account that you tried to reach does not exist").
--
-- Duas camadas, sem custo:
--   * antes de sair (src/lib/servidor/email-empresas.ts): o endereço de mentira (123@gmail.com, teste@, xxx@, o domínio
--     de exemplo ou com erro de digitação) e o domínio que não recebe e-mail (pergunta ao DNS se tem MX) não saem: a
--     empresa vira "invalido", sem gastar o envio do dia;
--   * depois (o mesmo arquivo, a cada 30 minutos): o robô lê na caixa do Marcelo os avisos de "não entregue" com erro
--     permanente (5.x.x) e marca o endereço como "voltou". O aviso fica na caixa (só é lido, sem marcar como lido).
-- Os endereços ruins ficam em privado.email_empresas_ruins e não saem de novo, nem se a empresa voltar à fila.
--
-- Pode rodar de novo.

create table if not exists privado.email_empresas_ruins (
  email text primary key,
  motivo text not null,
  origem text not null check (origem in ('filtro', 'voltou')),
  em timestamptz not null default now()
);
alter table privado.email_empresas_ruins enable row level security;
revoke all on privado.email_empresas_ruins from public, anon, authenticated;

alter table privado.email_empresas_envios drop constraint if exists email_empresas_envios_situacao_check;
alter table privado.email_empresas_envios add constraint email_empresas_envios_situacao_check
  check (situacao in ('na_fila', 'enviando', 'enviado', 'falhou', 'sim', 'nao', 'invalido', 'voltou'));

-- quando o robô leu os avisos de não entregue pela última vez
alter table privado.email_empresas add column if not exists devolvidos_lidos_em timestamptz;

-- o robô: este endereço é ruim (antes de sair). Não conta no limite do dia nem no espaço entre os envios.
create or replace function public.servidor_email_empresas_invalido(p_chave text, p_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  perform privado.exigir_servidor(p_chave);
  update privado.email_empresas_envios e
     set situacao = 'invalido', erro = left(p_motivo, 300), enviando_em = null
   where e.id = p_id and e.situacao = 'enviando'
  returning lower(btrim(e.email)) into v_email;
  if v_email is not null then
    insert into privado.email_empresas_ruins (email, motivo, origem)
    values (v_email, left(coalesce(p_motivo, 'endereço ruim'), 300), 'filtro')
    on conflict (email) do nothing;
  end if;
end
$$;
revoke execute on function public.servidor_email_empresas_invalido(text, bigint, text) from public;
grant execute on function public.servidor_email_empresas_invalido(text, bigint, text) to anon, authenticated, service_role;

-- o robô: está na hora de ler os avisos de não entregue? (a cada 30 minutos; marca a hora)
create or replace function public.servidor_email_empresas_ler_devolvidos(p_chave text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  update privado.email_empresas c set devolvidos_lidos_em = now()
   where c.id and (c.devolvidos_lidos_em is null or c.devolvidos_lidos_em < now() - interval '30 minutes')
     and exists (select 1 from privado.email_empresas_envios e where e.enviado_em > now() - interval '14 days');
  return found;
end
$$;
revoke execute on function public.servidor_email_empresas_ler_devolvidos(text) from public;
grant execute on function public.servidor_email_empresas_ler_devolvidos(text) to anon, authenticated, service_role;

-- o robô: os endereços que voltaram ([{"email", "motivo"}]); só os que o e-mail às empresas mandou. Devolve quantos
-- envios mudaram.
create or replace function public.servidor_email_empresas_voltaram(p_chave text, p_itens jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n integer := 0;
  v_m integer;
  x record;
begin
  perform privado.exigir_servidor(p_chave);
  if jsonb_typeof(p_itens) is distinct from 'array' then
    return 0;
  end if;
  for x in select lower(btrim(i->>'email')) as email, left(coalesce(i->>'motivo', 'não entregue'), 300) as motivo
             from jsonb_array_elements(p_itens) i
            limit 200 loop
    continue when x.email is null or x.email = '';
    update privado.email_empresas_envios e set situacao = 'voltou', erro = x.motivo
     where lower(btrim(e.email)) = x.email and e.situacao = 'enviado';
    get diagnostics v_m = row_count;
    v_n := v_n + v_m;
    if v_m > 0 or exists (select 1 from privado.email_empresas_envios e where lower(btrim(e.email)) = x.email) then
      insert into privado.email_empresas_ruins (email, motivo, origem) values (x.email, x.motivo, 'voltou')
      on conflict (email) do update set origem = 'voltou', motivo = excluded.motivo, em = now();
      update privado.email_empresas_envios e set situacao = 'invalido', erro = x.motivo
       where lower(btrim(e.email)) = x.email and e.situacao = 'na_fila';
    end if;
  end loop;
  return v_n;
end
$$;
revoke execute on function public.servidor_email_empresas_voltaram(text, jsonb) from public;
grant execute on function public.servidor_email_empresas_voltaram(text, jsonb) to anon, authenticated, service_role;

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
  -- os endereços que já se sabe que não existem saem da fila
  update privado.email_empresas_envios e set situacao = 'invalido', erro = r.motivo
    from privado.email_empresas_ruins r
   where e.situacao = 'na_fila' and r.email = lower(btrim(e.email));
  select * into v_e from privado.email_empresas_envios e
   where e.situacao = 'na_fila'
     and not exists (select 1 from privado.email_empresas_sair s where s.email = lower(btrim(e.email)))
     and not exists (select 1 from privado.email_empresas_ruins r where r.email = lower(btrim(e.email)))
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
                  'falharam', count(*) filter (where e.situacao = 'falhou'),
                  -- os endereços ruins: pegos antes de sair e os que voltaram (dos últimos 7 dias, para a taxa)
                  'invalidos', count(*) filter (where e.situacao = 'invalido'),
                  'voltaram', count(*) filter (where e.situacao = 'voltou'),
                  'enviados_7d', count(*) filter (where e.enviado_em >= now() - interval '7 days'),
                  'voltaram_7d', count(*) filter (where e.situacao = 'voltou' and e.enviado_em >= now() - interval '7 days'))
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

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270812120000_email_empresas_enderecos_ruins');
