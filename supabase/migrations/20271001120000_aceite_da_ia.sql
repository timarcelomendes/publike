-- O aceite da IA (25/11/2026; Marcelo: "tem como adicionar um aceite no whatsapp, sem travar?"). Pode rodar de novo.
--
-- Para ler o currículo (o arquivo, ou o que a pessoa conta para montar), a IA do Publike, que fica fora do Brasil,
-- recebe os dados. A LGPD aceita a transferência com o consentimento específico e em destaque, avisado antes que é
-- fora do Brasil (art. 33, VIII). O aceite vai junto do que a pessoa já faz:
--   - responder ao passo 1 do currículo, que traz o aviso ("Ao responder, você concorda…");
--   - mandar o arquivo depois do "Tenho currículo", que traz o aviso ("Ao mandar o arquivo, você concorda…");
--   - só o arquivo que chega sem aviso pede um toque ("Posso ler?"), uma vez por número, e espera a resposta.
-- O Publike guarda a prova (art. 8º, § 2º): de onde veio, quando e o texto do aviso. "sem IA" tira o aceite (art. 8º,
-- § 5º). No site, o aceite é o envio do PDF, das fotos ou da gravação do currículo, com o aviso junto do botão.
-- A conversa comum (a IA que responde as mensagens) segue no art. 33, IX: é o atendimento que a pessoa pediu.

create table if not exists privado.aceites_da_ia (
  id bigint generated always as identity primary key,
  -- a conversa do WhatsApp (a chave do número) ou a conta do site
  conversa text,
  perfil_id uuid references public.perfis (id) on delete cascade,
  origem text not null check (origem in ('montar', 'arquivo', 'pode_ler', 'site')),
  -- o texto do aviso que a pessoa viu
  aviso text not null check (char_length(aviso) between 10 and 600),
  criado_em timestamptz not null default now(),
  revogado_em timestamptz,
  constraint aceites_da_ia_de_quem check ((conversa is not null) <> (perfil_id is not null))
);
create index if not exists aceites_da_ia_conversa_idx on privado.aceites_da_ia (conversa, criado_em desc)
  where conversa is not null;
create index if not exists aceites_da_ia_perfil_idx on privado.aceites_da_ia (perfil_id, criado_em desc)
  where perfil_id is not null;
alter table privado.aceites_da_ia enable row level security;
revoke all on privado.aceites_da_ia from public, anon, authenticated;

comment on table privado.aceites_da_ia is
  'O aceite para a IA do Publike, fora do Brasil, ler o currículo (LGPD, art. 33, VIII): de onde, quando e o aviso visto. revogado_em: a pessoa tirou.';

-- 1. O aceite da conversa vale?
create or replace function public.servidor_ia_aceita(p_chave text, p_conversa text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return exists (select 1 from privado.aceites_da_ia a where a.conversa = p_conversa and a.revogado_em is null);
end
$$;

-- 2. Guarda o aceite (com um valendo, não repete)
create or replace function public.servidor_ia_aceitar(p_chave text, p_conversa text, p_origem text, p_aviso text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  if coalesce(p_conversa, '') = '' or coalesce(p_origem, '') not in ('montar', 'arquivo', 'pode_ler') then
    return false;
  end if;
  if exists (select 1 from privado.aceites_da_ia a where a.conversa = p_conversa and a.revogado_em is null) then
    return true;
  end if;
  insert into privado.aceites_da_ia (conversa, origem, aviso) values (p_conversa, p_origem, left(btrim(p_aviso), 600));
  return true;
end
$$;

-- 3. Tira o aceite ("sem IA"): quantos estavam valendo
create or replace function public.servidor_ia_tirar_aceite(p_chave text, p_conversa text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform privado.exigir_servidor(p_chave);
  update privado.aceites_da_ia a set revogado_em = now() where a.conversa = p_conversa and a.revogado_em is null;
  get diagnostics n = row_count;
  return n;
end
$$;

-- 4. O arquivo que espera o "Pode ler": o mais novo das últimas 24 horas e os mandados junto com ele (até 5 minutos
--    antes), lidos ou não (a leitura da vaga pode ter passado por ele antes de pedir o aceite)
create or replace function public.servidor_whatsapp_midias_esperando(p_chave text, p_conversa text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ultima timestamptz;
begin
  perform privado.exigir_servidor(p_chave);
  select max(m.criado_em) into v_ultima from privado.whatsapp_midias m
   where m.conversa = p_conversa and m.criado_em > now() - interval '24 hours';
  return jsonb_build_object(
    'midias', coalesce((
      select jsonb_agg(jsonb_build_object('wamid', x.wamid, 'tipo', x.tipo, 'midia', x.midia_id, 'mime', x.mime,
                                          'legenda', x.legenda) order by x.criado_em, x.n)
        from (select m.* from privado.whatsapp_midias m
               where m.conversa = p_conversa and v_ultima is not null
                 and m.criado_em between v_ultima - interval '5 minutes' and v_ultima
               order by m.criado_em desc, m.n desc limit 4) x), '[]'::jsonb),
    'leituras_hoje', (select count(*) from privado.whatsapp_leituras l
                       where l.conversa = p_conversa and l.criado_em > now() - interval '24 hours'
                         and l.resultado not in ('limite', 'grande')));
end
$$;

-- 5. O "Não, obrigado": o arquivo que esperava fica como visto (não é lido depois)
create or replace function public.servidor_whatsapp_midias_dispensar(p_chave text, p_conversa text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform privado.exigir_servidor(p_chave);
  update privado.whatsapp_midias m set lida_em = now()
   where m.conversa = p_conversa and m.lida_em is null and m.criado_em > now() - interval '24 hours';
  get diagnostics n = row_count;
  return n;
end
$$;

-- 6. No site: o aceite da própria conta (o envio do PDF, das fotos ou da gravação do currículo)
create or replace function public.aceitar_ia_do_curriculo(p_aviso text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_eu uuid := (select auth.uid());
begin
  if v_eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_aviso, ''))) < 10 then
    return false;
  end if;
  if exists (select 1 from privado.aceites_da_ia a where a.perfil_id = v_eu and a.revogado_em is null) then
    return true;
  end if;
  insert into privado.aceites_da_ia (perfil_id, origem, aviso) values (v_eu, 'site', left(btrim(p_aviso), 600));
  return true;
end
$$;

revoke execute on function
  public.servidor_ia_aceita(text, text),
  public.servidor_ia_aceitar(text, text, text, text),
  public.servidor_ia_tirar_aceite(text, text),
  public.servidor_whatsapp_midias_esperando(text, text),
  public.servidor_whatsapp_midias_dispensar(text, text),
  public.aceitar_ia_do_curriculo(text)
from public;
grant execute on function
  public.servidor_ia_aceita(text, text),
  public.servidor_ia_aceitar(text, text, text, text),
  public.servidor_ia_tirar_aceite(text, text),
  public.servidor_whatsapp_midias_esperando(text, text),
  public.servidor_whatsapp_midias_dispensar(text, text)
to anon, authenticated, service_role;
revoke execute on function public.aceitar_ia_do_curriculo(text) from anon;
grant execute on function public.aceitar_ia_do_curriculo(text) to authenticated;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20271001120000_aceite_da_ia');
