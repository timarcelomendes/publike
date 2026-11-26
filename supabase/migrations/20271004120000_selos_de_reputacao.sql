-- Os selos de reputação de quem publica vaga (25/11/2026; Marcelo: "Preciso dar destaque aos anúncios das empresas,
-- agências e anunciantes que respondem rápido, tem boa reputação"; escolhas "Selo e sobe na lista" e, para quem anuncia
-- como pessoa, sem CNPJ, "Histórico no Publike"). O selo de verificada continua só para CNPJ. Pode rodar de novo.
--
-- Uma conta só por anunciante (privado.selos_calculados), refeita pelo robô das filas a cada meia hora para quem tem
-- vaga no ar (privado.selos_das_contas). Dela sai tudo:
--   - "Responde rápido": quem se candidatou confirma ("A empresa te respondeu?": 7 de cada 10 dizem sim, com 3
--     respostas ou mais, nos últimos 90 dias), ou quem publicou responde 7 de cada 10 candidaturas pelo Publike, em
--     geral em até 2 dias, a maior parte com alguém clicando (o contato direto aceita sozinho e não conta), e entra
--     pelo menos uma vez por semana;
--   - "Bem avaliada": nota do processo seletivo 4,5 ou mais, com 3 avaliações ou mais;
--   - "Contratou pelo Publike": quem foi contratado confirmou que começou (a conquista), e quem publicou não negou;
--   - sem selo nenhum: com vaga no ar e o "Ainda está aberta?" sem resposta (só o "Responde rápido"), com denúncia
--     confirmada nos últimos 90 dias ou com a conta suspensa;
--   - quem tem selo sobe no "Mais relevantes" (os pontos da vaga: +50% com o "Responde rápido", +25% com o "Bem
--     avaliada", +10% com o "Contratou"); a linha do tempo soma pontos no site (src/lib/relevancia.ts);
--   - o painel mostra os números e o que falta (public.meus_selos, ao vivo).

-- 1. Os selos guardados ----------------------------------------------------------------------------------------------

create table if not exists privado.selos_das_contas (
  conta_id uuid primary key references public.perfis (id) on delete cascade,
  responde_rapido boolean not null default false,
  -- de onde veio o "Responde rápido": quem se candidatou confirmou (pessoas) ou as respostas pelo Publike (painel)
  responde_por text check (responde_por in ('pessoas', 'painel')),
  bem_avaliada boolean not null default false,
  nota numeric,
  avaliacoes integer not null default 0,
  contratou integer not null default 0,
  calculado_em timestamptz not null default now()
);
alter table privado.selos_das_contas enable row level security;
revoke all on privado.selos_das_contas from public, anon, authenticated;

-- 2. A conta de cada anunciante (ao vivo) ------------------------------------------------------------------------------

create or replace function privado.selos_calculados(p_conta uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sim integer := 0;
  v_nao integer := 0;
  v_medida boolean := false;
  v_taxa numeric;
  v_horas numeric;
  v_automaticas numeric;
  v_parado boolean;
  v_sem_resposta integer := 0;
  v_denuncia boolean := false;
  v_suspensa boolean := false;
  v_nota numeric;
  v_avaliacoes integer := 0;
  v_contratou integer := 0;
  v_pessoas boolean;
  v_painel boolean;
  v_perde boolean;
begin
  -- "A empresa te respondeu?" (migração 20270526120000): o que quem se candidatou disse, nos últimos 90 dias
  select count(*) filter (where t.resposta = 'sim'), count(*) filter (where t.resposta = 'ainda_nao')
    into v_sim, v_nao
    from privado.te_respondeu t
    join public.anuncios a on a.id = t.anuncio_id
   where a.autor_id = p_conta and t.respondida_em > now() - interval '90 days';
  -- as respostas pelo Publike (30 dias, com 5 curtidas ou mais)
  select true, x.taxa, x.horas, x.automaticas, x.parado
    into v_medida, v_taxa, v_horas, v_automaticas, v_parado
    from public.resposta_de_quem_publica(array[p_conta]) x
   limit 1;
  v_medida := coalesce(v_medida, false);
  -- as vagas no ar com o "Ainda está aberta?" sem resposta há 3 dias ou mais (migração 20271003120000)
  select count(*) into v_sem_resposta
    from public.anuncios a
   where a.autor_id = p_conta and a.tipo = 'vaga' and a.status = 'ativo' and a.preenchida_em is null
     and privado.vaga_sem_resposta(a.id);
  select exists (
           select 1 from public.denuncias d join public.anuncios a on a.id = d.anuncio_id
            where a.autor_id = p_conta and d.status = 'procedente' and d.criado_em > now() - interval '90 days'),
         coalesce((select pf.suspenso_ate > now() from public.perfis pf where pf.id = p_conta), false)
    into v_denuncia, v_suspensa;
  select n.media, coalesce(n.total, 0) into v_nota, v_avaliacoes from public.nota_do_processo(p_conta) n;
  -- quem começou a trabalhar e confirmou (a conquista), sem a empresa negar
  select count(distinct c.perfil_id) into v_contratou
    from public.conquistas c
    join public.anuncios a on a.id = c.anuncio_id
   where a.autor_id = p_conta and c.resposta = 'comecei' and c.empresa is distinct from 'negou';

  v_pessoas := v_sim + v_nao >= 3 and v_sim >= 0.7 * (v_sim + v_nao);
  v_painel := v_medida and v_taxa >= 0.7 and v_horas is not null and v_horas <= 48
              and coalesce(v_automaticas, 0) < 0.5 and not coalesce(v_parado, false);
  v_perde := v_denuncia or v_suspensa;

  return jsonb_build_object(
    'responde_rapido', (v_pessoas or v_painel) and not v_perde and v_sem_resposta = 0,
    'responde_por', case when v_perde or v_sem_resposta > 0 then null
                         when v_pessoas then 'pessoas' when v_painel then 'painel' end,
    'bem_avaliada', v_avaliacoes >= 3 and coalesce(v_nota, 0) >= 4.5 and not v_perde,
    'nota', v_nota,
    'avaliacoes', v_avaliacoes,
    'contratou', case when v_perde then 0 else v_contratou end,
    -- os números para o painel
    'te_sim', v_sim,
    'te_ainda_nao', v_nao,
    'resposta_taxa', v_taxa,
    'resposta_horas', v_horas,
    'resposta_automaticas', v_automaticas,
    'parado', v_parado,
    'sem_resposta', v_sem_resposta,
    'denuncia', v_denuncia,
    'suspensa', v_suspensa,
    'contratou_total', v_contratou
  );
end
$$;

-- 3. O robô das filas: refaz os selos de quem tem vaga no ar, no máximo a cada meia hora -----------------------------

create or replace function privado.calcular_selos()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_conta uuid;
  j jsonb;
  n integer := 0;
begin
  for v_conta in
    select distinct a.autor_id from public.anuncios a where a.tipo = 'vaga' and a.status = 'ativo'
  loop
    j := privado.selos_calculados(v_conta);
    insert into privado.selos_das_contas as s
      (conta_id, responde_rapido, responde_por, bem_avaliada, nota, avaliacoes, contratou, calculado_em)
    values (v_conta, (j->>'responde_rapido')::boolean, j->>'responde_por', (j->>'bem_avaliada')::boolean,
            (j->>'nota')::numeric, (j->>'avaliacoes')::integer, (j->>'contratou')::integer, now())
    on conflict (conta_id) do update
      set responde_rapido = excluded.responde_rapido, responde_por = excluded.responde_por,
          bem_avaliada = excluded.bem_avaliada, nota = excluded.nota, avaliacoes = excluded.avaliacoes,
          contratou = excluded.contratou, calculado_em = excluded.calculado_em;
    n := n + 1;
  end loop;
  -- quem não tem mais vaga no ar sai (o selo é de quem está contratando)
  delete from privado.selos_das_contas s
   where not exists (select 1 from public.anuncios a where a.autor_id = s.conta_id and a.tipo = 'vaga' and a.status = 'ativo');
  return n;
end
$$;

create or replace function public.servidor_calcular_selos(p_chave text, p_agora boolean default false)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  -- o robô chama a cada minuto: a conta vale por meia hora
  if not coalesce(p_agora, false)
     and coalesce((select max(s.calculado_em) from privado.selos_das_contas s), '-infinity') > now() - interval '30 minutes' then
    return 0;
  end if;
  -- duas filas ao mesmo tempo: só uma refaz
  if not pg_try_advisory_xact_lock(hashtext('publike:calcular_selos')) then
    return 0;
  end if;
  return privado.calcular_selos();
end
$$;

-- 4. O que o site lê ----------------------------------------------------------------------------------------------------

-- os selos de quem publicou cada vaga (o cartão, a linha do tempo e a página da vaga); só quem tem algum selo
create or replace function public.selos_das_vagas(p_ids uuid[])
returns table (anuncio_id uuid, responde_rapido boolean, responde_por text, bem_avaliada boolean, nota numeric,
               avaliacoes integer, contratou integer)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, s.responde_rapido, s.responde_por, s.bem_avaliada, s.nota, s.avaliacoes, s.contratou
    from public.anuncios a
    join privado.selos_das_contas s on s.conta_id = a.autor_id
   where a.id = any (p_ids[1:200])
     and a.tipo = 'vaga'
     and (s.responde_rapido or s.bem_avaliada or s.contratou > 0)
$$;

-- os selos de cada conta (o perfil)
create or replace function public.selos_das_contas(p_contas uuid[])
returns table (conta_id uuid, responde_rapido boolean, responde_por text, bem_avaliada boolean, nota numeric,
               avaliacoes integer, contratou integer)
language sql
stable
security definer
set search_path = ''
as $$
  select s.conta_id, s.responde_rapido, s.responde_por, s.bem_avaliada, s.nota, s.avaliacoes, s.contratou
    from privado.selos_das_contas s
   where s.conta_id = any (p_contas[1:200])
     and (s.responde_rapido or s.bem_avaliada or s.contratou > 0)
$$;

-- o painel: a conta de quem está no painel, ao vivo, com os números do que falta
create or replace function public.meus_selos()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_conta uuid := public.conta_atual();
begin
  if v_conta is null then
    return null;
  end if;
  return privado.selos_calculados(v_conta)
         || jsonb_build_object('vagas_no_ar', (select count(*) from public.anuncios a
                                                where a.autor_id = v_conta and a.tipo = 'vaga' and a.status = 'ativo'));
end
$$;

-- 5. Quem tem selo sobe no "Mais relevantes" ---------------------------------------------------------------------------

create or replace function privado.pontos_do_anuncio(p_anuncio uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (pontos
          -- os selos de quem publicou (migração 20271004120000)
          * coalesce((select 1 + case when s.responde_rapido then 0.5 else 0 end
                               + case when s.bem_avaliada then 0.25 else 0 end
                               + case when s.contratou > 0 then 0.1 else 0 end
                        from public.anuncios a
                        join privado.selos_das_contas s on s.conta_id = a.autor_id
                       where a.id = p_anuncio), 1)
          -- o "Ainda está aberta?" sem resposta (migração 20271003120000)
          / case when privado.vaga_sem_resposta(p_anuncio) then 4 else 1 end)::integer
    from (select (select count(*) from public.curtidas c
                   where c.anuncio_id = p_anuncio and c.criado_em > now() - interval '30 days')::integer * 5
               + (select count(*) from privado.aberturas_anuncio b
                   where b.anuncio_id = p_anuncio
                     and b.dia > (now() at time zone 'America/Sao_Paulo')::date - 30)::integer as pontos) x
$$;

-- 6. As permissões ----------------------------------------------------------------------------------------------------

revoke execute on function privado.selos_calculados(uuid), privado.calcular_selos() from public, anon, authenticated;
revoke execute on function
  public.servidor_calcular_selos(text, boolean),
  public.selos_das_vagas(uuid[]),
  public.selos_das_contas(uuid[]),
  public.meus_selos()
from public;
grant execute on function public.selos_das_vagas(uuid[]), public.selos_das_contas(uuid[]) to anon, authenticated;
revoke execute on function public.meus_selos() from anon;
grant execute on function public.meus_selos() to authenticated;
grant execute on function public.servidor_calcular_selos(text, boolean) to anon, authenticated, service_role;

-- a primeira conta já agora (o robô refaz a cada meia hora)
select privado.calcular_selos();

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20271004120000_selos_de_reputacao');
