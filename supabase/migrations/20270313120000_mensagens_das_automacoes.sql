-- As mensagens das automações saem marcadas como automáticas (08/11/2026). Pode rodar de novo.
-- Antes, a mensagem da automação "ao mover para uma etapa" e a das Automações personalizadas (regras) saíam como se
-- alguém da empresa tivesse escrito: contavam como resposta humana na reputação, no Retorno das empresas e no
-- "esperando" do admin, e anotavam "conversou com" na atividade da equipe. Agora levam mensagens.automatica = true (o
-- chat mostra "Mensagem automática"), como as perguntas do match. As antigas também são marcadas (pelo registro das
-- automações e das regras, no mesmo minuto, com o texto da empresa).
-- Rode depois de 20270312120000_documentos_admissao.sql.

-- 1. A marca: enquanto privado.mandar_mensagem_automatica manda, a mensagem nasce automática ----------------------
create or replace function privado.marcar_mensagem_automatica()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('publike.mensagem_automatica', true) = 'on' then
    new.automatica := true;
  end if;
  return new;
end
$$;
drop trigger if exists mensagens_marca_automatica on public.mensagens;
create trigger mensagens_marca_automatica before insert on public.mensagens
  for each row execute function privado.marcar_mensagem_automatica();

create or replace function privado.mandar_mensagem_automatica(p_anuncio uuid, p_perfil uuid, p_texto text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform set_config('publike.mensagem_automatica', 'on', true);
  begin
    v_id := public.enviar_mensagem(p_anuncio, p_perfil, p_texto);
  exception when others then
    perform set_config('publike.mensagem_automatica', '', true);
    raise;
  end;
  perform set_config('publike.mensagem_automatica', '', true);
  return v_id;
end
$$;
revoke all on function privado.mandar_mensagem_automatica(uuid, uuid, text), privado.marcar_mensagem_automatica()
  from public, anon, authenticated;

-- 2. As duas que mandam mensagem pela empresa (as definições de agora, com a marca) -----------------------------
CREATE OR REPLACE FUNCTION public.automacao_mensagem_ao_mover(p_anuncio uuid, p_perfis uuid[], p_etapa text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.anuncios := privado.minha_vaga_para_automacao(p_anuncio);
  v_modelo text;
  v_empresa text;
  v_sub uuid;
  r record;
  n integer := 0;
begin
  if p_etapa ~ '^sub:[0-9a-f-]{36}$' then
    v_sub := substr(p_etapa, 5)::uuid;
  elsif p_etapa not in ('analise', 'entrevista', 'contratado') then
    return 0;
  end if;
  select m.texto into v_modelo
    from public.automacoes_vaga x
    join public.modelos_mensagem m on m.id::text = x.mensagens ->> p_etapa
   where x.anuncio_id = a.id;
  if v_modelo is null then
    return 0;
  end if;
  select p.nome into v_empresa from public.perfis p where p.id = a.autor_id;
  for r in
    select c.perfil_id, p.nome
      from public.curtidas c
      join public.perfis p on p.id = c.perfil_id
      join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
     where c.anuncio_id = a.id and c.perfil_id = any (coalesce(p_perfis, '{}')) and c.status = 'match'
       and (case when v_sub is null then e.etapa = p_etapa else e.subetapa = v_sub end)
  loop
    insert into privado.automacoes_feitas (anuncio_id, perfil_id, regra, detalhe)
    values (a.id, r.perfil_id, 'mensagem', p_etapa)
    on conflict do nothing;
    if found then
      perform privado.mandar_mensagem_automatica(a.id, r.perfil_id,
        left(replace(replace(replace(v_modelo, '{nome}', coalesce(nullif(split_part(r.nome, ' ', 1), ''), r.nome)),
                             '{vaga}', a.titulo), '{empresa}', coalesce(v_empresa, '')), 2000));
      n := n + 1;
    end if;
  end loop;
  return n;
end
$function$;

CREATE OR REPLACE FUNCTION privado.regra_mandar(p_anuncio uuid, p_perfil uuid, p_texto text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.anuncios;
  v_nome text;
  v_texto text;
  v_status text;
begin
  select * into a from public.anuncios x where x.id = p_anuncio;
  select p.nome into v_nome from public.perfis p where p.id = p_perfil;
  select c.status into v_status from public.curtidas c where c.anuncio_id = p_anuncio and c.perfil_id = p_perfil;
  v_texto := replace(replace(replace(p_texto,
               '{nome}', coalesce(nullif(split_part(v_nome, ' ', 1), ''), 'tudo bem')),
               '{vaga}', a.titulo),
               '{empresa}', coalesce((select e.nome from public.perfis e where e.id = a.autor_id), 'a empresa'));
  if v_status = 'match' then
    perform privado.mandar_mensagem_automatica(p_anuncio, p_perfil, left(v_texto, 2000));
    return 'conversa';
  elsif v_status = 'pendente' then
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    values (p_perfil, 'candidatura_recebida', p_anuncio, a.autor_id, left(v_texto, 300));
    return 'recado';
  end if;
  return 'pulada';
end
$function$;

-- 3. As antigas: a mensagem da empresa no mesmo minuto em que a automação ou a regra mandou ---------------------
update public.mensagens m set automatica = true
  from privado.automacoes_feitas f
  join public.anuncios a on a.id = f.anuncio_id
 where f.regra = 'mensagem' and not m.automatica
   and m.anuncio_id = f.anuncio_id and m.perfil_id = f.perfil_id and m.autor_id = a.autor_id
   and m.criado_em between f.feito_em - interval '5 seconds' and f.feito_em + interval '1 minute';

update public.mensagens m set automatica = true
  from privado.regras_feitas f
  join public.anuncios a on a.id = f.anuncio_id
 where not m.automatica and f.feitas::text like '%conversa%'
   and m.anuncio_id = f.anuncio_id and m.perfil_id = f.perfil_id and m.autor_id = a.autor_id
   and m.criado_em between f.feito_em - interval '5 seconds' and f.feito_em + interval '1 minute';

update public.mensagens m set automatica = true
  from privado.regras_agendadas g
  join public.anuncios a on a.id = g.anuncio_id
 where not m.automatica and g.feita_em is not null
   and m.anuncio_id = g.anuncio_id and m.perfil_id = g.perfil_id and m.autor_id = a.autor_id
   and m.criado_em between g.feita_em - interval '5 seconds' and g.feita_em + interval '1 minute';
