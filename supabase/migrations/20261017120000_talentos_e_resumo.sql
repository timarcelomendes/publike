-- Painel 2.0, entrega 3: resumo do candidato pela IA, Talentos (quem deixou as empresas
-- acharem o currículo) e convites para uma vaga.

-- 0. Aviso novo --------------------------------------------------------------------------

alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('curtida', 'match', 'em_analise', 'removido', 'liberado', 'avaliacao', 'avaliacao_retida',
                  'match_desfeito', 'etapa', 'mensagem', 'seguindo', 'recomendacao', 'contratacao',
                  'entrevista', 'entrevista_resposta', 'aceite_curriculo', 'curriculo_recebido', 'busca',
                  'convite'));


-- os limites por dia das ações novas (resumo da IA e convite)
alter table privado.limites_uso drop constraint if exists limites_uso_acao_check;
alter table privado.limites_uso add constraint limites_uso_acao_check
  check (acao in ('anuncio', 'curtida', 'denuncia', 'ia_texto', 'edicao', 'avaliacao', 'desfazer_match', 'ia_indicacao',
                  'mensagem', 'seguir', 'recomendacao', 'etapa', 'contratacao', 'ia_resumo', 'convite'));


-- 1. Resumo do candidato feito pela IA ------------------------------------------------------
-- Um por candidatura, guardado para não pagar a IA de novo: vale enquanto o currículo
-- não mudar (curriculo_em). Só quem publicou a vaga lê e grava.

create table public.resumos_candidato (
  anuncio_id uuid not null,
  perfil_id uuid not null,
  curriculo_em timestamptz not null,
  conteudo jsonb not null check (jsonb_typeof(conteudo) = 'object' and pg_column_size(conteudo) < 8000),
  modelo text not null check (char_length(modelo) <= 60),
  criado_em timestamptz not null default now(),
  primary key (anuncio_id, perfil_id),
  foreign key (anuncio_id, perfil_id) references public.curtidas (anuncio_id, perfil_id) on delete cascade
);
comment on table public.resumos_candidato is
  'Resumo do candidato feito pela IA para quem publicou a vaga (ficha da caixa de entrada).';

alter table public.resumos_candidato enable row level security;
create policy "quem publicou vê o resumo" on public.resumos_candidato
  for select to authenticated
  using (exists (select 1 from public.anuncios a where a.id = anuncio_id and a.autor_id = (select auth.uid())));
create policy "quem publicou grava o resumo" on public.resumos_candidato
  for insert to authenticated
  with check (exists (select 1 from public.anuncios a where a.id = anuncio_id and a.autor_id = (select auth.uid())));
create policy "quem publicou refaz o resumo" on public.resumos_candidato
  for update to authenticated
  using (exists (select 1 from public.anuncios a where a.id = anuncio_id and a.autor_id = (select auth.uid())))
  with check (exists (select 1 from public.anuncios a where a.id = anuncio_id and a.autor_id = (select auth.uid())));
revoke all on public.resumos_candidato from anon, authenticated;
grant select on public.resumos_candidato to authenticated;
-- o upsert do PostgREST manda as chaves também no "update"
grant insert (anuncio_id, perfil_id, curriculo_em, conteudo, modelo, criado_em),
      update (anuncio_id, perfil_id, curriculo_em, conteudo, modelo, criado_em)
  on public.resumos_candidato to authenticated;

-- a IA ligada no admin e no máximo 60 resumos por dia para cada conta
create or replace function public.usar_ia_resumo()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Entre na sua conta para usar a ajuda da IA.' using errcode = '42501';
  end if;
  if not coalesce((select c.ia_melhorar_texto from public.config_site c limit 1), false) then
    raise exception 'A ajuda da IA está desligada agora.' using errcode = 'P0001', hint = 'ia_desligada';
  end if;
  perform privado.exigir_conta_ativa();
  perform privado.conferir_limite('ia_resumo', 60, 'Você já pediu 60 resumos da IA hoje. Tente de novo amanhã.');
end
$$;
revoke execute on function public.usar_ia_resumo() from public, anon;
grant execute on function public.usar_ia_resumo() to authenticated;


-- 2. Talentos ------------------------------------------------------------------------------
-- Quem marca "deixar as empresas me encontrarem" aparece, sem contato e com o nome
-- encurtado, para quem tem uma vaga na mesma cidade. A empresa só pode convidar: a
-- pessoa vê a vaga e decide se curte (o contato continua saindo só no match).

create table public.curriculo_visivel (
  perfil_id uuid primary key references public.curriculos (perfil_id) on delete cascade,
  desde timestamptz not null default now()
);
comment on table public.curriculo_visivel is
  'Quem deixou as empresas encontrarem o currículo (Talentos). Apagar a linha tira a pessoa da lista.';
alter table public.curriculo_visivel enable row level security;
create policy "cada um vê a própria escolha" on public.curriculo_visivel
  for select to authenticated using (perfil_id = (select auth.uid()));
create policy "cada um aparece" on public.curriculo_visivel
  for insert to authenticated with check (perfil_id = (select auth.uid()));
create policy "cada um some" on public.curriculo_visivel
  for delete to authenticated using (perfil_id = (select auth.uid()));
revoke all on public.curriculo_visivel from anon, authenticated;
grant select, delete on public.curriculo_visivel to authenticated;
grant insert (perfil_id) on public.curriculo_visivel to authenticated;

create table public.convites_vaga (
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (anuncio_id, perfil_id)
);
comment on table public.convites_vaga is 'Convites de quem publicou uma vaga para alguém de Talentos.';
alter table public.convites_vaga enable row level security;
create policy "quem convidou e quem foi convidado veem" on public.convites_vaga
  for select to authenticated
  using (perfil_id = (select auth.uid())
         or exists (select 1 from public.anuncios a where a.id = anuncio_id and a.autor_id = (select auth.uid())));
revoke all on public.convites_vaga from anon, authenticated;
grant select on public.convites_vaga to authenticated;

-- quem pode aparecer para uma vaga minha: na mesma cidade, sem curtida nela, sem bloqueio
create or replace function public.talentos_para_vaga(p_anuncio uuid)
returns table (
  perfil_id uuid,
  nome text,
  foto text,
  cidade text,
  bairro text,
  escolaridade text,
  curso text,
  experiencias jsonb,
  cursos text[],
  cnh text,
  disponibilidade text[],
  atualizado_em timestamptz,
  convidado boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
  v_cidade text;
begin
  perform privado.exigir_conta_ativa();
  select a.cidade into v_cidade
    from public.anuncios a
   where a.id = p_anuncio and a.autor_id = eu and a.tipo = 'vaga';
  if not found then
    raise exception 'Vaga não encontrada.' using errcode = 'P0002';
  end if;
  return query
  select p.id,
         -- "Maria S.": o nome inteiro só aparece se a pessoa curtir a vaga
         split_part(btrim(p.nome), ' ', 1)
           || coalesce(' ' || nullif(left(split_part(btrim(p.nome), ' ', 2), 1), '') || '.', ''),
         p.foto, p.cidade, p.bairro,
         c.escolaridade, c.curso, c.experiencias, c.cursos, c.cnh, c.disponibilidade, c.atualizado_em,
         exists (select 1 from public.convites_vaga cv where cv.anuncio_id = p_anuncio and cv.perfil_id = p.id)
    from public.curriculo_visivel v
    join public.curriculos c on c.perfil_id = v.perfil_id
    join public.perfis p on p.id = v.perfil_id
   where p.id <> eu
     and p.tipo = 'pessoa'
     and (p.suspenso_ate is null or p.suspenso_ate < now())
     and lower(p.cidade) = lower(v_cidade)
     and not exists (select 1 from public.curtidas k where k.anuncio_id = p_anuncio and k.perfil_id = p.id)
     and not privado.ha_bloqueio(eu, p.id)
   order by c.atualizado_em desc
   limit 200;
end
$$;
revoke execute on function public.talentos_para_vaga(uuid) from public, anon;
grant execute on function public.talentos_para_vaga(uuid) to authenticated;

create or replace function public.convidar_para_vaga(p_anuncio uuid, p_perfil uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
  v_titulo text;
  v_cidade text;
  quem text;
begin
  perform privado.exigir_conta_ativa();
  select a.titulo, a.cidade into v_titulo, v_cidade
    from public.anuncios a
   where a.id = p_anuncio and a.autor_id = eu and a.tipo = 'vaga'
     and a.status = 'ativo' and a.expira_em > now();
  if not found then
    raise exception 'Só dá para convidar para uma vaga sua que esteja no ar.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.curriculo_visivel v join public.perfis p on p.id = v.perfil_id
     where v.perfil_id = p_perfil and p.tipo = 'pessoa' and lower(p.cidade) = lower(v_cidade)
       and (p.suspenso_ate is null or p.suspenso_ate < now())
  ) or privado.ha_bloqueio(eu, p_perfil) then
    raise exception 'Essa pessoa não está mais em Talentos.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.curtidas k where k.anuncio_id = p_anuncio and k.perfil_id = p_perfil) then
    raise exception 'Essa pessoa já curtiu a vaga: ela está na sua caixa de entrada.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.convites_vaga cv where cv.anuncio_id = p_anuncio and cv.perfil_id = p_perfil) then
    raise exception 'Você já convidou essa pessoa para esta vaga.' using errcode = 'P0001';
  end if;
  perform privado.conferir_limite('convite', 40, 'Você já mandou 40 convites hoje. Tente de novo amanhã.');
  insert into public.convites_vaga (anuncio_id, perfil_id) values (p_anuncio, p_perfil);
  select p.nome into quem from public.perfis p where p.id = eu;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (p_perfil, 'convite', p_anuncio, eu,
          left(coalesce(quem, 'Uma empresa') || ' viu seu currículo e convidou você para a vaga “' || v_titulo
               || '”. Veja os detalhes e, se tiver interesse, curta a vaga.', 300));
end
$$;
revoke execute on function public.convidar_para_vaga(uuid, uuid) from public, anon;
grant execute on function public.convidar_para_vaga(uuid, uuid) to authenticated;


-- 3. E-mail do convite ------------------------------------------------------------------
-- (as mesmas funções de 20261017090000_avisos_de_busca.sql, com o aviso "convite")

CREATE OR REPLACE FUNCTION privado.enfileirar_email(p_usuario uuid, p_modelo text, p_dados jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cfg public.config_site;
  destino text;
  quer boolean;
  de_conta boolean := p_modelo in ('conta_suspensa', 'conta_banida', 'conta_reativada');
begin
  select * into cfg from public.config_site limit 1;
  if not found or not cfg.emails_ativos then
    return;
  end if;
  if (p_modelo = 'curtida' and not cfg.email_curtida)
     or (p_modelo = 'match' and not cfg.email_match)
     or (p_modelo in ('em_analise', 'removido', 'liberado') and not cfg.email_moderacao)
     or (de_conta and not cfg.email_conta)
     or (p_modelo like 'boas\_vindas\_%' and not cfg.email_boas_vindas) then
    return;
  end if;
  -- avisos de conta vão mesmo para quem desligou os avisos
  if not de_conta then
    select c.receber_emails into quer from public.contatos c where c.perfil_id = p_usuario;
    if quer is false then
      return;
    end if;
  end if;
  -- avisos que podem se repetir: no máximo um do mesmo tipo a cada 30 minutos para a mesma pessoa
  if p_modelo in ('curtida', 'etapa', 'contratacao', 'recomendacao', 'seguindo', 'mensagem', 'busca', 'convite') and exists (
    select 1 from privado.fila_emails f
     where f.usuario_id = p_usuario and f.modelo = p_modelo and f.criado_em > now() - interval '30 minutes'
  ) then
    return;
  end if;
  -- e no máximo 30 e-mails por dia para a mesma pessoa (avisos de conta e de moderação passam sempre)
  if not de_conta and p_modelo not in ('em_analise', 'removido', 'liberado') and (
    select count(*) from privado.fila_emails f
     where f.usuario_id = p_usuario and f.criado_em > now() - interval '1 day'
  ) >= 30 then
    return;
  end if;
  -- só para o e-mail de login confirmado (nunca para um endereço que a pessoa só digitou)
  select nullif(btrim(u.email::text), '') into destino
    from auth.users u
   where u.id = p_usuario and u.email_confirmed_at is not null;
  if destino is null or destino !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return;
  end if;
  insert into privado.fila_emails (modelo, para, usuario_id, dados)
  values (p_modelo, lower(destino), p_usuario,
          jsonb_build_object('nome', coalesce(privado.nome_para_email(p_usuario), ''))
          || coalesce(p_dados, '{}'::jsonb));
exception
  when others then
    raise warning 'Publike: e-mail % não entrou na fila (%).', p_modelo, sqlerrm;
end
$function$;

create or replace function privado.notificacao_por_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_titulo text;
  v_nota text;
  v_quem text;
  v_autor uuid;
  v_motivo text;
  v_futuro boolean;
  v_depois text;
begin
  select a.titulo, a.nota_moderacao, a.autor_id into v_titulo, v_nota, v_autor
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
                  'convite') then
    v_motivo := new.texto;
  end if;
  perform privado.enfileirar_email(new.destinatario_id, new.tipo, jsonb_build_object(
    'quem', coalesce(v_quem, 'Alguém'),
    'titulo', coalesce(v_titulo, ''),
    'motivo', coalesce(v_motivo, v_nota, ''),
    'depois', coalesce(v_depois, ''),
    'caminho', case new.tipo
                 when 'curtida' then '/painel/anuncio/' || new.anuncio_id
                 when 'match' then '/painel/matches'
                 when 'liberado' then '/anuncio/' || new.anuncio_id
                 when 'removido' then '/privacidade#regras'
                 when 'avaliacao' then '/painel/avaliacoes'
                 when 'avaliacao_retida' then '/privacidade#regras'
                 when 'match_desfeito' then
                   case when new.destinatario_id = v_autor then '/painel/anuncio/' || new.anuncio_id
                        else '/anuncio/' || new.anuncio_id end
                 when 'etapa' then '/painel/curtidas'
                 when 'mensagem' then '/painel/conversas/' || new.anuncio_id || '/' || new.ator_id
                 when 'seguindo' then '/anuncio/' || new.anuncio_id
                 when 'busca' then '/anuncio/' || new.anuncio_id
                 when 'convite' then '/anuncio/' || new.anuncio_id
                 when 'recomendacao' then '/perfil/' || new.destinatario_id || '#recomendacoes'
                 when 'contratacao' then
                   case when new.destinatario_id = v_autor then '/painel/anuncio/' || new.anuncio_id
                        else '/painel/curtidas' end
                 when 'entrevista' then '/anuncio/' || new.anuncio_id
                 when 'entrevista_resposta' then '/painel/anuncio/' || new.anuncio_id || '/quadro'
                 when 'aceite_curriculo' then '/perfil/curriculo?next=%2Fanuncio%2F' || new.anuncio_id
                 when 'curriculo_recebido' then '/painel/anuncio/' || new.anuncio_id || '#candidato-' || new.ator_id
                 else '/painel'
               end));
  return null;
end
$$;

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('convite', 'usuarios', 22, 'Convite para uma vaga',
     'Quando uma empresa acha o currículo da pessoa em Talentos e a convida para uma vaga.',
     array['nome', 'quem', 'titulo', 'motivo', 'link'],
     '{{quem}} convidou você para uma vaga',
     'Oi, {{nome}}.

{{motivo}}

O convite não compromete: só se você curtir a vaga e a empresa aceitar é que o contato de vocês aparece. Para não aparecer mais para as empresas, desmarque “Deixar as empresas me encontrarem” no seu currículo.',
     'Ver a vaga')
  ) as v (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do nothing;

notify pgrst, 'reload schema';
