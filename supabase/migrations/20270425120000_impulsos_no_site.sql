-- Admin › Impulsos também no site no ar (11/11/2026, pedido do Marcelo: "Admin no site"). Como as outras telas do
-- Admin no site (migração 20270327120000): sem a chave secreta, com a conta que entrou, e só para a equipe publike.org
-- (e-mail @publike.org confirmado e liberado em Admin › Moderadores › Painel no site). O admin do computador do dono
-- continua como antes. Cada impulso, parada e mudança de preço feita pelo site fica no registro da equipe.
-- Pode rodar de novo.

create or replace function privado.exigir_impulsos_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike mexe nos impulsos.' using errcode = '42501';
  end if;
end
$$;

insert into privado.telas_do_admin (rota, somente_publike) values ('/admin/impulsos', true)
on conflict (rota) do nothing;


create or replace function public.admin_impulsos()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mes timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  perform privado.exigir_impulsos_admin();
  return jsonb_build_object(
    'precos', coalesce((select jsonb_agg(jsonb_build_object('dias', p.dias, 'valor', p.valor, 'verba', p.verba,
                                                            'ligado', p.ligado) order by p.dias)
                          from privado.precos_impulso p), '[]'::jsonb),
    'config', (select to_jsonb(c) - 'id' - 'alerta_erro_em' from privado.config_impulso c where c.id),
    'mes', jsonb_build_object(
      'entrou', coalesce((select sum(k.valor) from privado.compras_avulsas k
                           where k.tipo = 'impulso' and k.situacao = 'paga' and k.paga_em >= v_mes), 0),
      'verba', coalesce((select sum(i.verba) from privado.impulsos i
                          where i.criado_em >= v_mes and i.situacao not in ('devolvido')), 0),
      'gasto', coalesce((select sum(d.custo) from privado.impulso_dias d where d.dia >= v_mes::date), 0),
      'impulsos', (select count(*) from privado.impulsos i where i.criado_em >= v_mes)),
    'impulsos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'conta', p.nome, 'conta_id', i.conta_id, 'anuncio_id', i.anuncio_id, 'titulo', i.titulo,
        'situacao', i.situacao, 'origem', i.origem, 'dias', i.dias, 'valor', i.valor, 'verba', i.verba,
        'gasto', i.gasto, 'campanha_id', i.campanha_id, 'criado_em', i.criado_em, 'aprovado_em', i.aprovado_em,
        'ate', i.ate, 'pausar', i.pausar, 'erro', i.ultimo_erro, 'erro_desde', i.erro_desde, 'motivo', i.motivo,
        'sandbox', i.sandbox,
        'totais', (select jsonb_build_object('impressoes', coalesce(sum(d.impressoes), 0),
                                             'cliques', coalesce(sum(d.cliques), 0),
                                             'visitas', coalesce(sum(d.visitas), 0),
                                             'curtidas', coalesce(sum(d.curtidas), 0))
                     from privado.impulso_dias d where d.impulso_id = i.id))
        order by i.criado_em desc)
      from (select * from privado.impulsos order by criado_em desc limit 100) i
      join public.perfis p on p.id = i.conta_id), '[]'::jsonb));
end
$$;


create or replace function public.admin_salvar_impulso(p_precos jsonb, p_config jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l jsonb;
begin
  perform privado.exigir_impulsos_admin();
  for l in select * from jsonb_array_elements(coalesce(p_precos, '[]'::jsonb)) loop
    update privado.precos_impulso
       set valor = (l ->> 'valor')::numeric, verba = (l ->> 'verba')::numeric, ligado = (l ->> 'ligado')::boolean
     where dias = (l ->> 'dias')::smallint;
  end loop;
  if p_config is not null then
    update privado.config_impulso
       set cortesia_ligada = coalesce((p_config ->> 'cortesia_ligada')::boolean, cortesia_ligada),
           cortesia_dias = coalesce((p_config ->> 'cortesia_dias')::smallint, cortesia_dias),
           cortesia_verba = coalesce((p_config ->> 'cortesia_verba')::numeric, cortesia_verba),
           raio_capital = coalesce((p_config ->> 'raio_capital')::smallint, raio_capital),
           raio_outras = coalesce((p_config ->> 'raio_outras')::smallint, raio_outras)
     where id;
  end if;
  perform privado.registrar('precos_impulso', 'config', 'impulso', 'Preços e regras do impulso',
                            jsonb_build_object('precos', p_precos, 'config', p_config));
end
$$;


create or replace function public.admin_vagas_para_impulso(p_busca text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  termo text := nullif(trim(coalesce(p_busca, '')), '');
begin
  perform privado.exigir_impulsos_admin();
  return coalesce((select jsonb_agg(x order by x.parada desc, x.curtidas, x.criado_em) from (
    select a.id, a.titulo, a.bairro, a.cidade, a.criado_em, p.nome as conta,
           (select count(*) from public.curtidas c where c.anuncio_id = a.id) as curtidas,
           privado.vaga_parada(a.id) as parada,
           exists (select 1 from privado.impulsos i
                    where i.anuncio_id = a.id and i.situacao in ('pago', 'em_revisao', 'no_ar')) as impulsionada
      from public.anuncios a
      join public.perfis p on p.id = a.autor_id
     where a.tipo = 'vaga' and a.status = 'ativo' and a.preenchida_em is null
       and (termo is null
            or public.sem_acento(a.titulo) ilike '%' || public.sem_acento(termo) || '%'
            or public.sem_acento(p.nome) ilike '%' || public.sem_acento(termo) || '%')
     order by privado.vaga_parada(a.id) desc, a.criado_em desc
     limit 30) x), '[]'::jsonb);
end
$$;


create or replace function public.admin_impulsionar(p_anuncio uuid, p_dias integer, p_verba numeric, p_avisar boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.anuncios;
  v_motivo text;
  v_id uuid;
begin
  perform privado.exigir_impulsos_admin();
  if p_dias is null or p_dias < 1 or p_dias > 30 then
    return jsonb_build_object('erro', 'O impulso vai de 1 a 30 dias.');
  end if;
  if p_verba is null or p_verba < 1 or p_verba > 1000 then
    return jsonb_build_object('erro', 'A verba vai de R$ 1 a R$ 1.000.');
  end if;
  select * into a from public.anuncios where id = p_anuncio;
  if a.id is null then
    return jsonb_build_object('erro', 'Não achamos a vaga.');
  end if;
  perform pg_advisory_xact_lock(hashtext('impulso:' || a.autor_id));
  v_motivo := privado.impulso_motivo_vaga(a.autor_id, p_anuncio);
  if v_motivo is not null then
    return jsonb_build_object('erro', v_motivo);
  end if;
  insert into privado.impulsos (conta_id, anuncio_id, titulo, origem, dias, valor, verba)
  values (a.autor_id, p_anuncio, a.titulo, 'admin', p_dias, 0, round(p_verba, 2))
  returning id into v_id;
  perform privado.registrar('impulsionar', 'anuncio', p_anuncio::text, left(a.titulo, 120),
                            jsonb_build_object('dias', p_dias, 'verba', round(p_verba, 2), 'avisar', p_avisar));
  if p_avisar then
    perform privado.avisar_pagamento(a.autor_id,
      'O Publike vai impulsionar a vaga "' || left(a.titulo, 80) || '" no Google por ' || p_dias
      || case when p_dias = 1 then ' dia' else ' dias' end
      || ', sem custo para você. Depois que o Google aprovar o anúncio, acompanhe quantos viram, clicaram e curtiram.',
      '/painel/impulsionar/' || p_anuncio);
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end
$$;


create or replace function public.admin_parar_impulso(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  i privado.impulsos;
begin
  perform privado.exigir_impulsos_admin();
  select * into i from privado.impulsos where id = p_id for update;
  if i.id is null or i.situacao not in ('pago', 'em_revisao', 'no_ar') then
    return jsonb_build_object('erro', 'Este impulso já terminou.');
  end if;
  perform privado.registrar('parar_impulso', 'anuncio', i.anuncio_id::text, left(i.titulo, 120),
                            jsonb_build_object('situacao', i.situacao, 'origem', i.origem));
  if i.situacao = 'no_ar' then
    update privado.impulsos set pausar = true, motivo = 'Parado pelo admin.' where id = p_id;
    return jsonb_build_object('ok', true);
  end if;
  return privado.impulso_devolver(p_id, 'Parado pelo admin.');
end
$$;

revoke execute on function public.admin_impulsos(), public.admin_salvar_impulso(jsonb, jsonb),
  public.admin_vagas_para_impulso(text), public.admin_impulsionar(uuid, integer, numeric, boolean),
  public.admin_parar_impulso(uuid) from public, anon;
grant execute on function public.admin_impulsos(), public.admin_salvar_impulso(jsonb, jsonb),
  public.admin_vagas_para_impulso(text), public.admin_impulsionar(uuid, integer, numeric, boolean),
  public.admin_parar_impulso(uuid) to authenticated, service_role;
revoke execute on function privado.exigir_impulsos_admin() from public;
