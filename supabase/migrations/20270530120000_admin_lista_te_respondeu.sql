-- Admin › Retorno: a lista de "A empresa te respondeu?" (15/11/2026, Marcelo: "quero uma visao compreensível disso").
-- Cada pergunta feita nos últimos N dias: quem perguntou (o nome curto), a vaga, a empresa, a resposta e quando, e se a
-- empresa já recebeu o aviso de que a pessoa ainda espera. A tela junta por empresa. Só o admin (service_role).
-- Pode rodar de novo.

create or replace function public.admin_lista_te_respondeu(p_dias integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'anuncio_id', t.anuncio_id,
           'perfil_id', t.perfil_id,
           'titulo', a.titulo,
           'empresa_id', a.autor_id,
           'empresa', pa.nome,
           'pessoa', coalesce(privado.nome_da_conquista(pp.nome), 'Candidato'),
           'perguntas', t.perguntas,
           'perguntada_em', t.perguntada_em,
           'resposta', t.resposta,
           'respondida_em', t.respondida_em,
           'empresa_avisada_em', t.empresa_avisada_em)
         order by t.perguntada_em desc), '[]'::jsonb)
    from privado.te_respondeu t
    join public.anuncios a on a.id = t.anuncio_id
    left join public.perfis pa on pa.id = a.autor_id
    left join public.perfis pp on pp.id = t.perfil_id
   where t.perguntada_em >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 365)))
$$;
revoke execute on function public.admin_lista_te_respondeu(integer) from public, anon, authenticated;
grant execute on function public.admin_lista_te_respondeu(integer) to service_role;

notify pgrst, 'reload schema';
