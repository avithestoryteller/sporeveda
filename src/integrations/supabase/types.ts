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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      bag_stage_history: {
        Row: {
          bag_id: string
          changed_at: string
          changed_by: string | null
          id: string
          notes: string | null
          org_id: string
          stage: Database["public"]["Enums"]["bag_stage"]
        }
        Insert: {
          bag_id: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          notes?: string | null
          org_id: string
          stage: Database["public"]["Enums"]["bag_stage"]
        }
        Update: {
          bag_id?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          stage?: Database["public"]["Enums"]["bag_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "bag_stage_history_bag_id_fkey"
            columns: ["bag_id"]
            isOneToOne: false
            referencedRelation: "bags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bag_stage_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bags: {
        Row: {
          bag_code: string
          bag_number: number
          batch_id: string
          created_at: string
          current_stage: Database["public"]["Enums"]["bag_stage"]
          farm_id: string
          id: string
          is_discarded: boolean
          net_weight_kg: number | null
          org_id: string
          species_id: string
          updated_at: string
        }
        Insert: {
          bag_code: string
          bag_number: number
          batch_id: string
          created_at?: string
          current_stage?: Database["public"]["Enums"]["bag_stage"]
          farm_id: string
          id?: string
          is_discarded?: boolean
          net_weight_kg?: number | null
          org_id: string
          species_id: string
          updated_at?: string
        }
        Update: {
          bag_code?: string
          bag_number?: number
          batch_id?: string
          created_at?: string
          current_stage?: Database["public"]["Enums"]["bag_stage"]
          farm_id?: string
          id?: string
          is_discarded?: boolean
          net_weight_kg?: number | null
          org_id?: string
          species_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bags_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bags_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_profitability"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "bags_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_contamination_rate_by_batch"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "bags_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_yield_by_batch"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "bags_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "farms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bags_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "v_farm_species_performance"
            referencedColumns: ["farm_id"]
          },
          {
            foreignKeyName: "bags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bags_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
      batches: {
        Row: {
          batch_code: string
          created_at: string
          dry_substrate_weight_kg: number | null
          farm_id: string
          id: string
          inoculation_date: string
          notes: string | null
          org_id: string
          species_id: string
          substrate_type: string | null
        }
        Insert: {
          batch_code: string
          created_at?: string
          dry_substrate_weight_kg?: number | null
          farm_id: string
          id?: string
          inoculation_date: string
          notes?: string | null
          org_id: string
          species_id: string
          substrate_type?: string | null
        }
        Update: {
          batch_code?: string
          created_at?: string
          dry_substrate_weight_kg?: number | null
          farm_id?: string
          id?: string
          inoculation_date?: string
          notes?: string | null
          org_id?: string
          species_id?: string
          substrate_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "farms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "v_farm_species_performance"
            referencedColumns: ["farm_id"]
          },
          {
            foreignKeyName: "batches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
      contamination_events: {
        Row: {
          action_taken: Database["public"]["Enums"]["contamination_action"]
          bag_id: string
          contaminant_type: string | null
          created_at: string
          detected_at: string
          id: string
          notes: string | null
          org_id: string
          severity: Database["public"]["Enums"]["contamination_severity"]
        }
        Insert: {
          action_taken?: Database["public"]["Enums"]["contamination_action"]
          bag_id: string
          contaminant_type?: string | null
          created_at?: string
          detected_at?: string
          id?: string
          notes?: string | null
          org_id: string
          severity: Database["public"]["Enums"]["contamination_severity"]
        }
        Update: {
          action_taken?: Database["public"]["Enums"]["contamination_action"]
          bag_id?: string
          contaminant_type?: string | null
          created_at?: string
          detected_at?: string
          id?: string
          notes?: string | null
          org_id?: string
          severity?: Database["public"]["Enums"]["contamination_severity"]
        }
        Relationships: [
          {
            foreignKeyName: "contamination_events_bag_id_fkey"
            columns: ["bag_id"]
            isOneToOne: false
            referencedRelation: "bags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contamination_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      costs: {
        Row: {
          amount: number
          batch_id: string | null
          category: string
          cost_type: string
          created_at: string
          created_by: string | null
          description: string | null
          farm_id: string | null
          id: string
          incurred_date: string
          notes: string | null
          org_id: string
          recurrence_interval: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          batch_id?: string | null
          category: string
          cost_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          farm_id?: string | null
          id?: string
          incurred_date?: string
          notes?: string | null
          org_id: string
          recurrence_interval?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          batch_id?: string | null
          category?: string
          cost_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          farm_id?: string | null
          id?: string
          incurred_date?: string
          notes?: string | null
          org_id?: string
          recurrence_interval?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "costs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_profitability"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "costs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_contamination_rate_by_batch"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "costs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_yield_by_batch"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "costs_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "farms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costs_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "v_farm_species_performance"
            referencedColumns: ["farm_id"]
          },
          {
            foreignKeyName: "costs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      environment_readings: {
        Row: {
          avg_humidity_pct: number | null
          avg_temp_c: number | null
          created_at: string
          farm_id: string
          id: string
          max_humidity_pct: number | null
          max_temp_c: number | null
          min_humidity_pct: number | null
          min_temp_c: number | null
          notes: string | null
          org_id: string
          reading_date: string
          recorded_by: string | null
          source: string
        }
        Insert: {
          avg_humidity_pct?: number | null
          avg_temp_c?: number | null
          created_at?: string
          farm_id: string
          id?: string
          max_humidity_pct?: number | null
          max_temp_c?: number | null
          min_humidity_pct?: number | null
          min_temp_c?: number | null
          notes?: string | null
          org_id: string
          reading_date: string
          recorded_by?: string | null
          source?: string
        }
        Update: {
          avg_humidity_pct?: number | null
          avg_temp_c?: number | null
          created_at?: string
          farm_id?: string
          id?: string
          max_humidity_pct?: number | null
          max_temp_c?: number | null
          min_humidity_pct?: number | null
          min_temp_c?: number | null
          notes?: string | null
          org_id?: string
          reading_date?: string
          recorded_by?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "environment_readings_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "farms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "environment_readings_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "v_farm_species_performance"
            referencedColumns: ["farm_id"]
          },
          {
            foreignKeyName: "environment_readings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      farms: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          location_notes: string | null
          name: string
          org_id: string
          target_colonization_humidity_max_pct: number | null
          target_colonization_humidity_min_pct: number | null
          target_colonization_temp_max: number | null
          target_colonization_temp_min: number | null
          target_fruiting_humidity_max_pct: number | null
          target_fruiting_humidity_min_pct: number | null
          target_fruiting_temp_max: number | null
          target_fruiting_temp_min: number | null
          target_humidity_max_pct: number | null
          target_humidity_min_pct: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          location_notes?: string | null
          name: string
          org_id: string
          target_colonization_humidity_max_pct?: number | null
          target_colonization_humidity_min_pct?: number | null
          target_colonization_temp_max?: number | null
          target_colonization_temp_min?: number | null
          target_fruiting_humidity_max_pct?: number | null
          target_fruiting_humidity_min_pct?: number | null
          target_fruiting_temp_max?: number | null
          target_fruiting_temp_min?: number | null
          target_humidity_max_pct?: number | null
          target_humidity_min_pct?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          location_notes?: string | null
          name?: string
          org_id?: string
          target_colonization_humidity_max_pct?: number | null
          target_colonization_humidity_min_pct?: number | null
          target_colonization_temp_max?: number | null
          target_colonization_temp_min?: number | null
          target_fruiting_humidity_max_pct?: number | null
          target_fruiting_humidity_min_pct?: number | null
          target_fruiting_temp_max?: number | null
          target_fruiting_temp_min?: number | null
          target_humidity_max_pct?: number | null
          target_humidity_min_pct?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "farms_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      harvests: {
        Row: {
          bag_id: string
          created_at: string
          flush_number: number
          harvest_date: string
          id: string
          notes: string | null
          org_id: string
          wet_weight_g: number
        }
        Insert: {
          bag_id: string
          created_at?: string
          flush_number: number
          harvest_date: string
          id?: string
          notes?: string | null
          org_id: string
          wet_weight_g: number
        }
        Update: {
          bag_id?: string
          created_at?: string
          flush_number?: number
          harvest_date?: string
          id?: string
          notes?: string | null
          org_id?: string
          wet_weight_g?: number
        }
        Relationships: [
          {
            foreignKeyName: "harvests_bag_id_fkey"
            columns: ["bag_id"]
            isOneToOne: false
            referencedRelation: "bags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      revenue: {
        Row: {
          amount: number
          batch_id: string | null
          buyer: string | null
          created_at: string
          created_by: string | null
          farm_id: string | null
          id: string
          notes: string | null
          org_id: string
          payment_method: string | null
          price_per_kg: number | null
          quantity_kg: number | null
          sale_date: string
          species_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          batch_id?: string | null
          buyer?: string | null
          created_at?: string
          created_by?: string | null
          farm_id?: string | null
          id?: string
          notes?: string | null
          org_id: string
          payment_method?: string | null
          price_per_kg?: number | null
          quantity_kg?: number | null
          sale_date?: string
          species_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          batch_id?: string | null
          buyer?: string | null
          created_at?: string
          created_by?: string | null
          farm_id?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          payment_method?: string | null
          price_per_kg?: number | null
          quantity_kg?: number | null
          sale_date?: string
          species_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_profitability"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "revenue_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_contamination_rate_by_batch"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "revenue_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_yield_by_batch"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "revenue_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "farms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "v_farm_species_performance"
            referencedColumns: ["farm_id"]
          },
          {
            foreignKeyName: "revenue_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
      species: {
        Row: {
          common_name: string
          created_at: string
          id: string
          org_id: string | null
          rec_colonization_temp_max: number | null
          rec_colonization_temp_min: number | null
          rec_fruiting_temp_max: number | null
          rec_fruiting_temp_min: number | null
          rec_humidity_max_pct: number | null
          rec_humidity_min_pct: number | null
          scientific_name: string | null
        }
        Insert: {
          common_name: string
          created_at?: string
          id?: string
          org_id?: string | null
          rec_colonization_temp_max?: number | null
          rec_colonization_temp_min?: number | null
          rec_fruiting_temp_max?: number | null
          rec_fruiting_temp_min?: number | null
          rec_humidity_max_pct?: number | null
          rec_humidity_min_pct?: number | null
          scientific_name?: string | null
        }
        Update: {
          common_name?: string
          created_at?: string
          id?: string
          org_id?: string | null
          rec_colonization_temp_max?: number | null
          rec_colonization_temp_min?: number | null
          rec_fruiting_temp_max?: number | null
          rec_fruiting_temp_min?: number | null
          rec_humidity_max_pct?: number | null
          rec_humidity_min_pct?: number | null
          scientific_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "species_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_batch_profitability: {
        Row: {
          batch_code: string | null
          batch_id: string | null
          net_margin: number | null
          org_id: string | null
          species_name: string | null
          total_cost: number | null
          total_revenue: number | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_contamination_rate_by_batch: {
        Row: {
          batch_code: string | null
          batch_id: string | null
          contaminated_bags: number | null
          contamination_rate_pct: number | null
          org_id: string | null
          species_id: string | null
          total_bags: number | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
      v_cost_breakdown_by_category: {
        Row: {
          category: string | null
          entry_count: number | null
          incurred_date: string | null
          org_id: string | null
          total_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "costs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_cumulative_financials: {
        Row: {
          cumulative_cost: number | null
          cumulative_net: number | null
          cumulative_revenue: number | null
          day: string | null
          org_id: string | null
        }
        Relationships: []
      }
      v_farm_species_performance: {
        Row: {
          avg_biological_efficiency_pct: number | null
          avg_contamination_rate_pct: number | null
          batch_count: number | null
          farm_id: string | null
          farm_name: string | null
          org_id: string | null
          species_id: string | null
          species_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "farms_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_monthly_financials: {
        Row: {
          month: string | null
          net_profit: number | null
          org_id: string | null
          total_cost: number | null
          total_revenue: number | null
        }
        Relationships: []
      }
      v_yield_by_batch: {
        Row: {
          batch_code: string | null
          batch_id: string | null
          biological_efficiency_pct: number | null
          dry_substrate_weight_kg: number | null
          org_id: string | null
          species_id: string | null
          total_wet_yield_kg: number | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      user_org_ids: { Args: never; Returns: string[] }
      user_role_in_org: {
        Args: { target_org: string }
        Returns: Database["public"]["Enums"]["org_role"]
      }
    }
    Enums: {
      bag_stage:
        | "prep"
        | "colonizing"
        | "bulking"
        | "fruiting"
        | "harvested"
        | "discarded"
      contamination_action: "monitoring" | "isolated" | "discarded"
      contamination_severity: "minor" | "moderate" | "severe"
      org_role: "owner" | "admin" | "member" | "viewer"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      bag_stage: [
        "prep",
        "colonizing",
        "bulking",
        "fruiting",
        "harvested",
        "discarded",
      ],
      contamination_action: ["monitoring", "isolated", "discarded"],
      contamination_severity: ["minor", "moderate", "severe"],
      org_role: ["owner", "admin", "member", "viewer"],
    },
  },
} as const
