-- Etapa à vista dos dois lados + conversa dentro do Publike.
--
-- 1. A etapa que quem publicou marca (Em análise, Entrevista…) passa a aparecer
--    para quem curtiu, com aviso no sino e por e-mail quando muda. A anotação
--    continua só de quem publicou.
-- 2. Serviços ganham etapas próprias: Novo, Orçamento enviado, Agendado,
--    Concluído e Não seguiu (vagas: Novo, Em análise, Entrevista, Contratado e
--    Não seguiu).
-- 3. Conversa: depois do match, os dois conversam pelo Publike (como no
--    WhatsApp, mas sem trocar número). Só os dois leem; desfeito o match, a
--    conversa some para os dois. Mensagem nova avisa no sino e por e-mail, uma
--    vez até a pessoa abrir a conversa.
--
-- Rode depois de 20261011120000_etapas_candidatos.sql (pode rodar de novo sem problema).

-- 1. Etapas ----------------------------------------------------------------------

alter table public.etapas_candidatos drop constraint if exists etapas_candidatos_etapa_check;
alter table public.etapas_candidatos add constraint etapas_candidatos_etapa_check
  check (etapa in ('novo', 'analise', 'entrevista', 'contratado', 'orcamento', 'agendado', 'concluido', 'nao_seguiu'));

-- O nome da etapa para quem curtiu (para o aviso).
create or replace function public.rotulo_etapa_para_quem_curtiu(p_etapa text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_etapa
           when 'analise' then 'Em análise'
           when 'entrevista' then 'Entrevista'
           when 'contratado' then 'Contratado'
           when 'orcamento' then 'Orçamento enviado'
           when 'agendado' then 'Agendado'
           when 'concluido' then 'Concluído'
           when 'nao_seguiu' then 'Encerrado'
           else 'Recebido'
         end
$$;

alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('curtida', 'match', 'em_analise', 'removido', 'liberado', 'avaliacao', 'avaliacao_retida',
                  'match_desfeito', 'etapa', 'mensagem'));

alter table privado.limites_uso drop constraint if exists limites_uso_acao_check;
alter table privado.limites_uso add constraint limites_uso_acao_check
  check (acao in ('anuncio', 'curtida', 'denuncia', 'ia_texto', 'edicao', 'avaliacao', 'desfazer_match', 'ia_indicacao',
                  'mensagem'));

-- Muda a etapa e a anotação de alguém que curtiu um anúncio meu. Se a etapa mudou,
-- quem curtiu recebe um aviso (a anotação nunca vai junto).
create or replace function public.salvar_etapa_candidato(p_anuncio uuid, p_perfil uuid, p_etapa text, p_nota text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_tipo text;
  v_titulo text;
  v_antes text;
begin
  if (select auth.uid()) is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if public.minha_conta_suspensa() then
    raise exception 'Sua conta está suspensa. Se achar que é um engano, fale com a gente.'
      using errcode = 'P0001', hint = 'conta_suspensa';
  end if;
  select a.tipo, a.titulo into v_tipo, v_titulo
    from public.curtidas c
    join public.anuncios a on a.id = c.anuncio_id
   where c.anuncio_id = p_anuncio
     and c.perfil_id = p_perfil
     and a.autor_id = (select auth.uid());
  if v_tipo is null then
    raise exception 'Essa pessoa não curtiu um anúncio seu.' using errcode = '42501';
  end if;
  if p_etapa is null
     or (v_tipo = 'vaga' and p_etapa not in ('novo', 'analise', 'entrevista', 'contratado', 'nao_seguiu'))
     or (v_tipo = 'servico' and p_etapa not in ('novo', 'orcamento', 'agendado', 'concluido', 'nao_seguiu')) then
    raise exception 'Escolha uma etapa da lista.' using errcode = '22023';
  end if;
  if char_length(v_nota) > 1000 then
    raise exception 'A anotação passa de 1000 letras.' using errcode = '22023';
  end if;

  select e.etapa into v_antes
    from public.etapas_candidatos e
   where e.anuncio_id = p_anuncio and e.perfil_id = p_perfil;

  insert into public.etapas_candidatos (anuncio_id, perfil_id, etapa, nota)
  values (p_anuncio, p_perfil, p_etapa, v_nota)
  on conflict (anuncio_id, perfil_id) do update
    set etapa = excluded.etapa,
        nota = excluded.nota,
        atualizado_em = case when public.etapas_candidatos.etapa is distinct from excluded.etapa
                             then now() else public.etapas_candidatos.atualizado_em end;

  if coalesce(v_antes, 'novo') <> p_etapa and p_etapa <> 'novo' then
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    values (p_perfil, 'etapa', p_anuncio, (select auth.uid()),
            case when p_etapa = 'nao_seguiu'
                 then case when v_tipo = 'vaga' then 'O processo de “' else 'O pedido “' end
                      || v_titulo || '” foi encerrado. Obrigado pelo interesse!'
                 else '“' || v_titulo || '” agora está em: ' || public.rotulo_etapa_para_quem_curtiu(p_etapa) || '.'
            end);
  end if;
end
$$;

-- A etapa de cada coisa que eu curti (a anotação não vem: é só de quem publicou).
create or replace function public.minhas_etapas()
returns table (anuncio_id uuid, etapa text, atualizado_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select e.anuncio_id, e.etapa, e.atualizado_em
    from public.etapas_candidatos e
   where e.perfil_id = (select auth.uid())
$$;

-- 2. Conversas ---------------------------------------------------------------------

-- Uma conversa é a de uma curtida que deu match: (anúncio, quem curtiu).
create table if not exists public.mensagens (
  id bigint generated always as identity primary key,
  anuncio_id uuid not null,
  perfil_id uuid not null,
  autor_id uuid not null references public.perfis (id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 2000),
  criado_em timestamptz not null default now(),
  lida_em timestamptz,
  foreign key (anuncio_id, perfil_id) references public.curtidas (anuncio_id, perfil_id) on delete cascade
);
create index if not exists mensagens_conversa_idx on public.mensagens (anuncio_id, perfil_id, id);

-- Sou um dos dois de um match neste anúncio?
create or replace function privado.na_conversa(p_anuncio uuid, p_perfil uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.curtidas c
      join public.anuncios a on a.id = c.anuncio_id
     where c.anuncio_id = p_anuncio
       and c.perfil_id = p_perfil
       and c.status = 'match'
       and (select auth.uid()) in (c.perfil_id, a.autor_id)
  )
$$;
revoke execute on function privado.na_conversa(uuid, uuid) from public;
grant execute on function privado.na_conversa(uuid, uuid) to authenticated;

-- Ler: só os dois do match (também pelo Realtime). Escrever: só pelas funções.
alter table public.mensagens enable row level security;
revoke all on public.mensagens from anon, authenticated;
grant select on public.mensagens to authenticated;
drop policy if exists "os dois do match leem a conversa" on public.mensagens;
create policy "os dois do match leem a conversa" on public.mensagens
  for select to authenticated
  using ((select privado.na_conversa(anuncio_id, perfil_id)));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mensagens'
     ) then
    alter publication supabase_realtime add table public.mensagens;
  end if;
end
$$;

-- Manda uma mensagem na conversa de um match.
create or replace function public.enviar_mensagem(p_anuncio uuid, p_perfil uuid, p_texto text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
  v_texto text := btrim(coalesce(p_texto, ''));
  v_autor uuid;
  v_titulo text;
  v_status text;
  v_outro uuid;
  v_nome text;
  v_id bigint;
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  if v_texto = '' then
    raise exception 'Escreva a mensagem.' using errcode = '22023';
  end if;
  if char_length(v_texto) > 2000 then
    raise exception 'A mensagem passa de 2000 letras.' using errcode = '22023';
  end if;
  if not privado.na_conversa(p_anuncio, p_perfil) then
    raise exception 'A conversa abre quando dá match.' using errcode = '42501';
  end if;
  select a.autor_id, a.titulo, a.status into v_autor, v_titulo, v_status
    from public.anuncios a where a.id = p_anuncio;
  if v_status in ('em_analise', 'removido') then
    raise exception 'Este anúncio está com a moderação. A conversa volta quando ele for liberado.'
      using errcode = 'P0001';
  end if;
  perform privado.conferir_limite('mensagem', 300, 'Você mandou muitas mensagens hoje. Tente de novo amanhã.');

  insert into public.mensagens (anuncio_id, perfil_id, autor_id, texto)
  values (p_anuncio, p_perfil, eu, v_texto)
  returning id into v_id;

  -- aviso para a outra pessoa: um só, até ela abrir a conversa
  v_outro := case when eu = v_autor then p_perfil else v_autor end;
  if not exists (
    select 1 from public.notificacoes n
     where n.destinatario_id = v_outro and n.tipo = 'mensagem' and n.anuncio_id = p_anuncio
       and n.ator_id = eu and not n.lida
  ) then
    select p.nome into v_nome from public.perfis p where p.id = eu;
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    values (v_outro, 'mensagem', p_anuncio, eu,
            coalesce(split_part(v_nome, ' ', 1), 'Alguém') || ' mandou uma mensagem sobre “' || v_titulo || '”.');
  end if;
  return v_id;
end
$$;

-- Abri a conversa: as mensagens da outra pessoa e o aviso dela ficam lidos.
create or replace function public.marcar_conversa_lida(p_anuncio uuid, p_perfil uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
begin
  if eu is null or not privado.na_conversa(p_anuncio, p_perfil) then
    return;
  end if;
  update public.mensagens m
     set lida_em = now()
   where m.anuncio_id = p_anuncio and m.perfil_id = p_perfil and m.autor_id <> eu and m.lida_em is null;
  update public.notificacoes n
     set lida = true
   where n.destinatario_id = eu and n.tipo = 'mensagem' and n.anuncio_id = p_anuncio and not n.lida;
end
$$;

-- As conversas de quem está logado (todos os matches), da mais recente para a mais antiga.
create or replace function public.minhas_conversas()
returns table (
  anuncio_id uuid,
  perfil_id uuid,
  anuncio_titulo text,
  anuncio_tipo text,
  papel text,
  outro_id uuid,
  outro_nome text,
  outro_foto text,
  etapa text,
  ultima_texto text,
  ultima_em timestamptz,
  ultima_minha boolean,
  nao_lidas integer,
  match_em timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.anuncio_id, c.perfil_id, a.titulo, a.tipo,
         case when a.autor_id = (select auth.uid()) then 'publiquei' else 'curti' end,
         o.id, o.nome, o.foto,
         coalesce(e.etapa, 'novo'),
         u.texto, u.criado_em, u.autor_id = (select auth.uid()),
         (select count(*)::integer from public.mensagens m
           where m.anuncio_id = c.anuncio_id and m.perfil_id = c.perfil_id
             and m.autor_id <> (select auth.uid()) and m.lida_em is null),
         c.respondida_em
    from public.curtidas c
    join public.anuncios a on a.id = c.anuncio_id
    join public.perfis o on o.id = case when a.autor_id = (select auth.uid()) then c.perfil_id else a.autor_id end
    left join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
    left join lateral (
      select m.texto, m.criado_em, m.autor_id
        from public.mensagens m
       where m.anuncio_id = c.anuncio_id and m.perfil_id = c.perfil_id
       order by m.id desc
       limit 1
    ) u on true
   where c.status = 'match'
     and (select auth.uid()) in (c.perfil_id, a.autor_id)
     and (o.suspenso_ate is null or o.suspenso_ate <= now())
   order by coalesce(u.criado_em, c.respondida_em, c.criado_em) desc
   limit 500
$$;

-- Avisos por e-mail: os tipos novos levam para a etapa (minhas curtidas) e para a conversa.
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
  if new.tipo = 'etapa' then
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
                 else '/painel'
               end));
  return null;
end
$$;

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('etapa', 'usuarios', 12, 'Etapa atualizada',
     'Quando quem publicou muda a etapa de quem curtiu (Em análise, Entrevista, Agendado…). A anotação de quem publicou não vai junto.',
     array['nome', 'quem', 'titulo', 'motivo', 'link'],
     'Novidade em “{{titulo}}”',
     'Oi, {{nome}}.

{{motivo}}

Veja os detalhes e converse com {{quem}} no Publike.',
     'Ver no Publike'),

    ('mensagem', 'usuarios', 13, 'Mensagem nova',
     'Quando a outra pessoa de um match manda mensagem pela conversa do Publike. Vai um aviso por conversa até a pessoa abrir; o texto da mensagem não vai no e-mail.',
     array['nome', 'quem', 'titulo', 'link'],
     '{{quem}} mandou uma mensagem sobre “{{titulo}}”',
     'Oi, {{nome}}.

{{quem}} mandou uma mensagem para você no Publike, sobre “{{titulo}}”.

Abra a conversa para ler e responder.',
     'Abrir a conversa')
  ) as v (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do nothing;

-- Permissões ------------------------------------------------------------------------

revoke execute on function public.minhas_etapas() from public, anon;
grant execute on function public.minhas_etapas() to authenticated;
revoke execute on function public.enviar_mensagem(uuid, uuid, text) from public, anon;
grant execute on function public.enviar_mensagem(uuid, uuid, text) to authenticated;
revoke execute on function public.marcar_conversa_lida(uuid, uuid) from public, anon;
grant execute on function public.marcar_conversa_lida(uuid, uuid) to authenticated;
revoke execute on function public.minhas_conversas() from public, anon;
grant execute on function public.minhas_conversas() to authenticated;
