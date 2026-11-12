-- Impulso pelo admin (11/11/2026, pedido do Marcelo: "quero impulsionar gratuitamente, pra ver o retorno. Criar no
-- admin"). Em Admin › Impulsos, o admin escolhe a vaga de qualquer cliente, os dias e quanto vai para o Google; o robô
-- cuida como de um impulso pago. Origem nova 'admin': não gasta o impulso grátis do cliente, não cobra nada e, se a
-- vaga sair do ar antes do fim, os dias que faltam não viram crédito (era um teste do Publike).

alter table privado.impulsos drop constraint if exists impulsos_origem_check;
alter table privado.impulsos add constraint impulsos_origem_check
  check (origem in ('compra', 'credito', 'cortesia', 'admin'));

-- as vagas no ar para impulsionar: pelo título ou pelo nome de quem publicou; as paradas primeiro
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
  perform privado.exigir_admin();
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
  perform privado.exigir_admin();
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

-- parar um impulso pelo admin: antes de entrar no ar, devolve (sem cobrança, nada a estornar); no ar, o robô tira do
-- Google na próxima volta
create or replace function public.admin_parar_impulso(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  i privado.impulsos;
begin
  perform privado.exigir_admin();
  select * into i from privado.impulsos where id = p_id for update;
  if i.id is null or i.situacao not in ('pago', 'em_revisao', 'no_ar') then
    return jsonb_build_object('erro', 'Este impulso já terminou.');
  end if;
  if i.situacao = 'no_ar' then
    update privado.impulsos set pausar = true, motivo = 'Parado pelo admin.' where id = p_id;
    return jsonb_build_object('ok', true);
  end if;
  return privado.impulso_devolver(p_id, 'Parado pelo admin.');
end
$$;

-- a vaga saiu do ar no meio: os dias que faltam viram crédito, menos no impulso do admin (era um teste do Publike)
create or replace function public.servidor_impulso_pausado(p_chave text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i privado.impulsos;
  v_dias integer;
begin
  perform privado.exigir_servidor(p_chave);
  select * into i from privado.impulsos where id = p_id and pausar and situacao in ('pago', 'em_revisao', 'no_ar')
    for update;
  if i.id is null then
    return;
  end if;
  v_dias := case when i.situacao = 'no_ar' then ceil(extract(epoch from (i.ate - now())) / 86400)::integer else i.dias end;
  update privado.impulsos
     set situacao = case when i.origem = 'admin' then 'encerrado' else 'credito' end,
         pausar = false, encerrado_em = now(),
         campanha_removida = campanha_removida or campanha_id is null,
         motivo = coalesce(i.motivo, 'A vaga saiu do ar ou foi preenchida.')
   where id = p_id;
  if v_dias >= 1 and i.origem <> 'admin' then
    insert into privado.creditos_impulso (conta_id, dias, verba, de_impulso)
    values (i.conta_id, least(v_dias, i.dias), greatest(round(i.verba * least(v_dias, i.dias) / i.dias, 2), 1), i.id);
    perform privado.avisar_pagamento(i.conta_id,
      'A vaga "' || left(i.titulo, 80) || '" saiu do ar, e o anúncio no Google parou. ' || least(v_dias, i.dias)
      || case when least(v_dias, i.dias) = 1 then ' dia ficou' else ' dias ficaram' end
      || ' como crédito para impulsionar outra vaga até ' || privado.data_br(now() + interval '90 days') || '.',
      '/painel/anuncios');
  end if;
end
$$;

revoke execute on function public.admin_vagas_para_impulso(text), public.admin_impulsionar(uuid, integer, numeric, boolean),
  public.admin_parar_impulso(uuid) from public, anon, authenticated;
grant execute on function public.admin_vagas_para_impulso(text), public.admin_impulsionar(uuid, integer, numeric, boolean),
  public.admin_parar_impulso(uuid) to service_role;
-- como as outras do servidor: a chave do servidor (p_chave) é quem protege
revoke execute on function public.servidor_impulso_pausado(text, uuid) from public;
grant execute on function public.servidor_impulso_pausado(text, uuid) to anon, authenticated, service_role;
