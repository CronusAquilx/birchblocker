export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      memories: {
        Row: {
          content: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          created_at: string
          id: string
          parts: Json
          role: string
          thread_id: string
          ui_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          parts?: Json
          role: string
          thread_id: string
          ui_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          parts?: Json
          role?: string
          thread_id?: string
          ui_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      models: {
        Row: {
          capabilities: string[]
          config: Json
          context_length: number
          created_at: string
          description: string | null
          display_name: string
          enabled: boolean
          id: string
          provider: string
          sort_order: number
          usage_multiplier: number
        }
        Insert: {
          capabilities?: string[]
          config?: Json
          context_length?: number
          created_at?: string
          description?: string | null
          display_name: string
          enabled?: boolean
          id: string
          provider: string
          sort_order?: number
          usage_multiplier?: number
        }
        Update: {
          capabilities?: string[]
          config?: Json
          context_length?: number
          created_at?: string
          description?: string | null
          display_name?: string
          enabled?: boolean
          id?: string
          provider?: string
          sort_order?: number
          usage_multiplier?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      provider_keys: {
        Row: {
          api_key: string | null
          base_url: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          api_key?: string | null
          base_url: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          api_key?: string | null
          base_url?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      reasoning_levels: {
        Row: {
          id: string
          label: string
          max_steps: number
          multiplier: number
          sort_order: number
        }
        Insert: {
          id: string
          label: string
          max_steps: number
          multiplier: number
          sort_order: number
        }
        Update: {
          id?: string
          label?: string
          max_steps?: number
          multiplier?: number
          sort_order?: number
        }
        Relationships: []
      }
      threads: {
        Row: {
          created_at: string
          id: string
          model_id: string
          reasoning: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          model_id?: string
          reasoning?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          model_id?: string
          reasoning?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tools: {
        Row: {
          description: string
          display_name: string
          enabled: boolean
          id: string
          permission: string
          sort_order: number
        }
        Insert: {
          description: string
          display_name: string
          enabled?: boolean
          id: string
          permission?: string
          sort_order?: number
        }
        Update: {
          description?: string
          display_name?: string
          enabled?: boolean
          id?: string
          permission?: string
          sort_order?: number
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          created_at: string
          id: string
          input_tokens: number
          model_id: string
          output_tokens: number
          reasoning: string
          thread_id: string | null
          units: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          input_tokens?: number
          model_id: string
          output_tokens?: number
          reasoning: string
          thread_id?: string | null
          units?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          input_tokens?: number
          model_id?: string
          output_tokens?: number
          reasoning?: string
          thread_id?: string | null
          units?: number
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      watch_history: {
        Row: {
          episode: number | null
          id: string
          media_type: string
          poster_path: string | null
          progress: number | null
          season: number | null
          title: string | null
          tmdb_id: number
          user_id: string
          watched_at: string
        }
        Insert: {
          episode?: number | null
          id?: string
          media_type?: string
          poster_path?: string | null
          progress?: number | null
          season?: number | null
          title?: string | null
          tmdb_id: number
          user_id: string
          watched_at?: string
        }
        Update: {
          episode?: number | null
          id?: string
          media_type?: string
          poster_path?: string | null
          progress?: number | null
          season?: number | null
          title?: string | null
          tmdb_id?: number
          user_id?: string
          watched_at?: string
        }
        Relationships: []
      }
      watchlist: {
        Row: {
          added_at: string
          id: string
          media_type: string
          poster_path: string | null
          title: string | null
          tmdb_id: number
          user_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          media_type?: string
          poster_path?: string | null
          title?: string | null
          tmdb_id: number
          user_id: string
        }
        Update: {
          added_at?: string
          id?: string
          media_type?: string
          poster_path?: string | null
          title?: string | null
          tmdb_id?: number
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
