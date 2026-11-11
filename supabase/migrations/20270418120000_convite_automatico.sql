-- O convite automático (claude/plano-convite-automatico-30-dias-e-anual.md, parte 4): o aviso "Chegou um candidato que
-- combina" continua grátis, com até 3 por dia. Com um plano (assinado ou por 30 dias) ou a liberação do Admin:
--   * o convite sai sozinho, ligado por vaga, com o recado da empresa (o convite de hoje: sem contato, e a pessoa
--     decide se curte);
--   * os avisos de quem combina vão até 30 por dia.
-- Para proteger quem procura: no máximo 2 convites automáticos por pessoa por semana, somando todas as empresas;
-- as regras do convite de hoje (currículo visível, região, sem quem curtiu, já foi convidado ou bloqueou, 3 por pessoa
-- em 30 dias por conta); o limite do dia da conta vale também para os automáticos; e "Não quero convites automáticos"
-- em Preferências. Pode rodar de novo.

-- a vaga com o convite ligado e o recado
create table if not exists public.convite_automatico_vagas (
  anuncio_id uuid primary key references public.anuncios(id) on delete cascade,
  ligado boolean not null default true,
  recado text check (recado is null or char_length(recado) <= 300),
  atualizado_em timestamptz not null default now()
);
alter table public.convite_automatico_vagas enable row level security;
revoke all on public.convite_automatico_vagas from public, anon, authenticated;

alter table public.convites_vaga add column if not exists automatico boolean not null default false;

-- quem não quer convites automáticos
create table if not exists privado.sem_convite_automatico (
  perfil_id uuid primary key references public.perfis(id) on delete cascade,
  desde timestamptz not null default now()
);
-- a liberação do Admin (sem plano)
create table if not exists privado.convite_automatico_contas (
  conta_id uuid primary key references public.perfis(id) on delete cascade,
  liberado_em timestamptz not null default now()
);
alter table privado.sem_convite_automatico enable row level security;
alter table privado.convite_automatico_contas enable row level security;
revoke all on privado.sem_convite_automatico, privado.convite_automatico_contas from public, anon, authenticated;

-- um plano que libera tudo valendo (assinatura, 30 dias ou a cortesia da agência), ou a liberação do Admin
create or replace function privado.convite_automatico_liberado(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privado.assinaturas a
                  where a.conta_id = p_conta and a.situacao = 'ativa' and privado.libera_tudo(a.recurso))
      or exists (select 1 from privado.cobrancas c
                  where c.conta_id = p_conta and c.situacao = 'paga' and privado.libera_tudo(c.recurso)
                    and c.periodo_ate + case when c.compra_id is null then interval '3 days' else interval '0' end > now())
      or exists (select 1 from privado.plano_agencia_cortesia x
                  where x.conta_id = p_conta and (x.ate is null or x.ate > now()))
      or exists (select 1 from privado.convite_automatico_contas x where x.conta_id = p_conta)
$$;
revoke execute on function privado.convite_automatico_liberado(uuid) from public;

-- ------------------------------------------------------------------ quem contrata

-- as vagas no ar da conta, cada uma com o convite ligado ou não, o recado e os números
create or replace function public.meus_convites_automaticos()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  eu uuid := (select public.conta_atual());
begin
  if eu is null then
    return null;
  end if;
  return jsonb_build_object(
    'liberado', privado.convite_automatico_liberado(eu),
    'vagas', coalesce((select jsonb_agg(jsonb_build_object(
               'id', a.id, 'titulo', a.titulo,
               'ligado', coalesce(c.ligado, false), 'recado', c.recado,
               'enviados', (select count(*) from public.convites_vaga v where v.anuncio_id = a.id and v.automatico),
               'curtiram', (select count(*) from public.convites_vaga v
                             where v.anuncio_id = a.id and v.automatico
                               and exists (select 1 from public.curtidas k
                                            where k.anuncio_id = v.anuncio_id and k.perfil_id = v.perfil_id)))
               order by a.criado_em desc)
             from public.anuncios a
             left join public.convite_automatico_vagas c on c.anuncio_id = a.id
            where a.autor_id = eu and a.tipo = 'vaga' and a.status = 'ativo' and a.preenchida_em is null), '[]'::jsonb));
end
$$;

create or replace function public.ligar_convite_automatico(p_anuncio uuid, p_ligado boolean, p_recado text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select public.conta_atual());
  v_recado text := nullif(btrim(regexp_replace(coalesce(p_recado, ''), '\s+', ' ', 'g')), '');
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  if not exists (select 1 from public.anuncios a where a.id = p_anuncio and a.autor_id = eu and a.tipo = 'vaga') then
    raise exception 'Só dá para ligar numa vaga sua.' using errcode = '42501';
  end if;
  if p_ligado and not privado.convite_automatico_liberado(eu) then
    raise exception 'O convite automático vem nos planos.' using errcode = 'P0001', hint = 'sem_plano';
  end if;
  if char_length(v_recado) > 300 then
    raise exception 'O recado pode ter até 300 caracteres.' using errcode = 'P0001';
  end if;
  if v_recado is not null and public.tem_contato(v_recado) then
    raise exception 'Tire o telefone, o e-mail ou o link do recado: o contato aparece no match.' using errcode = 'P0001';
  end if;
  insert into public.convite_automatico_vagas (anuncio_id, ligado, recado, atualizado_em)
  values (p_anuncio, coalesce(p_ligado, false), v_recado, now())
  on conflict (anuncio_id) do update set ligado = excluded.ligado, recado = excluded.recado, atualizado_em = now();
end
$$;

-- ------------------------------------------------------------------ quem procura

create or replace function public.recebo_convites_automaticos()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from privado.sem_convite_automatico s where s.perfil_id = (select auth.uid()))
$$;

create or replace function public.receber_convites_automaticos(p_sim boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if p_sim then
    delete from privado.sem_convite_automatico where perfil_id = (select auth.uid());
  else
    insert into privado.sem_convite_automatico (perfil_id) values ((select auth.uid())) on conflict do nothing;
  end if;
end
$$;

-- ------------------------------------------------------------------ o robô

-- as contas com o convite automático liberado e as vagas com o convite ligado
create or replace function public.servidor_convite_auto_contas(p_chave text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return coalesce((select jsonb_object_agg(q.conta, q.vagas)
                     from (select a.autor_id as conta,
                                  coalesce(jsonb_agg(a.id) filter (where c.ligado), '[]'::jsonb) as vagas
                             from public.anuncios a
                             left join public.convite_automatico_vagas c on c.anuncio_id = a.id
                            where a.tipo = 'vaga' and a.status = 'ativo' and a.preenchida_em is null
                              and a.expira_em > now()
                            group by a.autor_id
                           having privado.convite_automatico_liberado(a.autor_id)) q), '{}'::jsonb);
end
$$;

-- o convite que sai sozinho: confere tudo de novo e grava o convite (o mesmo texto do convite de hoje)
create or replace function public.servidor_convidar_sozinho(p_chave text, p_conta uuid, p_anuncio uuid, p_perfil uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.anuncios;
  c public.convite_automatico_vagas;
  quem text;
begin
  perform privado.exigir_servidor(p_chave);
  select * into a from public.anuncios x
   where x.id = p_anuncio and x.autor_id = p_conta and x.tipo = 'vaga' and x.status = 'ativo'
     and x.preenchida_em is null and x.expira_em > now();
  select * into c from public.convite_automatico_vagas where anuncio_id = p_anuncio;
  if a.id is null or not coalesce(c.ligado, false) or not privado.convite_automatico_liberado(p_conta) then
    return false;
  end if;
  if exists (select 1 from privado.sem_convite_automatico s where s.perfil_id = p_perfil) then
    return false;
  end if;
  -- uma pessoa de cada vez (os dois limites somam convites de várias contas)
  perform pg_advisory_xact_lock(hashtext('publike:convite_auto:' || p_perfil::text));
  if (select count(*) from public.convites_vaga v
       where v.perfil_id = p_perfil and v.automatico and v.criado_em > now() - interval '7 days') >= 2 then
    return false;
  end if;
  if privado.motivo_sem_convite(p_conta, p_anuncio, a.cidade, p_perfil) is not null then
    return false;
  end if;
  -- o limite do dia da conta vale também para os automáticos
  if (select count(*) from privado.limites_uso l
       where l.perfil_id = p_conta and l.acao = 'convite' and l.criado_em > now() - interval '24 hours')
     >= privado.limite_de_convites(p_conta) then
    return false;
  end if;
  insert into public.convites_vaga (anuncio_id, perfil_id, recado, automatico) values (p_anuncio, p_perfil, c.recado, true);
  insert into privado.limites_uso (perfil_id, acao) values (p_conta, 'convite');
  select p.nome into quem from public.perfis p where p.id = p_conta;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (p_perfil, 'convite', p_anuncio, p_conta,
          left(case when c.recado is null
                    then coalesce(quem, 'Uma empresa') || ' viu seu currículo e convidou você para a vaga “' || a.titulo
                         || '”. Veja os detalhes e, se tiver interesse, curta a vaga.'
                    else coalesce(quem, 'Uma empresa') || ' convidou você para a vaga “' || a.titulo || '”: “'
                         || c.recado || '”'
               end, 300));
  return true;
end
$$;

-- o aviso de quem combina: até 3 por dia; com o convite automático liberado, até 30
create or replace function public.servidor_avisar_talento(p_chave text, p_conta uuid, p_anuncio uuid, p_perfil uuid, p_texto text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  if not exists (select 1 from public.anuncios a
                  where a.id = p_anuncio and a.autor_id = p_conta and a.tipo = 'vaga' and a.status = 'ativo') then
    return false;
  end if;
  if exists (select 1 from privado.talentos_avisados t where t.anuncio_id = p_anuncio and t.perfil_id = p_perfil)
     or exists (select 1 from public.curtidas cu where cu.anuncio_id = p_anuncio and cu.perfil_id = p_perfil)
     or exists (select 1 from public.bloqueios b
                 where (b.perfil_id = p_conta and b.bloqueado_id = p_perfil)
                    or (b.perfil_id = p_perfil and b.bloqueado_id = p_conta))
     or (select count(*) from public.notificacoes n
          where n.destinatario_id = p_conta and n.tipo = 'talento_combina'
            and n.criado_em > now() - interval '24 hours')
        >= (case when privado.convite_automatico_liberado(p_conta) then 30 else 3 end) then
    return false;
  end if;
  insert into privado.talentos_avisados (anuncio_id, perfil_id) values (p_anuncio, p_perfil);
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto, link)
  values (p_conta, 'talento_combina', p_anuncio, p_perfil, left(p_texto, 300), '/talentos/' || p_perfil);
  return true;
end
$$;

revoke execute on function public.meus_convites_automaticos(), public.ligar_convite_automatico(uuid, boolean, text),
  public.recebo_convites_automaticos(), public.receber_convites_automaticos(boolean) from public, anon;
grant execute on function public.meus_convites_automaticos(), public.ligar_convite_automatico(uuid, boolean, text),
  public.recebo_convites_automaticos(), public.receber_convites_automaticos(boolean) to authenticated;
revoke execute on function public.servidor_convite_auto_contas(text), public.servidor_convidar_sozinho(text, uuid, uuid, uuid)
  from public;
grant execute on function public.servidor_convite_auto_contas(text), public.servidor_convidar_sozinho(text, uuid, uuid, uuid)
  to anon, authenticated, service_role;
