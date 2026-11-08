-- O chat em cada match, no Admin › Curtidas (08/11/2026). Pode rodar de novo.
-- Para cada curtida: quando quem publicou (ou a equipe) escreveu no chat pela primeira vez, quando a pessoa escreveu
-- pela primeira vez, se ela respondeu depois da empresa, e quantas mensagens automáticas saíram. Só conta mensagem
-- escrita por gente (mensagens.automatica = false; as perguntas do match e as das automações são automáticas). Vale
-- a conversa da vaga e a conversa direta da dupla, desde a curtida. Só lê; só para o admin e a moderação.
-- Rode depois de 20270313120000_mensagens_das_automacoes.sql.

create or replace function public.admin_chat_das_curtidas(p_anuncios uuid[])
returns table (anuncio_id uuid, perfil_id uuid, empresa_escreveu_em timestamptz, pessoa_escreveu_em timestamptz,
               pessoa_respondeu_em timestamptz, empresa_respondeu_em timestamptz, humanas integer,
               automaticas integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not (privado.eh_admin() or public.eh_moderador()) then
    raise exception 'Só o admin e a moderação veem isso.' using errcode = '42501';
  end if;
  return query
  with c as (
    select cu.anuncio_id, cu.perfil_id, cu.criado_em, a.autor_id
      from public.curtidas cu join public.anuncios a on a.id = cu.anuncio_id
     where cu.anuncio_id = any ((coalesce(p_anuncios, '{}'))[1:1000]) and cu.status in ('match', 'desfeito')
  ), m as (
    select c.anuncio_id, c.perfil_id, x.autor_id = c.perfil_id as da_pessoa, x.automatica, x.criado_em
      from c
      join public.mensagens x
        on (x.anuncio_id = c.anuncio_id and x.perfil_id = c.perfil_id)
        or (x.conversa_id in (select cv.id from public.conversas cv
                               where (cv.conta_a = c.autor_id and cv.conta_b = c.perfil_id)
                                  or (cv.conta_b = c.autor_id and cv.conta_a = c.perfil_id))
            and x.criado_em >= c.criado_em)
  ), r as (
    select m.anuncio_id, m.perfil_id,
           min(m.criado_em) filter (where not m.da_pessoa and not m.automatica) as empresa_em,
           min(m.criado_em) filter (where m.da_pessoa) as pessoa_em,
           min(m.criado_em) filter (where not m.da_pessoa) as primeira_da_empresa,
           count(*) filter (where not m.automatica)::integer as humanas,
           count(*) filter (where m.automatica)::integer as automaticas
      from m group by m.anuncio_id, m.perfil_id
  )
  select r.anuncio_id, r.perfil_id, r.empresa_em, r.pessoa_em,
         -- a pessoa respondeu: escreveu depois da primeira mensagem do lado da empresa (gente ou automática)
         (select min(m.criado_em) from m where m.anuncio_id = r.anuncio_id and m.perfil_id = r.perfil_id
             and m.da_pessoa and m.criado_em > r.primeira_da_empresa),
         -- a empresa respondeu: alguém dela escreveu depois da primeira mensagem da pessoa
         (select min(m.criado_em) from m where m.anuncio_id = r.anuncio_id and m.perfil_id = r.perfil_id
             and not m.da_pessoa and not m.automatica and m.criado_em > r.pessoa_em),
         r.humanas, r.automaticas
    from r;
end
$$;
revoke execute on function public.admin_chat_das_curtidas(uuid[]) from public, anon;
grant execute on function public.admin_chat_das_curtidas(uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';
