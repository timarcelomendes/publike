-- A pergunta do match ao entrar (06/11/2026): quem tem match com o WhatsApp de quem publicou liberado vê, no primeiro
-- acesso depois do match, "Deu match! Quer falar agora com X?" (a mesma pergunta que aparece na hora da curtida com
-- contato direto). Uma vez por match: a pergunta feita (na hora ou ao entrar) fica marcada. Vale para os matches que
-- já existem (a primeira vez que a pessoa entrar) e para os novos, inclusive os que a empresa aceitou com a pessoa
-- fora do site. Fica de fora o match em que a pessoa já falou (mandou mensagem no chat ou tocou no contato) e o de
-- anúncio que saiu do ar. Rode depois de 20270219120000_contato_nas_curtidas.sql. Pode rodar de novo.

create table if not exists privado.matches_perguntados (
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  perguntado_em timestamptz not null default now(),
  primary key (anuncio_id, perfil_id)
);
alter table privado.matches_perguntados enable row level security;
revoke all on privado.matches_perguntados from public, anon, authenticated;

-- o match mais novo ainda sem a pergunta, de quem curtiu (null: nenhum). O WhatsApp de quem publicou só vem com o
-- match (o mesmo de minhas_curtidas).
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
           'whatsapp', ct.whatsapp)
    from public.curtidas c
    join public.anuncios a on a.id = c.anuncio_id
    join public.perfis p on p.id = a.autor_id
    join public.contatos ct on ct.perfil_id = p.id
   where c.perfil_id = (select auth.uid())
     and c.status = 'match'
     and ct.whatsapp is not null
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

-- a pergunta apareceu (na hora da curtida ou ao entrar): não aparece de novo para este match
create or replace function public.marcar_match_perguntado(p_anuncio uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into privado.matches_perguntados (anuncio_id, perfil_id)
  select c.anuncio_id, c.perfil_id
    from public.curtidas c
   where c.anuncio_id = p_anuncio and c.perfil_id = (select auth.uid()) and c.status = 'match'
  on conflict (anuncio_id, perfil_id) do nothing
$$;
revoke execute on function public.marcar_match_perguntado(uuid) from public, anon;
grant execute on function public.marcar_match_perguntado(uuid) to authenticated;

notify pgrst, 'reload schema';
