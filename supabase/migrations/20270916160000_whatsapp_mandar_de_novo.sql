-- "Mandar de novo, com Sim, publicar" (23/11/2026; Marcelo: "a vaga não foi publicada, o usuário ficou no
-- prejuízo"). As vagas lidas antes do "Sim, publicar" e da pergunta do lugar receberam só o link do site, e ficaram
-- sem publicar (a Hering e a Flower Makes, em 23/11). Em Admin › Publicar pelo WhatsApp, a equipe pede para mandar de
-- novo a vaga preparada; o robô das filas (a cada minuto) manda pela conversa, com os botões de publicar (ou a
-- pergunta do lugar, quando falta). Só o último anúncio ainda não publicado da conversa, na janela de 24 horas, com o
-- atendimento automático na conversa. Pode rodar de novo.

create table if not exists privado.whatsapp_reenvios (
  lote uuid primary key,
  pedido_em timestamptz not null default now(),
  enviado_em timestamptz,
  resultado text check (resultado is null or char_length(resultado) <= 300)
);
alter table privado.whatsapp_reenvios enable row level security;
revoke all on table privado.whatsapp_reenvios from public, anon, authenticated;

-- a equipe pede (a vaga da lista; vale o anúncio inteiro dela)
create or replace function public.admin_whatsapp_mandar_de_novo(p_vaga uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v privado.whatsapp_vagas;
  v_ultimo uuid;
  c privado.whatsapp_conversas;
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  select * into v from privado.whatsapp_vagas x where x.id = p_vaga;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'nao_achou');
  end if;
  if not exists (select 1 from privado.whatsapp_vagas x where x.lote = v.lote and x.publicada_em is null) then
    return jsonb_build_object('ok', false, 'erro', 'publicada');
  end if;
  -- a resposta do lugar e o "Sim, publicar" valem para o último anúncio sem publicar da conversa
  select x.lote into v_ultimo from privado.whatsapp_vagas x
   where x.conversa = v.conversa and x.publicada_em is null
   order by x.criado_em desc, x.ordem limit 1;
  if v_ultimo is distinct from v.lote then
    return jsonb_build_object('ok', false, 'erro', 'outro_mais_novo');
  end if;
  select * into c from privado.whatsapp_conversas x where x.chave = v.conversa;
  if not found or c.ultima_da_pessoa_em is null or c.ultima_da_pessoa_em < now() - interval '23 hours 50 minutes' then
    return jsonb_build_object('ok', false, 'erro', 'janela');
  end if;
  if c.situacao = 'equipe' then
    return jsonb_build_object('ok', false, 'erro', 'equipe');
  end if;
  insert into privado.whatsapp_reenvios as r (lote) values (v.lote)
  on conflict (lote) do update set pedido_em = now(), enviado_em = null, resultado = null;
  return jsonb_build_object('ok', true);
end
$$;
revoke execute on function public.admin_whatsapp_mandar_de_novo(uuid) from public, anon;
grant execute on function public.admin_whatsapp_mandar_de_novo(uuid) to authenticated, service_role;

-- o robô das filas pega os pedidos (marca como "mandando", para não sair duas vezes) com as vagas sem publicar
create or replace function public.servidor_whatsapp_reenvios(p_chave text)
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
  with pegos as (
    update privado.whatsapp_reenvios r
       set enviado_em = now(), resultado = 'mandando'
     where r.enviado_em is null and r.pedido_em > now() - interval '2 hours'
    returning r.lote
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'lote', p.lote,
           'conversa', x.conversa,
           'numero', coalesce(c.numero, x.numero),
           'janela', c.ultima_da_pessoa_em > now() - interval '23 hours 55 minutes' and c.situacao = 'robo',
           'vagas', x.vagas)), '[]'::jsonb)
    into v
    from pegos p
    cross join lateral (
      select min(w.conversa) as conversa, min(w.numero) as numero,
             jsonb_agg(jsonb_build_object('token', w.token, 'rascunho', w.rascunho) order by w.ordem, w.criado_em) as vagas
        from privado.whatsapp_vagas w
       where w.lote = p.lote and w.publicada_em is null
    ) x
    left join privado.whatsapp_conversas c on c.chave = x.conversa
   where x.conversa is not null;
  return v;
end
$$;
revoke execute on function public.servidor_whatsapp_reenvios(text) from public;
grant execute on function public.servidor_whatsapp_reenvios(text) to anon, authenticated, service_role;

create or replace function public.servidor_whatsapp_reenvio_feito(p_chave text, p_lote uuid, p_resultado text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  update privado.whatsapp_reenvios set resultado = left(coalesce(p_resultado, ''), 300) where lote = p_lote;
end
$$;
revoke execute on function public.servidor_whatsapp_reenvio_feito(text, uuid, text) from public;
grant execute on function public.servidor_whatsapp_reenvio_feito(text, uuid, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270916160000_whatsapp_mandar_de_novo');
