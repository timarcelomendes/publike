-- =====================================================================
-- Aceite que espera o currículo
--
-- Vaga que pede currículo: quem publicou pode aceitar (curtir de volta) quem
-- ainda não mandou o currículo. A curtida fica aceita (aceita_em, com o status
-- ainda "pendente") e a pessoa recebe o aviso para mandar o currículo. Assim
-- que ela salva o currículo, dá match sozinho: o contato aparece para os dois,
-- ela recebe o "Deu match!" e quem publicou recebe o "currículo recebido".
--
--   1. você curte  →  2. quem publicou aceita  →  3. você manda o currículo  →  4. match
--
-- Também: os e-mails que faltavam das entrevistas (marcada, remarcada ou
-- cancelada, e a resposta do candidato).
--
-- Rode ANTES de publicar o código novo (o código antigo continua funcionando
-- com o banco novo). Rode depois de 20261016150000_recrutamento.sql. Pode rodar
-- de novo.
-- =====================================================================

-- 0. Avisos novos -----------------------------------------------------------------------

alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('curtida', 'match', 'em_analise', 'removido', 'liberado', 'avaliacao', 'avaliacao_retida',
                  'match_desfeito', 'etapa', 'mensagem', 'seguindo', 'recomendacao', 'contratacao',
                  'entrevista', 'entrevista_resposta', 'aceite_curriculo', 'curriculo_recebido'));


-- 1. A curtida aceita que espera o currículo -------------------------------------------

alter table public.curtidas add column if not exists aceita_em timestamptz;
comment on column public.curtidas.aceita_em is
  'Quem publicou aceitou, mas a vaga pede currículo e a pessoa ainda não mandou (o status continua pendente). O match sai quando o currículo chega.';
create index if not exists curtidas_aceitas_idx on public.curtidas (perfil_id) where aceita_em is not null;


-- 2. Responder a curtida ---------------------------------------------------------------
-- Devolve o que aconteceu: 'match', 'aceita' (esperando o currículo), 'dispensada'
-- ou 'pendente' (desfez a resposta). Antes, vaga que pedia currículo barrava o
-- aceite de quem ainda não tinha currículo (hint sem_curriculo).

drop function if exists public.responder_curtida(uuid, uuid, text);
create function public.responder_curtida(p_anuncio uuid, p_perfil uuid, p_decisao text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  atual text;
  situacao text;
  pede boolean;
  v_titulo text;
  v_aceita timestamptz;
  nome text;
  quem text;
begin
  perform privado.exigir_conta_ativa();
  if p_decisao not in ('match', 'dispensada', 'pendente') then
    raise exception 'Resposta inválida.' using errcode = '22023';
  end if;
  if exists (select 1 from public.perfis p where p.id = p_perfil and p.suspenso_ate > now()) then
    raise exception 'Essa pessoa está com a conta suspensa.' using errcode = 'P0001';
  end if;
  select c.status, a.status, a.tipo = 'vaga' and a.pede_curriculo, a.titulo, c.aceita_em
    into atual, situacao, pede, v_titulo, v_aceita
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
  if atual = 'desfeito' and p_decisao <> 'match' then
    raise exception 'Este match foi desfeito. Dá para dar match de novo ou deixar como está.'
      using errcode = 'P0001', hint = 'match_desfeito';
  end if;

  -- Vaga que pede currículo e a pessoa ainda não mandou: o aceite fica guardado e
  -- ela recebe o pedido do currículo (uma vez só). O match sai quando o currículo
  -- chegar (gatilho curriculos_libera_aceites).
  if p_decisao = 'match' and pede
     and not exists (select 1 from public.curriculos cv where cv.perfil_id = p_perfil) then
    update public.curtidas
       set status = 'pendente',
           aceita_em = coalesce(v_aceita, now()),
           respondida_em = null,
           desfeito_por = null, desfeito_motivo = null, desfeito_em = null, desfeito_futuro = null
     where anuncio_id = p_anuncio and perfil_id = p_perfil;
    delete from public.bloqueios b where b.perfil_id = (select auth.uid()) and b.bloqueado_id = p_perfil;
    if v_aceita is null then
      select p.nome into quem from public.perfis p where p.id = (select auth.uid());
      insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
      values (p_perfil, 'aceite_curriculo', p_anuncio, (select auth.uid()),
              left(coalesce(quem, 'Quem publicou') || ' aceitou você em “' || v_titulo
                   || '”. Falta só o seu currículo: mande e o contato de vocês aparece na hora.', 300));
    end if;
    return 'aceita';
  end if;

  update public.curtidas
     set status = p_decisao,
         aceita_em = null,
         respondida_em = case when p_decisao = 'pendente' then null else now() end,
         desfeito_por = null, desfeito_motivo = null, desfeito_em = null, desfeito_futuro = null
   where anuncio_id = p_anuncio and perfil_id = p_perfil;
  -- quem dá match de novo desfaz o próprio bloqueio
  if p_decisao = 'match' then
    delete from public.bloqueios b where b.perfil_id = (select auth.uid()) and b.bloqueado_id = p_perfil;
  end if;
  return p_decisao;
end
$$;

revoke execute on function public.responder_curtida(uuid, uuid, text) from public, anon;
grant execute on function public.responder_curtida(uuid, uuid, text) to authenticated;


-- 3. O currículo chegou: dá match nas vagas que já tinham aceitado -----------------------

create or replace function privado.curriculo_libera_aceites()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_nome text;
begin
  select p.nome into v_nome from public.perfis p where p.id = new.perfil_id;
  for r in
    update public.curtidas c
       set status = 'match',
           respondida_em = now(),
           aceita_em = null
      from public.anuncios a
     where a.id = c.anuncio_id
       and c.perfil_id = new.perfil_id
       and c.status = 'pendente'
       and c.aceita_em is not null
       and a.status not in ('em_analise', 'removido')
       and not exists (select 1 from public.perfis dono where dono.id = a.autor_id and dono.suspenso_ate > now())
       and not exists (
         select 1 from public.bloqueios b
          where (b.perfil_id = a.autor_id and b.bloqueado_id = new.perfil_id)
             or (b.perfil_id = new.perfil_id and b.bloqueado_id = a.autor_id))
    returning c.anuncio_id, a.autor_id, a.titulo
  loop
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    values (r.autor_id, 'curriculo_recebido', r.anuncio_id, new.perfil_id,
            left(coalesce(v_nome, 'A pessoa') || ' mandou o currículo para “' || r.titulo
                 || '”. Deu match: o contato de vocês está liberado.', 300));
  end loop;
  return null;
end
$$;

drop trigger if exists curriculos_libera_aceites on public.curriculos;
create trigger curriculos_libera_aceites
  after insert or update on public.curriculos
  for each row execute function privado.curriculo_libera_aceites();

-- Salvar o currículo pela API (upsert) põe o perfil_id também no UPDATE, e sem esta
-- permissão o banco recusava ("permission denied for table curriculos"). Continua
-- seguro: a política só deixa mexer no próprio currículo e o gatilho
-- curriculos_antes_de_salvar mantém o dono.
grant update (perfil_id) on public.curriculos to authenticated;


-- 4. "Novas" em Meus anúncios: quem já foi aceito e espera o currículo não conta -------

create or replace function public.meus_anuncios()
returns table (
  id uuid,
  tipo text,
  titulo text,
  categoria text,
  regime text,
  pagamento_valor numeric,
  pagamento_unidade text,
  beneficios text,
  cidade text,
  bairro text,
  status text,
  criado_em timestamptz,
  expira_em timestamptz,
  curtidas_total integer,
  curtidas_novas integer,
  matches integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id, a.tipo, a.titulo, a.categoria, a.regime,
         a.pagamento_valor, a.pagamento_unidade, a.beneficios,
         a.cidade, a.bairro, a.status, a.criado_em, a.expira_em,
         count(c.perfil_id)::integer,
         (count(c.perfil_id) filter (where c.status = 'pendente' and c.aceita_em is null))::integer,
         (count(c.perfil_id) filter (where c.status = 'match'))::integer
    from public.anuncios a
    left join public.curtidas c on c.anuncio_id = a.id
   where a.autor_id = (select auth.uid())
   group by a.id
   order by (a.status in ('ativo', 'pausado', 'em_analise')) desc, a.criado_em desc
$$;


-- 5. E-mails dos avisos novos (e das entrevistas, que ainda não tinham) -----------------

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
  if new.tipo in ('etapa', 'seguindo', 'recomendacao', 'contratacao', 'entrevista', 'entrevista_resposta') then
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
    ('aceite_curriculo', 'usuarios', 17, 'Aceito: falta o currículo',
     'Quando quem publicou aceita a pessoa numa vaga que pede currículo e ela ainda não mandou. Assim que ela salvar o currículo, dá match sozinho.',
     array['nome', 'quem', 'titulo', 'link'],
     '{{quem}} aceitou você em “{{titulo}}”',
     'Oi, {{nome}}. Boa notícia!

{{quem}} aceitou você na vaga “{{titulo}}”. Falta só um passo: esta vaga pede currículo.

Mande o seu agora. Leva uns 3 minutos e, assim que você salvar, dá match: a conversa e o WhatsApp de vocês aparecem no Publike.',
     'Mandar meu currículo'),

    ('curriculo_recebido', 'usuarios', 18, 'Currículo recebido: deu match',
     'Quando a pessoa que foi aceita numa vaga que pede currículo manda o currículo. Aí dá match e o contato aparece para os dois.',
     array['nome', 'quem', 'titulo', 'link'],
     '{{quem}} mandou o currículo: deu match em “{{titulo}}”',
     'Oi, {{nome}}.

{{quem}}, que você aceitou na vaga “{{titulo}}”, mandou o currículo. Deu match: o contato de vocês já está liberado.

Veja o currículo e chame para conversar pelo Publike.',
     'Ver o currículo'),

    ('entrevista', 'usuarios', 19, 'Entrevista marcada, remarcada ou cancelada',
     'Quando quem publicou a vaga marca, remarca ou cancela a entrevista com a pessoa.',
     array['nome', 'quem', 'titulo', 'motivo', 'link'],
     'Entrevista: “{{titulo}}”',
     'Oi, {{nome}}.

{{motivo}}

Veja os detalhes no Publike. Com a entrevista marcada, é por lá que você confirma a presença ou pede outro horário.',
     'Ver a entrevista'),

    ('entrevista_resposta', 'usuarios', 20, 'Resposta do candidato à entrevista',
     'Quando o candidato confirma a entrevista ou pede outro horário.',
     array['nome', 'quem', 'titulo', 'motivo', 'link'],
     '{{quem}} respondeu sobre a entrevista de “{{titulo}}”',
     'Oi, {{nome}}.

{{motivo}}

Veja no quadro da vaga e, se precisar, remarque por lá.',
     'Abrir o quadro')
  ) as v (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do nothing;

notify pgrst, 'reload schema';
