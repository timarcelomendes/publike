-- Procuradas sem vaga: 30 dias e sem repetir (21/11/2026; Marcelo: "se juntou 3 pessoas nos últimos 30 dias, pode disparar
-- também"). A conta passa a ser dos últimos 30 dias (o "Dias para trás" do Admin continua mudando), e a mesma função só
-- volta a avisar a mesma conta quando aparece alguém novo procurando depois do último aviso dela: as mesmas pessoas não
-- fazem a empresa receber o mesmo aviso toda semana. Pode rodar de novo.

alter table privado.config_procuradas alter column dias set default 30;
update privado.config_procuradas set dias = 30, atualizado_em = now() where id and dias = 7;

create or replace function privado.procuradas_destinatarios(p_dias integer, p_minimo integer)
returns table (conta_id uuid, nome text, tipo text, anuncio_id uuid, funcoes text[], texto text)
language sql
stable
security definer
set search_path = ''
as $$
  with f as (
    select * from privado.procuradas_sem_vaga(p_dias, p_minimo)
  ),
  -- as empresas que já publicaram vaga da função (12 meses) e não têm vaga dela no ar
  empresas as (
    select a.autor_id as conta_id, f.funcao_norma, f.funcao, f.pessoas, f.cidades,
           (array_agg(a.id order by a.criado_em desc))[1] as anuncio_id
      from f
      join public.anuncios a on a.tipo = 'vaga' and a.criado_em > now() - interval '12 months'
                            and privado.titulo_da_funcao(a.titulo, f.funcao)
      join public.perfis p on p.id = a.autor_id and p.tipo in ('comercio', 'empresa')
     where (p.suspenso_ate is null or p.suspenso_ate <= now())
       and (cardinality(f.cidades) = 0 or a.cidade = any (f.cidades) or p.cidade = any (f.cidades))
       and not exists (select 1 from public.anuncios b
                        where b.autor_id = a.autor_id and b.tipo = 'vaga' and b.status = 'ativo' and b.expira_em > now()
                          and privado.titulo_da_funcao(b.titulo, f.funcao))
     group by a.autor_id, f.funcao_norma, f.funcao, f.pessoas, f.cidades
  ),
  -- as agências de emprego (todas as funções)
  agencias as (
    select p.id as conta_id, f.funcao_norma, f.funcao, f.pessoas, f.cidades, null::uuid as anuncio_id
      from f
      join public.perfis p on p.tipo = 'agencia'
     where (p.suspenso_ate is null or p.suspenso_ate <= now())
  ),
  todas_antes as (
    select e.*, 'empresa' as tipo from empresas e
    union all
    select g.*, 'agencia' from agencias g
  ),
  -- a mesma função só volta a avisar a mesma conta com alguém novo procurando depois do último aviso dela
  todas as (
    select t.* from todas_antes t
     where not exists (
       select 1 from privado.procuras_avisadas v
        where v.conta_id = t.conta_id
          and t.funcao_norma = any (select lower(public.sem_acento(x)) from unnest(v.funcoes) x)
          and v.criado_em >= (select max(p.criado_em) from privado.procuras_sem_vaga p where p.funcao_norma = t.funcao_norma))
  ),
  por_conta as (
    select t.conta_id, t.tipo,
           (array_agg(t.anuncio_id order by t.pessoas desc) filter (where t.anuncio_id is not null))[1] as anuncio_id,
           array_agg(t.funcao order by t.pessoas desc, t.funcao) as funcoes,
           jsonb_agg(jsonb_build_object('funcao', t.funcao, 'pessoas', t.pessoas) order by t.pessoas desc, t.funcao) as itens,
           (select array_agg(distinct c) from todas t2, unnest(t2.cidades) c where t2.conta_id = t.conta_id) as cidades
      from todas t
     group by t.conta_id, t.tipo
  )
  select c.conta_id, p.nome, c.tipo, c.anuncio_id, c.funcoes[1:5],
         case
           when c.tipo = 'agencia' then
             'Nos últimos ' || p_dias || ' dias, estas funções foram procuradas no Publike e não tinham vaga no ar: '
             || privado.lista_de_procuradas((select jsonb_agg(x) from (select x from jsonb_array_elements(c.itens) x limit 5) y))
             || '. Se vocês têm vagas assim, publiquem aqui: a vaga aparece para quem procura essa função perto de casa.'
           when jsonb_array_length(c.itens) = 1 then
             'Nos últimos ' || p_dias || ' dias, ' || (c.itens -> 0 ->> 'pessoas')
             || case when (c.itens -> 0 ->> 'pessoas')::integer = 1 then ' pessoa procurou' else ' pessoas procuraram' end
             || ' vaga de '
             || (c.itens -> 0 ->> 'funcao') || ' no Publike'
             || case when cardinality(c.cidades) between 1 and 2 then ', em ' || array_to_string(c.cidades, ' e ') else '' end
             || ', e não havia vaga de ' || (c.itens -> 0 ->> 'funcao') || ' no ar. Vocês já anunciaram essa vaga aqui: se'
             || ' estiverem contratando, publiquem de novo, com a vaga de antes já preenchida.'
           else
             'Nos últimos ' || p_dias || ' dias, pessoas procuraram no Publike vagas que vocês já anunciaram aqui, e não'
             || ' havia nenhuma no ar: '
             || privado.lista_de_procuradas((select jsonb_agg(x) from (select x from jsonb_array_elements(c.itens) x limit 5) y))
             || '. Se estiverem contratando, publiquem de novo, com a vaga de antes já preenchida.'
         end
    from por_conta c
    join public.perfis p on p.id = c.conta_id
   order by c.tipo desc, jsonb_array_length(c.itens) desc, p.nome
$$;


revoke all on function privado.procuradas_destinatarios(integer, integer) from public, anon, authenticated;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270823120000_procuradas_30_dias');
