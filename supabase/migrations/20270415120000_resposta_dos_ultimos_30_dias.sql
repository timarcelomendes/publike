-- "Responde todas as curtidas, em geral no mesmo dia" sem dizer mais do que é verdade (10/11/2026, pedido do Marcelo).
-- Rode depois de 20270414120000_cancelar_entrevista_em_video.sql. Pode rodar de novo.
--
-- resposta_de_quem_publica(ids):
--   * conta só as curtidas dos últimos 30 dias (antes, 180): o jeito de responder de hoje, não o de meses atrás;
--   * devolve também "parado": a conta (ou alguém da equipe da agência) não abre o Publike há mais de 7 dias. O site,
--     nesse caso, não diz "em geral no mesmo dia". Só o sim ou não, nada da data do acesso.
-- O site sem esta mudança continua funcionando (lê só o que já lia).

drop function if exists public.resposta_de_quem_publica(uuid[]);

create function public.resposta_de_quem_publica(p_autores uuid[])
returns table (autor_id uuid, taxa numeric, horas numeric, automaticas numeric, diretas numeric, parado boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select a.autor_id,
           (cu.status <> 'pendente' or cu.aceita_em is not null) as respondida,
           cu.respondida_por,
           extract(epoch from (coalesce(cu.aceita_em, cu.respondida_em) - cu.criado_em)) / 3600 as horas
      from public.curtidas cu
      join public.anuncios a on a.id = cu.anuncio_id
     where a.autor_id = any (p_autores[1:100])
       and a.tipo = 'vaga'
       and cu.criado_em > now() - interval '30 days'
       and (cu.status <> 'pendente' or cu.aceita_em is not null or cu.criado_em < now() - interval '3 days')
  ),
  -- o último acesso da conta e da equipe: o login (auth.users) ou a última página aberta (privado.aparelho_da_conta)
  quem as (
    select x.autor_id, x.autor_id as pessoa from (select distinct c.autor_id from c) x
    union
    select e.agencia_id, e.membro_id from public.equipe_agencia e
     where e.agencia_id in (select c.autor_id from c)
  ),
  acesso as (
    select q.autor_id,
           max(greatest(coalesce(u.last_sign_in_at, '-infinity'), coalesce(ap.visto_em, '-infinity'))) as em
      from quem q
      join auth.users u on u.id = q.pessoa
      left join privado.aparelho_da_conta ap on ap.conta_id = q.pessoa
     group by q.autor_id
  )
  select c.autor_id,
         round(count(*) filter (where c.respondida)::numeric / count(*), 1) as taxa,
         round((percentile_cont(0.5) within group (order by c.horas)
                  filter (where c.respondida and c.horas is not null and c.horas >= 0))::numeric, 0) as horas,
         round(count(*) filter (where c.respondida and c.respondida_por in ('direto', 'automacao', 'regra', 'publike'))::numeric
               / greatest(count(*) filter (where c.respondida), 1), 1) as automaticas,
         round(count(*) filter (where c.respondida and c.respondida_por = 'direto')::numeric
               / greatest(count(*) filter (where c.respondida), 1), 1) as diretas,
         coalesce((select ac.em from acesso ac where ac.autor_id = c.autor_id), '-infinity') < now() - interval '7 days'
           as parado
    from c
   group by c.autor_id
  having count(*) >= 5
$$;
revoke execute on function public.resposta_de_quem_publica(uuid[]) from public;
grant execute on function public.resposta_de_quem_publica(uuid[]) to anon, authenticated;

notify pgrst, 'reload schema';
