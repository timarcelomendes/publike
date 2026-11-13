-- As vagas impulsionadas no alto das páginas de vagas da cidade (13/11/2026, pedido do Marcelo: "Deve"). Muda a
-- decisão 1 do plano do impulso (claude/plano-impulsionar-vaga.md, "só fora do Publike") e a regra de 24/10 ("nenhuma
-- ordem usa pagamento") só neste ponto: a lista de sempre continua na mesma ordem; as impulsionadas da região
-- aparecem num quadro à parte, acima dela, com a etiqueta "Impulsionada".
--
-- Só o id da vaga e desde quando o impulso vale, para o site cruzar com as vagas no ar da praça (que já passaram pelas
-- regras de quem aparece). Vale do pagamento (em revisão no Google) até o fim (no ar, sem pausa e dentro do prazo).

create or replace function public.vagas_impulsionadas()
returns table (anuncio_id uuid, desde timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (i.anuncio_id) i.anuncio_id, coalesce(i.aprovado_em, i.criado_em) as desde
    from privado.impulsos i
    join public.anuncios a on a.id = i.anuncio_id
   where i.situacao in ('em_revisao', 'no_ar')
     and not i.pausar
     and (i.ate is null or i.ate > now())
     and a.tipo = 'vaga'
     and a.status = 'ativo'
   order by i.anuncio_id, coalesce(i.aprovado_em, i.criado_em) desc
$$;
revoke execute on function public.vagas_impulsionadas() from public;
grant execute on function public.vagas_impulsionadas() to anon, authenticated;

notify pgrst, 'reload schema';
