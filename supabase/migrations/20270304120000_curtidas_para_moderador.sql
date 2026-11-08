-- =====================================================================
-- Admin › Curtidas também pelo site no ar (para a moderação, com login).
--
-- O admin completo só abre no computador do dono (a chave secreta nunca vai
-- para a hospedagem). Esta função entrega à moderação as mesmas curtidas da
-- tela do admin: só responde para quem está em public.moderadores, só lê e
-- traz no máximo 500 curtidas (as mais novas, desde p_desde).
-- Usa: a coluna respondida_por (20270215120000), o último acesso
-- (20270213120000) e os toques de contato (20270219120000).
-- Pode rodar de novo.
-- =====================================================================

create or replace function public.moderacao_curtidas(p_desde timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.eh_moderador() then
    raise exception 'Só a moderação vê as curtidas.' using errcode = '42501';
  end if;
  return (
    with c as (
      select cu.anuncio_id, cu.perfil_id, cu.status, cu.aceita_em, cu.respondida_em, cu.criado_em, cu.respondida_por
        from public.curtidas cu
       where p_desde is null or cu.criado_em >= p_desde
       order by cu.criado_em desc
       limit 500
    ),
    a as (
      select an.id, an.titulo, an.tipo, an.autor_id, an.status, an.preenchida_em, an.expira_em, an.atualizado_em,
             (select count(*) from public.curtidas x where x.anuncio_id = an.id) as curtidas
        from public.anuncios an
       where an.id in (select c.anuncio_id from c)
    ),
    ids as (
      select c.perfil_id as id from c
      union
      select a.autor_id from a
    ),
    p as (
      select pe.id, pe.nome, pe.tipo, pe.bairro,
             nullif(greatest(coalesce(u.last_sign_in_at, '-infinity'), coalesce(ap.visto_em, '-infinity')),
                    '-infinity') as acesso
        from public.perfis pe
        join ids on ids.id = pe.id
        left join auth.users u on u.id = pe.id
        left join privado.aparelho_da_conta ap on ap.conta_id = pe.id
    ),
    t as (
      select distinct on (h.anuncio_id, h.perfil_id, split_part(h.o_que, ':', 1))
             h.anuncio_id, h.perfil_id,
             case when h.o_que like 'contato_pessoa:%' then 'pessoa' else 'empresa' end as lado,
             split_part(h.o_que, ':', 2) as canal, h.em
        from privado.historico_etapas h
       where h.anuncio_id in (select a.id from a)
         and (h.o_que like 'contato:%' or h.o_que like 'contato_pessoa:%')
       order by h.anuncio_id, h.perfil_id, split_part(h.o_que, ':', 1), h.em desc
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'criado_em', c.criado_em,
             'status', c.status,
             'aceita_em', c.aceita_em,
             'respondida_em', c.respondida_em,
             'respondida_por', c.respondida_por,
             'curtiu', (select jsonb_build_object('id', p.id, 'nome', p.nome, 'tipo', p.tipo, 'bairro', p.bairro,
                                                  'acesso', p.acesso) from p where p.id = c.perfil_id),
             'anuncio', (select jsonb_build_object('id', a.id, 'titulo', a.titulo, 'tipo', a.tipo, 'status', a.status,
                                                   'preenchida_em', a.preenchida_em, 'expira_em', a.expira_em,
                                                   'atualizado_em', a.atualizado_em, 'curtidas', a.curtidas,
                                                   'autor_id', a.autor_id) from a where a.id = c.anuncio_id),
             'publicou', (select jsonb_build_object('id', p.id, 'nome', p.nome, 'tipo', p.tipo, 'acesso', p.acesso)
                            from a join p on p.id = a.autor_id where a.id = c.anuncio_id),
             'contato_empresa', (select jsonb_build_object('canal', t.canal, 'em', t.em) from t
                                  where t.anuncio_id = c.anuncio_id and t.perfil_id = c.perfil_id and t.lado = 'empresa'),
             'contato_pessoa', (select jsonb_build_object('canal', t.canal, 'em', t.em) from t
                                 where t.anuncio_id = c.anuncio_id and t.perfil_id = c.perfil_id and t.lado = 'pessoa')
           ) order by c.criado_em desc), '[]'::jsonb)
      from c
  );
end
$$;
revoke execute on function public.moderacao_curtidas(timestamptz) from public, anon;
grant execute on function public.moderacao_curtidas(timestamptz) to authenticated;

notify pgrst, 'reload schema';
