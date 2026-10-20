-- Uma conversa por pessoa (20/10/2026). Pode rodar de novo sem problema.
--
-- Antes, cada match tinha a sua conversa (anúncio + quem curtiu) e a conexão (talento e empresa,
-- sem vaga) tinha outra. Agora, com a mesma pessoa, é uma conversa só: a da dupla. As mensagens das
-- vagas e da conexão ficam juntas, na ordem em que foram mandadas (as que já existem também).
--   * A conversa vale enquanto a dupla tiver uma ligação: um match (vaga ou serviço de um, curtido
--     pelo outro) ou a conexão aceita. Desfeita uma ligação, a conversa continua se sobrar outra;
--     sem nenhuma, some para os dois e volta se eles se ligarem de novo (como no match). Bloqueio
--     fecha a conversa.
--   * A mensagem guarda a vaga quando nasce dela (o currículo pelo chat, a entrevista marcada); a
--     mandada direto na conversa fica sem vaga.
--   * As funções antigas (enviar_mensagem, marcar_conversa_lida, minhas_conversas,
--     enviar_curriculo_na_conversa) continuam valendo para o site que está no ar até o deploy.
--
-- Rode depois de 20261020150000_conexoes.sql. Rodou de novo uma migração mais antiga (que recria o
-- aviso por e-mail, a regra de leitura das mensagens ou minhas_conexoes)? Rode esta de novo depois.


-- 1. A conversa da dupla -------------------------------------------------------------------------

create table if not exists public.conversas (
  id uuid primary key default gen_random_uuid(),
  conta_a uuid not null references public.perfis (id) on delete cascade,
  conta_b uuid not null references public.perfis (id) on delete cascade,
  criado_em timestamptz not null default now(),
  unique (conta_a, conta_b),
  check (conta_a < conta_b)
);
create index if not exists conversas_conta_b_idx on public.conversas (conta_b);
comment on table public.conversas is
  'A conversa de duas contas: uma só, venha de match (vaga ou serviço) ou de conexão. Só pelas funções.';
alter table public.conversas enable row level security;
revoke all on public.conversas from anon, authenticated;

-- A conversa da dupla (criada na primeira vez).
create or replace function privado.conversa_da_dupla(p_a uuid, p_b uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_a is null or p_b is null or p_a = p_b then
    return null;
  end if;
  select c.id into v_id from public.conversas c
   where c.conta_a = least(p_a, p_b) and c.conta_b = greatest(p_a, p_b);
  if v_id is null then
    insert into public.conversas (conta_a, conta_b) values (least(p_a, p_b), greatest(p_a, p_b))
    on conflict (conta_a, conta_b) do nothing
    returning id into v_id;
    if v_id is null then
      select c.id into v_id from public.conversas c
       where c.conta_a = least(p_a, p_b) and c.conta_b = greatest(p_a, p_b);
    end if;
  end if;
  return v_id;
end
$$;
revoke execute on function privado.conversa_da_dupla(uuid, uuid) from public;

-- A dupla está ligada? Um match (anúncio de um, curtido pelo outro) ou a conexão aceita, e nenhum
-- dos dois bloqueou o outro.
create or replace function privado.dupla_ligada(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_a <> p_b, false)
     and not privado.ha_bloqueio(p_a, p_b)
     and (exists (select 1 from public.curtidas c join public.anuncios a on a.id = c.anuncio_id
                   where c.perfil_id = p_b and a.autor_id = p_a and c.status = 'match')
          or exists (select 1 from public.curtidas c join public.anuncios a on a.id = c.anuncio_id
                      where c.perfil_id = p_a and a.autor_id = p_b and c.status = 'match')
          or exists (select 1 from public.conexoes x
                      where x.status = 'aceita'
                        and ((x.talento_id = p_a and x.empresa_id = p_b)
                             or (x.talento_id = p_b and x.empresa_id = p_a))))
$$;
revoke execute on function privado.dupla_ligada(uuid, uuid) from public;

-- Estou nesta conversa e a dupla está ligada? (a regra de leitura das mensagens, também no Realtime)
create or replace function privado.na_conversa_dupla(p_conversa uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversas d
     where d.id = p_conversa
       and public.conta_atual() in (d.conta_a, d.conta_b)
       and privado.dupla_ligada(d.conta_a, d.conta_b)
  )
$$;
revoke execute on function privado.na_conversa_dupla(uuid) from public;
grant execute on function privado.na_conversa_dupla(uuid) to authenticated;


-- 2. As mensagens passam a ser da conversa da dupla ----------------------------------------------

alter table public.mensagens add column if not exists conversa_id uuid references public.conversas (id) on delete cascade;
alter table public.mensagens alter column anuncio_id drop not null;
alter table public.mensagens alter column perfil_id drop not null;

-- A vaga da mensagem vira só a origem dela: desfeita ou apagada a curtida, a mensagem fica na
-- conversa (antes ia junto).
do $$
declare
  v_nome text;
begin
  for v_nome in
    select con.conname from pg_constraint con
     where con.conrelid = 'public.mensagens'::regclass and con.contype = 'f'
       and con.confrelid = 'public.curtidas'::regclass
  loop
    execute format('alter table public.mensagens drop constraint %I', v_nome);
  end loop;
end
$$;
alter table public.mensagens add constraint mensagens_anuncio_id_perfil_id_fkey
  foreign key (anuncio_id, perfil_id) references public.curtidas (anuncio_id, perfil_id) on delete set null;

-- Mensagem nascida de uma vaga (as funções antigas, a entrevista marcada) cai na conversa da dupla.
create or replace function privado.mensagem_da_dupla()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.conversa_id is null and new.anuncio_id is not null then
    select privado.conversa_da_dupla(a.autor_id, new.perfil_id) into new.conversa_id
      from public.anuncios a where a.id = new.anuncio_id;
  end if;
  if new.conversa_id is null then
    raise exception 'Conversa não encontrada.' using errcode = '23502';
  end if;
  return new;
end
$$;
drop trigger if exists mensagens_da_dupla on public.mensagens;
create trigger mensagens_da_dupla
  before insert on public.mensagens
  for each row execute function privado.mensagem_da_dupla();

-- As mensagens que já existem vão para a conversa da dupla.
update public.mensagens m
   set conversa_id = privado.conversa_da_dupla(a.autor_id, m.perfil_id)
  from public.anuncios a
 where m.conversa_id is null and a.id = m.anuncio_id;

create index if not exists mensagens_conversa_dupla_idx on public.mensagens (conversa_id, criado_em);

-- Ler: os dois da conversa, enquanto a dupla estiver ligada (também pelo Realtime). Escrever: só
-- pelas funções.
drop policy if exists "os dois do match leem a conversa" on public.mensagens;
drop policy if exists "os dois da conversa leem" on public.mensagens;
create policy "os dois da conversa leem" on public.mensagens
  for select to authenticated
  using ((select privado.na_conversa_dupla(conversa_id)));


-- 3. A conversa da conexão vem para a conversa da dupla ------------------------------------------

do $$
begin
  if to_regclass('public.mensagens_conexao') is not null then
    insert into public.mensagens (conversa_id, autor_id, texto, criado_em, lida_em)
    select privado.conversa_da_dupla(x.talento_id, x.empresa_id), m.autor_id, m.texto, m.criado_em, m.lida_em
      from public.mensagens_conexao m
      join public.conexoes x on x.id = m.conexao_id
     order by m.id;
    drop table public.mensagens_conexao;
  end if;
end
$$;
drop function if exists public.enviar_mensagem_conexao(uuid, text);
drop function if exists public.marcar_conexao_lida(uuid);
drop function if exists privado.na_conexao(uuid);

-- As conexões mostram a última mensagem da conversa da dupla (a conversa mesmo fica em Conversas).
create or replace function public.minhas_conexoes(p_outro uuid default null)
returns table (
  id uuid,
  status text,
  pedi boolean,
  outro_id uuid,
  outro_nome text,
  outro_foto text,
  outro_tipo text,
  outro_cidade text,
  outro_bairro text,
  outro_na_vitrine boolean,
  mensagem text,
  criado_em timestamptz,
  respondida_em timestamptz,
  whatsapp text,
  email text,
  ultima_texto text,
  ultima_em timestamptz,
  ultima_minha boolean,
  nao_lidas integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (select public.conta_atual() as id)
  select c.id, c.status, c.pedida_por = eu.id,
         o.id,
         case when o.tipo = 'pessoa' and c.status <> 'aceita' then privado.nome_curto(o.nome) else o.nome end,
         case when o.tipo = 'pessoa' and c.status <> 'aceita' then null else o.foto end,
         o.tipo, o.cidade, o.bairro,
         exists (select 1 from public.curriculo_na_vitrine n where n.perfil_id = o.id),
         c.mensagem, c.criado_em, c.respondida_em,
         case when c.status = 'aceita' then ct.whatsapp end,
         case when c.status = 'aceita' then ct.email end,
         u.texto, u.criado_em, u.autor_id = eu.id,
         coalesce((select count(*)::integer from public.mensagens m
                    where m.conversa_id = d.id and m.autor_id <> eu.id and m.lida_em is null), 0)
    from eu
    join public.conexoes c on eu.id in (c.talento_id, c.empresa_id)
    join public.perfis o on o.id = case when c.talento_id = eu.id then c.empresa_id else c.talento_id end
    left join public.contatos ct on ct.perfil_id = o.id
    left join public.conversas d
      on c.status = 'aceita'
     and d.conta_a = least(c.talento_id, c.empresa_id) and d.conta_b = greatest(c.talento_id, c.empresa_id)
    left join lateral (
      select m.texto, m.criado_em, m.autor_id
        from public.mensagens m
       where m.conversa_id = d.id
       order by m.criado_em desc, m.id desc
       limit 1
    ) u on true
   where (p_outro is null or o.id = p_outro)
     and not (c.status = 'recusada' and c.pedida_por <> eu.id)
     and (o.suspenso_ate is null or o.suspenso_ate <= now())
     and not privado.ha_bloqueio(eu.id, o.id)
   order by coalesce(u.criado_em, c.respondida_em, c.criado_em) desc
   limit 500
$$;
revoke execute on function public.minhas_conexoes(uuid) from public, anon;
grant execute on function public.minhas_conexoes(uuid) to authenticated;


-- 4. A conversa por pessoa -----------------------------------------------------------------------

-- As minhas conversas, uma por pessoa (ou só a com uma conta): com quem tenho match ou conexão
-- aceita, as vagas em comum (com a etapa) e a última mensagem. Da mais recente para a mais antiga.
create or replace function public.conversas_por_pessoa(p_outro uuid default null)
returns table (
  outro_id uuid,
  outro_nome text,
  outro_foto text,
  outro_tipo text,
  outro_na_vitrine boolean,
  conversa_id uuid,
  conectados boolean,
  vagas jsonb,
  desde timestamptz,
  ultima_texto text,
  ultima_em timestamptz,
  ultima_minha boolean,
  nao_lidas integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (select public.conta_atual() as id),
  ligacoes as (
    -- anúncio meu, curtido pela outra pessoa
    select c.perfil_id as outro, a.id as anuncio_id, c.perfil_id, a.titulo, a.tipo, 'publiquei'::text as papel,
           coalesce(e.etapa, 'novo') as etapa, coalesce(c.respondida_em, c.criado_em) as desde
      from eu
      join public.anuncios a on a.autor_id = eu.id
      join public.curtidas c on c.anuncio_id = a.id and c.status = 'match'
      left join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
     where p_outro is null or c.perfil_id = p_outro
    union all
    -- anúncio da outra pessoa, curtido por mim
    select a.autor_id, a.id, c.perfil_id, a.titulo, a.tipo, 'curti', coalesce(e.etapa, 'novo'),
           coalesce(c.respondida_em, c.criado_em)
      from eu
      join public.curtidas c on c.perfil_id = eu.id and c.status = 'match'
      join public.anuncios a on a.id = c.anuncio_id
      left join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
     where p_outro is null or a.autor_id = p_outro
    union all
    -- conexão aceita
    select case when x.talento_id = eu.id then x.empresa_id else x.talento_id end, null, null, null, null,
           'conexao', null, coalesce(x.respondida_em, x.criado_em)
      from eu
      join public.conexoes x on eu.id in (x.talento_id, x.empresa_id) and x.status = 'aceita'
     where p_outro is null or p_outro in (x.talento_id, x.empresa_id)
  ),
  pessoas as (
    select l.outro,
           max(l.desde) as desde,
           bool_or(l.papel = 'conexao') as conectados,
           coalesce(jsonb_agg(jsonb_build_object(
                      'anuncio_id', l.anuncio_id, 'perfil_id', l.perfil_id, 'titulo', l.titulo, 'tipo', l.tipo,
                      'papel', l.papel, 'etapa', l.etapa, 'desde', l.desde) order by l.desde desc)
                      filter (where l.anuncio_id is not null),
                    '[]'::jsonb) as vagas
      from ligacoes l
     group by l.outro
  )
  select p.outro, o.nome, o.foto, o.tipo,
         exists (select 1 from public.curriculo_na_vitrine n where n.perfil_id = o.id),
         d.id, p.conectados, p.vagas, p.desde,
         u.texto, u.criado_em, u.autor_id = eu.id,
         coalesce((select count(*)::integer from public.mensagens m
                    where m.conversa_id = d.id and m.autor_id <> eu.id and m.lida_em is null), 0)
    from eu
    cross join pessoas p
    join public.perfis o on o.id = p.outro
    left join public.conversas d on d.conta_a = least(eu.id, p.outro) and d.conta_b = greatest(eu.id, p.outro)
    left join lateral (
      select m.texto, m.criado_em, m.autor_id
        from public.mensagens m
       where m.conversa_id = d.id
       order by m.criado_em desc, m.id desc
       limit 1
    ) u on true
   where p.outro <> eu.id
     and (o.suspenso_ate is null or o.suspenso_ate <= now())
     and not privado.ha_bloqueio(eu.id, p.outro)
   order by coalesce(u.criado_em, p.desde) desc
   limit 500
$$;
revoke execute on function public.conversas_por_pessoa(uuid) from public, anon;
grant execute on function public.conversas_por_pessoa(uuid) to authenticated;

-- Abre a conversa com uma conta (criada na primeira vez). null: a dupla não está ligada.
create or replace function public.abrir_conversa_com(p_outro uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := public.conta_atual();
begin
  if eu is null or p_outro is null or not privado.dupla_ligada(eu, p_outro) then
    return null;
  end if;
  return privado.conversa_da_dupla(eu, p_outro);
end
$$;
revoke execute on function public.abrir_conversa_com(uuid) from public, anon;
grant execute on function public.abrir_conversa_com(uuid) to authenticated;

-- Manda uma mensagem para uma conta com quem tenho match ou conexão aceita.
create or replace function public.enviar_mensagem_para(p_outro uuid, p_texto text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := public.conta_atual();
  v_texto text := btrim(coalesce(p_texto, ''));
  v_suspenso timestamptz;
  v_nome text;
  v_tipo text;
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
  if p_outro is null or not privado.dupla_ligada(eu, p_outro) then
    raise exception 'A conversa abre quando dá match ou quando a conexão é aceita.' using errcode = '42501';
  end if;
  select p.suspenso_ate into v_suspenso from public.perfis p where p.id = p_outro;
  if v_suspenso is not null and v_suspenso > now() then
    raise exception 'Não dá para mandar mensagem para esta conta.' using errcode = 'P0001';
  end if;
  -- só com match em anúncio que está com a moderação (sem conexão nem outro match): espera liberar
  if not exists (select 1 from public.conexoes x
                  where x.status = 'aceita'
                    and ((x.talento_id = eu and x.empresa_id = p_outro)
                         or (x.talento_id = p_outro and x.empresa_id = eu)))
     and not exists (select 1 from public.curtidas c join public.anuncios a on a.id = c.anuncio_id
                      where c.status = 'match' and a.status not in ('em_analise', 'removido')
                        and ((a.autor_id = eu and c.perfil_id = p_outro)
                             or (a.autor_id = p_outro and c.perfil_id = eu))) then
    raise exception 'Este anúncio está com a moderação. A conversa volta quando ele for liberado.'
      using errcode = 'P0001';
  end if;
  perform privado.conferir_limite('mensagem', 300, 'Você mandou muitas mensagens hoje. Tente de novo amanhã.');

  insert into public.mensagens (conversa_id, autor_id, texto)
  values (privado.conversa_da_dupla(eu, p_outro), eu, v_texto)
  returning id into v_id;

  -- aviso para a outra pessoa: um só, até ela abrir a conversa
  if not exists (
    select 1 from public.notificacoes n
     where n.destinatario_id = p_outro and n.tipo = 'mensagem' and n.ator_id = eu and not n.lida
  ) then
    select p.nome, p.tipo into v_nome, v_tipo from public.perfis p where p.id = eu;
    insert into public.notificacoes (destinatario_id, tipo, ator_id, texto)
    values (p_outro, 'mensagem', eu,
            left(coalesce(case when v_tipo = 'pessoa' then split_part(v_nome, ' ', 1) else v_nome end, 'Alguém')
                 || ' mandou uma mensagem.', 300));
  end if;
  return v_id;
end
$$;
revoke execute on function public.enviar_mensagem_para(uuid, text) from public, anon;
grant execute on function public.enviar_mensagem_para(uuid, text) to authenticated;

-- Abri a conversa: tudo o que a outra pessoa mandou (de qualquer vaga ou da conexão) e os avisos
-- de mensagem dela ficam lidos.
create or replace function public.marcar_conversa_lida_com(p_outro uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := public.conta_atual();
  v_conversa uuid;
begin
  if eu is null or p_outro is null or not privado.dupla_ligada(eu, p_outro) then
    return;
  end if;
  select c.id into v_conversa from public.conversas c
   where c.conta_a = least(eu, p_outro) and c.conta_b = greatest(eu, p_outro);
  update public.mensagens m
     set lida_em = now()
   where m.conversa_id = v_conversa and m.autor_id <> eu and m.lida_em is null;
  update public.notificacoes n
     set lida = true
   where n.destinatario_id = eu and n.tipo = 'mensagem' and n.ator_id = p_outro and not n.lida;
end
$$;
revoke execute on function public.marcar_conversa_lida_com(uuid) from public, anon;
grant execute on function public.marcar_conversa_lida_com(uuid) to authenticated;


-- 5. Equipe da agência: mensagem sem vaga também fica anotada -----------------------------------

create or replace function privado.equipe_anota_mensagem()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_autor uuid;
  v_titulo text;
  v_outro uuid;
begin
  if new.anuncio_id is null then
    -- mandada direto na conversa: "conversou com" quem está do outro lado
    select case when d.conta_a = new.autor_id then d.conta_b else d.conta_a end into v_outro
      from public.conversas d where d.id = new.conversa_id;
    if v_outro is null or exists (
         select 1 from public.atividades_equipe x
          where x.agencia_id = new.autor_id and x.anuncio_id is null and x.perfil_id = v_outro
            and x.membro_id = (select auth.uid()) and x.texto like 'conversou com %'
            and x.criado_em > now() - interval '30 minutes') then
      return null;
    end if;
    perform privado.anotar_atividade(new.autor_id, 'conversou com {candidato}', null, v_outro);
    return null;
  end if;
  select a.autor_id, a.titulo into v_autor, v_titulo from public.anuncios a where a.id = new.anuncio_id;
  if v_autor is null or new.autor_id is distinct from v_autor then
    return null;
  end if;
  if exists (select 1 from public.atividades_equipe x
              where x.agencia_id = v_autor and x.anuncio_id = new.anuncio_id and x.perfil_id = new.perfil_id
                and x.membro_id = (select auth.uid()) and x.texto like 'conversou com %'
                and x.criado_em > now() - interval '30 minutes') then
    return null;
  end if;
  perform privado.anotar_atividade(v_autor,
    'conversou com {candidato} sobre “' || v_titulo || '”',
    new.anuncio_id, new.perfil_id);
  return null;
end
$$;


-- 6. O aviso por e-mail de mensagem leva para a conversa com a pessoa ----------------------------

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
  v_entrevista jsonb;
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
                  'convite', 'vaga_preenchida', 'finalistas', 'convite_candidato', 'equipe', 'conexao') then
    v_motivo := new.texto;
  end if;
  -- entrevista: os dados para o convite de agenda (.ics) que vai anexo no e-mail
  if new.tipo in ('entrevista', 'entrevista_resposta') then
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
$$;

-- O e-mail de mensagem nova não depende mais de uma vaga (a conversa é com a pessoa). Quem já
-- editou o texto no admin fica com o seu.
update public.modelos_email m
   set assunto = case when m.assunto = m.assunto_padrao then v.assunto else m.assunto end,
       corpo = case when m.corpo = m.corpo_padrao then v.corpo else m.corpo end,
       assunto_padrao = v.assunto,
       corpo_padrao = v.corpo,
       descricao = v.descricao
  from (values (
    '{{quem}} mandou uma mensagem no Publike',
    'Oi, {{nome}}.

{{quem}} mandou uma mensagem para você no Publike.

Sobre “{{titulo}}”.

Abra a conversa para ler e responder.',
    'Quando alguém com quem você tem match ou conexão manda mensagem pela conversa do Publike. Vai um aviso por pessoa até abrir a conversa; o texto da mensagem não vai no e-mail.'
  )) as v (assunto, corpo, descricao)
 where m.chave = 'mensagem';

notify pgrst, 'reload schema';
