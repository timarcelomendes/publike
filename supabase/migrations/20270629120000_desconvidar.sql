-- Desconvidar: quem convidou alguém para uma vaga sua pode desfazer o convite enquanto a pessoa ainda não curtiu.
-- Some o convite e o aviso do sino da pessoa (o e-mail ou o WhatsApp que já saiu não volta). O convite desfeito fica
-- guardado: o convite automático não manda de novo para a mesma vaga, e ele conta no limite de 3 convites em 30 dias
-- para a mesma pessoa (convidar e desconvidar não vira um jeito de mandar avisos sem fim). O convite gasto no limite
-- do dia também não volta.

create table if not exists privado.convites_desfeitos (
  id bigint generated always as identity primary key,
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  conta_id uuid not null references public.perfis (id) on delete cascade,
  convidado_em timestamptz not null,
  automatico boolean not null default false,
  desfeito_em timestamptz not null default now()
);
create index if not exists convites_desfeitos_perfil_idx on privado.convites_desfeitos (perfil_id, desfeito_em);
create index if not exists convites_desfeitos_anuncio_idx on privado.convites_desfeitos (anuncio_id, perfil_id);
alter table privado.convites_desfeitos enable row level security;
revoke all on privado.convites_desfeitos from public, anon, authenticated;

-- desfazer o convite: só quem é dono da vaga, e só enquanto a pessoa não curtiu
create or replace function public.desconvidar(p_anuncio uuid, p_perfil uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta uuid := (select public.conta_atual());
  v public.convites_vaga;
begin
  if v_conta is null then
    raise exception 'Entre na sua conta.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.anuncios a where a.id = p_anuncio and a.autor_id = v_conta and a.tipo = 'vaga') then
    raise exception 'Só dá para desfazer convite de uma vaga sua.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.curtidas k where k.anuncio_id = p_anuncio and k.perfil_id = p_perfil) then
    raise exception 'Esta pessoa já curtiu a vaga: o convite não dá mais para desfazer.' using errcode = 'P0001';
  end if;
  delete from public.convites_vaga cv
   where cv.anuncio_id = p_anuncio and cv.perfil_id = p_perfil
  returning * into v;
  if v.anuncio_id is null then
    return; -- já não havia convite (desfeito em outra aba): nada a fazer
  end if;
  insert into privado.convites_desfeitos (anuncio_id, perfil_id, conta_id, convidado_em, automatico)
  values (p_anuncio, p_perfil, v_conta, v.criado_em, v.automatico);
  delete from public.notificacoes n
   where n.destinatario_id = p_perfil and n.tipo = 'convite' and n.anuncio_id = p_anuncio and n.ator_id = v_conta;
end
$$;

revoke execute on function public.desconvidar(uuid, uuid) from public, anon;
grant execute on function public.desconvidar(uuid, uuid) to authenticated;

-- o convite desfeito conta no limite de 3 convites em 30 dias para a mesma pessoa
create or replace function privado.motivo_sem_convite(p_conta uuid, p_anuncio uuid, p_cidade text, p_perfil uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (
      select 1 from public.curriculo_visivel v join public.perfis p on p.id = v.perfil_id
       where v.perfil_id = p_perfil and p.tipo = 'pessoa'
         and (lower(p.cidade) = lower(p_cidade)
              or exists (select 1 from public.curriculo_na_vitrine n where n.perfil_id = p_perfil))
         and (p.suspenso_ate is null or p.suspenso_ate < now())
    ) or privado.ha_bloqueio(p_conta, p_perfil) then 'fora'
    when exists (select 1 from public.curtidas k where k.anuncio_id = p_anuncio and k.perfil_id = p_perfil) then 'curtiu'
    when exists (select 1 from public.convites_vaga cv where cv.anuncio_id = p_anuncio and cv.perfil_id = p_perfil) then 'convidado'
    when (select count(*) from public.convites_vaga cv join public.anuncios a on a.id = cv.anuncio_id
           where a.autor_id = p_conta and cv.perfil_id = p_perfil and cv.criado_em > now() - interval '30 days')
       + (select count(*) from privado.convites_desfeitos d
           where d.conta_id = p_conta and d.perfil_id = p_perfil and d.convidado_em > now() - interval '30 days') >= 3
     and not exists (select 1 from public.curtidas k join public.anuncios a on a.id = k.anuncio_id
                      where a.autor_id = p_conta and k.perfil_id = p_perfil and k.criado_em > now() - interval '30 days')
      then 'muitos'
    else null
  end
$$;

-- o convite automático não manda de novo o convite que a empresa desfez para a mesma vaga
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
  if exists (select 1 from privado.sem_convite_automatico s where s.perfil_id = p_perfil)
     or exists (select 1 from privado.convites_desfeitos d where d.anuncio_id = p_anuncio and d.perfil_id = p_perfil) then
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

select privado.migracao_aplicada('20270629120000_desconvidar');
