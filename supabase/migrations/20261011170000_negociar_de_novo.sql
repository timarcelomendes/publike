-- Match desfeito: dá para tentar de novo, a não ser que a outra pessoa não queira.
--
-- Antes: quem desfazia respondia "toparia negociar depois?" e, com "não", as
-- duas pessoas ficavam bloqueadas uma para a outra; com "sim", ainda era preciso
-- essa resposta para curtir de novo.
-- Agora:
--   * Depois de um match desfeito, quem curtiu pode curtir de novo e quem
--     publicou pode dar match de novo, enquanto o anúncio estiver no ar.
--   * O bloqueio tem dono: "não quero mais receber curtidas (ou match) de X".
--     Ele só impede X de procurar quem bloqueou. Quem bloqueou pode desbloquear
--     quando quiser, e curtir ou dar match em X também desfaz o próprio bloqueio.
--   * Qualquer um dos dois pode bloquear, não só quem desfez o match.
-- Os bloqueios que já existem continuam valendo, do jeito novo: quem desfez e
-- respondeu "não" não recebe mais curtidas da outra pessoa.
--
-- Rode depois de 20261011150000_conversas.sql (pode rodar de novo sem problema).

-- `p_outro` não quer mais receber nada de quem está logado?
create or replace function privado.bloqueado_com(p_outro uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.bloqueios b
     where b.perfil_id = p_outro and b.bloqueado_id = (select auth.uid())
  )
$$;

-- Curtiu alguém que eu tinha bloqueado: o meu bloqueio sai.
create or replace function privado.curtida_tira_meu_bloqueio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.bloqueios b
   where b.perfil_id = new.perfil_id
     and b.bloqueado_id = (select a.autor_id from public.anuncios a where a.id = new.anuncio_id);
  return null;
end
$$;

drop trigger if exists curtidas_tira_meu_bloqueio on public.curtidas;
create trigger curtidas_tira_meu_bloqueio
  after insert on public.curtidas
  for each row execute function privado.curtida_tira_meu_bloqueio();

-- Quem curtiu volta a curtir um anúncio cujo match foi desfeito (por qualquer um
-- dos dois), a não ser que quem publicou tenha bloqueado.
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
  if privado.bloqueado_com(a.autor_id) then
    raise exception 'Quem publicou preferiu não receber mais curtidas suas.' using errcode = 'P0001', hint = 'bloqueado';
  end if;
  if a.status <> 'ativo' or a.expira_em <= now() then
    raise exception 'Este anúncio não está mais no ar.' using errcode = 'P0001';
  end if;
  perform privado.conferir_limite('curtida', 60, 'Você curtiu bastante coisa hoje. Tente de novo amanhã.');

  update public.curtidas
     set status = 'pendente', mensagem = texto, criado_em = now(), respondida_em = null,
         desfeito_por = null, desfeito_motivo = null, desfeito_em = null, desfeito_futuro = null
   where anuncio_id = p_anuncio and perfil_id = usuario;
  -- quem curte de novo desfaz o próprio bloqueio
  delete from public.bloqueios b where b.perfil_id = usuario and b.bloqueado_id = a.autor_id;

  select p.nome into quem from public.perfis p where p.id = usuario;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (a.autor_id, 'curtida', a.id, usuario,
          case when a.tipo = 'servico'
               then coalesce(quem, 'Alguém') || ' quer contratar você de novo: “' || a.titulo || '”.'
               else coalesce(quem, 'Alguém') || ' curtiu de novo “' || a.titulo || '”.'
          end);
end
$$;

-- Quem publicou responde. Num match desfeito, pode dar match de novo, a não ser
-- que quem curtiu tenha bloqueado. Vaga que pede currículo: só com currículo.
create or replace function public.responder_curtida(p_anuncio uuid, p_perfil uuid, p_decisao text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  atual text;
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
  select c.status, a.status, a.tipo = 'vaga' and a.pede_curriculo
    into atual, situacao, pede
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
  if p_decisao = 'match' and privado.bloqueado_com(p_perfil) then
    select split_part(p.nome, ' ', 1) into nome from public.perfis p where p.id = p_perfil;
    raise exception '% preferiu não negociar de novo com você.', coalesce(nome, 'Essa pessoa')
      using errcode = 'P0001', hint = 'bloqueado';
  end if;
  if p_decisao = 'match' and pede and not exists (select 1 from public.curriculos cv where cv.perfil_id = p_perfil) then
    select split_part(p.nome, ' ', 1) into nome from public.perfis p where p.id = p_perfil;
    raise exception 'Esta vaga pede currículo e % ainda não preencheu. O match fica liberado assim que o currículo estiver pronto.',
      coalesce(nome, 'a pessoa') using errcode = 'P0001', hint = 'sem_curriculo';
  end if;
  if atual = 'desfeito' and p_decisao <> 'match' then
    raise exception 'Este match foi desfeito. Dá para dar match de novo ou deixar como está.'
      using errcode = 'P0001', hint = 'match_desfeito';
  end if;
  update public.curtidas
     set status = p_decisao,
         respondida_em = case when p_decisao = 'pendente' then null else now() end,
         desfeito_por = null, desfeito_motivo = null, desfeito_em = null, desfeito_futuro = null
   where anuncio_id = p_anuncio and perfil_id = p_perfil;
  -- quem dá match de novo desfaz o próprio bloqueio
  if p_decisao = 'match' then
    delete from public.bloqueios b where b.perfil_id = (select auth.uid()) and b.bloqueado_id = p_perfil;
  end if;
end
$$;

-- Bloquear ou desbloquear alguém com quem já houve curtida (num anúncio de um dos dois).
create or replace function public.bloquear_pessoa(p_outro uuid, p_bloquear boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
begin
  if eu is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  if p_outro is null or p_outro = eu then
    raise exception 'Pessoa inválida.' using errcode = '22023';
  end if;
  if not exists (
    select 1
      from public.curtidas c
      join public.anuncios a on a.id = c.anuncio_id
     where (c.perfil_id = eu and a.autor_id = p_outro)
        or (c.perfil_id = p_outro and a.autor_id = eu)
  ) then
    raise exception 'Vocês ainda não se curtiram.' using errcode = 'P0002';
  end if;
  if p_bloquear then
    insert into public.bloqueios (perfil_id, bloqueado_id) values (eu, p_outro) on conflict do nothing;
  else
    delete from public.bloqueios b where b.perfil_id = eu and b.bloqueado_id = p_outro;
  end if;
end
$$;

-- Os bloqueios que me envolvem: quem eu bloqueei e quem me bloqueou.
create or replace function public.meus_bloqueios()
returns table (outro_id uuid, eu_bloqueei boolean, me_bloqueou boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select o.outro_id,
         bool_or(o.eu), bool_or(not o.eu)
    from (
      select b.bloqueado_id as outro_id, true as eu from public.bloqueios b where b.perfil_id = (select auth.uid())
      union all
      select b.perfil_id, false from public.bloqueios b where b.bloqueado_id = (select auth.uid())
    ) o
   group by o.outro_id
$$;

revoke execute on function privado.curtida_tira_meu_bloqueio() from public;
revoke execute on function public.bloquear_pessoa(uuid, boolean) from public, anon;
grant execute on function public.bloquear_pessoa(uuid, boolean) to authenticated;
revoke execute on function public.meus_bloqueios() from public, anon;
grant execute on function public.meus_bloqueios() to authenticated;
