-- Comunicados no sino (27/10/2026): o admin escreve um aviso (texto e, se quiser, um link do site) e manda
-- para um público: todas as contas, pessoas, empresas e comércios, agências, ou pelo aparelho do último
-- acesso (Android no navegador, iPhone, computador; migração 20261128120000). Fica só no sino (sem e-mail e
-- sem notificação no celular). Com link, quem já recebeu um comunicado com o mesmo link fica de fora (dá
-- para mandar de novo para quem chegou depois). O primeiro uso: o convite do teste do app para quem usa
-- Android (/testar-app?de=sino). Pode rodar de novo.

-- 1. O aviso pode levar a um link do site (só caminho, "/...") -----------------------------------------
alter table public.notificacoes add column if not exists link text;
alter table public.notificacoes drop constraint if exists notificacoes_link_check;
alter table public.notificacoes add constraint notificacoes_link_check
  check (link is null or (char_length(link) <= 300 and link ~ '^/([^/\\]|$)' and link !~ '[[:space:]]'));

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
                  'vagas_semana', 'talentos_semana', 'comunicado'));

-- só no sino: fora do e-mail
drop trigger if exists notificacoes_por_email on public.notificacoes;
create trigger notificacoes_por_email
  after insert on public.notificacoes
  for each row
  when (new.tipo not in ('recado_no_ar', 'recado_retido', 'recado_forca', 'convite_curriculo', 'convite_empresa',
                         'convite_agencia', 'convite_servicos', 'convite_vitrine', 'curriculo_publico',
                         'visita', 'visitas_do_dia', 'visitas_novidade', 'avaliacao_liberada',
                         'avaliacao_removida', 'mensagem_equipe', 'vagas_semana', 'talentos_semana',
                         'comunicado'))
  execute function privado.notificacao_por_email();

-- 2. A página do teste do app conta quem veio do sino ------------------------------------------------
alter table privado.teste_app_numeros drop constraint if exists teste_app_numeros_origem_check;
alter table privado.teste_app_numeros add constraint teste_app_numeros_origem_check
  check (origem in ('painel', 'instalar', 'whatsapp', 'sino', 'outro'));

create or replace function public.contar_teste_app(p_evento text, p_origem text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_evento not in ('abriu', 'grupo', 'aceitar', 'instalar', 'whatsapp') then
    return;
  end if;
  insert into privado.teste_app_numeros as n (dia, evento, origem, total)
  values (
    (now() at time zone 'America/Sao_Paulo')::date,
    p_evento,
    case when p_origem in ('painel', 'instalar', 'whatsapp', 'sino') then p_origem else 'outro' end,
    1
  )
  on conflict (dia, evento, origem) do update set total = n.total + 1;
end
$$;

-- 3. O aparelho da conta: 'app' (o app Android), 'android', 'iphone', 'computador' ou null ---------------
create or replace function privado.aparelho_da_conta_tipo(p_conta uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with ultimo as (
    select coalesce(
      (select case when a.app then 'app' else a.navegador end from privado.aparelho_da_conta a where a.conta_id = p_conta),
      (select s.user_agent
         from auth.sessions s
        where s.user_id = p_conta and coalesce(s.user_agent, '') <> '' and s.user_agent !~* '^node'
        order by coalesce(s.refreshed_at at time zone 'UTC', s.updated_at, s.created_at) desc
        limit 1)) as ua
  )
  select case
           when ua is null then null
           when ua = 'app' then 'app'
           when ua ~* 'android' then 'android'
           when ua ~* 'iphone|ipad|ipod' then 'iphone'
           else 'computador'
         end
    from ultimo
$$;

-- 4. Os comunicados mandados (o histórico do admin) --------------------------------------------------
create table if not exists privado.comunicados (
  id bigint generated always as identity primary key,
  publico text not null,
  texto text not null,
  link text,
  total integer not null,
  criado_em timestamptz not null default now()
);
alter table privado.comunicados enable row level security;

-- quem recebe: está no público, não está bloqueada e (com link) não recebeu comunicado com o mesmo link
create or replace function privado.recebe_comunicado(p_publico text, p_link text, p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.users u where u.id = p_conta and (u.banned_until is null or u.banned_until <= now()))
     and case p_publico
           when 'todos' then true
           when 'pessoas' then exists (select 1 from public.perfis p where p.id = p_conta and p.tipo = 'pessoa')
           when 'empresas' then exists (select 1 from public.perfis p where p.id = p_conta and p.tipo in ('empresa', 'comercio'))
           when 'agencias' then exists (select 1 from public.perfis p where p.id = p_conta and p.tipo = 'agencia')
           when 'android' then privado.aparelho_da_conta_tipo(p_conta) = 'android'
           when 'iphone' then privado.aparelho_da_conta_tipo(p_conta) = 'iphone'
           when 'computador' then privado.aparelho_da_conta_tipo(p_conta) = 'computador'
           else false
         end
     and (p_link is null or not exists (
           select 1 from public.notificacoes n
            where n.destinatario_id = p_conta and n.tipo = 'comunicado' and n.link = p_link))
$$;

revoke execute on function privado.aparelho_da_conta_tipo(uuid), privado.recebe_comunicado(text, text, uuid)
  from public, anon, authenticated;

-- quantos recebem (para o admin ver antes de mandar)
create or replace function public.admin_contar_comunicado(p_publico text, p_link text default null)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  return (select count(*)::integer from public.perfis p
           where privado.recebe_comunicado(p_publico, nullif(btrim(p_link), ''), p.id));
end
$$;

-- manda no sino e guarda no histórico (devolve quantos)
create or replace function public.admin_enviar_comunicado(p_publico text, p_texto text, p_link text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  total integer;
  v_texto text := btrim(coalesce(p_texto, ''));
  v_link text := nullif(btrim(coalesce(p_link, '')), '');
begin
  perform privado.exigir_admin();
  if p_publico not in ('todos', 'pessoas', 'empresas', 'agencias', 'android', 'iphone', 'computador') then
    raise exception 'Público desconhecido.' using errcode = 'P0001';
  end if;
  if char_length(v_texto) < 10 or char_length(v_texto) > 240 then
    raise exception 'O texto vai de 10 a 240 letras.' using errcode = 'P0001';
  end if;
  insert into public.notificacoes (destinatario_id, tipo, texto, link)
  select p.id, 'comunicado', v_texto, v_link
    from public.perfis p
   where privado.recebe_comunicado(p_publico, v_link, p.id);
  get diagnostics total = row_count;
  insert into privado.comunicados (publico, texto, link, total) values (p_publico, v_texto, v_link, total);
  if total > 0 then
    perform privado.registrar('enviar_comunicado', 'config', 'comunicados', left(v_texto, 80),
                              jsonb_build_object('total', total, 'publico', p_publico, 'link', v_link));
  end if;
  return total;
end
$$;

-- os últimos comunicados mandados
create or replace function public.admin_comunicados(p_limite integer default 20)
returns table (id bigint, publico text, texto text, link text, total integer, criado_em timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  return query
  select c.id, c.publico, c.texto, c.link, c.total, c.criado_em
    from privado.comunicados c
   order by c.criado_em desc
   limit least(greatest(coalesce(p_limite, 20), 1), 100);
end
$$;

revoke execute on function public.admin_contar_comunicado(text, text), public.admin_enviar_comunicado(text, text, text),
  public.admin_comunicados(integer) from public, anon, authenticated;
grant execute on function public.admin_contar_comunicado(text, text), public.admin_enviar_comunicado(text, text, text),
  public.admin_comunicados(integer) to service_role;
