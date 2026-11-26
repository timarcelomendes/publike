-- Mais empresas e agências publicando (26/11/2026; Marcelo: "preciso fazer com que mais empresas e agências se
-- cadastrem e publiquem vagas, a maior conversão ocorre hoje via mensagens do WhatsApp, que mando, mas é muito
-- limitado"; escolheu "faça os 3, mas o 2 inicialmente desligado"). Pode rodar de novo.
--
-- Nos últimos 45 dias, o convite com a vaga pronta, tirado da foto de uma vaga (a empresa está contratando agora),
-- converteu 4,3% (951 enviados, 41 contas, 40 vagas; as agências também vieram daí). A base da Receita (197) e o
-- e-mail (240): nenhuma conta. O gargalo é achar as fotos e mandar um por um, do celular.
--
-- 1. Quem procura trabalho traz as vagas: a foto de um anúncio de vaga que a pessoa manda no WhatsApp do Publike vira
--    um convite pronto (origem 'indicacao'), com a vaga escrita e o contato da empresa. A mesma empresa junta as vagas
--    e os contatos no convite que já existe.
-- 2. O envio do convite pelo WhatsApp oficial do Publike (o modelo de marketing publike_vaga_pronta), em lote, pelo robô
--    das filas: DESLIGADO até a equipe ligar em Admin › Convites, com o teto por dia. Só sai o convite com a vaga pronta
--    e WhatsApp (os da foto, do arquivo e os indicados; a Receita, não), das 9h às 18h, de segunda a sábado.

-- 1. Os convites indicados ------------------------------------------------------------------------------------------

alter table public.convites drop constraint if exists convites_origem_check;
alter table public.convites add constraint convites_origem_check
  check (origem is null or origem in ('arquivo', 'imagem', 'receita', 'indicacao'));

alter table public.convites drop constraint if exists convites_enviada_por_check;
alter table public.convites add constraint convites_enviada_por_check
  check (enviada_por is null or enviada_por in ('whatsapp', 'email', 'whatsapp_oficial'));

-- quem indicou (a conversa do WhatsApp) e quantas vezes a vaga foi indicada
alter table public.convites add column if not exists indicada_por text;
alter table public.convites add column if not exists indicacoes integer not null default 0;

alter table privado.whatsapp_leituras drop constraint if exists whatsapp_leituras_resultado_check;
alter table privado.whatsapp_leituras add constraint whatsapp_leituras_resultado_check
  check (resultado in ('vaga', 'servico', 'curriculo', 'golpe', 'outro', 'falhou', 'limite', 'grande', 'indicacao'));

-- o número com DDD, só os dígitos, sem o 55 ("62999990000"); o resto, nulo
create or replace function privado.numero_do_convite(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when x ~ '^[1-9][0-9]9?[0-9]{8}$' then x end
    from (select regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^55(?=[1-9][0-9]9?[0-9]{8}$)', '') as x) y
$$;

-- A vaga que quem procura trabalho mandou: o convite (novo ou juntado ao que já existe pelo nome)
create or replace function public.servidor_vaga_indicada(p_chave text, p_conversa text, p_empresa jsonb, p_vagas jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nome text := left(btrim(regexp_replace(coalesce(p_empresa->>'nome', ''), '\s+', ' ', 'g')), 120);
  v_tipo text := case when p_empresa->>'tipo' = 'agencia' then 'agencia' else 'empresa' end;
  v_titulos text[];
  v_whats text[];
  v_tels text[];
  v_email text := lower(btrim(coalesce(p_empresa->>'email', '')));
  v_rascunho jsonb := case when jsonb_typeof(p_vagas) = 'array' and jsonb_array_length(p_vagas) > 0 then p_vagas->0 end;
  c public.convites;
  v_hoje integer;
begin
  perform privado.exigir_servidor(p_chave);
  if char_length(v_nome) < 2 then
    return jsonb_build_object('situacao', 'sem_nome');
  end if;
  -- no máximo 10 indicações por conversa por dia
  select count(*) into v_hoje from public.convites x
   where x.indicada_por = p_conversa and x.atualizado_em > now() - interval '1 day';
  if v_hoje >= 10 then
    return jsonb_build_object('situacao', 'limite');
  end if;

  select array_agg(distinct left(btrim(v->>'titulo'), 120)) filter (where char_length(btrim(coalesce(v->>'titulo', ''))) >= 2)
    into v_titulos
    from jsonb_array_elements(case when jsonb_typeof(p_vagas) = 'array' then p_vagas else '[]'::jsonb end) v;
  select array_agg(distinct n) filter (where n is not null) into v_whats
    from (select privado.numero_do_convite(x) as n
            from jsonb_array_elements_text(case when jsonb_typeof(p_empresa->'whatsapp') = 'array' then p_empresa->'whatsapp' else '[]'::jsonb end) x) y;
  select array_agg(distinct n) filter (where n is not null) into v_tels
    from (select privado.numero_do_convite(x) as n
            from jsonb_array_elements_text(case when jsonb_typeof(p_empresa->'telefones') = 'array' then p_empresa->'telefones' else '[]'::jsonb end) x) y;
  if v_email !~ '^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$' or char_length(v_email) > 200 then
    v_email := null;
  end if;
  if v_rascunho is not null and octet_length(v_rascunho::text) > 8000 then
    v_rascunho := null;
  end if;

  select * into c from public.convites x where lower(btrim(x.nome)) = lower(v_nome) for update;
  if found then
    update public.convites x
       set vagas = (select coalesce(array_agg(distinct t), '{}') from (select unnest(x.vagas || coalesce(v_titulos, '{}')) t limit 20) z),
           whatsapp = (select coalesce(array_agg(distinct t), '{}') from (select unnest(x.whatsapp || coalesce(v_whats, '{}')) t limit 5) z),
           telefones = (select coalesce(array_agg(distinct t), '{}') from (select unnest(x.telefones || coalesce(v_tels, '{}')) t limit 5) z),
           email = coalesce(x.email, v_email),
           rascunho = coalesce(x.rascunho, v_rascunho),
           indicada_por = coalesce(x.indicada_por, p_conversa),
           indicacoes = x.indicacoes + 1
     where x.id = c.id;
    return jsonb_build_object('situacao', case when c.usuario_id is not null then 'ja_no_publike' else 'juntou' end,
                              'nome', c.nome, 'com_contato',
                              cardinality(c.whatsapp) + coalesce(cardinality(v_whats), 0) + cardinality(c.telefones)
                              + coalesce(cardinality(v_tels), 0) > 0 or coalesce(c.email, v_email) is not null);
  end if;

  insert into public.convites (nome, tipo, vagas, whatsapp, telefones, email, observacao, origem, rascunho,
                               indicada_por, indicacoes)
  values (v_nome, v_tipo, coalesce(v_titulos[1:20], '{}'), coalesce(v_whats[1:5], '{}'), coalesce(v_tels[1:5], '{}'),
          v_email, 'Vaga mandada por quem procura trabalho, no WhatsApp do Publike', 'indicacao', v_rascunho,
          p_conversa, 1);
  return jsonb_build_object('situacao', 'novo', 'nome', v_nome,
                            'com_contato', coalesce(cardinality(v_whats), 0) + coalesce(cardinality(v_tels), 0) > 0
                                           or v_email is not null);
end
$$;

-- 2. O envio pelo WhatsApp oficial (desligado) ---------------------------------------------------------------------

create table if not exists privado.config_convites_whatsapp (
  id boolean primary key default true check (id),
  ligado boolean not null default false,
  por_dia integer not null default 100 check (por_dia between 1 and 2000),
  atualizado_em timestamptz not null default now()
);
insert into privado.config_convites_whatsapp (id) values (true) on conflict do nothing;
alter table privado.config_convites_whatsapp enable row level security;
revoke all on privado.config_convites_whatsapp from public, anon, authenticated;

-- os envios (e as falhas) pelo modelo, para o teto do dia e para o Admin
create table if not exists privado.convites_whatsapp_envios (
  id bigint generated always as identity primary key,
  convite_id uuid not null references public.convites (id) on delete cascade,
  numero text not null,
  wamid text,
  falhou text,
  criado_em timestamptz not null default now()
);
create index if not exists convites_whatsapp_envios_dia_idx on privado.convites_whatsapp_envios (criado_em);
create index if not exists convites_whatsapp_envios_convite_idx on privado.convites_whatsapp_envios (convite_id);
alter table privado.convites_whatsapp_envios enable row level security;
revoke all on privado.convites_whatsapp_envios from public, anon, authenticated;

-- os convites que podem sair agora (o teto do dia já descontado); com o envio desligado, nada
create or replace function public.servidor_convites_para_whatsapp(p_chave text, p_limite integer default 20,
                                                                   p_agora boolean default false)
returns table (id uuid, nome text, vaga text, numero text, token text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cfg privado.config_convites_whatsapp;
  hora integer := extract(hour from now() at time zone 'America/Sao_Paulo');
  dia integer := extract(isodow from now() at time zone 'America/Sao_Paulo');
  v_feitos integer;
begin
  perform privado.exigir_servidor(p_chave);
  select * into cfg from privado.config_convites_whatsapp where config_convites_whatsapp.id;
  if not found or not cfg.ligado then
    return;
  end if;
  -- das 9h às 18h, de segunda a sábado (horário de quem contrata)
  if not coalesce(p_agora, false) and (hora < 9 or hora >= 18 or dia = 7) then
    return;
  end if;
  select count(*) into v_feitos from privado.convites_whatsapp_envios e
   where e.criado_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  if v_feitos >= cfg.por_dia then
    return;
  end if;
  return query
    select c.id, c.nome,
           coalesce(nullif(btrim(c.rascunho->>'titulo'), ''), c.vagas[1]),
           '55' || c.whatsapp[1],
           c.token
      from public.convites c
     where c.status = 'a_enviar' and c.usuario_id is null and c.tipo in ('empresa', 'agencia')
       and coalesce(c.origem, '') in ('imagem', 'arquivo', 'indicacao')
       and cardinality(c.whatsapp) > 0 and c.rascunho is not null
       and coalesce(nullif(btrim(c.rascunho->>'titulo'), ''), c.vagas[1]) is not null
       -- uma vez por convite
       and not exists (select 1 from privado.convites_whatsapp_envios e where e.convite_id = c.id)
       -- o número que pediu PARAR, ou que já é de uma conversa com a equipe
       and not exists (select 1 from privado.whatsapp_conversas w
                        where w.numero in ('55' || c.whatsapp[1], '55' || regexp_replace(c.whatsapp[1], '^([0-9]{2})9', '\1'))
                          and (w.avisos_parados_em is not null or w.situacao = 'equipe'))
     order by c.criado_em desc
     limit least(greatest(coalesce(p_limite, 20), 1), cfg.por_dia - v_feitos);
end
$$;

-- o envio feito (ou a falha): o convite fica como enviado pelo WhatsApp oficial, e a conversa guarda o que saiu
create or replace function public.servidor_convite_whatsapp_mandado(p_chave text, p_convite uuid, p_numero text,
                                                                     p_wamid text, p_falhou text, p_texto text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.convites;
  v_numero text := regexp_replace(coalesce(p_numero, ''), '\D', '', 'g');
begin
  perform privado.exigir_servidor(p_chave);
  select * into c from public.convites x where x.id = p_convite;
  if not found then
    return;
  end if;
  insert into privado.convites_whatsapp_envios (convite_id, numero, wamid, falhou)
  values (c.id, v_numero, left(p_wamid, 200), left(p_falhou, 300));
  if p_falhou is not null then
    update public.convites x set nota = left(coalesce(x.nota || E'\n', '') || 'WhatsApp oficial: ' || p_falhou, 500)
     where x.id = c.id;
    return;
  end if;
  update public.convites x
     set status = 'enviada', enviada_em = now(), enviada_por = 'whatsapp_oficial', mensagem = 'publike'
   where x.id = c.id;
  -- a conversa da empresa (a resposta dela cai no atendimento já com o que recebeu)
  if v_numero <> '' then
    -- sem origem: ela é a do anúncio da Meta (a janela grátis), e o convite é uma mensagem paga
    insert into privado.whatsapp_conversas (chave, numero, nome, perfil)
    values (v_numero, v_numero, left(c.nome, 120), 'contratar')
    on conflict (chave) do nothing;
    if btrim(coalesce(p_texto, '')) <> '' then
      insert into privado.whatsapp_conversa_mensagens (chave, de, texto, wamid)
      values (v_numero, 'robo', left(btrim(p_texto), 4000), left(p_wamid, 200));
      update privado.whatsapp_conversas w set ultima_em = now() where w.chave = v_numero;
    end if;
  end if;
end
$$;

-- Admin › Convites: ligar, desligar e o teto por dia; e os números de hoje
create or replace function public.admin_convites_whatsapp(p_ligado boolean default null, p_por_dia integer default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cfg privado.config_convites_whatsapp;
begin
  perform privado.exigir_admin();
  if p_ligado is not null or p_por_dia is not null then
    update privado.config_convites_whatsapp x
       set ligado = coalesce(p_ligado, x.ligado),
           por_dia = coalesce(least(greatest(p_por_dia, 1), 2000), x.por_dia),
           atualizado_em = now()
     where x.id;
    perform privado.registrar('convites_whatsapp', 'config', 'convites_whatsapp',
                              case when p_ligado then 'ligou' when p_ligado = false then 'desligou' else 'teto' end,
                              jsonb_build_object('ligado', p_ligado, 'por_dia', p_por_dia));
  end if;
  select * into cfg from privado.config_convites_whatsapp x where x.id;
  return jsonb_build_object(
    'ligado', cfg.ligado,
    'por_dia', cfg.por_dia,
    'hoje', (select count(*) from privado.convites_whatsapp_envios e
              where e.falhou is null
                and e.criado_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'),
    'total', (select count(*) from privado.convites_whatsapp_envios e where e.falhou is null),
    'contas', (select count(*) from privado.convites_whatsapp_envios e join public.convites c on c.id = e.convite_id
                where e.falhou is null and c.usuario_id is not null),
    'prontos', (select count(*) from public.convites c
                 where c.status = 'a_enviar' and c.usuario_id is null and c.tipo in ('empresa', 'agencia')
                   and coalesce(c.origem, '') in ('imagem', 'arquivo', 'indicacao')
                   and cardinality(c.whatsapp) > 0 and c.rascunho is not null
                   and not exists (select 1 from privado.convites_whatsapp_envios e where e.convite_id = c.id)),
    'indicados', (select count(*) from public.convites c where c.origem = 'indicacao'),
    'indicados_semana', (select count(*) from public.convites c where c.origem = 'indicacao'
                          and c.criado_em > now() - interval '7 days'));
end
$$;

-- 3. As permissões ---------------------------------------------------------------------------------------------------

revoke execute on function privado.numero_do_convite(text) from public, anon, authenticated;
revoke execute on function public.servidor_vaga_indicada(text, text, jsonb, jsonb) from public;
grant execute on function public.servidor_vaga_indicada(text, text, jsonb, jsonb) to anon, authenticated, service_role;
revoke execute on function public.servidor_convites_para_whatsapp(text, integer, boolean) from public;
grant execute on function public.servidor_convites_para_whatsapp(text, integer, boolean) to anon, authenticated, service_role;
revoke execute on function public.servidor_convite_whatsapp_mandado(text, uuid, text, text, text, text) from public;
grant execute on function public.servidor_convite_whatsapp_mandado(text, uuid, text, text, text, text) to anon, authenticated, service_role;
revoke execute on function public.admin_convites_whatsapp(boolean, integer) from public, anon;
grant execute on function public.admin_convites_whatsapp(boolean, integer) to authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20271011120000_convites_que_escalam');
