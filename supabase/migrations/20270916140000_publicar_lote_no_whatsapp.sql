-- Publicar no WhatsApp também o anúncio com várias vagas (23/11/2026; a foto da Eleni com "Operador de caixa" e
-- "Vendedor(a)" foi para o link do site, que quase ninguém completa). As vagas lidas da mesma foto são um lote: o botão
-- "Sim, publicar as N" publica todas, uma por uma, com as mesmas regras da vaga sozinha. Esta função devolve as que
-- ainda não foram publicadas do lote da vaga do botão, na ordem do anúncio. Pode rodar de novo.

create or replace function public.servidor_whatsapp_tokens_do_lote(p_chave text, p_conversa text, p_token text)
returns text[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lote uuid;
begin
  perform privado.exigir_servidor(p_chave);
  select x.lote into v_lote from privado.whatsapp_vagas x
   where x.token = p_token and x.conversa = p_conversa and x.criado_em > now() - interval '30 days';
  if v_lote is null then
    return '{}'::text[];
  end if;
  return coalesce((select array_agg(x.token order by x.ordem, x.criado_em)
                     from privado.whatsapp_vagas x
                    where x.lote = v_lote and x.conversa = p_conversa and x.publicada_em is null), '{}'::text[]);
end
$$;
revoke execute on function public.servidor_whatsapp_tokens_do_lote(text, text, text) from public;
grant execute on function public.servidor_whatsapp_tokens_do_lote(text, text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270916140000_publicar_lote_no_whatsapp');
