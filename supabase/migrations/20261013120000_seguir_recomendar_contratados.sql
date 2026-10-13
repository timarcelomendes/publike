-- Social a serviço do emprego:
--   1. Seguir um comércio (ou profissional) ou um bairro e receber aviso de anúncio novo.
--   2. "Eu recomendo": vizinho, cliente ou ex-patrão recomenda quem presta serviço.
--   3. Contratações públicas: "Fulano foi contratado pela Padaria X", só com o sim dos dois.
-- Nada disso é feed: tudo existe para alguém ser contratado ou uma vaga ser preenchida.

alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('curtida', 'match', 'em_analise', 'removido', 'liberado', 'avaliacao', 'avaliacao_retida',
                  'match_desfeito', 'etapa', 'mensagem', 'seguindo', 'recomendacao', 'contratacao'));

alter table privado.limites_uso drop constraint if exists limites_uso_acao_check;
alter table privado.limites_uso add constraint limites_uso_acao_check
  check (acao in ('anuncio', 'curtida', 'denuncia', 'ia_texto', 'edicao', 'avaliacao', 'desfazer_match', 'ia_indicacao',
                  'mensagem', 'seguir', 'recomendacao'));


-- 1. Seguir ------------------------------------------------------------------

create table if not exists public.seguindo (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  -- ou um perfil (comércio, empresa, agência, profissional)...
  alvo_perfil uuid references public.perfis (id) on delete cascade,
  -- ... ou um bairro de uma cidade
  cidade text,
  bairro text,
  bairro_chave text,
  criado_em timestamptz not null default now(),
  check (
    (alvo_perfil is not null and cidade is null and bairro is null and bairro_chave is null)
    or (alvo_perfil is null and cidade is not null and bairro is not null and bairro_chave is not null)
  ),
  check (alvo_perfil is distinct from perfil_id)
);
create unique index if not exists seguindo_perfil_idx on public.seguindo (perfil_id, alvo_perfil)
  where alvo_perfil is not null;
create unique index if not exists seguindo_bairro_idx on public.seguindo (perfil_id, cidade, bairro_chave)
  where alvo_perfil is null;
create index if not exists seguindo_alvo_idx on public.seguindo (alvo_perfil) where alvo_perfil is not null;
create index if not exists seguindo_lugar_idx on public.seguindo (cidade, bairro_chave) where alvo_perfil is null;

alter table public.seguindo enable row level security;
-- cada um vê e apaga só o que segue; seguir é pela função (limites e conferências)
drop policy if exists "ver o que sigo" on public.seguindo;
create policy "ver o que sigo" on public.seguindo for select to authenticated
  using (perfil_id = (select auth.uid()));
drop policy if exists "deixar de seguir" on public.seguindo;
create policy "deixar de seguir" on public.seguindo for delete to authenticated
  using (perfil_id = (select auth.uid()));
revoke all on public.seguindo from anon, authenticated;
grant select, delete on public.seguindo to authenticated;

create or replace function public.seguir_perfil(p_perfil uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
begin
  if usuario is null then
    raise exception 'Entre na sua conta para seguir.' using errcode = '42501';
  end if;
  if p_perfil = usuario then
    raise exception 'Você não pode seguir a si mesmo.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.perfis p where p.id = p_perfil) then
    raise exception 'Perfil não encontrado.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.seguindo s where s.perfil_id = usuario and s.alvo_perfil = p_perfil) then
    return;
  end if;
  if (select count(*) from public.seguindo s where s.perfil_id = usuario) >= 100 then
    raise exception 'Você já segue 100 perfis e bairros. Deixe de seguir algum para seguir outro.'
      using errcode = 'P0001', hint = 'limite_seguir';
  end if;
  perform privado.conferir_limite('seguir', 60, 'Muitas ações seguidas. Tente de novo amanhã.');
  insert into public.seguindo (perfil_id, alvo_perfil) values (usuario, p_perfil)
  on conflict do nothing;
end
$$;

create or replace function public.seguir_bairro(p_cidade text, p_bairro text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  v_cidade text := nullif(btrim(coalesce(p_cidade, '')), '');
  v_bairro text := nullif(btrim(coalesce(p_bairro, '')), '');
  v_chave text;
begin
  if usuario is null then
    raise exception 'Entre na sua conta para seguir.' using errcode = '42501';
  end if;
  if v_cidade is null or v_bairro is null or char_length(v_cidade) > 80 or char_length(v_bairro) > 80 then
    raise exception 'Escolha um bairro.' using errcode = '22023';
  end if;
  v_chave := public.chave_bairro(v_bairro);
  if nullif(v_chave, '') is null then
    raise exception 'Escolha um bairro.' using errcode = '22023';
  end if;
  if exists (select 1 from public.seguindo s
              where s.perfil_id = usuario and s.cidade = v_cidade and s.bairro_chave = v_chave) then
    return;
  end if;
  if (select count(*) from public.seguindo s where s.perfil_id = usuario) >= 100 then
    raise exception 'Você já segue 100 perfis e bairros. Deixe de seguir algum para seguir outro.'
      using errcode = 'P0001', hint = 'limite_seguir';
  end if;
  perform privado.conferir_limite('seguir', 60, 'Muitas ações seguidas. Tente de novo amanhã.');
  insert into public.seguindo (perfil_id, cidade, bairro, bairro_chave) values (usuario, v_cidade, v_bairro, v_chave)
  on conflict do nothing;
end
$$;

revoke execute on function public.seguir_perfil(uuid), public.seguir_bairro(text, text) from public, anon;
grant execute on function public.seguir_perfil(uuid), public.seguir_bairro(text, text) to authenticated;

-- Quem segue recebe um aviso quando um anúncio entra no ar pela primeira vez.
create table if not exists privado.avisos_seguindo (
  anuncio_id uuid primary key references public.anuncios (id) on delete cascade,
  criado_em timestamptz not null default now()
);

-- os anúncios que já estavam no ar antes disto não avisam ninguém
insert into privado.avisos_seguindo (anuncio_id)
select a.id from public.anuncios a where a.status <> 'em_analise'
on conflict do nothing;

create or replace function privado.avisar_quem_segue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_autor text;
  v_lugar text;
begin
  if new.status <> 'ativo' or (tg_op = 'UPDATE' and old.status = 'ativo') then
    return null;
  end if;
  -- só a primeira vez que entra no ar (pausar e reativar não avisa de novo)
  insert into privado.avisos_seguindo (anuncio_id) values (new.id) on conflict do nothing;
  if not found then
    return null;
  end if;
  select p.nome into v_autor from public.perfis p where p.id = new.autor_id;
  v_lugar := coalesce(nullif(btrim(coalesce(new.bairro, '')), ''), new.cidade);

  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  select q.perfil_id, 'seguindo', new.id, new.autor_id,
         case when q.por_perfil
              then coalesce(v_autor, 'Quem você segue') || ' publicou '
                   || case when new.tipo = 'servico' then 'um serviço' else 'uma vaga' end
                   || ': “' || new.titulo || '”.'
              else case when new.tipo = 'servico' then 'Serviço novo em ' else 'Vaga nova em ' end
                   || v_lugar || ': “' || new.titulo || '”.'
         end
    from (
      select distinct on (s.perfil_id) s.perfil_id, s.alvo_perfil is not null as por_perfil
        from public.seguindo s
       where s.perfil_id <> new.autor_id
         and (s.alvo_perfil = new.autor_id
              or (s.alvo_perfil is null and s.cidade = new.cidade
                  and s.bairro_chave = public.chave_bairro(coalesce(new.bairro, ''))))
       order by s.perfil_id, (s.alvo_perfil is not null) desc
    ) q
   -- no máximo 5 avisos destes por pessoa por dia: seguir não pode virar spam
   where (select count(*) from public.notificacoes n
           where n.destinatario_id = q.perfil_id and n.tipo = 'seguindo'
             and n.criado_em > now() - interval '24 hours') < 5
     and not exists (select 1 from public.bloqueios b
                      where (b.perfil_id = q.perfil_id and b.bloqueado_id = new.autor_id)
                         or (b.perfil_id = new.autor_id and b.bloqueado_id = q.perfil_id));
  return null;
end
$$;

drop trigger if exists avisar_quem_segue on public.anuncios;
create trigger avisar_quem_segue
  after insert or update of status on public.anuncios
  for each row execute function privado.avisar_quem_segue();
revoke execute on function privado.avisar_quem_segue() from public;


-- 2. Eu recomendo -------------------------------------------------------------

create table if not exists public.recomendacoes (
  id bigint generated always as identity primary key,
  profissional_id uuid not null references public.perfis (id) on delete cascade,
  autor_id uuid not null references public.perfis (id) on delete cascade,
  relacao text not null check (relacao in ('vizinho', 'cliente', 'ex_patrao', 'colega')),
  texto text not null check (char_length(texto) between 10 and 300),
  -- quem foi recomendado pode esconder do perfil
  oculta boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (profissional_id, autor_id),
  check (profissional_id <> autor_id)
);
create index if not exists recomendacoes_profissional_idx on public.recomendacoes (profissional_id, criado_em desc);

alter table public.recomendacoes enable row level security;
-- as visíveis são públicas; quem escreveu e quem recebeu veem também as escondidas
drop policy if exists "ver recomendações" on public.recomendacoes;
create policy "ver recomendações" on public.recomendacoes for select to anon, authenticated
  using (not oculta or autor_id = (select auth.uid()) or profissional_id = (select auth.uid()));
drop policy if exists "apagar a minha recomendação" on public.recomendacoes;
create policy "apagar a minha recomendação" on public.recomendacoes for delete to authenticated
  using (autor_id = (select auth.uid()));
revoke all on public.recomendacoes from anon, authenticated;
grant select on public.recomendacoes to anon, authenticated;
grant delete on public.recomendacoes to authenticated;

create or replace function public.recomendar(p_profissional uuid, p_relacao text, p_texto text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  v_texto text := btrim(coalesce(p_texto, ''));
  v_nome text;
  v_nova boolean;
begin
  if usuario is null then
    raise exception 'Entre na sua conta para recomendar.' using errcode = '42501';
  end if;
  if public.minha_conta_suspensa() then
    raise exception 'Sua conta está suspensa. Se achar que é um engano, fale com a gente.'
      using errcode = 'P0001', hint = 'conta_suspensa';
  end if;
  if p_profissional = usuario then
    raise exception 'Você não pode recomendar a si mesmo.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.perfis p where p.id = p_profissional and p.tipo = 'pessoa') then
    raise exception 'Só dá para recomendar quem presta serviço.' using errcode = '22023';
  end if;
  if p_relacao not in ('vizinho', 'cliente', 'ex_patrao', 'colega') then
    raise exception 'Diga de onde vocês se conhecem.' using errcode = '22023';
  end if;
  if char_length(v_texto) < 10 or char_length(v_texto) > 300 then
    raise exception 'Escreva de 10 a 300 letras.' using errcode = '22023';
  end if;
  if exists (select 1 from public.bloqueios b
              where (b.perfil_id = usuario and b.bloqueado_id = p_profissional)
                 or (b.perfil_id = p_profissional and b.bloqueado_id = usuario)) then
    raise exception 'Não é possível recomendar este perfil.' using errcode = '42501';
  end if;
  v_nova := not exists (select 1 from public.recomendacoes r
                         where r.profissional_id = p_profissional and r.autor_id = usuario);
  perform privado.conferir_limite('recomendacao', 10, 'Você já recomendou muita gente hoje. Tente de novo amanhã.');

  insert into public.recomendacoes (profissional_id, autor_id, relacao, texto)
  values (p_profissional, usuario, p_relacao, v_texto)
  on conflict (profissional_id, autor_id) do update
    set relacao = excluded.relacao, texto = excluded.texto, atualizado_em = now();

  if v_nova then
    select p.nome into v_nome from public.perfis p where p.id = usuario;
    insert into public.notificacoes (destinatario_id, tipo, ator_id, texto)
    values (p_profissional, 'recomendacao', usuario,
            coalesce(v_nome, 'Alguém') || ' recomendou você no Publike.');
  end if;
end
$$;

-- quem recebeu esconde ou mostra de novo
create or replace function public.mostrar_recomendacao(p_id bigint, p_mostrar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.recomendacoes r set oculta = not coalesce(p_mostrar, false)
   where r.id = p_id and r.profissional_id = (select auth.uid());
  if not found then
    raise exception 'Recomendação não encontrada.' using errcode = 'P0002';
  end if;
end
$$;

-- as recomendações de um perfil, com o nome de quem recomendou
-- (a de segurança e LGPD troca as colunas: sem o drop, rodar esta de novo depois dela dá erro)
drop function if exists public.recomendacoes_do_perfil(uuid);
create or replace function public.recomendacoes_do_perfil(p_perfil uuid)
returns table (
  id bigint,
  autor_id uuid,
  autor_nome text,
  autor_foto text,
  relacao text,
  texto text,
  oculta boolean,
  criado_em timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.autor_id, p.nome, p.foto, r.relacao, r.texto, r.oculta, r.criado_em
    from public.recomendacoes r
    join public.perfis p on p.id = r.autor_id
   where r.profissional_id = p_perfil
     and (not r.oculta or r.profissional_id = (select auth.uid()) or r.autor_id = (select auth.uid()))
     and (p.suspenso_ate is null or p.suspenso_ate <= now())
   order by r.criado_em desc
   limit 50
$$;

revoke execute on function public.recomendar(uuid, text, text), public.mostrar_recomendacao(bigint, boolean)
  from public, anon;
grant execute on function public.recomendar(uuid, text, text), public.mostrar_recomendacao(bigint, boolean)
  to authenticated;
grant execute on function public.recomendacoes_do_perfil(uuid) to anon, authenticated;


-- 3. Contratações públicas ------------------------------------------------------

create table if not exists public.contratacoes_publicas (
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  ok_empresa boolean not null default false,
  ok_pessoa boolean not null default false,
  publicado_em timestamptz,
  criado_em timestamptz not null default now(),
  primary key (anuncio_id, perfil_id)
);
alter table public.contratacoes_publicas enable row level security;
-- só as funções abaixo leem e escrevem
revoke all on public.contratacoes_publicas from anon, authenticated;

create or replace function public.autorizar_contratacao_publica(p_anuncio uuid, p_perfil uuid, p_sim boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  v_autor uuid;
  v_titulo text;
  v_nome_autor text;
  v_nome_pessoa text;
  v_empresa boolean;
  v_antes_empresa boolean;
  v_antes_pessoa boolean;
  v_ok_empresa boolean;
  v_ok_pessoa boolean;
begin
  if usuario is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  select a.autor_id, a.titulo into v_autor, v_titulo
    from public.anuncios a
    join public.curtidas c on c.anuncio_id = a.id and c.perfil_id = p_perfil and c.status = 'match'
    join public.etapas_candidatos e on e.anuncio_id = a.id and e.perfil_id = p_perfil and e.etapa = 'contratado'
   where a.id = p_anuncio and a.tipo = 'vaga';
  if v_autor is null then
    raise exception 'Só dá para mostrar contratações marcadas como Contratado.' using errcode = '22023';
  end if;
  if usuario = v_autor then
    v_empresa := true;
  elsif usuario = p_perfil then
    v_empresa := false;
  else
    raise exception 'Essa contratação não é sua.' using errcode = '42501';
  end if;

  select c.ok_empresa, c.ok_pessoa into v_antes_empresa, v_antes_pessoa
    from public.contratacoes_publicas c where c.anuncio_id = p_anuncio and c.perfil_id = p_perfil;

  insert into public.contratacoes_publicas (anuncio_id, perfil_id, ok_empresa, ok_pessoa)
  values (p_anuncio, p_perfil, v_empresa and p_sim, (not v_empresa) and p_sim)
  on conflict (anuncio_id, perfil_id) do update
    set ok_empresa = case when v_empresa then p_sim else public.contratacoes_publicas.ok_empresa end,
        ok_pessoa = case when v_empresa then public.contratacoes_publicas.ok_pessoa else p_sim end;

  update public.contratacoes_publicas c
     set publicado_em = case when c.ok_empresa and c.ok_pessoa then coalesce(c.publicado_em, now()) else null end
   where c.anuncio_id = p_anuncio and c.perfil_id = p_perfil
  returning c.ok_empresa, c.ok_pessoa into v_ok_empresa, v_ok_pessoa;

  -- o primeiro sim pede o sim do outro lado
  if p_sim and not (v_ok_empresa and v_ok_pessoa)
     and coalesce(case when v_empresa then v_antes_empresa else v_antes_pessoa end, false) = false then
    select p.nome into v_nome_autor from public.perfis p where p.id = v_autor;
    select p.nome into v_nome_pessoa from public.perfis p where p.id = p_perfil;
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    values (case when v_empresa then p_perfil else v_autor end, 'contratacao', p_anuncio, usuario,
            case when v_empresa
                 then coalesce(v_nome_autor, 'Quem contratou você') || ' quer mostrar no Publike que contratou você em “'
                      || v_titulo || '”. Você topa?'
                 else coalesce(v_nome_pessoa, 'Quem você contratou') || ' quer mostrar no Publike que foi contratado em “'
                      || v_titulo || '”. Você topa?'
            end);
  end if;
end
$$;

-- as minhas (dos dois lados), para mostrar o botão certo
create or replace function public.minhas_contratacoes_publicas()
returns table (anuncio_id uuid, perfil_id uuid, ok_empresa boolean, ok_pessoa boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.anuncio_id, c.perfil_id, c.ok_empresa, c.ok_pessoa
    from public.contratacoes_publicas c
    join public.anuncios a on a.id = c.anuncio_id
   where c.perfil_id = (select auth.uid()) or a.autor_id = (select auth.uid())
$$;

-- as públicas (os dois disseram sim): primeiro nome e inicial de quem foi contratado
create or replace function public.contratacoes_recentes(p_empresa uuid default null, p_pessoa uuid default null,
                                                        p_limite integer default 12)
returns table (
  anuncio_id uuid,
  titulo text,
  pessoa_id uuid,
  pessoa_nome text,
  empresa_id uuid,
  empresa_nome text,
  bairro text,
  cidade text,
  publicado_em timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.titulo, pe.id,
         split_part(btrim(pe.nome), ' ', 1)
           || case when position(' ' in btrim(pe.nome)) > 0
                   then ' ' || left(split_part(btrim(pe.nome), ' ', array_length(regexp_split_to_array(btrim(pe.nome), '\s+'), 1)), 1) || '.'
                   else '' end,
         em.id, em.nome, a.bairro, a.cidade, c.publicado_em
    from public.contratacoes_publicas c
    join public.anuncios a on a.id = c.anuncio_id
    join public.perfis pe on pe.id = c.perfil_id
    join public.perfis em on em.id = a.autor_id
   where c.ok_empresa and c.ok_pessoa
     and (p_empresa is null or a.autor_id = p_empresa)
     and (p_pessoa is null or c.perfil_id = p_pessoa)
     and (pe.suspenso_ate is null or pe.suspenso_ate <= now())
     and (em.suspenso_ate is null or em.suspenso_ate <= now())
   order by c.publicado_em desc
   limit least(greatest(coalesce(p_limite, 12), 1), 50)
$$;

revoke execute on function public.autorizar_contratacao_publica(uuid, uuid, boolean),
  public.minhas_contratacoes_publicas() from public, anon;
grant execute on function public.autorizar_contratacao_publica(uuid, uuid, boolean),
  public.minhas_contratacoes_publicas() to authenticated;
grant execute on function public.contratacoes_recentes(uuid, uuid, integer) to anon, authenticated;


-- E-mails dos avisos novos -----------------------------------------------------------

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
  if new.tipo in ('etapa', 'seguindo', 'recomendacao', 'contratacao') then
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
                 when 'recomendacao' then '/perfil/' || new.destinatario_id || '#recomendacoes'
                 when 'contratacao' then
                   case when new.destinatario_id = v_autor then '/painel/anuncio/' || new.anuncio_id
                        else '/painel/curtidas' end
                 else '/painel'
               end));
  return null;
end
$$;

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('seguindo', 'usuarios', 14, 'Anúncio novo de quem a pessoa segue',
     'Quando um comércio, empresa ou profissional que a pessoa segue publica, ou sai anúncio novo num bairro que ela segue. No máximo 5 por dia.',
     array['nome', 'titulo', 'motivo', 'link'],
     'Anúncio novo: “{{titulo}}”',
     'Oi, {{nome}}.

{{motivo}}

Veja os detalhes no Publike. Para parar de receber, deixe de seguir no seu painel.',
     'Ver o anúncio'),

    ('recomendacao', 'usuarios', 15, 'Recomendação recebida',
     'Quando alguém recomenda quem presta serviço (vizinho, cliente, ex-patrão ou colega).',
     array['nome', 'quem', 'motivo', 'link'],
     '{{quem}} recomendou você no Publike',
     'Oi, {{nome}}.

{{quem}} deixou uma recomendação no seu perfil do Publike. Ela ajuda quem procura um profissional a confiar em você.

Se não quiser que ela apareça, dá para esconder no seu perfil.',
     'Ver a recomendação'),

    ('contratacao', 'usuarios', 16, 'Pedido para mostrar a contratação',
     'Quando um lado de uma contratação (quem contratou ou quem foi contratado) quer mostrar no Publike que ela aconteceu. Só aparece com o sim dos dois.',
     array['nome', 'quem', 'titulo', 'motivo', 'link'],
     'Mostrar no Publike a contratação em “{{titulo}}”?',
     'Oi, {{nome}}.

{{motivo}}

Só aparece se vocês dois disserem sim, e dá para tirar quando quiser.',
     'Responder')
  ) as v (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do nothing;
