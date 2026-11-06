-- Avisar o Google das vagas (06/11/2026): pela Indexing API (a do Google para páginas de vaga), a vaga que entra no ar
-- é avisada na hora (URL_UPDATED) e a que sai (encerrada, preenchida, vencida, removida ou apagada) também
-- (URL_DELETED). Sem isso, o Google passava a cada duas semanas e muitas vagas venciam antes de aparecer no Google
-- Vagas. A rotina das filas (a cada 5 minutos) pede a lista, avisa e marca. A cota do Google é de 200 avisos por dia:
-- a lista para em 180. Rode depois de 20270221120000_conversa_so_no_chat.sql. Pode rodar de novo.

-- o que o Google já sabe de cada vaga (sem chave para o anúncio: a vaga apagada ainda precisa do aviso de saída)
create table if not exists privado.google_vagas (
  anuncio_id uuid primary key,
  no_ar boolean not null,
  avisado_em timestamptz not null default now()
);
create index if not exists google_vagas_avisado on privado.google_vagas (avisado_em);
alter table privado.google_vagas enable row level security;
revoke all on privado.google_vagas from public, anon, authenticated;

-- as vagas para avisar: as que entraram no ar, as que saíram e as editadas (de novo só depois de 3 dias, para a cota)
create or replace function public.servidor_vagas_para_o_google(p_chave text, p_limite integer default 10)
returns table (anuncio_id uuid, no_ar boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cota integer;
begin
  perform privado.exigir_servidor(p_chave);
  select greatest(0, least(coalesce(p_limite, 10), 180 - count(*)::integer)) into v_cota
    from privado.google_vagas g where g.avisado_em > now() - interval '1 day';
  return query
  select x.id, x.no_ar from (
    select a.id,
           (a.status = 'ativo' and a.expira_em > now() and a.preenchida_em is null) as no_ar,
           g.anuncio_id is null as nova
      from public.anuncios a
      left join privado.google_vagas g on g.anuncio_id = a.id
     where a.tipo = 'vaga'
       and (
         -- nunca avisada: só quando está no ar
         (g.anuncio_id is null and a.status = 'ativo' and a.expira_em > now() and a.preenchida_em is null)
         -- entrou ou saiu do ar desde o último aviso
         or (g.anuncio_id is not null
             and g.no_ar <> (a.status = 'ativo' and a.expira_em > now() and a.preenchida_em is null))
         -- editada no ar
         or (g.no_ar and a.status = 'ativo' and a.expira_em > now() and a.preenchida_em is null
             and a.atualizado_em > g.avisado_em and g.avisado_em < now() - interval '3 days')
       )
    union all
    -- apagada depois de avisada no ar
    select g.anuncio_id, false, false
      from privado.google_vagas g
     where g.no_ar and not exists (select 1 from public.anuncios a where a.id = g.anuncio_id)
  ) x
  -- as que saíram primeiro (o Google tira do ar a vaga que não existe mais), depois as novas
  order by x.no_ar, x.nova desc
  limit v_cota;
end
$$;
revoke execute on function public.servidor_vagas_para_o_google(text, integer) from public;
grant execute on function public.servidor_vagas_para_o_google(text, integer) to anon, authenticated, service_role;

-- o Google aceitou o aviso
create or replace function public.servidor_vaga_avisada_ao_google(p_chave text, p_anuncio uuid, p_no_ar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  insert into privado.google_vagas (anuncio_id, no_ar, avisado_em) values (p_anuncio, p_no_ar, now())
  on conflict (anuncio_id) do update set no_ar = excluded.no_ar, avisado_em = now();
end
$$;
revoke execute on function public.servidor_vaga_avisada_ao_google(text, uuid, boolean) from public;
grant execute on function public.servidor_vaga_avisada_ao_google(text, uuid, boolean) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
