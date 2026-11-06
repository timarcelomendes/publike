-- Só pelo chat do Publike, ou chat e WhatsApp (06/11/2026; claude/plano-so-chat-ou-whatsapp.md): quem publica a vaga
-- escolhe como os candidatos falam com ele depois do match. 'ambos' (o de sempre): o chat e o WhatsApp, o telefone e
-- o e-mail de quem publicou. 'chat': só o chat do Publike; o contato de quem publicou não sai para os candidatos desta
-- vaga (quem publica continua vendo o de quem curtiu). As vagas de antes ficam 'ambos'. Rode depois de
-- 20270220120000_pergunta_do_match_ao_entrar.sql. Pode rodar de novo.

-- 1. A escolha na vaga ----------------------------------------------------------------------------------------------
alter table public.anuncios add column if not exists contato_por text not null default 'ambos';
alter table public.anuncios drop constraint if exists anuncios_contato_por_check;
alter table public.anuncios add constraint anuncios_contato_por_check check (contato_por in ('ambos', 'chat'));
grant insert (contato_por), update (contato_por) on public.anuncios to authenticated;

-- 2. Candidaturas: o contato de quem publicou só na vaga 'ambos' (e o so_chat, para a tela dizer "pelo chat") ------
drop function if exists public.minhas_curtidas();
create function public.minhas_curtidas()
returns table (
  anuncio_id uuid,
  titulo text,
  tipo text,
  categoria text,
  regime text,
  pagamento_valor numeric,
  pagamento_unidade text,
  beneficios text,
  cidade text,
  bairro text,
  anuncio_status text,
  expira_em timestamptz,
  autor_id uuid,
  autor_nome text,
  autor_tipo text,
  autor_foto text,
  status text,
  mensagem text,
  curtido_em timestamptz,
  respondida_em timestamptz,
  autor_whatsapp text,
  autor_email text,
  so_chat boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.titulo, a.tipo, a.categoria, a.regime,
         a.pagamento_valor, a.pagamento_unidade, a.beneficios,
         a.cidade, a.bairro,
         case when a.status = 'ativo' and a.expira_em <= now() then 'expirado' else a.status end,
         a.expira_em, p.id, p.nome, p.tipo, p.foto,
         c.status, c.mensagem, c.criado_em, c.respondida_em,
         case when c.status = 'match' and a.status <> 'em_analise' and a.contato_por <> 'chat' then ct.whatsapp end,
         case when c.status = 'match' and a.status <> 'em_analise' and a.contato_por <> 'chat' then ct.email end,
         a.contato_por = 'chat'
    from public.curtidas c
    join public.anuncios a on a.id = c.anuncio_id
    join public.perfis p on p.id = a.autor_id
    left join public.contatos ct on ct.perfil_id = p.id
   where c.perfil_id = (select auth.uid())
     and a.status <> 'removido'
     and (p.suspenso_ate is null or p.suspenso_ate <= now())
     and not (select public.minha_conta_suspensa())
   order by c.criado_em desc
$$;
revoke execute on function public.minhas_curtidas() from public, anon;
grant execute on function public.minhas_curtidas() to authenticated;

-- 3. Matches: do lado de quem curtiu, o contato de quem publicou só na vaga 'ambos' ---------------------------------
drop function if exists public.meus_matches();
create function public.meus_matches()
returns table (
  anuncio_id uuid,
  anuncio_titulo text,
  anuncio_tipo text,
  papel text,
  outro_id uuid,
  outro_nome text,
  outro_tipo text,
  outro_foto text,
  outro_cidade text,
  outro_bairro text,
  outro_whatsapp text,
  outro_email text,
  match_em timestamptz,
  so_chat boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from (
    -- quem publicou vê o contato de quem curtiu (a vaga só pelo chat esconde só o de quem publicou)
    select a.id, a.titulo, a.tipo, 'publiquei'::text,
           p.id, p.nome, p.tipo, p.foto, p.cidade, p.bairro, ct.whatsapp, ct.email,
           coalesce(c.respondida_em, c.criado_em) as quando, false
      from public.curtidas c
      join public.anuncios a on a.id = c.anuncio_id
      join public.perfis p on p.id = c.perfil_id
      left join public.contatos ct on ct.perfil_id = p.id
     where c.status = 'match' and a.autor_id = (select auth.uid())
       and a.status not in ('em_analise', 'removido')
       and (p.suspenso_ate is null or p.suspenso_ate <= now())
    union all
    select a.id, a.titulo, a.tipo, 'curti'::text,
           p.id, p.nome, p.tipo, p.foto, p.cidade, p.bairro,
           case when a.contato_por <> 'chat' then ct.whatsapp end,
           case when a.contato_por <> 'chat' then ct.email end,
           coalesce(c.respondida_em, c.criado_em) as quando, a.contato_por = 'chat'
      from public.curtidas c
      join public.anuncios a on a.id = c.anuncio_id
      join public.perfis p on p.id = a.autor_id
      left join public.contatos ct on ct.perfil_id = p.id
     where c.status = 'match' and c.perfil_id = (select auth.uid())
       and a.status not in ('em_analise', 'removido')
       and (p.suspenso_ate is null or p.suspenso_ate <= now())
  ) m
  where not (select public.minha_conta_suspensa())
  order by m.quando desc
$$;
revoke execute on function public.meus_matches() from public, anon;
grant execute on function public.meus_matches() to authenticated;

-- 4. A pergunta ao entrar: os matches só pelo chat entram (sem o WhatsApp; a pergunta oferece abrir a conversa) -------
create or replace function public.match_para_perguntar()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'anuncio_id', c.anuncio_id,
           'titulo', a.titulo,
           'tipo', a.tipo,
           'direto', a.contato_direto,
           'autor_id', p.id,
           'autor_nome', p.nome,
           'whatsapp', case when a.contato_por = 'chat' then null else ct.whatsapp end,
           'so_chat', a.contato_por = 'chat')
    from public.curtidas c
    join public.anuncios a on a.id = c.anuncio_id
    join public.perfis p on p.id = a.autor_id
    left join public.contatos ct on ct.perfil_id = p.id
   where c.perfil_id = (select auth.uid())
     and c.status = 'match'
     and (a.contato_por = 'chat' or ct.whatsapp is not null)
     -- o anúncio no ar (a vaga preenchida ou vencida não pede conversa)
     and a.status = 'ativo' and a.expira_em > now() and a.preenchida_em is null
     and (p.suspenso_ate is null or p.suspenso_ate <= now())
     and not (select public.minha_conta_suspensa())
     and not privado.ha_bloqueio(a.autor_id, c.perfil_id)
     and not exists (select 1 from privado.matches_perguntados x
                      where x.anuncio_id = c.anuncio_id and x.perfil_id = c.perfil_id)
     -- a pessoa já falou: mandou mensagem no chat ou tocou no contato de quem publicou
     and not exists (select 1 from public.mensagens m
                      where m.anuncio_id = c.anuncio_id and m.perfil_id = c.perfil_id and m.autor_id = c.perfil_id)
     and not exists (select 1 from privado.historico_etapas h
                      where h.anuncio_id = c.anuncio_id and h.perfil_id = c.perfil_id
                        and h.o_que like 'contato\_pessoa:%')
   order by coalesce(c.respondida_em, c.criado_em) desc
   limit 1
$$;
revoke execute on function public.match_para_perguntar() from public, anon;
grant execute on function public.match_para_perguntar() to authenticated;

-- 5. O aviso do match na vaga só pelo chat (com contato direto): "a conversa já está aberta no chat" ------------------
create or replace function public.notificar_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_titulo text;
  v_tipo text;
  v_direto boolean;
  v_chat boolean;
  quem text;
  dono uuid;
begin
  if new.status = 'match' and old.status is distinct from 'match' then
    select a.titulo, a.tipo, a.contato_direto, a.contato_por = 'chat', p.nome, p.id
      into v_titulo, v_tipo, v_direto, v_chat, quem, dono
      from public.anuncios a join public.perfis p on p.id = a.autor_id
     where a.id = new.anuncio_id;
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    values (new.perfil_id, 'match', new.anuncio_id, dono,
            case when v_direto and new.respondida_em > now() - interval '1 minute'
                      and (select auth.uid()) is distinct from dono and v_chat
                 then 'Deu match em “' || v_titulo || '”! A conversa com ' || coalesce(quem, 'quem publicou')
                      || ' já está aberta no chat do Publike.'
                 when v_direto and new.respondida_em > now() - interval '1 minute'
                      and (select auth.uid()) is distinct from dono
                 then 'Deu match! O contato de ' || coalesce(quem, 'quem publicou') || ' em “' || v_titulo
                      || '” já está liberado. Chame no WhatsApp.'
                 when v_tipo = 'servico'
                 then 'Deu match! ' || coalesce(quem, 'O profissional') || ' aceitou seu pedido em “' || v_titulo
                      || '”. Agora é só conversar.'
                 else 'Deu match! ' || coalesce(quem, 'Quem publicou') || ' curtiu você de volta em “' || v_titulo
                      || '”. Agora é só conversar.'
            end);
  end if;
  return null;
end
$$;

notify pgrst, 'reload schema';
