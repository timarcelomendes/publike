-- O lugar da vaga perguntado na conversa (23/11/2026; a foto da Hering tinha "Operador de caixa" sem lugar e
-- "Vendedor(a) · Passeio das Águas" sem a cidade, e foi para o link do site, que quase ninguém completa). Quando a foto
-- não diz o bairro ou a cidade, o Publike pergunta na conversa; a resposta completa as vagas do último anúncio lido
-- (as ainda não publicadas, nas últimas 24 horas) e as vagas vêm com "Sim, publicar". Esta função devolve essas
-- vagas e, com o bairro ou a cidade, completa antes:
--   * a vaga sem bairro fica com o bairro respondido e, se veio a cidade, com ela (o lugar respondido vale inteiro);
--   * a vaga com bairro e sem cidade fica com a cidade respondida;
--   * a vaga que já tinha bairro e cidade fica como está.
-- Devolve {ligado, ok, vagas: [{token, ordem, rascunho}]}. Pode rodar de novo.

create or replace function public.servidor_whatsapp_lugar_das_vagas(
  p_chave text, p_conversa text, p_bairro text default null, p_cidade text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ligado boolean;
  v_lote uuid;
  v_bairro text := nullif(btrim(regexp_replace(coalesce(p_bairro, ''), '\s+', ' ', 'g')), '');
  v_cidade text := nullif(btrim(coalesce(p_cidade, '')), '');
begin
  perform privado.exigir_servidor(p_chave);
  select c.ativo and coalesce(c.atendimento_ligado, false) and c.vagas_ligado and c.vagas_publicar_aqui
    into v_ligado
    from privado.config_whatsapp c where c.id;
  if not coalesce(v_ligado, false) then
    return jsonb_build_object('ligado', false, 'ok', false);
  end if;
  if v_bairro is not null and char_length(v_bairro) > 60 then
    v_bairro := left(v_bairro, 60);
  end if;

  select x.lote into v_lote
    from privado.whatsapp_vagas x
   where x.conversa = p_conversa and x.publicada_em is null and x.criado_em > now() - interval '24 hours'
   order by x.criado_em desc, x.ordem
   limit 1;
  if v_lote is null then
    return jsonb_build_object('ligado', true, 'ok', false);
  end if;

  if v_bairro is not null or v_cidade is not null then
    update privado.whatsapp_vagas x
       set rascunho = x.rascunho
             || case when coalesce(btrim(x.rascunho ->> 'bairro'), '') = '' and v_bairro is not null
                     then jsonb_build_object('bairro', v_bairro) else '{}'::jsonb end
             || case when v_cidade is not null
                          and (coalesce(btrim(x.rascunho ->> 'cidade'), '') = ''
                               or (coalesce(btrim(x.rascunho ->> 'bairro'), '') = '' and v_bairro is not null))
                     then jsonb_build_object('cidade', v_cidade) else '{}'::jsonb end
     where x.lote = v_lote and x.conversa = p_conversa and x.publicada_em is null;
  end if;

  return jsonb_build_object(
    'ligado', true,
    'ok', true,
    'vagas', (select coalesce(jsonb_agg(jsonb_build_object('token', x.token, 'ordem', x.ordem, 'rascunho', x.rascunho)
                                        order by x.ordem, x.criado_em), '[]'::jsonb)
                from privado.whatsapp_vagas x
               where x.lote = v_lote and x.conversa = p_conversa and x.publicada_em is null));
end
$$;
revoke execute on function public.servidor_whatsapp_lugar_das_vagas(text, text, text, text) from public;
grant execute on function public.servidor_whatsapp_lugar_das_vagas(text, text, text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270916150000_lugar_da_vaga_no_whatsapp');
