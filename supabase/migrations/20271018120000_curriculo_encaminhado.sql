-- Encaminhar o currículo pelo WhatsApp (claude/plano-concentrar-contratacoes.md, parte 1; 28/11/2026, Marcelo:
-- "Pode fazer tudo"). Quem contrata recebe currículo no WhatsApp dela (indicação, grupo, Instagram) e encaminha para o
-- WhatsApp do Publike. O Publike reconhece a conta pelo número, lê o currículo (sem guardar o arquivo nem o contato),
-- pergunta para qual vaga e cria o convite do Candidato de fora (migração 20261019290000). A empresa recebe a mensagem
-- pronta para encaminhar à pessoa: o Publike não escreve para ela, o contato é da empresa.
--
-- 1. privado.curriculos_encaminhados: o currículo lido, esperando a escolha da vaga (6 horas).
-- 2. servidor_whatsapp_vagas_da_conta: a conta que contrata do número da conversa e as vagas no ar (até 10).
-- 3. servidor_whatsapp_guardar_encaminhado e servidor_whatsapp_convite_de_fora: guardar e criar o convite.
-- 4. convites_candidato.origem: 'painel' (o de antes) ou 'whatsapp'.

-- 1. O currículo esperando a vaga ---------------------------------------------------------------------------------

create table if not exists privado.curriculos_encaminhados (
  id uuid primary key default gen_random_uuid(),
  conversa text not null,
  conta uuid not null references public.perfis (id) on delete cascade,
  nome text not null,
  curriculo jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists curriculos_encaminhados_conversa on privado.curriculos_encaminhados (conversa, criado_em desc);
revoke all on privado.curriculos_encaminhados from public, anon, authenticated;

alter table public.convites_candidato add column if not exists origem text not null default 'painel';
alter table public.convites_candidato drop constraint if exists convites_candidato_origem_check;
alter table public.convites_candidato add constraint convites_candidato_origem_check check (origem in ('painel', 'whatsapp'));

-- 2. A conta do número e as vagas no ar ----------------------------------------------------------------------------

-- A conta que contrata deste número (empresa, comércio ou agência) e as vagas dela no ar, as mais novas primeiro.
-- Sem conta que contrata: {"conta": null}, e o atendimento segue como antes (o currículo é da própria pessoa).
create or replace function public.servidor_whatsapp_vagas_da_conta(p_chave text, p_conversa text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_numero text;
  v_conta uuid;
  v_nome text;
  v_tipo text;
begin
  perform privado.exigir_servidor(p_chave);
  select c.numero into v_numero from privado.whatsapp_conversas c where c.chave = p_conversa;
  if v_numero is null then
    return jsonb_build_object('conta', null);
  end if;
  v_conta := privado.conta_do_celular(v_numero);
  select p.nome, p.tipo into v_nome, v_tipo from public.perfis p where p.id = v_conta;
  if v_conta is null or v_tipo is null or v_tipo not in ('empresa', 'comercio', 'agencia') then
    return jsonb_build_object('conta', null);
  end if;
  return jsonb_build_object(
    'conta', v_conta,
    'nome', v_nome,
    'tipo', v_tipo,
    'total', (select count(*) from public.anuncios a
               where a.autor_id = v_conta and a.tipo = 'vaga' and a.status = 'ativo'
                 and a.expira_em > now() and a.preenchida_em is null),
    'vagas', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'titulo', x.titulo, 'cliente', x.cliente) order by x.criado_em desc)
        from (select a.id, a.titulo, a.criado_em,
                     case when a.contratante_confidencial then null else nullif(btrim(a.contratante), '') end as cliente
                from public.anuncios a
               where a.autor_id = v_conta and a.tipo = 'vaga' and a.status = 'ativo'
                 and a.expira_em > now() and a.preenchida_em is null
               order by a.criado_em desc
               limit 10) x), '[]'::jsonb));
end
$$;

-- 3. Guardar o currículo e criar o convite -------------------------------------------------------------------------

create or replace function public.servidor_whatsapp_guardar_encaminhado(
  p_chave text, p_conversa text, p_conta uuid, p_nome text, p_curriculo jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform privado.exigir_servidor(p_chave);
  if p_curriculo is not null and (jsonb_typeof(p_curriculo) <> 'object' or octet_length(p_curriculo::text) > 20000) then
    raise exception 'currículo inválido' using errcode = '22023';
  end if;
  -- os que passaram da hora saem (o currículo lido não fica guardado à toa)
  delete from privado.curriculos_encaminhados e where e.criado_em < now() - interval '6 hours';
  insert into privado.curriculos_encaminhados (conversa, conta, nome, curriculo)
  values (p_conversa, p_conta, left(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), 80), p_curriculo)
  returning id into v_id;
  return v_id;
end
$$;

-- O convite do Candidato de fora para o currículo que espera a vaga (o mais recente da conversa, ou o `p_encaminhado`).
-- As regras do painel: a vaga da conta, no ar, até 50 convites esperando por vaga e 60 por dia.
create or replace function public.servidor_whatsapp_convite_de_fora(
  p_chave text, p_conversa text, p_anuncio uuid, p_encaminhado uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e privado.curriculos_encaminhados;
  a public.anuncios;
  v_numero text;
  v_token text;
  v_quem text;
begin
  perform privado.exigir_servidor(p_chave);
  select * into e from privado.curriculos_encaminhados x
   where x.conversa = p_conversa and x.criado_em > now() - interval '6 hours'
     and (p_encaminhado is null or x.id = p_encaminhado)
   order by x.criado_em desc
   limit 1
     for update;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'sem_curriculo');
  end if;
  -- quem toca é a mesma conta que encaminhou
  select c.numero into v_numero from privado.whatsapp_conversas c where c.chave = p_conversa;
  if privado.conta_do_celular(v_numero) is distinct from e.conta then
    return jsonb_build_object('ok', false, 'erro', 'outra_conta');
  end if;
  select * into a from public.anuncios x where x.id = p_anuncio and x.autor_id = e.conta and x.tipo = 'vaga';
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'vaga');
  end if;
  if a.status <> 'ativo' or a.expira_em <= now() or a.preenchida_em is not null then
    return jsonb_build_object('ok', false, 'erro', 'fora_do_ar', 'titulo', a.titulo);
  end if;
  if (select count(*) from public.convites_candidato k
       where k.anuncio_id = a.id and k.aceito_em is null and k.recusado_em is null
         and k.cancelado_em is null and k.expira_em > now()) >= 50 then
    return jsonb_build_object('ok', false, 'erro', 'limite_vaga', 'titulo', a.titulo);
  end if;
  perform pg_advisory_xact_lock(hashtext('publike:convite_candidato:' || e.conta::text));
  if (select count(*) from privado.limites_uso l
       where l.perfil_id = e.conta and l.acao = 'convite_candidato' and l.criado_em > now() - interval '24 hours') >= 60 then
    return jsonb_build_object('ok', false, 'erro', 'limite_dia');
  end if;
  insert into privado.limites_uso (perfil_id, acao) values (e.conta, 'convite_candidato');
  insert into public.convites_candidato as k (token, anuncio_id, autor_id, nome, curriculo, origem)
  values (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
          a.id, e.conta, e.nome, e.curriculo, 'whatsapp')
  returning k.token into v_token;
  delete from privado.curriculos_encaminhados x where x.id = e.id;
  -- quem chama, na mensagem para a pessoa: a empresa; na vaga de agência, o cliente (ou a agência, se confidencial)
  select coalesce(case when a.contratante_confidencial then null else nullif(btrim(a.contratante), '') end, p.nome)
    into v_quem
    from public.perfis p where p.id = e.conta;
  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'nome', e.nome,
    'titulo', a.titulo,
    'anuncio_id', a.id,
    'quem', v_quem,
    'com_curriculo', e.curriculo is not null);
end
$$;

revoke execute on function public.servidor_whatsapp_vagas_da_conta(text, text),
  public.servidor_whatsapp_guardar_encaminhado(text, text, uuid, text, jsonb),
  public.servidor_whatsapp_convite_de_fora(text, text, uuid, uuid) from public;
grant execute on function public.servidor_whatsapp_vagas_da_conta(text, text),
  public.servidor_whatsapp_guardar_encaminhado(text, text, uuid, text, jsonb),
  public.servidor_whatsapp_convite_de_fora(text, text, uuid, uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20271018120000_curriculo_encaminhado');
