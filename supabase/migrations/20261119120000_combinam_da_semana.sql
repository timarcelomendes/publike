-- Vagas e talentos que combinam, toda semana (25/10/2026). Pode rodar de novo.
--
-- Uma vez por semana (segunda, a partir das 9h de Brasília), quem tem currículo recebe "Vagas que
-- combinam com você" (as vagas novas da semana com bom % de match) e as empresas, comércios e
-- agências com vaga no ar recebem "Talentos que combinam com as suas vagas" (currículos da aba
-- Talentos). Chega no sino, no celular (quem ativou) e por e-mail. A conta do match é a do site
-- (src/lib/aderencia.ts): o servidor do site lê os dados por aqui, escolhe e registra o envio.
-- Fica DESLIGADO até o admin ligar (Admin › E-mails › Vagas e talentos da semana).
--   * config_site.combinam_semana: liga e desliga (admin_ligar_combinam).
--   * privado.combinam_enviados: o que cada conta recebeu em cada semana (nunca repete vaga nem talento).
--   * servidor_combinam_*: o servidor do site (com a chave do servidor).
--   * notificacoes.tipo ganha 'vagas_semana' e 'talentos_semana' (o e-mail sai direto, com a lista).

alter table public.config_site add column if not exists combinam_semana boolean not null default false;

create table if not exists privado.combinam_enviados (
  semana date not null,
  conta_id uuid not null references public.perfis (id) on delete cascade,
  tipo text not null check (tipo in ('vagas_semana', 'talentos_semana')),
  ids uuid[] not null default '{}',
  criado_em timestamptz not null default now(),
  primary key (semana, conta_id, tipo)
);
create index if not exists combinam_enviados_conta_idx on privado.combinam_enviados (conta_id, tipo);
alter table privado.combinam_enviados enable row level security;
revoke all on privado.combinam_enviados from public, anon, authenticated;

-- Os tipos novos no sino (a lista de 20261110120000_mensagem_da_equipe, mais os dois)
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
                  'vagas_semana', 'talentos_semana'));

-- o e-mail destes sai direto (com a lista), não pelo gatilho do sino
drop trigger if exists notificacoes_por_email on public.notificacoes;
create trigger notificacoes_por_email
  after insert on public.notificacoes
  for each row
  when (new.tipo not in ('recado_no_ar', 'recado_retido', 'recado_forca', 'convite_curriculo', 'convite_empresa',
                         'convite_agencia', 'convite_servicos', 'convite_vitrine', 'curriculo_publico',
                         'visita', 'visitas_do_dia', 'visitas_novidade', 'avaliacao_liberada',
                         'avaliacao_removida', 'mensagem_equipe', 'vagas_semana', 'talentos_semana'))
  execute function privado.notificacao_por_email();

-- e no celular também (a lista de 20261112120000_notificacoes_no_celular, mais os dois)
drop trigger if exists notificacoes_para_celular on public.notificacoes;
create trigger notificacoes_para_celular
  after insert on public.notificacoes
  for each row
  when (new.tipo in ('curtida', 'match', 'mensagem', 'conexao', 'em_analise', 'removido', 'liberado',
                     'etapa', 'entrevista', 'entrevista_resposta', 'contratacao', 'aceite_curriculo',
                     'curriculo_recebido', 'convite', 'convite_candidato', 'finalistas', 'vaga_preenchida',
                     'seguindo', 'busca', 'avaliacao', 'recado_retido', 'mensagem_equipe', 'equipe',
                     'vagas_semana', 'talentos_semana'))
  execute function privado.notificacao_para_celular();

-- Os modelos do e-mail (o admin edita em Admin › E-mails)
insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
values
  ('vagas_semana', 'usuarios', 91, 'Vagas que combinam com você',
   'Toda segunda, para quem tem currículo: as vagas novas da semana com bom % de match (até 5). Só sai quando tem vaga boa.',
   array['nome', 'quantas', 'lista'],
   '{{quantas}} com você esta semana',
   E'Oi, {{nome}}.\n\nEntraram no Publike vagas que combinam com o seu currículo:\n\n{{lista}}\n\nCurtir é se candidatar: quem publicou vê seu perfil e, se curtir de volta, o WhatsApp dos dois aparece.',
   'Ver as vagas',
   '{{quantas}} com você esta semana',
   E'Oi, {{nome}}.\n\nEntraram no Publike vagas que combinam com o seu currículo:\n\n{{lista}}\n\nCurtir é se candidatar: quem publicou vê seu perfil e, se curtir de volta, o WhatsApp dos dois aparece.',
   'Ver as vagas'),
  ('talentos_semana', 'usuarios', 92, 'Talentos que combinam com as suas vagas',
   'Toda segunda, para empresa, comércio e agência com vaga no ar: currículos da aba Talentos que combinam com as vagas (até 5, nunca repete). Só sai quando tem talento bom.',
   array['nome', 'quantas', 'lista'],
   '{{quantas}} com as suas vagas',
   E'Oi, {{nome}}.\n\nNa aba Talentos, estes currículos combinam com as suas vagas:\n\n{{lista}}\n\nAbra o currículo e convide para a vaga. É grátis.',
   'Ver os talentos',
   '{{quantas}} com as suas vagas',
   E'Oi, {{nome}}.\n\nNa aba Talentos, estes currículos combinam com as suas vagas:\n\n{{lista}}\n\nAbra o currículo e convide para a vaga. É grátis.',
   'Ver os talentos')
on conflict (chave) do nothing;

-- Admin: liga e desliga
create or replace function public.admin_ligar_combinam(p_ligado boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  -- com o "where id" (a linha única), como as outras: o Supabase recusa update sem where
  update public.config_site set combinam_semana = coalesce(p_ligado, false), atualizado_em = now(),
         atualizado_por = (select auth.uid())
   where id;
end
$$;
revoke execute on function public.admin_ligar_combinam(boolean) from public, anon;
grant execute on function public.admin_ligar_combinam(boolean) to authenticated, service_role;

-- A semana de agora (a segunda-feira, no horário de Brasília) e se já pode mandar: só na segunda, a
-- partir das 9h (ligar num domingo não manda na hora; a tarefa das filas vai mandando ao longo da segunda)
create or replace function public.servidor_combinam_situacao(p_chave text)
returns table (ligado boolean, semana date, pode boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  agora timestamp := now() at time zone 'America/Sao_Paulo';
  segunda date := date_trunc('week', agora)::date;
begin
  perform privado.exigir_servidor(p_chave);
  return query
  select coalesce((select c.combinam_semana from public.config_site c limit 1), false),
         segunda,
         agora::date = segunda and agora >= segunda + time '09:00';
end
$$;

-- As vagas novas (da semana, no aviso; do mês, no "Combinam com você" da home), com o que a conta do
-- match precisa
drop function if exists public.servidor_combinam_vagas(text);
create or replace function public.servidor_combinam_vagas(p_chave text, p_dias integer default 7)
returns table (id uuid, autor_id uuid, autor_nome text, titulo text, descricao text, escolaridade_minima text,
               experiencia text, cnh text, cidade text, bairro text, jornada text, horario_detalhe jsonb,
               horario text, criado_em timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return query
  select a.id, a.autor_id, p.nome, a.titulo, a.descricao, a.escolaridade_minima, a.experiencia, a.cnh, a.cidade,
         a.bairro, a.jornada, to_jsonb(a.horario_detalhe), a.horario, a.criado_em
    from public.anuncios a
    join public.perfis p on p.id = a.autor_id
   where a.tipo = 'vaga' and a.status = 'ativo' and a.preenchida_em is null and a.expira_em > now()
     and a.criado_em > now() - make_interval(days => least(greatest(coalesce(p_dias, 7), 1), 90))
     and not coalesce(p.suspenso_ate > now(), false)
   order by a.criado_em desc
   limit 800;
end
$$;

-- Quem tem currículo e ainda não foi visto nesta semana (com as vagas que já curtiu, passou ou recebeu)
create or replace function public.servidor_combinam_pessoas(p_chave text, p_semana date, p_limite integer default 100)
returns table (perfil_id uuid, cidade text, bairro text, curriculo jsonb, ja uuid[])
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return query
  select p.id, p.cidade, p.bairro, to_jsonb(c),
         array(select cu.anuncio_id from public.curtidas cu where cu.perfil_id = p.id
               union select d.anuncio_id from public.dispensas d where d.perfil_id = p.id
               union select unnest(e.ids) from privado.combinam_enviados e
                      where e.conta_id = p.id and e.tipo = 'vagas_semana')
    from public.perfis p
    join public.curriculos c on c.perfil_id = p.id
   where p.tipo = 'pessoa' and not coalesce(p.suspenso_ate > now(), false)
     and not exists (select 1 from privado.combinam_enviados e
                      where e.semana = p_semana and e.conta_id = p.id and e.tipo = 'vagas_semana')
   order by p.id
   limit least(greatest(coalesce(p_limite, 100), 1), 300);
end
$$;

-- Empresas, comércios e agências com vaga no ar ainda não vistas nesta semana (com os talentos que já
-- curtiram uma vaga delas, os conectados e os que já receberam)
create or replace function public.servidor_combinam_empresas(p_chave text, p_semana date, p_limite integer default 50)
returns table (perfil_id uuid, vagas jsonb, ja uuid[])
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return query
  select p.id,
         (select jsonb_agg(jsonb_build_object(
                   'id', a.id, 'titulo', a.titulo, 'descricao', a.descricao,
                   'escolaridade_minima', a.escolaridade_minima, 'experiencia', a.experiencia, 'cnh', a.cnh,
                   'cidade', a.cidade, 'bairro', a.bairro, 'jornada', a.jornada,
                   'horario_detalhe', a.horario_detalhe, 'horario', a.horario) order by a.criado_em desc)
            from public.anuncios a
           where a.autor_id = p.id and a.tipo = 'vaga' and a.status = 'ativo' and a.preenchida_em is null
             and a.expira_em > now()),
         array(select cu.perfil_id from public.curtidas cu join public.anuncios a on a.id = cu.anuncio_id
                where a.autor_id = p.id
               union select x.talento_id from public.conexoes x where x.empresa_id = p.id
               union select unnest(e.ids) from privado.combinam_enviados e
                      where e.conta_id = p.id and e.tipo = 'talentos_semana')
    from public.perfis p
   where p.tipo in ('empresa', 'comercio', 'agencia') and not coalesce(p.suspenso_ate > now(), false)
     and exists (select 1 from public.anuncios a
                  where a.autor_id = p.id and a.tipo = 'vaga' and a.status = 'ativo' and a.preenchida_em is null
                    and a.expira_em > now())
     and not exists (select 1 from privado.combinam_enviados e
                      where e.semana = p_semana and e.conta_id = p.id and e.tipo = 'talentos_semana')
   order by p.id
   limit least(greatest(coalesce(p_limite, 50), 1), 200);
end
$$;

-- Os talentos da aba Talentos (o resumo aberto: nome encurtado, o que faz, onde mora)
create or replace function public.servidor_combinam_talentos(p_chave text)
returns table (perfil_id uuid, nome text, cidade text, bairro text, curriculo jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return query
  select p.id, privado.nome_curto(p.nome), p.cidade, p.bairro, to_jsonb(c)
    from public.curriculo_na_vitrine v
    join public.perfis p on p.id = v.perfil_id
    join public.curriculos c on c.perfil_id = p.id
   where p.tipo = 'pessoa' and not coalesce(p.suspenso_ate > now(), false)
   limit 2000;
end
$$;

-- Registra a semana da conta (mesmo sem nada para mandar) e, com algo, manda no sino, no celular e
-- por e-mail. Devolve se mandou.
create or replace function public.servidor_combinam_registrar(
  p_chave text, p_semana date, p_conta uuid, p_tipo text, p_ids uuid[], p_texto text, p_dados jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := coalesce(p_ids, '{}');
begin
  perform privado.exigir_servidor(p_chave);
  if p_tipo not in ('vagas_semana', 'talentos_semana') then
    raise exception 'Tipo inválido.' using errcode = 'P0001';
  end if;
  insert into privado.combinam_enviados (semana, conta_id, tipo, ids)
  values (p_semana, p_conta, p_tipo, v_ids)
  on conflict do nothing;
  if not found or cardinality(v_ids) = 0 then
    return false;
  end if;
  insert into public.notificacoes (destinatario_id, tipo, texto)
  values (p_conta, p_tipo, left(coalesce(p_texto, ''), 300));
  perform privado.enfileirar_email(p_conta, p_tipo, coalesce(p_dados, '{}'::jsonb));
  return true;
end
$$;

revoke execute on function public.servidor_combinam_situacao(text), public.servidor_combinam_vagas(text, integer),
  public.servidor_combinam_pessoas(text, date, integer), public.servidor_combinam_empresas(text, date, integer),
  public.servidor_combinam_talentos(text),
  public.servidor_combinam_registrar(text, date, uuid, text, uuid[], text, jsonb) from public;
grant execute on function public.servidor_combinam_situacao(text), public.servidor_combinam_vagas(text, integer),
  public.servidor_combinam_pessoas(text, date, integer), public.servidor_combinam_empresas(text, date, integer),
  public.servidor_combinam_talentos(text),
  public.servidor_combinam_registrar(text, date, uuid, text, uuid[], text, jsonb)
  to anon, authenticated, service_role;
