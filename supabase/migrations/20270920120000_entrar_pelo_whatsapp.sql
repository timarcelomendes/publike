-- Entrar com um toque pelo WhatsApp (24/11/2026; Marcelo: "quando a pessoa enviar o currículo nao vale ter algo melhor
-- [...] chamar para um clique onde acessa o Publike"). O Publike manda na conversa um link que vale 24 horas, uma vez,
-- só para aquele número; quem toca entra (ou cria a conta pelo número) sem digitar código.
--
-- Como entra sem código: o próprio Auth gera o código (signInWithOtp pelo celular) e chama o gancho "Send SMS"; o site
-- marca antes, aqui, que vai pegar o código daquele número (privado.codigos_pegos, 1 minuto); o gancho guarda o código
-- em vez de mandar pelo WhatsApp, e o site confere o código no Auth (verifyOtp), que abre a sessão. O link prova que é
-- a pessoa: ele só chega ao WhatsApp daquele número.
--
-- O banco guarda só a impressão do link (sha256), nunca o link.

create table if not exists privado.entradas_whatsapp (
  impressao text primary key check (impressao ~ '^[0-9a-f]{64}$'),
  numero text not null check (numero ~ '^\d{10,15}$'),
  destino text not null check (destino ~ '^/[A-Za-z0-9/?=&_%.-]*$' and char_length(destino) <= 300),
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '24 hours',
  usado_em timestamptz
);
create index if not exists entradas_whatsapp_numero on privado.entradas_whatsapp (numero, criado_em desc);
revoke all on privado.entradas_whatsapp from public, anon, authenticated;

create table if not exists privado.codigos_pegos (
  numero text primary key check (numero ~ '^\d{10,15}$'),
  pedido_em timestamptz not null default now(),
  codigo text check (codigo is null or codigo ~ '^\d{4,10}$')
);
revoke all on privado.codigos_pegos from public, anon, authenticated;

-- o link: 64 letras; volta o link (só agora) e guarda a impressão. Os links velhos do número (vencidos ou usados) saem
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
  delete from privado.entradas_whatsapp e
   where e.numero = v_numero and (e.usado_em is not null or e.expira_em < now());
  insert into privado.entradas_whatsapp (impressao, numero, destino)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_numero, p_destino);
  return v_token;
end
$$;

-- a página do link: o número (para mostrar escondido) e o destino, sem gastar o link
create or replace function public.servidor_ver_entrada_whatsapp(p_chave text, p_token text)
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
           where e.impressao = encode(extensions.digest(p_token, 'sha256'), 'hex')
             and e.usado_em is null and e.expira_em > now());
end
$$;

-- o toque: gasta o link (uma vez) e marca que o site vai pegar o código daquele número no próximo minuto
create or replace function public.servidor_usar_entrada_whatsapp(p_chave text, p_token text, p_numero_do_login text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform privado.exigir_servidor(p_chave);
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' or coalesce(p_numero_do_login, '') !~ '^\d{10,15}$' then
    return null;
  end if;
  update privado.entradas_whatsapp e set usado_em = now()
   where e.impressao = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and e.usado_em is null and e.expira_em > now()
  returning jsonb_build_object('numero', e.numero, 'destino', e.destino) into v;
  if v is null then
    return null;
  end if;
  insert into privado.codigos_pegos (numero, pedido_em, codigo) values (p_numero_do_login, now(), null)
  on conflict (numero) do update set pedido_em = now(), codigo = null;
  return v;
end
$$;

-- o gancho do código: se o site pediu para pegar o código deste número no último minuto, guarda e não manda
create or replace function public.servidor_guardar_codigo_pego(p_chave text, p_numero text, p_codigo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  perform privado.exigir_servidor(p_chave);
  update privado.codigos_pegos c set codigo = p_codigo
   where c.numero = regexp_replace(coalesce(p_numero, ''), '\D', '', 'g')
     and c.codigo is null and c.pedido_em > now() - interval '1 minute'
     and coalesce(p_codigo, '') ~ '^\d{4,10}$'
  returning true into v_ok;
  return coalesce(v_ok, false);
end
$$;

-- o site pega o código (uma vez) para conferir no Auth
create or replace function public.servidor_pegar_codigo(p_chave text, p_numero text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_codigo text;
begin
  perform privado.exigir_servidor(p_chave);
  delete from privado.codigos_pegos c
   where c.numero = p_numero and c.pedido_em > now() - interval '1 minute' and c.codigo is not null
  returning c.codigo into v_codigo;
  delete from privado.codigos_pegos c where c.pedido_em < now() - interval '1 hour';
  return v_codigo;
end
$$;

revoke execute on function public.servidor_criar_entrada_whatsapp(text, text, text),
  public.servidor_ver_entrada_whatsapp(text, text),
  public.servidor_usar_entrada_whatsapp(text, text, text),
  public.servidor_guardar_codigo_pego(text, text, text),
  public.servidor_pegar_codigo(text, text) from public;
grant execute on function public.servidor_criar_entrada_whatsapp(text, text, text),
  public.servidor_ver_entrada_whatsapp(text, text),
  public.servidor_usar_entrada_whatsapp(text, text, text),
  public.servidor_guardar_codigo_pego(text, text, text),
  public.servidor_pegar_codigo(text, text) to anon, authenticated, service_role;

select privado.migracao_aplicada('20270920120000_entrar_pelo_whatsapp');
