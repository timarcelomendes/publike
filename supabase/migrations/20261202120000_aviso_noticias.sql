-- Notícias novas no sino (28/10/2026): no fim do dia, quem tem conta recebe um aviso só (não é postagem
-- na linha do tempo) com as notícias publicadas hoje, e no celular de quem ligou as notificações. Sem
-- e-mail. A conta desliga o celular em Avisos e notificações (grupo "noticias"). Sai pela tarefa das filas
-- (/api/filas, a cada 5 minutos), a partir das 18h de Brasília, uma vez por dia e só com notícia nova.
-- Depende de 20261129120000_comunicados.sql (a coluna notificacoes.link). Pode rodar de novo.

-- 1. O tipo do aviso e o grupo ------------------------------------------------------------------------
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
                  'vagas_semana', 'talentos_semana', 'comunicado', 'noticias_do_dia'));

alter table privado.avisos_desligados drop constraint if exists avisos_desligados_grupo_check;
alter table privado.avisos_desligados add constraint avisos_desligados_grupo_check
  check (grupo in ('mensagens', 'andamento', 'conexoes', 'vagas_novas', 'semana', 'convites', 'noticias'));

-- a de 20261120120000, mais as notícias
create or replace function privado.grupo_do_aviso(p_tipo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_tipo = 'mensagem' then 'mensagens'
    when p_tipo in ('curtida', 'match', 'match_desfeito', 'etapa', 'contratacao', 'entrevista', 'entrevista_resposta',
                    'aceite_curriculo', 'curriculo_recebido', 'convite', 'convite_candidato', 'finalistas',
                    'vaga_preenchida', 'recomendacao', 'avaliacao') then 'andamento'
    when p_tipo = 'conexao' then 'conexoes'
    when p_tipo in ('busca', 'seguindo') then 'vagas_novas'
    when p_tipo in ('vagas_semana', 'talentos_semana') then 'semana'
    when p_tipo in ('convite_curriculo', 'convite_empresa', 'convite_agencia', 'convite_servicos',
                    'convite_vitrine') then 'convites'
    when p_tipo = 'noticias_do_dia' then 'noticias'
    else null
  end
$$;

-- a de 20261120120000, aceitando o grupo das notícias
create or replace function public.mudar_aviso(p_grupo text, p_canal text, p_ligado boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
begin
  if conta is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  if (select public.papel_na_conta()) not in ('dono', 'admin') then
    raise exception 'Só quem administra a conta escolhe os avisos.' using errcode = '42501';
  end if;
  if coalesce(p_grupo, '') not in ('mensagens', 'andamento', 'conexoes', 'vagas_novas', 'semana', 'convites', 'noticias')
     or coalesce(p_canal, '') not in ('email', 'celular') then
    raise exception 'Aviso desconhecido.' using errcode = '22023';
  end if;
  if coalesce(p_ligado, true) then
    delete from privado.avisos_desligados d
     where d.conta_id = conta and d.grupo = p_grupo and d.canal = p_canal;
  else
    insert into privado.avisos_desligados (conta_id, grupo, canal) values (conta, p_grupo, p_canal)
    on conflict do nothing;
  end if;
end
$$;

-- só no sino e no celular: fora do e-mail
drop trigger if exists notificacoes_por_email on public.notificacoes;
create trigger notificacoes_por_email
  after insert on public.notificacoes
  for each row
  when (new.tipo not in ('recado_no_ar', 'recado_retido', 'recado_forca', 'convite_curriculo', 'convite_empresa',
                         'convite_agencia', 'convite_servicos', 'convite_vitrine', 'curriculo_publico',
                         'visita', 'visitas_do_dia', 'visitas_novidade', 'avaliacao_liberada',
                         'avaliacao_removida', 'mensagem_equipe', 'vagas_semana', 'talentos_semana',
                         'comunicado', 'noticias_do_dia'))
  execute function privado.notificacao_por_email();

drop trigger if exists notificacoes_para_celular on public.notificacoes;
create trigger notificacoes_para_celular
  after insert on public.notificacoes
  for each row
  when (new.tipo in ('curtida', 'match', 'mensagem', 'conexao', 'em_analise', 'removido', 'liberado',
                     'etapa', 'entrevista', 'entrevista_resposta', 'contratacao', 'aceite_curriculo',
                     'curriculo_recebido', 'convite', 'convite_candidato', 'finalistas', 'vaga_preenchida',
                     'seguindo', 'busca', 'avaliacao', 'recado_retido', 'mensagem_equipe', 'equipe',
                     'vagas_semana', 'talentos_semana', 'noticias_do_dia'))
  execute function privado.notificacao_para_celular();

-- 2. O aviso do dia ---------------------------------------------------------------------------------
create table if not exists privado.avisos_noticias (
  dia date primary key,
  noticias integer not null,
  contas integer not null,
  enviado_em timestamptz not null default now()
);
alter table privado.avisos_noticias enable row level security;

-- a partir das 18h de Brasília, uma vez por dia, se saiu notícia hoje: um aviso por conta (devolve quantas)
-- p_agora: só para teste (o servidor usa a hora de agora)
create or replace function privado.avisar_noticias_do_dia(p_agora timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  agora timestamp := p_agora at time zone 'America/Sao_Paulo';
  hoje date := agora::date;
  inicio timestamptz := date_trunc('day', agora) at time zone 'America/Sao_Paulo';
  total integer;
  titulo text;
  texto text;
  contas integer;
begin
  if extract(hour from agora) < 18 or exists (select 1 from privado.avisos_noticias a where a.dia = hoje) then
    return 0;
  end if;
  select count(*), (array_agg(n.titulo order by n.publicar_em desc))[1]
    into total, titulo
    from public.noticias n
   where n.status = 'aprovada' and n.publicar_em >= inicio and n.publicar_em <= p_agora;
  if coalesce(total, 0) = 0 then
    return 0;
  end if;
  texto := case when total = 1
                then 'Notícia nova no Publike: ' || left(titulo, 140)
                else total || ' notícias novas hoje no Publike. A mais recente: ' || left(titulo, 120) end;
  insert into public.notificacoes (destinatario_id, tipo, texto, link)
  select p.id, 'noticias_do_dia', texto, '/noticias'
    from public.perfis p
    join auth.users u on u.id = p.id
   where u.banned_until is null or u.banned_until <= now();
  get diagnostics contas = row_count;
  insert into privado.avisos_noticias (dia, noticias, contas) values (hoje, total, contas) on conflict (dia) do nothing;
  return contas;
end
$$;
revoke execute on function privado.avisar_noticias_do_dia(timestamptz) from public, anon, authenticated;

create or replace function public.servidor_avisar_noticias(p_chave text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return privado.avisar_noticias_do_dia();
end
$$;
revoke execute on function public.servidor_avisar_noticias(text) from public;
grant execute on function public.servidor_avisar_noticias(text) to anon, authenticated, service_role;
