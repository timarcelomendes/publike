-- Muita procura e pouca vaga (22/11/2026; Marcelo: "aquelas vagas que tem muita procura e pouca vaga, também
-- interessa"). Até aqui só a procura sem nenhuma vaga ficava guardada (privado.procuras_sem_vaga, 20270822120000). Agora
-- toda busca por função no WhatsApp fica guardada do mesmo jeito: só a função, a cidade, a região e uma impressão de
-- quem procurou (para contar pessoas sem repetir). A oferta é contada na hora: as vagas no ar com a função no título
-- (privado.titulo_da_funcao). O Admin › Procuradas sem vaga mostra as funções com mais gente por vaga; o aviso às
-- empresas vem depois, com umas duas semanas de dados. Pode rodar de novo.

create table if not exists privado.procuras (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  dia date not null default (now() at time zone 'America/Sao_Paulo')::date,
  origem text not null default 'whatsapp' check (origem in ('whatsapp', 'site')),
  funcao text not null check (char_length(funcao) between 3 and 60),
  funcao_norma text not null,
  cidade text check (cidade is null or char_length(cidade) <= 60),
  regiao text check (regiao is null or char_length(regiao) <= 60),
  quem text not null
);
create unique index if not exists procuras_uma_por_dia on privado.procuras (quem, funcao_norma, dia);
create index if not exists procuras_criado_idx on privado.procuras (criado_em desc);
alter table privado.procuras enable row level security;
revoke all on privado.procuras from public, anon, authenticated;

-- o atendimento do WhatsApp registra as funções de cada busca (com vaga ou sem)
create or replace function public.servidor_registrar_procura(
  p_chave text, p_funcoes text[], p_cidade text, p_regiao text, p_quem text, p_origem text default 'whatsapp'
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  f text;
  n integer := 0;
  k integer;
begin
  perform privado.exigir_servidor(p_chave);
  if coalesce(btrim(p_quem), '') = '' then
    return 0;
  end if;
  foreach f in array coalesce(p_funcoes[1:3], '{}') loop
    f := left(regexp_replace(btrim(coalesce(f, '')), '\s+', ' ', 'g'), 60);
    continue when char_length(f) < 3;
    insert into privado.procuras (origem, funcao, funcao_norma, cidade, regiao, quem)
    values (case when p_origem = 'site' then 'site' else 'whatsapp' end, f, lower(public.sem_acento(f)),
            nullif(left(btrim(coalesce(p_cidade, '')), 60), ''), nullif(left(btrim(coalesce(p_regiao, '')), 60), ''),
            md5('procura|' || p_quem))
    on conflict do nothing;
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  -- de vez em quando, o que passou de 400 dias sai
  if random() < 0.01 then
    delete from privado.procuras where criado_em < now() - interval '400 days';
  end if;
  return n;
end
$$;
revoke execute on function public.servidor_registrar_procura(text, text[], text, text, text, text) from public;
grant execute on function public.servidor_registrar_procura(text, text[], text, text, text, text)
  to anon, authenticated, service_role;

-- O Admin: as funções procuradas nos últimos dias, com quantas pessoas, quantas vagas no ar com a função no título e
-- quantas pessoas por vaga (as com mais gente por vaga primeiro; sem vaga, no topo)
create or replace function public.admin_procura_e_oferta(p_dias integer default 14, p_minimo integer default 3)
returns table (funcao text, pessoas integer, vagas integer, por_vaga numeric, desde date)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  return query
  with p as (
    select r.funcao_norma,
           (array_agg(r.funcao order by r.criado_em desc))[1] as funcao,
           count(distinct r.quem)::integer as pessoas
      from privado.procuras r
     where r.criado_em > now() - make_interval(days => least(greatest(coalesce(p_dias, 14), 1), 90))
     group by r.funcao_norma
    having count(distinct r.quem) >= greatest(coalesce(p_minimo, 3), 1)
  ),
  v as (
    select p.funcao_norma,
           (select count(*)::integer from public.anuncios a
             where a.tipo = 'vaga' and a.status = 'ativo' and a.expira_em > now()
               and privado.titulo_da_funcao(a.titulo, p.funcao)) as vagas
      from p
  )
  select p.funcao, p.pessoas, v.vagas,
         case when v.vagas = 0 then null else round(p.pessoas::numeric / v.vagas, 1) end,
         (select min(r.dia) from privado.procuras r)
    from p join v on v.funcao_norma = p.funcao_norma
   order by (v.vagas = 0) desc, p.pessoas::numeric / greatest(v.vagas, 1) desc, p.pessoas desc
   limit 60;
end
$$;
revoke execute on function public.admin_procura_e_oferta(integer, integer) from public, anon, authenticated;
grant execute on function public.admin_procura_e_oferta(integer, integer) to service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270909120000_procura_e_oferta');
