export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      queue_numbers: {
        Row: {
          id: string
          number: number
          status: 'waiting' | 'current' | 'completed'
          created_at: string
          called_at: string | null
          completed_at: string | null
        }
        Insert: {
          id?: string
          number: number
          status?: 'waiting' | 'current' | 'completed'
          created_at?: string
          called_at?: string | null
          completed_at?: string | null
        }
        Update: {
          id?: string
          number?: number
          status?: 'waiting' | 'current' | 'completed'
          created_at?: string
          called_at?: string | null
          completed_at?: string | null
        }
        Relationships: []
      }
      queue_state: {
        Row: {
          id: string
          current_number: number | null
          next_number: number | null
          updated_at: string
        }
        Insert: {
          id?: string
          current_number?: number | null
          next_number?: number | null
          updated_at?: string
        }
        Update: {
          id?: string
          current_number?: number | null
          next_number?: number | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
