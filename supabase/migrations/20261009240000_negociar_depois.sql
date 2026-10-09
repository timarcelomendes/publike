-- =====================================================================
-- Desfazer match: "toparia negociar com essa pessoa em outro momento?"
--
-- A resposta é obrigatória.
--   Sim: o match fica em aberto para depois. Quem curtiu pode curtir de
--        novo o mesmo anúncio e quem publicou pode dar match de novo.
--   Não: as duas pessoas ficam bloqueadas uma para a outra: nenhuma consegue
--        curtir os anúncios da outra nem dar match com ela.
--
-- Também: vaga que pede currículo só dá match com quem preencheu o currículo.
--
-- Rode depois de 20261009230000_desfazer_match.sql.
-- =====================================================================


-- 1. Dados -----------------------------------------------------------------

alter table public.curtidas add column desfeito_futuro boolean;
alter table public.matches_desfeitos add column futuro boolean not null default false;

-- Quem não quer mais negociar com quem. Vale para os dois lados.
create table public.bloqueios (
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  bloqueado_id uuid not null references public.perfis (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (perfil_id, bloqueado_id),
  check (perfil_id <> bloqueado_id)
);
create index bloqueios_bloqueado_idx on public.bloqueios (bloqueado_id);
alter table public.bloqueios enable row level security;
revoke all on public.bloqueios from anon, authenticated;
comment on table public.bloqueios is
  'Criado quando alguém desfaz um match e diz que não quer negociar de novo. Nenhum dos dois curte os anúncios do outro.';

create or replace function privado.ha_bloqueio(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.bloqueios b
     where (b.perfil_id = p_a and b.bloqueado_id = p_b)
        or (b.perfil_id = p_b and b.bloqueado_id = p_a))
$$;

-- A mesma pergunta, sempre entre quem está logado e outra pessoa (o gatilho
-- de curtir roda com a permissão de quem curte).
create or replace function privado.bloqueado_com(p_outro uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select privado.ha_bloqueio((select auth.uid()), p_outro)
$$;


-- 2. Curtir: barra quem está bloqueado -------------------------------------------

create or replace function public.curtidas_antes_de_inserir()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
begin
  new.status := 'pendente';
  new.criado_em := now();
  new.respondida_em := null;
  new.mensagem := nullif(btrim(coalesce(new.mensagem, '')), '');
  if public.tem_contato(new.mensagem) then
    raise exception 'Tire o telefone ou e-mail da mensagem. O contato aparece sozinho quando der match.'
      using errcode = 'P0001', hint = 'contato_no_texto';
  end if;
  if usuario is not null then
    perform privado.exigir_conta_ativa();
    if not exists (
      select 1 from public.contatos c
       where c.perfil_id = usuario and (c.whatsapp is not null or c.email is not null)
    ) then
      raise exception 'Complete seu perfil com um WhatsApp antes de curtir.'
        using errcode = 'P0001', hint = 'perfil_incompleto';
    end if;
    if privado.bloqueado_com((select a.autor_id from public.anuncios a where a.id = new.anuncio_id)) then
      raise exception 'Não dá para curtir este anúncio: vocês desfizeram um match antes.'
        using errcode = 'P0001', hint = 'bloqueado';
    end if;
    perform privado.conferir_limite('curtida', 60, 'Você curtiu bastante coisa hoje. Tente de novo amanhã.');
  end if;
  return new;
end
$$;


-- 3. Desfazer, agora com a pergunta ----------------------------------------------

drop function public.desfazer_match(uuid, uuid, text, text);
create function public.desfazer_match(
  p_anuncio uuid, p_perfil uuid, p_motivo text, p_justificativa text, p_futuro boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  c public.curtidas;
  a public.anuncios;
  outro uuid;
  quem text;
  texto text := btrim(regexp_replace(coalesce(p_justificativa, ''), '\s+', ' ', 'g'));
begin
  if usuario is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  if p_motivo is null or p_motivo not in (
    'vaga_preenchida', 'sem_resposta', 'nao_combinou', 'desistiu', 'nao_compareceu', 'comportamento', 'outro') then
    raise exception 'Escolha o motivo.' using errcode = 'P0001', hint = 'motivo';
  end if;
  if char_length(texto) < 10 then
    raise exception 'Explique em poucas palavras por que está desfazendo (pelo menos 10 letras).'
      using errcode = 'P0001', hint = 'justificativa';
  end if;
  if char_length(texto) > 500 then
    raise exception 'Use no máximo 500 letras na justificativa.' using errcode = 'P0001', hint = 'justificativa';
  end if;
  if p_futuro is null then
    raise exception 'Diga se toparia negociar com essa pessoa em outro momento.' using errcode = 'P0001', hint = 'futuro';
  end if;

  select * into a from public.anuncios where id = p_anuncio;
  select * into c from public.curtidas
   where anuncio_id = p_anuncio and perfil_id = p_perfil
     for update;
  if not found or a.id is null or not (usuario = c.perfil_id or usuario = a.autor_id) then
    raise exception 'Match não encontrado.' using errcode = 'P0002';
  end if;
  if c.status = 'desfeito' then
    raise exception 'Este match já foi desfeito.' using errcode = 'P0001';
  end if;
  if c.status <> 'match' then
    raise exception 'Só dá para desfazer um match.' using errcode = 'P0001';
  end if;
  if p_motivo = 'vaga_preenchida' and (a.tipo <> 'vaga' or usuario <> a.autor_id) then
    raise exception 'Escolha outro motivo.' using errcode = 'P0001', hint = 'motivo';
  end if;
  perform privado.conferir_limite('desfazer_match', 10, 'Você desfez muitos matches hoje. Tente de novo amanhã.');

  outro := case when usuario = a.autor_id then c.perfil_id else a.autor_id end;
  update public.curtidas
     set status = 'desfeito', desfeito_por = usuario, desfeito_motivo = p_motivo, desfeito_em = now(),
         desfeito_futuro = p_futuro
   where anuncio_id = p_anuncio and perfil_id = p_perfil;

  insert into public.matches_desfeitos
    (anuncio_id, titulo, tipo_anuncio, autor_id, interessado_id, desfeito_por, outro_id, motivo, justificativa,
     match_em, futuro)
  values (a.id, a.titulo, a.tipo, a.autor_id, c.perfil_id, usuario, outro, p_motivo, texto,
          coalesce(c.respondida_em, c.criado_em), p_futuro);

  if not p_futuro then
    insert into public.bloqueios (perfil_id, bloqueado_id) values (usuario, outro) on conflict do nothing;
  end if;

  select p.nome into quem from public.perfis p where p.id = usuario;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (outro, 'match_desfeito', a.id, usuario,
          coalesce(quem, 'A outra pessoa') || ' desfez o match em “' || a.titulo || '”. Motivo: '
          || public.rotulo_motivo_desfeito(p_motivo) || '.'
          || case when p_futuro then ' Topa negociar com você em outro momento.' else '' end);

  if p_motivo = 'comportamento' then
    perform privado.avisar_equipe('aviso_match_desfeito', jsonb_build_object(
      'titulo', a.titulo,
      'quem', coalesce(quem, 'Alguém'),
      'caminho', '/admin/usuarios/' || outro));
  end if;
end
$$;


-- 4. Negociar depois -------------------------------------------------------------

-- Quem curtiu volta a curtir um anúncio cujo match foi desfeito com "sim".
create or replace function public.curtir_de_novo(p_anuncio uuid, p_mensagem text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  c public.curtidas;
  a public.anuncios;
  quem text;
  texto text := nullif(btrim(coalesce(p_mensagem, '')), '');
begin
  if usuario is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  if char_length(texto) > 280 then
    raise exception 'Use no máximo 280 letras na mensagem.' using errcode = 'P0001';
  end if;
  if public.tem_contato(texto) then
    raise exception 'Tire o telefone ou e-mail da mensagem. O contato aparece sozinho quando der match.'
      using errcode = 'P0001', hint = 'contato_no_texto';
  end if;
  select * into a from public.anuncios where id = p_anuncio;
  select * into c from public.curtidas where anuncio_id = p_anuncio and perfil_id = usuario for update;
  if not found or a.id is null or c.status <> 'desfeito' then
    raise exception 'Não há match desfeito neste anúncio.' using errcode = 'P0002';
  end if;
  if not coalesce(c.desfeito_futuro, false) or privado.ha_bloqueio(usuario, a.autor_id) then
    raise exception 'Não dá para curtir este anúncio de novo.' using errcode = 'P0001', hint = 'bloqueado';
  end if;
  if a.status <> 'ativo' or a.expira_em <= now() then
    raise exception 'Este anúncio não está mais no ar.' using errcode = 'P0001';
  end if;
  perform privado.conferir_limite('curtida', 60, 'Você curtiu bastante coisa hoje. Tente de novo amanhã.');

  update public.curtidas
     set status = 'pendente', mensagem = texto, criado_em = now(), respondida_em = null,
         desfeito_por = null, desfeito_motivo = null, desfeito_em = null, desfeito_futuro = null
   where anuncio_id = p_anuncio and perfil_id = usuario;

  select p.nome into quem from public.perfis p where p.id = usuario;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (a.autor_id, 'curtida', a.id, usuario,
          case when a.tipo = 'servico'
               then coalesce(quem, 'Alguém') || ' quer contratar você de novo: “' || a.titulo || '”.'
               else coalesce(quem, 'Alguém') || ' curtiu de novo “' || a.titulo || '”.'
          end);
end
$$;

-- Quem publicou pode dar match de novo num match desfeito com "sim".
-- Bloqueio entre as duas pessoas impede qualquer match.
-- Vaga que pede currículo: só dá match com quem já preencheu o currículo.
create or replace function public.responder_curtida(p_anuncio uuid, p_perfil uuid, p_decisao text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  atual text;
  futuro boolean;
  situacao text;
  pede boolean;
  nome text;
begin
  perform privado.exigir_conta_ativa();
  if p_decisao not in ('match', 'dispensada', 'pendente') then
    raise exception 'Resposta inválida.' using errcode = '22023';
  end if;
  if exists (select 1 from public.perfis p where p.id = p_perfil and p.suspenso_ate > now()) then
    raise exception 'Essa pessoa está com a conta suspensa.' using errcode = 'P0001';
  end if;
  select c.status, c.desfeito_futuro, a.status, a.tipo = 'vaga' and a.pede_curriculo
    into atual, futuro, situacao, pede
    from public.curtidas c
    join public.anuncios a on a.id = c.anuncio_id
   where c.anuncio_id = p_anuncio
     and c.perfil_id = p_perfil
     and a.autor_id = (select auth.uid())
     for update of c;
  if not found then
    raise exception 'Curtida não encontrada.' using errcode = 'P0002';
  end if;
  if situacao in ('em_analise', 'removido') then
    raise exception 'Este anúncio está com a moderação. Responda depois que ele for liberado.'
      using errcode = 'P0001', hint = 'com_moderacao';
  end if;
  if atual = 'match' then
    raise exception 'Este match já aconteceu. Para desistir, use “Desfazer match”.' using errcode = 'P0001', hint = 'match_feito';
  end if;
  if p_decisao = 'match' and privado.ha_bloqueio((select auth.uid()), p_perfil) then
    raise exception 'Vocês desfizeram um match antes e um dos dois não quis negociar de novo.'
      using errcode = 'P0001', hint = 'bloqueado';
  end if;
  if p_decisao = 'match' and pede and not exists (select 1 from public.curriculos cv where cv.perfil_id = p_perfil) then
    select split_part(p.nome, ' ', 1) into nome from public.perfis p where p.id = p_perfil;
    raise exception 'Esta vaga pede currículo e % ainda não preencheu. O match fica liberado assim que o currículo estiver pronto.',
      coalesce(nome, 'a pessoa') using errcode = 'P0001', hint = 'sem_curriculo';
  end if;
  if atual = 'desfeito' and not (p_decisao = 'match' and coalesce(futuro, false)) then
    raise exception 'Este match foi desfeito e não volta.' using errcode = 'P0001', hint = 'match_desfeito';
  end if;
  update public.curtidas
     set status = p_decisao,
         respondida_em = case when p_decisao = 'pendente' then null else now() end,
         desfeito_por = null, desfeito_motivo = null, desfeito_em = null, desfeito_futuro = null
   where anuncio_id = p_anuncio and perfil_id = p_perfil;
end
$$;


-- 5. Equipe: mostra a resposta --------------------------------------------------

drop function public.admin_matches_desfeitos(uuid);
create function public.admin_matches_desfeitos(p_perfil uuid)
returns table (
  id bigint,
  anuncio_id uuid,
  titulo text,
  tipo_anuncio text,
  fez boolean,
  outro_id uuid,
  outro_nome text,
  motivo text,
  justificativa text,
  futuro boolean,
  match_em timestamptz,
  criado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_equipe();
  return query
    select d.id, d.anuncio_id, d.titulo, d.tipo_anuncio, d.desfeito_por = p_perfil,
           case when d.desfeito_por = p_perfil then d.outro_id else d.desfeito_por end,
           p.nome, d.motivo, d.justificativa, d.futuro, d.match_em, d.criado_em
      from public.matches_desfeitos d
      left join public.perfis p
        on p.id = case when d.desfeito_por = p_perfil then d.outro_id else d.desfeito_por end
     where d.desfeito_por = p_perfil or d.outro_id = p_perfil
     order by d.criado_em desc
     limit 100;
end
$$;


-- 6. E-mail do match desfeito diz se a pessoa topa negociar depois -----------

update public.modelos_email
   set corpo = case when corpo = corpo_padrao then 'Oi, {{nome}}.

{{quem}} desfez o match em “{{titulo}}” no Publike. Motivo: {{motivo}}.

{{depois}}

O contato de vocês não aparece mais no painel. Se aconteceu algo errado, denuncie pelo site ou responda este e-mail.' else corpo end,
       corpo_padrao = 'Oi, {{nome}}.

{{quem}} desfez o match em “{{titulo}}” no Publike. Motivo: {{motivo}}.

{{depois}}

O contato de vocês não aparece mais no painel. Se aconteceu algo errado, denuncie pelo site ou responda este e-mail.',
       variaveis = array['nome', 'quem', 'titulo', 'motivo', 'depois', 'link']
 where chave = 'match_desfeito';

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
                 else '/painel'
               end));
  return null;
end
$$;


-- 7. Permissões ------------------------------------------------------------

revoke execute on function privado.ha_bloqueio(uuid, uuid), privado.bloqueado_com(uuid) from public;
grant execute on function privado.bloqueado_com(uuid) to authenticated;
revoke execute on function
  public.desfazer_match(uuid, uuid, text, text, boolean),
  public.curtir_de_novo(uuid, text),
  public.admin_matches_desfeitos(uuid)
from public, anon;
grant execute on function
  public.desfazer_match(uuid, uuid, text, text, boolean),
  public.curtir_de_novo(uuid, text)
to authenticated;
grant execute on function public.admin_matches_desfeitos(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
