-- Entrar pelo botão do aviso (25/11/2026; Marcelo, com a Super Box: "COMO PUBLICOU SEM ACESSAR?", "Login feito pelo
-- WhatsApp" e "se ele demora mais de 24h, como é a experiencia?"). Pode rodar de novo.
--
-- A Super Box publicou pelo "Sim, publicar" do WhatsApp: a conta nasceu do número e nunca abriu o site. O aviso da
-- candidatura chegou e foi lido, mas o botão "Ver a candidatura" caía no entrar do site (digitar o número, esperar o
-- código; fora das 24 horas da Meta, o código nem sai), e o candidato ficou esperando.
--
-- 1. O botão dos avisos do WhatsApp, para a conta cujo login é aquele número (o login pelo celular cai nela), passa a
--    ser o link de entrar com um toque (migração 20270920120000), com o mesmo destino. Vale 7 dias e uma vez: o aviso
--    pode ser lido dias depois, e os lembretes (1 e 3 dias sem resposta) trazem um link novo.
-- 2. O link usado ou vencido: quem já está dentro, na conta do número, vai direto ao destino
--    (servidor_destino_da_entrada); quem não está pede outro escrevendo "entrar" no WhatsApp do Publike (a mensagem da
--    pessoa abre a conversa, e o link chega na hora, para o mesmo destino: servidor_ultimo_destino_de_entrada).
--    Por isso os links usados e vencidos ficam 30 dias (antes saíam no link seguinte do número).
-- 3. O Admin mostra "login feito pelo WhatsApp" na conta que entra só pelo número (sem e-mail), no lugar de "nunca
--    acessou" (admin_login_pelo_whatsapp).

-- 1. O link de entrar do aviso; null: a conta não entra por este número (o e-mail com outro WhatsApp, a equipe do
--    Publike, a apagada ou a bloqueada ficam com o link de sempre)
create or replace function public.servidor_entrada_para_aviso(
  p_chave text,
  p_conta uuid,
  p_numero text,
  p_destino text,
  p_horas integer default 168
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_numero text := regexp_replace(coalesce(p_numero, ''), '\D', '', 'g');
  v_horas integer := least(greatest(coalesce(p_horas, 168), 1), 168);
begin
  perform privado.exigir_servidor(p_chave);
  if v_numero !~ '^\d{10,15}$' or coalesce(p_destino, '') !~ '^/[A-Za-z0-9/?=&_%.-]*$'
     or char_length(p_destino) > 300 or p_destino like '//%' then
    return null;
  end if;
  -- o login do link é o celular do número no formato do Auth (o mesmo de telefoneDoLogin no site)
  if not exists (select 1 from auth.users u
                  where u.id = p_conta
                    and u.phone = privado.telefone_do_login(v_numero)
                    and u.deleted_at is null
                    and not coalesce(u.is_anonymous, false)
                    and (u.banned_until is null or u.banned_until <= now())
                    and not privado.conta_da_equipe_publike(u.id)) then
    return null;
  end if;
  delete from privado.entradas_whatsapp e where e.criado_em < now() - interval '30 days';
  insert into privado.entradas_whatsapp (impressao, numero, destino, expira_em)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_numero, p_destino,
          now() + make_interval(hours => v_horas));
  return v_token;
end
$$;

-- O link do "entrar" e dos currículos: como antes (24 horas, uma vez), mas os usados e vencidos ficam 30 dias
create or replace function public.servidor_criar_entrada_whatsapp(p_chave text, p_numero text, p_destino text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_numero text := regexp_replace(coalesce(p_numero, ''), '\D', '', 'g');
begin
  perform privado.exigir_servidor(p_chave);
  delete from privado.entradas_whatsapp e where e.criado_em < now() - interval '30 days';
  insert into privado.entradas_whatsapp (impressao, numero, destino)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_numero, p_destino);
  return v_token;
end
$$;

-- 2. O link usado ou vencido: o número e o destino (a página manda direto quem já está dentro, na conta do número)
create or replace function public.servidor_destino_da_entrada(p_chave text, p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  return (select jsonb_build_object('numero', e.numero, 'destino', e.destino)
            from privado.entradas_whatsapp e
           where e.impressao = encode(extensions.digest(p_token, 'sha256'), 'hex'));
end
$$;

-- O "entrar" na conversa: o destino do último link do número (dos últimos 7 dias), para o link novo levar ao mesmo lugar
create or replace function public.servidor_ultimo_destino_de_entrada(p_chave text, p_numero text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return (select e.destino from privado.entradas_whatsapp e
           where e.numero = regexp_replace(coalesce(p_numero, ''), '\D', '', 'g')
             and e.criado_em > now() - interval '7 days'
           order by e.criado_em desc
           limit 1);
end
$$;

-- 3. As contas que entram só pelo WhatsApp (o login é o número, sem e-mail)
create or replace function public.admin_login_pelo_whatsapp(p_ids uuid[])
returns table (id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike vê isso.' using errcode = '42501';
  end if;
  return query
  select u.id from auth.users u
   where u.id = any ((coalesce(p_ids, '{}'))[1:1000])
     and coalesce(u.phone, '') <> '' and coalesce(u.email, '') = '';
end
$$;

revoke execute on function
  public.servidor_entrada_para_aviso(text, uuid, text, text, integer),
  public.servidor_destino_da_entrada(text, text),
  public.servidor_ultimo_destino_de_entrada(text, text),
  public.admin_login_pelo_whatsapp(uuid[])
from public;
grant execute on function
  public.servidor_entrada_para_aviso(text, uuid, text, text, integer),
  public.servidor_destino_da_entrada(text, text),
  public.servidor_ultimo_destino_de_entrada(text, text)
to anon, authenticated, service_role;
revoke execute on function public.admin_login_pelo_whatsapp(uuid[]) from anon;
grant execute on function public.admin_login_pelo_whatsapp(uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20271002120000_entrar_pelo_aviso');
