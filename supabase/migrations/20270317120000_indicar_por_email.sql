-- Indicar a vaga por e-mail e as dicas de novidade (09/11/2026; claude/plano-comentarios-e-indicar-por-email.md,
-- partes 1 e 3). Pode rodar de novo. Rode depois de 20270316120000_falhas_de_internet.sql.
--
-- 1. As dicas de novidade: o balão "Novo" junto da novidade, uma vez por pessoa (privado.dicas_vistas). Quem não
--    entrou guarda no aparelho.
-- 2. indicacoes_email: quem tem conta manda uma vaga para o e-mail de um amigo.
--    - O e-mail com conta no Publike: o aviso vai para a conta (sino, celular e e-mail, como os outros avisos).
--    - O e-mail sem conta: sai o e-mail "indicacao_vaga" com o link /indicacao/<código>. O código é aleatório e
--      no banco fica só o hash dele. A página do link mostra a vaga e a conta se cria em um toque (Google ou o
--      link de entrar no próprio e-mail); a curtida guarda a indicação como os links de hoje (?i=p.<conta>).
--    - Quem indica recebe sempre a mesma resposta ("enviado"): nunca descobre se o amigo tem conta, se já
--      recebeu a vaga ou se pediu para não receber.
--    - Limites: 10 por dia e 30 por semana por pessoa; a mesma vaga uma vez por e-mail; no máximo 3 indicações
--      por e-mail a cada 30 dias; quem toca em "Parar de receber" não recebe mais (fica só o hash).
--    - O e-mail digitado é apagado 14 dias depois (fica o hash, para os limites).
-- 3. O aviso novo "indicacao" (sino, celular e e-mail) e o e-mail "indicacao_vaga" (Admin › E-mails).
-- 4. A novidade em Admin › Novidades (publicada; o ponto aparece no menu da conta).

-- 1. As dicas de novidade ---------------------------------------------------------------------------------------
create table if not exists privado.dicas_vistas (
  usuario_id uuid not null references auth.users (id) on delete cascade,
  chave text not null check (chave ~ '^[a-z0-9_-]{2,60}$'),
  vista_em timestamptz not null default now(),
  -- usou a novidade (comentou, mandou a indicação): a dica não volta e o admin conta
  usou_em timestamptz,
  primary key (usuario_id, chave)
);
alter table privado.dicas_vistas enable row level security;
revoke all on privado.dicas_vistas from public, anon, authenticated;

-- As dicas que a pessoa já viu (as chaves).
create or replace function public.minhas_dicas_vistas()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(d.chave order by d.chave), '{}'::text[])
    from privado.dicas_vistas d
   where d.usuario_id = (select auth.uid())
$$;
revoke execute on function public.minhas_dicas_vistas() from public, anon;
grant execute on function public.minhas_dicas_vistas() to authenticated;

-- A dica apareceu (ou a pessoa usou a novidade). Nunca dá erro: a dica não pode atrapalhar a página.
create or replace function public.marcar_dica_vista(p_chave text, p_usou boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
begin
  if eu is null or p_chave is null or p_chave !~ '^[a-z0-9_-]{2,60}$' then
    return;
  end if;
  -- as chaves vêm do site: no máximo 200 por pessoa
  if not exists (select 1 from privado.dicas_vistas d where d.usuario_id = eu and d.chave = p_chave)
     and (select count(*) from privado.dicas_vistas d where d.usuario_id = eu) >= 200 then
    return;
  end if;
  insert into privado.dicas_vistas (usuario_id, chave, usou_em)
  values (eu, p_chave, case when p_usou then now() end)
  on conflict (usuario_id, chave) do update
    set usou_em = case when p_usou then coalesce(dicas_vistas.usou_em, now()) else dicas_vistas.usou_em end;
end
$$;
revoke execute on function public.marcar_dica_vista(text, boolean) from public, anon;
grant execute on function public.marcar_dica_vista(text, boolean) to authenticated;

-- Admin › Novidades: quantas pessoas viram cada dica e quantas usaram a novidade depois.
create or replace function public.admin_numeros_dicas()
returns table (chave text, vistas bigint, usaram bigint, primeira timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  return query
  select d.chave, count(*), count(d.usou_em), min(d.vista_em)
    from privado.dicas_vistas d
   group by d.chave
   order by min(d.vista_em) desc;
end
$$;
revoke execute on function public.admin_numeros_dicas() from public, anon;
grant execute on function public.admin_numeros_dicas() to authenticated, service_role;

-- 2. A indicação por e-mail ---------------------------------------------------------------------------------------
create table if not exists public.indicacoes_email (
  id uuid primary key default gen_random_uuid(),
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  -- quem indicou: a conta (na agência, a agência) e a pessoa que escreveu
  conta_id uuid not null references public.perfis (id) on delete cascade,
  pessoa_id uuid references auth.users (id) on delete set null,
  -- o nome do amigo, se quem indicou escreveu
  nome text check (nome is null or char_length(nome) between 2 and 60),
  -- o e-mail do amigo sem conta (apagado em 14 dias) e o hash dele (para os limites)
  email text check (email is null or char_length(email) <= 200),
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  -- o hash do código do link /indicacao/<código>
  codigo_hash text unique check (codigo_hash is null or codigo_hash ~ '^[0-9a-f]{64}$'),
  -- o e-mail já tinha conta: o aviso foi para ela
  destinatario_id uuid references public.perfis (id) on delete set null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '14 days',
  -- entrou pelo link (já com a conta) e a conta que nasceu pela indicação
  aberta_em timestamptz,
  conta_criada_id uuid references public.perfis (id) on delete set null,
  unique (anuncio_id, email_hash)
);
comment on table public.indicacoes_email is 'Vagas indicadas por e-mail. Só pelas funções.';
create index if not exists indicacoes_email_pessoa_idx on public.indicacoes_email (pessoa_id, criado_em desc);
create index if not exists indicacoes_email_hash_idx on public.indicacoes_email (email_hash, criado_em desc);
create index if not exists indicacoes_email_conta_idx on public.indicacoes_email (conta_id, criado_em desc);
alter table public.indicacoes_email enable row level security;
revoke all on public.indicacoes_email from anon, authenticated;
grant select, insert, update, delete on public.indicacoes_email to service_role;

-- quem tocou em "Parar de receber" (só o hash do e-mail)
create table if not exists privado.emails_sem_indicacao (
  email_hash text primary key check (email_hash ~ '^[0-9a-f]{64}$'),
  criado_em timestamptz not null default now()
);
alter table privado.emails_sem_indicacao enable row level security;
revoke all on privado.emails_sem_indicacao from public, anon, authenticated;

create or replace function privado.hash_texto(p_texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(coalesce(p_texto, ''), 'UTF8')), 'hex')
$$;

create or replace function privado.hash_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select privado.hash_texto(lower(btrim(coalesce(p_email, ''))))
$$;

-- "R$ 1.800", "R$ 1.800 a R$ 2.200" (sem centavos), com a unidade ("por mês")
create or replace function privado.valor_da_vaga(p_valor numeric, p_ate numeric, p_unidade text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when p_valor is null then null
           else 'R$ ' || replace(to_char(round(p_valor)::bigint, 'FM999,999,999'), ',', '.')
                || case when p_ate is not null and p_ate > p_valor
                        then ' a R$ ' || replace(to_char(round(p_ate)::bigint, 'FM999,999,999'), ',', '.') else '' end
                || case p_unidade
                     when 'hora' then ' por hora'
                     when 'dia' then ' por dia'
                     when 'semana' then ' por semana'
                     when 'mes' then ' por mês'
                     when 'servico' then ' pelo serviço'
                     when 'visita' then ' por visita'
                     else ''
                   end
         end
$$;

-- Manda a vaga para o e-mail de um amigo. Devolve sempre 'enviado' quando a vaga e quem indica estão certos (mesmo
-- quando o e-mail não recebe: já recebeu, pediu para não receber ou chegou ao limite do mês).
create or replace function public.indicar_por_email(p_anuncio uuid, p_email text, p_nome text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
  eu uuid := (select auth.uid());
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_nome text := nullif(left(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), 60), '');
  v_hash text;
  v_codigo text;
  v_dest uuid;
  v_quem text;
  v_cfg public.config_site;
  a record;
begin
  if conta is null or eu is null then
    raise exception 'Entre na sua conta para indicar.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  if char_length(v_email) > 200 or v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$' then
    raise exception 'Confira o e-mail do seu amigo.' using errcode = 'P0001';
  end if;
  -- o nome é só para o "Oi, Ana": sem número, arroba ou link
  if v_nome is not null and (char_length(v_nome) < 2 or v_nome ~ '[0-9@/:]') then
    v_nome := null;
  end if;
  select an.id, an.autor_id, an.titulo, an.status, an.tipo, an.preenchida_em, an.bairro, an.cidade,
         an.pagamento_valor, an.pagamento_ate, an.pagamento_unidade, an.contratante, an.contratante_confidencial,
         p.nome as autor_nome
    into a
    from public.anuncios an
    join public.perfis p on p.id = an.autor_id
   where an.id = p_anuncio;
  if not found or a.tipo <> 'vaga' or a.status <> 'ativo' or a.preenchida_em is not null then
    raise exception 'Essa vaga não está mais no ar.' using errcode = 'P0001';
  end if;
  if a.autor_id = conta then
    raise exception 'Para a sua vaga, use "Chamar candidato de fora" ou os links de indicação.' using errcode = 'P0001';
  end if;
  if exists (select 1 from auth.users u where u.id = eu and lower(u.email) = v_email) then
    raise exception 'Esse é o seu e-mail. Escreva o e-mail do seu amigo.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.indicacoes_email i
       where i.pessoa_id = eu and i.criado_em > now() - interval '7 days') >= 30 then
    raise exception 'Você já indicou 30 vezes nesta semana. Tente de novo em alguns dias.' using errcode = 'P0001';
  end if;
  perform privado.conferir_limite('indicacao_email', 10, 'Você já mandou 10 indicações hoje. Tente de novo amanhã.');

  v_hash := privado.hash_email(v_email);
  -- quem pediu para não receber, a mesma vaga de novo ou 3 indicações em 30 dias: não manda, responde igual
  if exists (select 1 from privado.emails_sem_indicacao s where s.email_hash = v_hash)
     or exists (select 1 from public.indicacoes_email i where i.anuncio_id = p_anuncio and i.email_hash = v_hash)
     or (select count(*) from public.indicacoes_email i
          where i.email_hash = v_hash and i.criado_em > now() - interval '30 days') >= 3 then
    return 'enviado';
  end if;

  -- o e-mail já tem conta no Publike (com perfil): o aviso vai para a conta
  select p.id into v_dest
    from auth.users u
    join public.perfis p on p.id = u.id
   where lower(u.email) = v_email
   limit 1;
  if v_dest = conta or v_dest = a.autor_id then
    return 'enviado';
  end if;

  v_quem := coalesce(nullif(btrim(privado.nome_para_email(conta)), ''), 'Alguém');
  v_codigo := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.indicacoes_email (anuncio_id, conta_id, pessoa_id, nome, email, email_hash, codigo_hash, destinatario_id)
  values (p_anuncio, conta, eu, v_nome, case when v_dest is null then v_email end, v_hash,
          case when v_dest is null then privado.hash_texto(v_codigo) end, v_dest);

  if v_dest is not null then
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto, link)
    values (v_dest, 'indicacao', p_anuncio, conta,
            v_quem || ' indicou uma vaga para você: ' || left(a.titulo, 120) || '.',
            '/anuncio/' || p_anuncio || '?i=p.' || conta);
    return 'enviado';
  end if;

  -- o e-mail para quem não tem conta (direto na fila: não há conta para olhar as escolhas)
  select * into v_cfg from public.config_site limit 1;
  if found and v_cfg.emails_ativos and privado.email_ligado('indicacao_vaga') then
    insert into privado.fila_emails (modelo, para, usuario_id, dados)
    values ('indicacao_vaga', v_email, null, jsonb_build_object(
      'nome', coalesce(split_part(v_nome, ' ', 1), ''),
      'quem', v_quem,
      'titulo', left(a.titulo, 120),
      'lugar', concat_ws(', ', nullif(btrim(a.bairro), ''), a.cidade),
      'valor', coalesce(privado.valor_da_vaga(a.pagamento_valor, a.pagamento_ate, a.pagamento_unidade), ''),
      'empresa', case when a.contratante_confidencial then 'Empresa confidencial'
                      else coalesce(nullif(btrim(a.contratante), ''), a.autor_nome) end,
      'caminho', '/indicacao/' || v_codigo || '?utm_source=email&utm_campaign=indicacao',
      'sair_indicacao', v_codigo));
  end if;
  return 'enviado';
end
$$;
revoke execute on function public.indicar_por_email(uuid, text, text) from public, anon;
grant execute on function public.indicar_por_email(uuid, text, text) to authenticated;

-- A página do link (qualquer pessoa com o código): a vaga, quem indicou e o e-mail do amigo (para entrar).
create or replace function public.ver_indicacao_email(p_codigo text)
returns table (
  anuncio_id uuid, titulo text, no_ar boolean, lugar text, valor text, empresa text,
  quem text, indicador_id uuid, nome text, email text, valida boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select i.anuncio_id, an.titulo,
         an.status = 'ativo' and an.preenchida_em is null,
         concat_ws(', ', nullif(btrim(an.bairro), ''), an.cidade),
         privado.valor_da_vaga(an.pagamento_valor, an.pagamento_ate, an.pagamento_unidade),
         case when an.contratante_confidencial then 'Empresa confidencial'
              else coalesce(nullif(btrim(an.contratante), ''), pa.nome) end,
         coalesce(nullif(btrim(privado.nome_para_email(i.conta_id)), ''), 'Alguém'),
         i.conta_id, i.nome,
         case when i.expira_em > now() then i.email end,
         i.expira_em > now() and i.email is not null
    from public.indicacoes_email i
    join public.anuncios an on an.id = i.anuncio_id
    join public.perfis pa on pa.id = an.autor_id
   where p_codigo ~ '^[0-9a-f]{64}$'
     and i.codigo_hash = privado.hash_texto(p_codigo)
$$;
revoke execute on function public.ver_indicacao_email(text) from public;
grant execute on function public.ver_indicacao_email(text) to anon, authenticated;

-- Entrou pelo link (já com a conta): marca a indicação e devolve a vaga e o código de quem indicou ("p.<conta>").
-- A conta que nasceu agora com o mesmo e-mail fica como "criada pela indicação".
create or replace function public.usar_indicacao_email(p_codigo text)
returns table (anuncio_id uuid, codigo text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
  conta uuid := (select public.conta_atual());
  v_email text;
  i public.indicacoes_email;
begin
  if eu is null or p_codigo is null or p_codigo !~ '^[0-9a-f]{64}$' then
    return;
  end if;
  select * into i from public.indicacoes_email x where x.codigo_hash = privado.hash_texto(p_codigo);
  if not found then
    return;
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = eu;
  if privado.hash_email(v_email) = i.email_hash then
    update public.indicacoes_email x
       set aberta_em = coalesce(x.aberta_em, now()),
           conta_criada_id = coalesce(x.conta_criada_id,
                                      case when x.destinatario_id is null and conta is not null
                                                and exists (select 1 from public.perfis p
                                                             where p.id = conta and p.criado_em >= x.criado_em)
                                           then conta end)
     where x.id = i.id;
  end if;
  return query select i.anuncio_id, 'p.' || i.conta_id::text;
end
$$;
revoke execute on function public.usar_indicacao_email(text) from public, anon;
grant execute on function public.usar_indicacao_email(text) to authenticated;

-- "Parar de receber" (o link do e-mail e o cabeçalho List-Unsubscribe): o e-mail não recebe mais indicação.
create or replace function public.sair_das_indicacoes(p_codigo text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
begin
  if p_codigo is null or p_codigo !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  select i.email_hash into v_hash from public.indicacoes_email i where i.codigo_hash = privado.hash_texto(p_codigo);
  if v_hash is null then
    return false;
  end if;
  insert into privado.emails_sem_indicacao (email_hash) values (v_hash) on conflict do nothing;
  -- o e-mail não serve mais: some de todas as indicações para ele
  update public.indicacoes_email i set email = null where i.email_hash = v_hash and i.email is not null;
  return true;
end
$$;
revoke execute on function public.sair_das_indicacoes(text) from public;
grant execute on function public.sair_das_indicacoes(text) to anon, authenticated;

-- Limpeza diária: o e-mail digitado sai depois de 14 dias (fica o hash).
create or replace function privado.limpar_indicacoes_email()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.indicacoes_email i set email = null where i.email is not null and i.expira_em < now();
$$;
revoke execute on function privado.limpar_indicacoes_email() from public;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('publike-limpar-indicacoes-email', '40 6 * * *', 'select privado.limpar_indicacoes_email()');
  end if;
exception
  when others then
    raise notice 'Publike: a limpeza das indicações por e-mail não foi agendada (%).', sqlerrm;
end
$$;

-- os limites de uso ganham a ação nova (e a dos comentários, que vem na próxima migração)
alter table privado.limites_uso drop constraint if exists limites_uso_acao_check;
alter table privado.limites_uso add constraint limites_uso_acao_check check (acao = any (array[
  'anuncio', 'curtida', 'denuncia', 'ia_texto', 'edicao', 'avaliacao', 'desfazer_match', 'ia_indicacao',
  'mensagem', 'seguir', 'recomendacao', 'etapa', 'contratacao', 'ia_resumo', 'convite', 'talento',
  'convite_candidato', 'convite_equipe', 'conexao', 'recado', 'recado_edicao', 'copiloto', 'teste',
  'indicacao_email', 'comentario', 'comentario_edicao']));

-- 3. O aviso e os e-mails -----------------------------------------------------------------------------------------
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check CHECK ((tipo = ANY (ARRAY['curtida'::text, 'match'::text, 'em_analise'::text, 'removido'::text, 'liberado'::text, 'avaliacao'::text, 'avaliacao_retida'::text, 'match_desfeito'::text, 'etapa'::text, 'mensagem'::text, 'seguindo'::text, 'recomendacao'::text, 'contratacao'::text, 'entrevista'::text, 'entrevista_resposta'::text, 'aceite_curriculo'::text, 'curriculo_recebido'::text, 'busca'::text, 'convite'::text, 'vaga_preenchida'::text, 'finalistas'::text, 'convite_candidato'::text, 'equipe'::text, 'conexao'::text, 'recado_no_ar'::text, 'recado_retido'::text, 'recado_forca'::text, 'convite_curriculo'::text, 'convite_empresa'::text, 'convite_agencia'::text, 'convite_servicos'::text, 'convite_vitrine'::text, 'curriculo_publico'::text, 'visita'::text, 'visitas_do_dia'::text, 'visitas_novidade'::text, 'avaliacao_liberada'::text, 'avaliacao_removida'::text, 'mensagem_equipe'::text, 'vagas_semana'::text, 'talentos_semana'::text, 'comunicado'::text, 'noticias_do_dia'::text, 'teste_pedido'::text, 'teste_feito'::text, 'lembrete_curtida'::text, 'sem_resposta'::text, 'pagamento'::text, 'dispensada'::text, 'entrevista_lembrete'::text, 'video_pedido'::text, 'video_enviado'::text, 'parados'::text, 'proposta'::text, 'proposta_resposta'::text, 'candidatura_recebida'::text, 'talentos_reativar'::text, 'match_empresa'::text, 'matches_sem_contato'::text, 'respostas_match'::text, 'liberacao'::text, 'talento_combina'::text, 'pedido_cliente'::text, 'busca_talentos'::text, 'documentos_admissao'::text, 'indicacao'::text, 'comentario'::text, 'comentario_resposta'::text])));

CREATE OR REPLACE FUNCTION privado.grupo_do_aviso(p_tipo text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_tipo = 'mensagem' then 'mensagens'
    when p_tipo in ('curtida', 'match', 'match_desfeito', 'etapa', 'contratacao', 'entrevista', 'entrevista_resposta',
                    'aceite_curriculo', 'curriculo_recebido', 'convite', 'convite_candidato', 'finalistas',
                    'vaga_preenchida', 'recomendacao', 'avaliacao', 'teste_pedido', 'teste_feito',
                    'lembrete_curtida', 'sem_resposta', 'dispensada', 'entrevista_lembrete',
                    'video_pedido', 'video_enviado', 'parados', 'proposta', 'proposta_resposta', 'candidatura_recebida',
                    'match_empresa', 'matches_sem_contato', 'respostas_match', 'talento_combina', 'pedido_cliente', 'busca_talentos', 'documentos_admissao',
                    'comentario', 'comentario_resposta') then 'andamento'
    when p_tipo = 'conexao' then 'conexoes'
    when p_tipo in ('busca', 'seguindo', 'indicacao') then 'vagas_novas'
    when p_tipo in ('vagas_semana', 'talentos_semana', 'talentos_reativar', 'resumo_vagas') then 'semana'
    when p_tipo in ('convite_curriculo', 'convite_empresa', 'convite_agencia', 'convite_servicos',
                    'convite_vitrine') then 'convites'
    when p_tipo = 'noticias_do_dia' then 'noticias'
    else null
  end
$function$;

CREATE OR REPLACE FUNCTION privado.notificacao_por_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_titulo text;
  v_nota text;
  v_quem text;
  v_autor uuid;
  v_motivo text;
  v_futuro boolean;
  v_depois text;
  v_entrevista jsonb;
  v_status text;
  v_categoria text;
begin
  select a.titulo, a.nota_moderacao, a.autor_id, a.status, a.categoria into v_titulo, v_nota, v_autor, v_status, v_categoria
    from public.anuncios a where a.id = new.anuncio_id;
  select p.nome into v_quem from public.perfis p where p.id = new.ator_id;
  if new.tipo = 'match_desfeito' then
    select public.rotulo_motivo_desfeito(d.motivo), d.futuro into v_motivo, v_futuro
      from public.matches_desfeitos d
     where d.anuncio_id = new.anuncio_id and d.desfeito_por = new.ator_id
     order by d.id desc limit 1;
    if v_futuro then
      v_depois := coalesce(v_quem, 'A outra pessoa') || ' disse que topa negociar com você em outro momento. '
                  || case when new.destinatario_id = v_autor
                          then 'Se quiser, dá para dar match de novo na lista de interessados.'
                          else 'Se ainda tiver interesse, dá para curtir o anúncio de novo.' end;
    end if;
  end if;
  if new.tipo in ('etapa', 'seguindo', 'recomendacao', 'contratacao', 'entrevista', 'entrevista_resposta', 'busca',
                  'convite', 'vaga_preenchida', 'finalistas', 'convite_candidato', 'equipe', 'conexao',
                  'liberado', 'lembrete_curtida', 'sem_resposta', 'dispensada', 'entrevista_lembrete',
                  'video_pedido', 'video_enviado', 'parados', 'proposta', 'proposta_resposta', 'candidatura_recebida',
                  'match_empresa', 'matches_sem_contato', 'respostas_match', 'liberacao', 'talento_combina', 'pedido_cliente', 'busca_talentos', 'documentos_admissao',
                  'indicacao', 'comentario', 'comentario_resposta') then
    v_motivo := new.texto;
  end if;
  -- quem indicou (o nome curto, como no e-mail para quem não tem conta)
  if new.tipo = 'indicacao' and new.ator_id is not null then
    v_quem := coalesce(nullif(btrim(privado.nome_para_email(new.ator_id)), ''), v_quem);
  end if;
  -- entrevista: os dados para o convite de agenda (.ics) que vai anexo no e-mail
  if new.tipo in ('entrevista', 'entrevista_resposta', 'entrevista_lembrete') then
    select jsonb_build_object(
             'id', e.id,
             'quando', e.quando,
             'duracao_min', e.duracao_min,
             'formato', e.formato,
             'local', e.local,
             'obs', e.obs,
             'situacao', e.situacao,
             'atualizado_em', e.atualizado_em,
             'anuncio_id', e.anuncio_id,
             'perfil_id', e.perfil_id,
             'vaga', a.titulo,
             'empresa', pa.nome,
             'candidato', pc.nome,
             'para', case when new.destinatario_id = a.autor_id then 'empresa' else 'candidato' end)
      into v_entrevista
      from public.entrevistas e
      join public.anuncios a on a.id = e.anuncio_id
      join public.perfis pa on pa.id = a.autor_id
      join public.perfis pc on pc.id = e.perfil_id
     where e.anuncio_id = new.anuncio_id
       and e.perfil_id = case when new.destinatario_id = a.autor_id then new.ator_id else new.destinatario_id end
     order by e.atualizado_em desc
     limit 1;
  end if;
  perform privado.enfileirar_email(new.destinatario_id, new.tipo, jsonb_build_object(
    'quem', coalesce(v_quem, 'Alguém'),
    'titulo', coalesce(v_titulo, ''),
    'motivo', coalesce(v_motivo, v_nota, ''),
    'depois', coalesce(v_depois, ''),
    'caminho', case new.tipo
                 -- a ficha de quem curtiu na Caixa de entrada, com o Aceitar e o Dispensar (o serviço volta para o anúncio)
                 when 'curtida' then '/painel/caixa?aba=responder&c=' || new.anuncio_id || ':' || new.ator_id
                 when 'lembrete_curtida' then '/painel/caixa?aba=responder&vaga=' || new.anuncio_id
                 when 'sem_resposta' then '/?tipo=vaga&categoria=' || coalesce(v_categoria, 'outros')
                 when 'dispensada' then '/anuncio/' || new.anuncio_id || '/parecidas'
                 when 'match' then '/painel/matches'
                 when 'match_empresa' then '/painel/anuncio/' || new.anuncio_id || '/quadro?candidato=' || new.ator_id
                 when 'matches_sem_contato' then '/painel/matches'
                 when 'respostas_match' then '/painel/anuncio/' || new.anuncio_id || '/quadro?candidato=' || new.ator_id
                 -- a funcionalidade liberada: a página dela (o link vem do banco, só caminho do site)
                 when 'liberacao' then coalesce(new.link, '/painel')
                 -- o candidato que combina: a ficha dele em Talentos
                 when 'talento_combina' then coalesce(new.link, '/talentos')
                 -- o pedido de vaga do cliente da agência: a página dos pedidos
                 when 'documentos_admissao' then coalesce(new.link, '/painel/curtidas')
                 when 'busca_talentos' then coalesce(new.link, '/talentos')
                 when 'pedido_cliente' then coalesce(new.link, '/painel/pedidos')
                 -- a vaga indicada (com o código de quem indicou) e o comentário na vaga
                 when 'indicacao' then coalesce(new.link, '/anuncio/' || new.anuncio_id)
                 when 'comentario' then coalesce(new.link, '/anuncio/' || new.anuncio_id || '#comentarios')
                 when 'comentario_resposta' then coalesce(new.link, '/anuncio/' || new.anuncio_id || '#comentarios')
                 when 'liberado' then
                   case when v_status = 'ativo' then '/anuncio/' || new.anuncio_id else '/painel/anuncios' end
                 when 'removido' then '/privacidade#regras'
                 when 'avaliacao' then '/painel/avaliacoes'
                 when 'avaliacao_retida' then '/privacidade#regras'
                 when 'match_desfeito' then
                   case when new.destinatario_id = v_autor then '/painel/anuncio/' || new.anuncio_id
                        else '/anuncio/' || new.anuncio_id end
                 when 'etapa' then '/painel/curtidas'
                 when 'mensagem' then coalesce('/painel/conversas/' || new.ator_id, '/painel/conversas')
                 when 'seguindo' then '/anuncio/' || new.anuncio_id
                 when 'busca' then '/anuncio/' || new.anuncio_id
                 when 'convite' then '/anuncio/' || new.anuncio_id
                 when 'vaga_preenchida' then '/?tipo=vaga'
                 when 'recomendacao' then '/perfil/' || new.destinatario_id || '#recomendacoes'
                 when 'contratacao' then
                   case when new.destinatario_id = v_autor then '/painel/anuncio/' || new.anuncio_id
                        else '/painel/curtidas' end
                 when 'entrevista' then '/anuncio/' || new.anuncio_id
                 when 'entrevista_resposta' then '/painel/anuncio/' || new.anuncio_id || '/quadro'
                 when 'video_pedido' then '/entrevista-video/' || new.anuncio_id
                 when 'video_enviado' then '/painel/anuncio/' || new.anuncio_id || '/quadro?candidato=' || new.ator_id
                 when 'parados' then '/painel/anuncio/' || new.anuncio_id || '/quadro'
                 when 'proposta' then '/proposta/' || new.anuncio_id
                 when 'candidatura_recebida' then '/painel/curtidas'
                 when 'proposta_resposta' then '/painel/anuncio/' || new.anuncio_id || '/quadro?candidato=' || new.ator_id
                 when 'entrevista_lembrete' then
                   case when new.destinatario_id = v_autor then '/painel/anuncio/' || new.anuncio_id || '/quadro?candidato=' || new.ator_id
                        else '/anuncio/' || new.anuncio_id end
                 when 'aceite_curriculo' then '/perfil/curriculo?next=%2Fanuncio%2F' || new.anuncio_id
                 when 'curriculo_recebido' then '/painel/anuncio/' || new.anuncio_id || '#candidato-' || new.ator_id
                 when 'finalistas' then '/painel/anuncio/' || new.anuncio_id || '/finalistas'
                 when 'convite_candidato' then '/painel/anuncio/' || new.anuncio_id || '/convidar'
                 when 'equipe' then '/painel/equipe'
                 when 'conexao' then '/painel/conexoes/' || new.ator_id
                 else '/painel'
               end)
    || case when v_entrevista is null then '{}'::jsonb else jsonb_build_object('entrevista', v_entrevista) end);
  return null;
end
$function$;

drop trigger if exists notificacoes_para_celular on public.notificacoes;
CREATE TRIGGER notificacoes_para_celular AFTER INSERT ON public.notificacoes FOR EACH ROW WHEN ((new.tipo = ANY (ARRAY['curtida'::text, 'match'::text, 'mensagem'::text, 'conexao'::text, 'em_analise'::text, 'removido'::text, 'liberado'::text, 'etapa'::text, 'entrevista'::text, 'entrevista_resposta'::text, 'contratacao'::text, 'aceite_curriculo'::text, 'curriculo_recebido'::text, 'convite'::text, 'convite_candidato'::text, 'finalistas'::text, 'vaga_preenchida'::text, 'seguindo'::text, 'busca'::text, 'avaliacao'::text, 'recado_retido'::text, 'mensagem_equipe'::text, 'equipe'::text, 'vagas_semana'::text, 'talentos_semana'::text, 'noticias_do_dia'::text, 'teste_pedido'::text, 'teste_feito'::text, 'lembrete_curtida'::text, 'sem_resposta'::text, 'pagamento'::text, 'dispensada'::text, 'entrevista_lembrete'::text, 'video_pedido'::text, 'video_enviado'::text, 'parados'::text, 'proposta'::text, 'proposta_resposta'::text, 'candidatura_recebida'::text, 'talentos_reativar'::text, 'match_empresa'::text, 'matches_sem_contato'::text, 'respostas_match'::text, 'liberacao'::text, 'talento_combina'::text, 'pedido_cliente'::text, 'busca_talentos'::text, 'documentos_admissao'::text, 'indicacao'::text, 'comentario'::text, 'comentario_resposta'::text]))) EXECUTE FUNCTION privado.notificacao_para_celular();

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('indicacao', 'usuarios', 47, 'Vaga indicada (quem tem conta)',
     'Para quem tem conta: alguém mandou uma vaga para o e-mail da pessoa pelo "Mandar por e-mail".',
     array['nome', 'quem', 'titulo', 'link'],
     '{{quem}} indicou uma vaga para você',
     E'Oi, {{nome}}.\n\n{{quem}} lembrou de você e indicou esta vaga no Publike: {{titulo}}.\n\nSe combinar com você, é só tocar em Curtir na vaga para se candidatar. A empresa vê que foi indicação.',
     'Ver a vaga'),
    ('indicacao_vaga', 'usuarios', 48, 'Vaga indicada (quem não tem conta)',
     'Para um e-mail sem conta no Publike: alguém com conta mandou uma vaga pelo "Mandar por e-mail". Leva o link para criar a conta em um toque e o "Parar de receber".',
     array['nome', 'quem', 'titulo', 'lugar', 'valor', 'empresa', 'link'],
     '{{quem}} indicou uma vaga para você',
     E'Oi, {{nome}}.\n\n{{quem}} lembrou de você e indicou uma vaga no Publike, o mural de vagas de Goiânia:\n\n{{titulo}}\n{{empresa}} · {{lugar}}\n\n{{valor}}\n\nCandidatar-se é grátis. Se você ainda não tem conta, ela fica pronta em um toque, com o seu Google ou com este e-mail.',
     'Ver a vaga')
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

-- 4. A novidade (publicada hoje; o ponto aparece no menu da conta) -----------------------------------------------
insert into public.novidades (dia, para, titulo, texto, link, botao, publicada)
select (now() at time zone 'America/Sao_Paulo')::date, 'todos', 'Indique vagas por e-mail',
       'Lembrou de alguém para uma vaga? Toque em "Mandar por e-mail" na página da vaga. Se a pessoa ainda não tiver conta, ela cria em um toque, e a empresa vê que foi indicação sua.',
       '/?tipo=vaga', 'Ver vagas', true
 where not exists (select 1 from public.novidades n where n.titulo = 'Indique vagas por e-mail');

notify pgrst, 'reload schema';
