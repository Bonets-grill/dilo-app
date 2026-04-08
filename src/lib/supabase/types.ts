export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          phone: string | null;
          avatar_url: string | null;
          locale: string;
          language: string;
          timezone: string;
          currency: string;
          plan: 'free' | 'premium';
          daily_messages_used: number;
          daily_messages_reset_at: string;
          onboarded: boolean;
          preferences: Json;
          stripe_customer_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'language' | 'created_at' | 'updated_at' | 'daily_messages_used' | 'daily_messages_reset_at' | 'onboarded' | 'preferences'> & {
          daily_messages_used?: number;
          daily_messages_reset_at?: string;
          onboarded?: boolean;
          preferences?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['users']['Insert']>;
      };
      user_skills: {
        Row: {
          id: string;
          user_id: string;
          skill_id: string;
          source: string;
          stripe_subscription_id: string | null;
          status: 'active' | 'cancelled' | 'past_due' | 'trialing';
          trial_ends_at: string | null;
          activated_at: string;
          expires_at: string | null;
        };
        Insert: {
          user_id: string;
          skill_id: string;
          source?: string;
          stripe_subscription_id?: string | null;
          status?: string;
          trial_ends_at?: string | null;
          expires_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['user_skills']['Insert']>;
      };
      skill_catalog: {
        Row: {
          id: string;
          name_es: string;
          name_en: string;
          name_fr: string;
          name_it: string;
          name_de: string;
          description_es: string | null;
          description_en: string | null;
          description_fr: string | null;
          description_it: string | null;
          description_de: string | null;
          icon: string;
          category: string;
          tools: string[];
          price_eur: number;
          price_usd: number;
          price_mxn: number;
          price_cop: number;
          price_cad: number;
          stripe_price_id_eur: string | null;
          stripe_price_id_usd: string | null;
          stripe_price_id_mxn: string | null;
          stripe_price_id_cop: string | null;
          stripe_price_id_cad: string | null;
          sort_order: number;
          active: boolean;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['skill_catalog']['Row'], 'created_at' | 'sort_order' | 'active'> & {
          sort_order?: number;
          active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['skill_catalog']['Insert']>;
      };
      skill_packs: {
        Row: {
          id: string;
          name_es: string;
          name_en: string;
          name_fr: string;
          name_it: string;
          name_de: string;
          description_es: string | null;
          description_en: string | null;
          description_fr: string | null;
          description_it: string | null;
          description_de: string | null;
          skill_ids: string[];
          price_eur: number;
          price_usd: number;
          price_mxn: number;
          price_cop: number;
          price_cad: number;
          stripe_price_id_eur: string | null;
          stripe_price_id_usd: string | null;
          stripe_price_id_mxn: string | null;
          stripe_price_id_cop: string | null;
          stripe_price_id_cad: string | null;
          discount_percent: number;
          sort_order: number;
          active: boolean;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['skill_packs']['Row'], 'created_at' | 'sort_order' | 'active' | 'discount_percent'> & {
          sort_order?: number;
          active?: boolean;
          discount_percent?: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['skill_packs']['Insert']>;
      };
      channels: {
        Row: {
          id: string;
          user_id: string;
          type: 'whatsapp' | 'telegram';
          instance_id: string | null;
          instance_name: string | null;
          phone: string | null;
          status: 'disconnected' | 'connecting' | 'connected';
          qr_code: string | null;
          connected_at: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          user_id: string;
          type: 'whatsapp' | 'telegram';
          instance_id?: string | null;
          instance_name?: string | null;
          phone?: string | null;
          status?: string;
          qr_code?: string | null;
          metadata?: Json;
        };
        Update: Partial<Database['public']['Tables']['channels']['Insert']>;
      };
      conversations: {
        Row: {
          id: string;
          user_id: string;
          title: string | null;
          pinned: boolean;
          message_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          title?: string | null;
          pinned?: boolean;
          message_count?: number;
        };
        Update: Partial<Database['public']['Tables']['conversations']['Insert']>;
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          user_id: string;
          role: 'user' | 'assistant' | 'tool' | 'system';
          content: string;
          tool_name: string | null;
          tool_input: Json | null;
          tool_result: Json | null;
          skill_id: string | null;
          model: string | null;
          tokens_input: number | null;
          tokens_output: number | null;
          latency_ms: number | null;
          created_at: string;
        };
        Insert: {
          conversation_id: string;
          user_id: string;
          role: string;
          content: string;
          tool_name?: string | null;
          tool_input?: Json | null;
          tool_result?: Json | null;
          skill_id?: string | null;
          model?: string | null;
          tokens_input?: number | null;
          tokens_output?: number | null;
          latency_ms?: number | null;
        };
        Update: Partial<Database['public']['Tables']['messages']['Insert']>;
      };
      contacts: {
        Row: {
          id: string;
          user_id: string;
          phone: string | null;
          name: string | null;
          whatsapp_jid: string | null;
          telegram_id: string | null;
          alias: string | null;
          tags: string[] | null;
          last_message_at: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          phone?: string | null;
          name?: string | null;
          whatsapp_jid?: string | null;
          telegram_id?: string | null;
          alias?: string | null;
          tags?: string[] | null;
        };
        Update: Partial<Database['public']['Tables']['contacts']['Insert']>;
      };
      reminders: {
        Row: {
          id: string;
          user_id: string;
          text: string;
          due_at: string;
          repeat_type: 'once' | 'daily' | 'weekly' | 'monthly' | null;
          repeat_count: number;
          repeats_sent: number;
          channel: 'push' | 'whatsapp' | 'telegram';
          target_phone: string | null;
          target_name: string | null;
          status: 'pending' | 'sent' | 'cancelled';
          created_at: string;
        };
        Insert: {
          user_id: string;
          text: string;
          due_at: string;
          repeat_type?: string | null;
          repeat_count?: number;
          channel?: string;
          target_phone?: string | null;
          target_name?: string | null;
        };
        Update: Partial<Database['public']['Tables']['reminders']['Insert']> & {
          repeats_sent?: number;
          status?: string;
        };
      };
      expenses: {
        Row: {
          id: string;
          user_id: string;
          amount: number;
          currency: string;
          category: string;
          description: string | null;
          date: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          amount: number;
          category: string;
          currency?: string;
          description?: string | null;
          date?: string;
        };
        Update: Partial<Database['public']['Tables']['expenses']['Insert']>;
      };
      budgets: {
        Row: {
          id: string;
          user_id: string;
          month: string;
          amount: number;
          currency: string;
        };
        Insert: {
          user_id: string;
          month: string;
          amount: number;
          currency?: string;
        };
        Update: Partial<Database['public']['Tables']['budgets']['Insert']>;
      };
      lists: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          type: 'checklist' | 'notes';
          created_at: string;
        };
        Insert: {
          user_id: string;
          name: string;
          type?: string;
        };
        Update: Partial<Database['public']['Tables']['lists']['Insert']>;
      };
      list_items: {
        Row: {
          id: string;
          list_id: string;
          text: string;
          checked: boolean;
          sort_order: number;
        };
        Insert: {
          list_id: string;
          text: string;
          checked?: boolean;
          sort_order?: number;
        };
        Update: Partial<Database['public']['Tables']['list_items']['Insert']>;
      };
      message_queue: {
        Row: {
          id: string;
          user_id: string;
          channel_type: 'whatsapp' | 'telegram';
          target_phone: string;
          target_name: string | null;
          content: string;
          media_url: string | null;
          scheduled_at: string;
          status: 'pending' | 'sent' | 'failed' | 'cancelled';
          sent_at: string | null;
          error: string | null;
          retry_count: number;
          created_at: string;
        };
        Insert: {
          user_id: string;
          channel_type: string;
          target_phone: string;
          target_name?: string | null;
          content: string;
          media_url?: string | null;
          scheduled_at: string;
        };
        Update: Partial<Database['public']['Tables']['message_queue']['Insert']> & {
          status?: string;
          sent_at?: string | null;
          error?: string | null;
          retry_count?: number;
        };
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          keys: Json;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          endpoint: string;
          keys: Json;
          user_agent?: string | null;
        };
        Update: Partial<Database['public']['Tables']['push_subscriptions']['Insert']>;
      };
      analytics_events: {
        Row: {
          id: string;
          user_id: string | null;
          event_type: string;
          event_data: Json;
          skill_id: string | null;
          locale: string | null;
          created_at: string;
        };
        Insert: {
          user_id?: string | null;
          event_type: string;
          event_data?: Json;
          skill_id?: string | null;
          locale?: string | null;
        };
        Update: Partial<Database['public']['Tables']['analytics_events']['Insert']>;
      };
    };
  };
}

// Helper types
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];

export type User = Tables<'users'>;
export type UserSkill = Tables<'user_skills'>;
export type SkillCatalog = Tables<'skill_catalog'>;
export type SkillPack = Tables<'skill_packs'>;
export type Channel = Tables<'channels'>;
export type Conversation = Tables<'conversations'>;
export type Message = Tables<'messages'>;
export type Contact = Tables<'contacts'>;
export type Reminder = Tables<'reminders'>;
export type Expense = Tables<'expenses'>;
export type Budget = Tables<'budgets'>;
export type List = Tables<'lists'>;
export type ListItem = Tables<'list_items'>;
export type MessageQueue = Tables<'message_queue'>;
export type PushSubscription = Tables<'push_subscriptions'>;
export type AnalyticsEvent = Tables<'analytics_events'>;
