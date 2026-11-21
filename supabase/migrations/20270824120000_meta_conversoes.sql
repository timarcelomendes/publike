-- A vaga publicada volta para a Meta (21/11/2026; Marcelo, "Perfeito" ao D das melhorias dos anúncios: avisar a Meta
-- quando uma conversa vira vaga publicada). A campanha de empresas (clique para o WhatsApp) só via a conversa: 40
-- conversas, 4 vagas lidas e nenhuma publicada pelo anúncio. A Meta aprende com o que acontece depois do clique; com
-- a API de Conversões para mensagens, ela passa a saber qual clique publicou vaga.
--
-- O clique do anúncio vem no `referral.ctwa_clid` da primeira mensagem (o webhook guarda em
-- `whatsapp_conversas.origem->>'clique'`, src/lib/servidor/whatsapp.ts). Quando uma vaga sai, o servidor procura a
-- conversa da conta que publicou: a da vaga lida no WhatsApp (`whatsapp_vagas`) ou a do número da conta (o WhatsApp do
-- contato ou o celular do login). Vale um aviso por clique, até 7 dias depois do clique (o prazo da Meta). O envio
-- (src/lib/servidor/meta-conversoes.ts) só acontece com o META_DATASET_ID na Vercel; sem ele, nada sai e nada dá erro.
--
-- Pode rodar de novo.

create table if not exists privado.meta_conversoes (
  clique text primary key check (char_length(clique) between 8 and 300),
  conversa text not null,
  anuncio_id uuid references public.anuncios (id) on delete set null,
  evento text not null default 'LeadSubmitted',
  criado_em timestamptz not null default now(),
  enviado_em timestamptz,
  -- 'ok', ou o erro da Meta (curto)
  resultado text check (resultado is null or char_length(resultado) <= 300)
);
create index if not exists meta_conversoes_criado_idx on privado.meta_conversoes (criado_em desc);
alter table privado.meta_conversoes enable row level security;
revoke all on privado.meta_conversoes from public, anon, authenticated;

-- O clique da conversa de quem publicou a vaga, uma vez só (reserva antes de mandar). Null: sem anúncio, passou dos 7
-- dias ou o clique já foi avisado.
create or replace function public.servidor_meta_conversao_da_vaga(p_chave text, p_anuncio uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  autor uuid;
  c record;
begin
  perform privado.exigir_servidor(p_chave);
  select a.autor_id into autor from public.anuncios a where a.id = p_anuncio and a.tipo = 'vaga';
  if autor is null then
    return null;
  end if;
  select cv.chave, cv.origem->>'clique' as clique
    into c
    from privado.whatsapp_conversas cv
   where cv.origem ? 'clique'
     and cv.origem_em > now() - interval '7 days'
     and cv.chave in (
       select v.conversa from privado.whatsapp_vagas v where v.anuncio_id = p_anuncio
       union
       select privado.chave_do_numero(ct.whatsapp) from public.contatos ct
        where ct.perfil_id = autor and ct.whatsapp is not null
       union
       select privado.chave_do_numero(u.phone) from auth.users u where u.id = autor and coalesce(u.phone, '') <> '')
     and not exists (select 1 from privado.meta_conversoes m where m.clique = cv.origem->>'clique')
   order by cv.origem_em desc
   limit 1;
  if c.clique is null or char_length(c.clique) not between 8 and 300 then
    return null;
  end if;
  insert into privado.meta_conversoes (clique, conversa, anuncio_id)
  values (c.clique, c.chave, p_anuncio)
  on conflict (clique) do nothing;
  if not found then
    return null;
  end if;
  return jsonb_build_object('clique', c.clique);
end
$$;
revoke execute on function public.servidor_meta_conversao_da_vaga(text, uuid) from public;
grant execute on function public.servidor_meta_conversao_da_vaga(text, uuid) to anon, authenticated, service_role;

-- O que a Meta respondeu.
create or replace function public.servidor_meta_conversao_resultado(p_chave text, p_clique text, p_resultado text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  update privado.meta_conversoes
     set enviado_em = now(), resultado = left(coalesce(p_resultado, ''), 300)
   where clique = p_clique;
end
$$;
revoke execute on function public.servidor_meta_conversao_resultado(text, text, text) from public;
grant execute on function public.servidor_meta_conversao_resultado(text, text, text) to anon, authenticated, service_role;

-- Para o Admin › WhatsApp › Ligação: quantas vagas voltaram para a Meta e o último erro.
create or replace function public.admin_meta_conversoes()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  return (
    select jsonb_build_object(
      'enviadas_30_dias', count(*) filter (where resultado = 'ok' and criado_em > now() - interval '30 days'),
      'falharam_30_dias', count(*) filter (where resultado <> 'ok' and criado_em > now() - interval '30 days'),
      'ultimo_erro', (select m.resultado from privado.meta_conversoes m
                       where m.resultado <> 'ok' order by m.criado_em desc limit 1),
      'ultima_em', max(criado_em))
      from privado.meta_conversoes);
end
$$;
revoke execute on function public.admin_meta_conversoes() from public, anon;
grant execute on function public.admin_meta_conversoes() to authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270824120000_meta_conversoes');
