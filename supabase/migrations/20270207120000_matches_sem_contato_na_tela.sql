-- Matches sem contato: a tela mostra o que acontece (04/11/2026; claude/plano-match-no-chat.md, parte 2, a correção).
-- A prévia de Admin › Retorno passa a separar os matches das vagas de contato direto (curtir já é o match e o
-- WhatsApp é liberado: o contato pode ter sido por lá), mostrar quantas perguntas já foram mandadas e respondidas
-- (no lugar de só "quem ainda falta") e marcar as empresas que nunca entraram no Publike. O envio não muda: o botão
-- continua perguntando e avisando como antes. Pode rodar de novo.

create or replace function public.admin_matches_sem_contato()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform privado.exigir_admin();
  with m as (
    select s.*, a.contato_direto, q.situacao as pergunta,
           not exists (select 1 from auth.users u where u.id = s.conta and u.last_sign_in_at is not null) as nunca_entrou
      from privado.matches_sem_contato() s
      join public.anuncios a on a.id = s.anuncio_id
      left join privado.perguntas_do_match q on q.anuncio_id = s.anuncio_id and q.perfil_id = s.perfil_id),
  c as (
    select m.conta, count(*) as quantos,
           count(*) filter (where m.contato_direto) as direto,
           count(*) filter (where m.perguntavel) as perguntaveis,
           count(*) filter (where m.pergunta = 'respondido') as responderam,
           bool_or(m.nunca_entrou) as nunca_entrou,
           (select max(n.criado_em) from public.notificacoes n
             where n.destinatario_id = m.conta and n.tipo = 'matches_sem_contato') as avisada_em
      from m group by m.conta),
  -- as perguntas que o botão já mandou ("Ainda tem interesse em …?")
  r as (
    select count(*) filter (where q.situacao in ('perguntando', 'respondido')) as mandadas,
           count(*) filter (where q.situacao = 'respondido') as responderam,
           count(*) filter (where q.situacao = 'montar') as na_fila
      from privado.perguntas_do_match q where q.origem = 'retomada')
  select jsonb_build_object(
    'contas', (select count(*) from c),
    'matches', (select count(*) from m),
    -- a empresa aceitou e não chamou (fora do contato direto)
    'aceitos', (select count(*) from m where not m.contato_direto),
    'contas_aceitos', (select count(distinct m.conta) from m where not m.contato_direto),
    'direto', (select count(*) from m where m.contato_direto),
    'nunca_entraram', (select count(*) from c where c.nunca_entrou),
    'perguntas', (select count(*) from m where m.perguntavel),
    'mandadas', (select r.mandadas from r),
    'responderam', (select r.responderam from r),
    'na_fila', (select r.na_fila from r),
    'prontas', (select count(*) from c where c.avisada_em is null or c.avisada_em < now() - interval '7 days'),
    'exemplos', coalesce((
      select jsonb_agg(jsonb_build_object('nome', p.nome, 'quantos', x.quantos, 'direto', x.direto,
                                          'perguntaveis', x.perguntaveis, 'responderam', x.responderam,
                                          'nunca_entrou', x.nunca_entrou, 'avisada_em', x.avisada_em)
                       order by x.quantos desc, p.nome)
        from (select * from c order by c.quantos desc limit 8) x
        join public.perfis p on p.id = x.conta), '[]'::jsonb))
    into v;
  return v;
end
$$;
revoke execute on function public.admin_matches_sem_contato() from public, anon;
grant execute on function public.admin_matches_sem_contato() to authenticated, service_role;

notify pgrst, 'reload schema';
