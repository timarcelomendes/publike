-- O e-mail para quem anunciou vaga em outro lugar (20/11/2026; Marcelo: "tem muitas vagas com e-mails públicos de
-- vagas [...] criar um envio falando sobre publicar via WhatsApp do Publike e dar as outras opções, falar brevemente dos
-- recursos", e depois "ok, pode ser assim" para o jeito combinado):
--   * uma empresa por vez, posta à mão no Admin (sem robô varrendo site de vagas): o nome, o e-mail, o cargo da vaga,
--     onde ela foi vista e o link;
--   * só endereço da empresa: o e-mail pessoal (gmail, hotmail, outlook...) fica de fora;
--   * o texto cita a vaga ({vaga} e {onde}) e é outro, guardado ao lado do texto de sempre (assunto_vagas e texto_vagas);
--   * vai para a mesma fila: o mesmo limite por dia, o mesmo horário, o "não quero receber" e os endereços ruins; sai
--     antes dos outros públicos (a vaga é de agora);
--   * cada endereço recebe uma vez só, como no resto (quem já recebeu de outro público não recebe de novo).
--
-- Pode rodar de novo.

-- 1. o público, a vaga e o texto -------------------------------------------------------------------------------------

alter table privado.email_empresas_envios drop constraint if exists email_empresas_envios_publico_check;
alter table privado.email_empresas_envios add constraint email_empresas_envios_publico_check
  check (publico in ('publike', 'agencias', 'abriram', 'vagas'));

alter table privado.email_empresas_envios add column if not exists vaga text;
alter table privado.email_empresas_envios add column if not exists onde text;
alter table privado.email_empresas_envios add column if not exists link_vaga text;
alter table privado.email_empresas_envios add column if not exists posto_por uuid;

alter table privado.email_empresas add column if not exists assunto_vagas text not null
  default '{empresa}: a vaga de {vaga} no Publike, de graça';
alter table privado.email_empresas add column if not exists texto_vagas text not null
  default 'Olá! Tudo bem?

Vi a vaga de {vaga} que vocês divulgaram{onde}. Sou o Marcelo, do Publike, o site de vagas de Goiânia em que quem procura trabalho perto de casa curte a vaga e a empresa recebe o candidato.

Posso publicar essa vaga no Publike para vocês, de graça. É só tocar no botão abaixo.

Se preferir publicar por conta própria, também é de graça:
• pelo WhatsApp: mande a foto do cartaz ou o texto da vaga para (62) 8477-1907, e ela vai para o ar em minutos;
• pelo site: publike.org, em Publicar vaga.

No Publike, vocês veem quem mora perto da empresa, e quem combina com a vaga recebe o convite para se candidatar.

Se tiver alguma dúvida, é só responder este e-mail.';

-- o endereço de uma pessoa (o provedor grátis): fica de fora deste público
create or replace function privado.email_empresas_pessoal(p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(split_part(btrim(coalesce(p_email, '')), '@', 2)) in (
    'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.com.br', 'outlook.com', 'outlook.com.br', 'live.com',
    'msn.com', 'yahoo.com', 'yahoo.com.br', 'ymail.com', 'icloud.com', 'me.com', 'bol.com.br', 'uol.com.br',
    'terra.com.br', 'ig.com.br', 'globo.com', 'globomail.com', 'r7.com', 'zipmail.com.br', 'protonmail.com',
    'proton.me', 'aol.com')
$$;
revoke all on function privado.email_empresas_pessoal(text) from public;

-- 2. o Admin --------------------------------------------------------------------------------------------------------

-- pôr uma empresa que anunciou vaga na fila; devolve {ok, mensagem} ou {ok: false, erro}
create or replace function public.admin_email_empresas_vaga_por(
  p_nome text, p_email text, p_vaga text, p_onde text, p_link text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_nome text := left(btrim(coalesce(p_nome, '')), 120);
  v_vaga text := left(btrim(coalesce(p_vaga, '')), 80);
  v_onde text := nullif(left(btrim(coalesce(p_onde, '')), 60), '');
  v_link text := nullif(left(btrim(coalesce(p_link, '')), 300), '');
  v_antes privado.email_empresas_envios;
begin
  perform privado.exigir_equipe_email_empresas();
  if v_nome = '' then
    return jsonb_build_object('ok', false, 'erro', 'Escreva o nome da empresa.');
  end if;
  if v_vaga = '' then
    return jsonb_build_object('ok', false, 'erro', 'Escreva o cargo da vaga (por exemplo, auxiliar de cozinha).');
  end if;
  if not privado.email_empresas_valido(v_email) then
    return jsonb_build_object('ok', false, 'erro', 'Confira o e-mail.');
  end if;
  if privado.email_empresas_pessoal(v_email) then
    return jsonb_build_object('ok', false, 'erro',
      'É um e-mail pessoal (' || split_part(v_email, '@', 2) || '): fica de fora. Só o endereço da empresa.');
  end if;
  if exists (select 1 from privado.email_empresas_sair s where s.email = v_email) then
    return jsonb_build_object('ok', false, 'erro', 'Este endereço pediu para não receber.');
  end if;
  if exists (select 1 from privado.email_empresas_ruins r where r.email = v_email) then
    return jsonb_build_object('ok', false, 'erro', 'Este endereço já se mostrou ruim (não existe ou voltou).');
  end if;
  select * into v_antes from privado.email_empresas_envios e where lower(btrim(e.email)) = v_email;
  if found then
    return jsonb_build_object('ok', false, 'erro',
      case when v_antes.situacao = 'na_fila' then 'Este endereço já está na fila.'
           else 'Este endereço já recebeu o e-mail do Publike'
                || coalesce(' em ' || to_char(v_antes.enviado_em at time zone 'America/Sao_Paulo', 'DD/MM'), '')
                || ': cada endereço recebe uma vez só.' end);
  end if;
  insert into privado.email_empresas_envios (publico, nome, email, prioridade, vaga, onde, link_vaga, posto_por)
  values ('vagas', v_nome, v_email, 40, v_vaga, v_onde, v_link, (select auth.uid()));
  perform privado.registrar('email_empresas_vaga', 'config', v_email, 'E-mail às empresas',
                            jsonb_build_object('empresa', v_nome, 'vaga', v_vaga, 'onde', v_onde));
  return jsonb_build_object('ok', true, 'mensagem', v_nome || ' entrou na fila.');
end
$$;
revoke execute on function public.admin_email_empresas_vaga_por(text, text, text, text, text) from public, anon;
grant execute on function public.admin_email_empresas_vaga_por(text, text, text, text, text)
  to authenticated, service_role;

-- o texto deste público e as empresas postas (as 60 mais novas)
create or replace function public.admin_email_empresas_vagas()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cfg privado.email_empresas;
begin
  perform privado.exigir_equipe_email_empresas();
  select * into cfg from privado.email_empresas where id;
  return jsonb_build_object(
    'assunto', cfg.assunto_vagas,
    'texto', cfg.texto_vagas,
    'lista', coalesce((select jsonb_agg(to_jsonb(y) order by y.id desc)
                         from (select e.id, e.nome, e.email, e.vaga, e.onde, e.link_vaga, e.situacao, e.erro,
                                      e.criado_em, e.enviado_em, e.abriu_em, e.respondeu_em
                                 from privado.email_empresas_envios e
                                where e.publico = 'vagas'
                                order by e.id desc limit 60) y), '[]'::jsonb));
end
$$;
revoke execute on function public.admin_email_empresas_vagas() from public, anon;
grant execute on function public.admin_email_empresas_vagas() to authenticated, service_role;

create or replace function public.admin_email_empresas_vagas_salvar(p_assunto text, p_texto text)
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
  update privado.email_empresas
     set assunto_vagas = btrim(p_assunto), texto_vagas = btrim(p_texto),
         atualizado_em = now(), atualizado_por = (select auth.uid())
   where id;
  perform privado.registrar('email_empresas_vagas_salvar', 'config', null, 'E-mail às empresas', '{}'::jsonb);
end
$$;
revoke execute on function public.admin_email_empresas_vagas_salvar(text, text) from public, anon;
grant execute on function public.admin_email_empresas_vagas_salvar(text, text) to authenticated, service_role;

-- 3. o robô: o texto e a vaga de quem anunciou -----------------------------------------------------------------------

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
  -- a vaga anunciada há mais de 30 dias já passou: sai da fila sem gastar o envio
  update privado.email_empresas_envios e set situacao = 'invalido', erro = 'a vaga foi posta há mais de 30 dias'
   where e.situacao = 'na_fila' and e.publico = 'vagas' and e.criado_em < now() - interval '30 days';
  select * into v_e from privado.email_empresas_envios e
   where e.situacao = 'na_fila'
     and not exists (select 1 from privado.email_empresas_sair s where s.email = lower(btrim(e.email)))
     and not exists (select 1 from privado.email_empresas_ruins r where r.email = lower(btrim(e.email)))
   -- o público (quem anunciou vaga, Publike, agências, abriram perto) e, dentro dele, quem mais entrou no Publike
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
    'assunto', case when v_e.publico = 'vagas' then cfg.assunto_vagas else cfg.assunto end,
    'texto', case when v_e.publico = 'vagas' then cfg.texto_vagas else cfg.texto end,
    'vaga', v_e.vaga, 'onde', v_e.onde,
    'remetente_nome', cfg.remetente_nome, 'remetente_email', cfg.remetente_email);
end
$$;

-- o resumo do Admin: o público novo nos números por público e a vaga em quem disse sim
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
                                       from unnest(array['publike', 'agencias', 'abriram', 'vagas']) as p(publico)
                                       left join privado.email_empresas_envios e on e.publico = p.publico
                                      group by p.publico) x), '{}'::jsonb),
    'sim', coalesce((select jsonb_agg(to_jsonb(y) order by y.respondeu_em desc)
                       from (select e.id, e.publico, e.conta_id, e.cnpj, e.nome, e.email, e.link_vagas, e.telefone,
                                    e.observacao, e.respondeu_em, e.vaga, e.onde, e.link_vaga
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

select privado.migracao_aplicada('20270814120000_email_empresas_quem_anunciou');
