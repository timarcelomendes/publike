-- O currículo pelo WhatsApp (22/11/2026; claude/plano-curriculo-otimizado.md, fase 1; Marcelo: "Sim", começando pelo
-- WhatsApp). Quem procura trabalho monta o currículo conversando: conta o que faz (escrito ou em áudio), responde as
-- perguntas que um recrutador faria e o Publike escreve o currículo, sem inventar nada. A prévia vem na conversa, com o
-- botão "Conferir e salvar", que abre o formulário do site já preenchido (privado.curriculos_preparados, pelo token).
--
-- Desligado até o Marcelo aprovar os textos e ligar em Admin › Qualificados: 'desligado', 'teste' (só os números de
-- teste de Admin › WhatsApp) ou 'todos'.
--
-- Pode rodar de novo.

alter table privado.config_whatsapp add column if not exists curriculo_modo text not null default 'desligado';
alter table privado.config_whatsapp drop constraint if exists config_whatsapp_curriculo_modo;
alter table privado.config_whatsapp add constraint config_whatsapp_curriculo_modo
  check (curriculo_modo in ('desligado', 'teste', 'todos'));

create table if not exists privado.curriculos_preparados (
  id bigint generated always as identity primary key,
  token text not null unique
    default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  conversa text not null,
  dados jsonb not null,
  criado_em timestamptz not null default now(),
  aberto_em timestamptz,
  constraint curriculos_preparados_token check (token ~ '^[0-9a-f]{64}$'),
  constraint curriculos_preparados_dados
    check (jsonb_typeof(dados) = 'object' and octet_length(dados::text) <= 12000)
);
create index if not exists curriculos_preparados_criado on privado.curriculos_preparados (criado_em desc);
create index if not exists curriculos_preparados_conversa on privado.curriculos_preparados (conversa, criado_em desc);
alter table privado.curriculos_preparados enable row level security;
revoke all on privado.curriculos_preparados from public, anon, authenticated;

-- O robô do atendimento (a chave do servidor; volatile: a conferência da chave grava a hora de uso)
create or replace function public.servidor_curriculo_whatsapp_ligado(p_chave text, p_numero text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c privado.config_whatsapp;
begin
  perform privado.exigir_servidor(p_chave);
  select * into c from privado.config_whatsapp where id;
  if not found or not c.ativo or not coalesce(c.atendimento_ligado, false) then
    return false;
  end if;
  return case c.curriculo_modo
           when 'todos' then true
           when 'teste' then coalesce(privado.chave_do_numero(p_numero) = any (privado.whatsapp_chaves_de_teste()), false)
           else false
         end;
end
$$;

create or replace function public.servidor_guardar_curriculo_preparado(p_chave text, p_conversa text, p_dados jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  perform privado.exigir_servidor(p_chave);
  insert into privado.curriculos_preparados (conversa, dados)
  values (left(p_conversa, 200), p_dados)
  returning token into v_token;
  return v_token;
end
$$;
revoke execute on function public.servidor_curriculo_whatsapp_ligado(text, text),
  public.servidor_guardar_curriculo_preparado(text, text, jsonb) from public;
grant execute on function public.servidor_curriculo_whatsapp_ligado(text, text),
  public.servidor_guardar_curriculo_preparado(text, text, jsonb) to anon, authenticated, service_role;

-- O link do WhatsApp: o currículo montado, por 7 dias (só os campos do formulário; sem contato)
create or replace function public.curriculo_preparado(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v privado.curriculos_preparados;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  update privado.curriculos_preparados x set aberto_em = coalesce(x.aberto_em, now())
   where x.token = p_token and x.criado_em > now() - interval '7 days'
  returning * into v;
  if not found then
    return null;
  end if;
  return v.dados;
end
$$;
revoke execute on function public.curriculo_preparado(text) from public;
grant execute on function public.curriculo_preparado(text) to anon, authenticated, service_role;

-- O admin: o modo e os números
create or replace function public.admin_curriculo_whatsapp()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  return jsonb_build_object(
    'modo', (select c.curriculo_modo from privado.config_whatsapp c where c.id),
    'montados', (select count(*) from privado.curriculos_preparados),
    'conversas', (select count(distinct p.conversa) from privado.curriculos_preparados p),
    'abertos', (select count(*) from privado.curriculos_preparados p where p.aberto_em is not null),
    'ultimos_7_dias', (select count(*) from privado.curriculos_preparados p where p.criado_em > now() - interval '7 days'));
end
$$;

create or replace function public.admin_modo_curriculo_whatsapp(p_modo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  if p_modo not in ('desligado', 'teste', 'todos') then
    raise exception 'Modo inválido.' using errcode = '22023';
  end if;
  update privado.config_whatsapp set curriculo_modo = p_modo where id;
end
$$;
revoke execute on function public.admin_curriculo_whatsapp(), public.admin_modo_curriculo_whatsapp(text) from public, anon;
grant execute on function public.admin_curriculo_whatsapp(), public.admin_modo_curriculo_whatsapp(text) to authenticated;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270902120000_curriculo_pelo_whatsapp');
