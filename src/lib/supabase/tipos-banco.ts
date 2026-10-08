// Tipos do banco, no formato que o `supabase gen types typescript` gera.
// Se mudar a migração, atualize aqui ou gere de novo com a CLI do Supabase:
//   npx supabase gen types typescript --project-id SEU_ID > src/lib/supabase/tipos-banco.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type SemTabela = { [_ in never]: never };

export type Database = {
  public: {
    Tables: {
      perfis: {
        Row: {
          id: string;
          nome: string;
          tipo: string;
          foto: string | null;
          cidade: string;
          bairro: string | null;
          sobre: string | null;
          servicos: string[];
          verificado: boolean;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id: string;
          nome: string;
          tipo?: string;
          foto?: string | null;
          cidade?: string;
          bairro?: string | null;
          sobre?: string | null;
          servicos?: string[];
        };
        Update: {
          nome?: string;
          tipo?: string;
          foto?: string | null;
          cidade?: string;
          bairro?: string | null;
          sobre?: string | null;
          servicos?: string[];
        };
        Relationships: [];
      };
      contatos: {
        Row: {
          perfil_id: string;
          whatsapp: string | null;
          email: string | null;
          atualizado_em: string;
        };
        Insert: {
          perfil_id: string;
          whatsapp?: string | null;
          email?: string | null;
        };
        Update: {
          whatsapp?: string | null;
          email?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "contatos_perfil_id_fkey";
            columns: ["perfil_id"];
            isOneToOne: true;
            referencedRelation: "perfis";
            referencedColumns: ["id"];
          },
        ];
      };
      moderadores: {
        Row: { perfil_id: string; criado_em: string };
        Insert: { perfil_id: string };
        Update: { perfil_id?: string };
        Relationships: [];
      };
      anuncios: {
        Row: {
          id: string;
          autor_id: string;
          tipo: string;
          titulo: string;
          descricao: string;
          categoria: string;
          regime: string | null;
          pagamento_valor: number | null;
          pagamento_unidade: string | null;
          beneficios: string | null;
          horario: string | null;
          vagas: number;
          cidade: string;
          bairro: string;
          local: unknown;
          status: string;
          criado_em: string;
          atualizado_em: string;
          expira_em: string;
          busca: unknown;
        };
        Insert: {
          tipo: string;
          titulo: string;
          descricao: string;
          categoria: string;
          regime?: string | null;
          pagamento_valor?: number | null;
          pagamento_unidade?: string | null;
          beneficios?: string | null;
          horario?: string | null;
          vagas?: number;
          cidade: string;
          bairro: string;
          /** EWKT, por exemplo: SRID=4326;POINT(-49.25 -16.68) */
          local: string;
        };
        Update: {
          titulo?: string;
          descricao?: string;
          categoria?: string;
          regime?: string | null;
          pagamento_valor?: number | null;
          pagamento_unidade?: string | null;
          beneficios?: string | null;
          horario?: string | null;
          vagas?: number;
          cidade?: string;
          bairro?: string;
          local?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "anuncios_autor_id_fkey";
            columns: ["autor_id"];
            isOneToOne: false;
            referencedRelation: "perfis";
            referencedColumns: ["id"];
          },
        ];
      };
      curtidas: {
        Row: {
          anuncio_id: string;
          perfil_id: string;
          mensagem: string | null;
          status: string;
          criado_em: string;
          respondida_em: string | null;
        };
        Insert: {
          anuncio_id: string;
          mensagem?: string | null;
        };
        Update: SemTabela;
        Relationships: [
          {
            foreignKeyName: "curtidas_anuncio_id_fkey";
            columns: ["anuncio_id"];
            isOneToOne: false;
            referencedRelation: "anuncios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "curtidas_perfil_id_fkey";
            columns: ["perfil_id"];
            isOneToOne: false;
            referencedRelation: "perfis";
            referencedColumns: ["id"];
          },
        ];
      };
      denuncias: {
        Row: {
          id: number;
          anuncio_id: string;
          autor_id: string | null;
          motivo: string;
          detalhes: string | null;
          status: string;
          criado_em: string;
        };
        Insert: {
          anuncio_id: string;
          motivo: string;
          detalhes?: string | null;
        };
        Update: SemTabela;
        Relationships: [];
      };
      notificacoes: {
        Row: {
          id: number;
          destinatario_id: string;
          tipo: string;
          anuncio_id: string | null;
          texto: string;
          lida: boolean;
          criado_em: string;
          ator_id: string | null;
        };
        Insert: SemTabela;
        Update: { lida?: boolean };
        Relationships: [];
      };
    };
    Views: SemTabela;
    Functions: {
      buscar_anuncios: {
        Args: {
          p_lat?: number;
          p_lng?: number;
          p_raio_km?: number;
          p_tipo?: string | null;
          p_categoria?: string | null;
          p_regime?: string | null;
          p_texto?: string | null;
          p_ordem?: string;
          p_limite?: number;
        };
        Returns: {
          id: string;
          tipo: string;
          titulo: string;
          categoria: string;
          regime: string | null;
          pagamento_valor: number | null;
          pagamento_unidade: string | null;
          beneficios: string | null;
          cidade: string;
          bairro: string;
          lat: number;
          lng: number;
          distancia_km: number;
          criado_em: string;
          autor_id: string;
          autor_nome: string;
          autor_tipo: string;
          autor_verificado: boolean;
          minha_curtida: string | null;
        }[];
      };
      obter_anuncio: {
        Args: { p_id: string };
        Returns: {
          id: string;
          autor_id: string;
          tipo: string;
          titulo: string;
          descricao: string;
          categoria: string;
          regime: string | null;
          pagamento_valor: number | null;
          pagamento_unidade: string | null;
          beneficios: string | null;
          horario: string | null;
          vagas: number;
          cidade: string;
          bairro: string;
          lat: number;
          lng: number;
          status: string;
          criado_em: string;
          atualizado_em: string;
          expira_em: string;
          autor_nome: string;
          autor_tipo: string;
          autor_foto: string | null;
          autor_verificado: boolean;
          autor_desde: string;
          minha_curtida: string | null;
          minha_mensagem: string | null;
        }[];
      };
      meus_anuncios: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          tipo: string;
          titulo: string;
          categoria: string;
          regime: string | null;
          pagamento_valor: number | null;
          pagamento_unidade: string | null;
          beneficios: string | null;
          cidade: string;
          bairro: string;
          status: string;
          criado_em: string;
          expira_em: string;
          curtidas_total: number;
          curtidas_novas: number;
          matches: number;
        }[];
      };
      interessados: {
        Args: { p_anuncio: string };
        Returns: {
          perfil_id: string;
          nome: string;
          tipo: string;
          foto: string | null;
          cidade: string;
          bairro: string | null;
          sobre: string | null;
          servicos: string[];
          verificado: boolean;
          membro_desde: string;
          mensagem: string | null;
          status: string;
          curtido_em: string;
          whatsapp: string | null;
          email: string | null;
        }[];
      };
      minhas_curtidas: {
        Args: Record<PropertyKey, never>;
        Returns: {
          anuncio_id: string;
          titulo: string;
          tipo: string;
          categoria: string;
          regime: string | null;
          pagamento_valor: number | null;
          pagamento_unidade: string | null;
          beneficios: string | null;
          cidade: string;
          bairro: string;
          anuncio_status: string;
          expira_em: string;
          autor_id: string;
          autor_nome: string;
          autor_tipo: string;
          autor_foto: string | null;
          status: string;
          mensagem: string | null;
          curtido_em: string;
          respondida_em: string | null;
          autor_whatsapp: string | null;
          autor_email: string | null;
        }[];
      };
      meus_matches: {
        Args: Record<PropertyKey, never>;
        Returns: {
          anuncio_id: string;
          anuncio_titulo: string;
          anuncio_tipo: string;
          papel: string;
          outro_id: string;
          outro_nome: string;
          outro_tipo: string;
          outro_foto: string | null;
          outro_cidade: string;
          outro_bairro: string | null;
          outro_whatsapp: string | null;
          outro_email: string | null;
          match_em: string;
        }[];
      };
      responder_curtida: {
        Args: { p_anuncio: string; p_perfil: string; p_decisao: string };
        Returns: undefined;
      };
      renovar_anuncio: {
        Args: { p_id: string };
        Returns: string;
      };
      salvar_perfil: {
        Args: {
          p_nome: string;
          p_tipo: string;
          p_cidade: string;
          p_bairro: string | null;
          p_sobre: string | null;
          p_servicos: string[];
          p_foto: string | null;
          p_whatsapp: string | null;
          p_email: string | null;
        };
        Returns: undefined;
      };
      excluir_minha_conta: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      fila_moderacao: {
        Args: Record<PropertyKey, never>;
        Returns: {
          anuncio_id: string;
          titulo: string;
          tipo: string;
          status: string;
          cidade: string;
          bairro: string;
          criado_em: string;
          autor_id: string;
          autor_nome: string;
          denuncias_abertas: number;
          motivos: string[];
          detalhes: string[];
        }[];
      };
      moderar_anuncio: {
        Args: { p_anuncio: string; p_decisao: string };
        Returns: undefined;
      };
      eh_moderador: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
    Enums: SemTabela;
    CompositeTypes: SemTabela;
  };
};
