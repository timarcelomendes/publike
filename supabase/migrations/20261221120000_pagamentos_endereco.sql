-- O endereço de cobrança e o celular de quem paga no cartão: o checkout do Asaas pede (telefone, endereço,
-- número, CEP e bairro do cliente). Guardado para vir preenchido na próxima vez. Pode rodar de novo.
alter table privado.clientes_pagamento add column if not exists telefone text
  check (telefone is null or telefone ~ '^[0-9]{10,11}$');
alter table privado.clientes_pagamento add column if not exists endereco jsonb
  check (endereco is null or (jsonb_typeof(endereco) = 'object' and octet_length(endereco::text) <= 1000));

-- a tela de assinar: o que já foi informado
create or replace function public.meu_endereco_de_cobranca()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('telefone', c.telefone, 'endereco', c.endereco)
    from privado.clientes_pagamento c
   where (select auth.uid()) is not null and c.conta_id = public.conta_atual()
$$;
revoke execute on function public.meu_endereco_de_cobranca() from public, anon;
grant execute on function public.meu_endereco_de_cobranca() to authenticated;

create or replace function public.servidor_pagamento_endereco(p_chave text, p_conta uuid, p_telefone text,
                                                              p_endereco jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  update privado.clientes_pagamento
     set telefone = p_telefone, endereco = p_endereco, atualizado_em = now()
   where conta_id = p_conta;
end
$$;
revoke execute on function public.servidor_pagamento_endereco(text, uuid, text, jsonb) from public;
grant execute on function public.servidor_pagamento_endereco(text, uuid, text, jsonb)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
