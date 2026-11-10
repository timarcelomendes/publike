-- O mesmo anúncio publicado duas vezes (10/11/2026). Pode rodar de novo.
--
-- O que aconteceu: a Go Laser publicou "Consultora de vendas" às 00:12:50 e de novo às 00:14:06, com o mesmo texto;
-- no dia 09, outra conta fez o mesmo com 2 minutos de diferença. O site guarda a página de publicar ao abrir a vaga
-- (Next.js mantém as últimas páginas abertas, com o que estava escrito): quem volta pelo "voltar" do celular acha o
-- formulário pronto, no Conferir, e um toque em Publicar cria outra vaga igual. O banco não conferia nada.
--
-- Agora:
-- 1. O banco não aceita, da mesma conta, um anúncio igual (tipo, título, texto, cidade, bairro e empresa) a outro
--    no ar, em análise ou pausado criado nas últimas 24 horas. O site leva a pessoa ao que já está publicado, com um
--    aviso. Dois toques ao mesmo tempo esperam um pelo outro (a trava é por conta), então só um passa.
-- 2. Admin › Anúncios › Repetidos: os pares que já existem, e "Encerrar a cópia e avisar" (fica a que tem mais
--    curtidas; empate, a primeira). A conta recebe a mensagem da equipe no sino e no e-mail.

-- o texto comparado: sem diferença de maiúsculas e de espaços
create or replace function privado.texto_comparavel(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')))
$$;

revoke execute on function privado.texto_comparavel(text) from public, anon, authenticated;

-- 1. A regra, antes de gravar (depois das outras arrumações do anúncio: o nome começa com zz_r)
create or replace function privado.anuncio_nao_repetido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_igual uuid;
begin
  if new.autor_id is null then
    return new;
  end if;
  -- um pedido de cada vez por conta: o segundo toque espera o primeiro terminar e já vê a vaga gravada
  perform pg_advisory_xact_lock(hashtextextended('publike:anuncio:' || new.autor_id::text, 0));
  select a.id into v_igual
    from public.anuncios a
   where a.autor_id = new.autor_id
     and a.tipo = new.tipo
     and a.status in ('ativo', 'em_analise', 'pausado')
     and a.criado_em > now() - interval '24 hours'
     and privado.texto_comparavel(a.titulo) = privado.texto_comparavel(new.titulo)
     and privado.texto_comparavel(a.descricao) = privado.texto_comparavel(new.descricao)
     and privado.texto_comparavel(a.cidade) = privado.texto_comparavel(new.cidade)
     and privado.texto_comparavel(a.bairro) = privado.texto_comparavel(new.bairro)
     and privado.texto_comparavel(a.contratante) = privado.texto_comparavel(new.contratante)
     and a.cliente_id is not distinct from new.cliente_id
   order by a.criado_em
   limit 1;
  if v_igual is not null then
    raise exception 'Este anúncio já está publicado: é igual a um que você publicou há pouco.'
      using errcode = 'P0001', hint = 'repetido', detail = v_igual::text;
  end if;
  return new;
end
$$;

revoke execute on function privado.anuncio_nao_repetido() from public, anon, authenticated;

drop trigger if exists anuncios_zz_repetido on public.anuncios;
create trigger anuncios_zz_repetido
  before insert on public.anuncios
  for each row execute function privado.anuncio_nao_repetido();

-- 2. Admin: os pares repetidos que estão no ar (ou em análise, ou pausados)
create or replace function public.admin_anuncios_repetidos()
returns table (
  copia_id uuid,
  original_id uuid,
  tipo text,
  titulo text,
  cidade text,
  bairro text,
  autor_id uuid,
  autor_nome text,
  copia_status text,
  original_status text,
  copia_criada timestamptz,
  original_criada timestamptz,
  copia_curtidas integer,
  original_curtidas integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  return query
    select b.id, a.id, a.tipo, a.titulo, a.cidade, a.bairro, a.autor_id, p.nome, b.status, a.status,
           b.criado_em, a.criado_em,
           (select count(*)::integer from public.curtidas c where c.anuncio_id = b.id),
           (select count(*)::integer from public.curtidas c where c.anuncio_id = a.id)
      from public.anuncios a
      join public.anuncios b
        on b.autor_id = a.autor_id and b.tipo = a.tipo and b.id <> a.id
       and (b.criado_em, b.id) > (a.criado_em, a.id)
       and b.criado_em - a.criado_em < interval '24 hours'
       and b.status in ('ativo', 'em_analise', 'pausado')
       and privado.texto_comparavel(b.titulo) = privado.texto_comparavel(a.titulo)
       and privado.texto_comparavel(b.descricao) = privado.texto_comparavel(a.descricao)
       and privado.texto_comparavel(b.cidade) = privado.texto_comparavel(a.cidade)
       and privado.texto_comparavel(b.bairro) = privado.texto_comparavel(a.bairro)
       and privado.texto_comparavel(b.contratante) = privado.texto_comparavel(a.contratante)
       and b.cliente_id is not distinct from a.cliente_id
      left join public.perfis p on p.id = a.autor_id
     where a.status in ('ativo', 'em_analise', 'pausado')
       and a.criado_em > now() - interval '120 days'
     order by b.criado_em desc
     limit 200;
end
$$;

-- 3. Admin: encerra a cópia (fica a que tem mais curtidas; empate, a primeira) e devolve o que a mensagem precisa
create or replace function public.admin_encerrar_repetido(p_copia uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  par record;
  v_encerrar uuid;
  v_manter uuid;
  anterior text := current_setting('publike.sistema', true);
begin
  perform privado.exigir_admin();
  select r.* into par from public.admin_anuncios_repetidos() r where r.copia_id = p_copia limit 1;
  if not found then
    raise exception 'Este par não está mais repetido (uma das duas já saiu do ar).' using errcode = 'P0001';
  end if;
  if par.copia_curtidas > par.original_curtidas then
    v_encerrar := par.original_id;
    v_manter := par.copia_id;
  else
    v_encerrar := par.copia_id;
    v_manter := par.original_id;
  end if;
  perform set_config('publike.sistema', 'on', true);
  update public.anuncios set status = 'encerrado' where id = v_encerrar;
  perform set_config('publike.sistema', coalesce(anterior, ''), true);
  perform privado.registrar('encerrar_repetido', 'anuncio', v_encerrar::text, par.titulo,
                            jsonb_build_object('fica', v_manter));
  return jsonb_build_object(
    'encerrado', v_encerrar,
    'fica', v_manter,
    'autor', par.autor_id,
    'titulo', par.titulo,
    'minutos', greatest(1, round(extract(epoch from par.copia_criada - par.original_criada) / 60)::integer));
end
$$;

revoke execute on function public.admin_anuncios_repetidos(), public.admin_encerrar_repetido(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_anuncios_repetidos(), public.admin_encerrar_repetido(uuid) to service_role;

notify pgrst, 'reload schema';
