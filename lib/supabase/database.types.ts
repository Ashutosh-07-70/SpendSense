export type Database = {
  public: {
    Tables: {
      finance_transactions: {
        Row: { id: string; user_id: string; source_id: string; name: string; category: string; transaction_date: string; amount_cents: number; type: string; note: string | null; payment_method: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; user_id?: string; source_id: string; name: string; category: string; transaction_date: string; amount_cents: number; type: string; note?: string | null; payment_method?: string | null; created_at?: string; updated_at?: string };
        Update: { name?: string; category?: string; transaction_date?: string; amount_cents?: number; type?: string; note?: string | null; payment_method?: string | null };
        Relationships: [];
      };
      finance_budgets: {
        Row: { id: string; user_id: string; source_id: string; category: string; limit_cents: number; created_at: string; updated_at: string };
        Insert: { id?: string; user_id?: string; source_id: string; category: string; limit_cents: number; created_at?: string; updated_at?: string };
        Update: { category?: string; limit_cents?: number };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      replace_my_finance_data: { Args: { p_transactions: unknown; p_budgets: unknown }; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
