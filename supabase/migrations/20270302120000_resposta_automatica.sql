-- =====================================================================
-- "Responde todas as curtidas" deixa claro quando a resposta foi automática.
--
-- resposta_de_quem_publica(ids) passa a devolver também:
--   * automaticas: a parte das respondidas sem ninguém clicar (contato direto,
--     automação, regra da empresa ou o Publike fechando depois de 48 h);
--   * diretas: a parte das respondidas pelo contato direto (aceita na hora).
-- (quem respondeu: migração 20270215120000_quem_respondeu_a_curtida.sql)
--
-- O site antigo continua funcionando com o banco novo (só lê taxa e horas), e o
-- site novo, sem esta migração, mostra o texto de antes. Pode rodar de novo.
-- =====================================================================

drop function if exists public.resposta_de_quem_publica(uuid[]);

create function public.resposta_de_quem_publica(p_autores uuid[])
returns table (autor_id uuid, taxa numeric, horas numeric, automaticas numeric, diretas numeric)
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
       and cu.criado_em > now() - interval '180 days'
       and (cu.status <> 'pendente' or cu.aceita_em is not null or cu.criado_em < now() - interval '3 days')
  )
  select c.autor_id,
         round(count(*) filter (where c.respondida)::numeric / count(*), 1) as taxa,
         round((percentile_cont(0.5) within group (order by c.horas)
                  filter (where c.respondida and c.horas is not null and c.horas >= 0))::numeric, 0) as horas,
         round(count(*) filter (where c.respondida and c.respondida_por in ('direto', 'automacao', 'regra', 'publike'))::numeric
               / greatest(count(*) filter (where c.respondida), 1), 1) as automaticas,
         round(count(*) filter (where c.respondida and c.respondida_por = 'direto')::numeric
               / greatest(count(*) filter (where c.respondida), 1), 1) as diretas
    from c
   group by c.autor_id
  having count(*) >= 5
$$;
revoke execute on function public.resposta_de_quem_publica(uuid[]) from public;
grant execute on function public.resposta_de_quem_publica(uuid[]) to anon, authenticated;
