export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      apparatus: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      bookings: {
        Row: {
          id: string;
          session_id: string;
          client_id: string;
          apparatus_id: string | null;
          status: Database['public']['Enums']['booking_status'];
          reserved_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          client_id: string;
          apparatus_id?: string | null;
          status?: Database['public']['Enums']['booking_status'];
          reserved_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          client_id?: string;
          apparatus_id?: string | null;
          status?: Database['public']['Enums']['booking_status'];
          reserved_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bookings_apparatus_id_fkey';
            columns: ['apparatus_id'];
            isOneToOne: false;
            referencedRelation: 'apparatus';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookings_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          }
        ];
      };
      class_types: {
        Row: {
          id: string;
          name: string;
          description: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
        };
        Relationships: [];
      };
      clients: {
        Row: {
          id: string;
          full_name: string;
          phone: string | null;
          email: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          full_name: string;
          phone?: string | null;
          email?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          phone?: string | null;
          email?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      client_profiles: {
        Row: {
          client_id: string;
          status: Database['public']['Enums']['client_status'];
          avatar_url: string | null;
          birthdate: string | null;
          occupation: string | null;
          notes: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          preferred_apparatus: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          client_id: string;
          status?: Database['public']['Enums']['client_status'];
          avatar_url?: string | null;
          birthdate?: string | null;
          occupation?: string | null;
          notes?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          preferred_apparatus?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          client_id?: string;
          status?: Database['public']['Enums']['client_status'];
          avatar_url?: string | null;
          birthdate?: string | null;
          occupation?: string | null;
          notes?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          preferred_apparatus?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'client_profiles_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: true;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          }
        ];
      };
      courses: {
        Row: {
          id: string;
          title: string;
          slug: string | null;
          description: string | null;
          short_description: string | null;
          price: string | null;
          currency: string;
          duration_label: string | null;
          level: string | null;
          category: string | null;
          session_count: number;
          session_duration_minutes: number;
          lead_instructor_id: string | null;
          visibility: Database['public']['Enums']['course_visibility'];
          status: Database['public']['Enums']['course_status'];
          tags: string[];
          cover_image_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          slug?: string | null;
          description?: string | null;
          short_description?: string | null;
          price?: string | null;
          currency?: string;
          duration_label?: string | null;
          level?: string | null;
          category?: string | null;
          session_count: number;
          session_duration_minutes: number;
          lead_instructor_id?: string | null;
          visibility?: Database['public']['Enums']['course_visibility'];
          status?: Database['public']['Enums']['course_status'];
          tags?: string[];
          cover_image_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          slug?: string | null;
          description?: string | null;
          short_description?: string | null;
          price?: string | null;
          currency?: string;
          duration_label?: string | null;
          level?: string | null;
          category?: string | null;
          session_count?: number;
          session_duration_minutes?: number;
          lead_instructor_id?: string | null;
          visibility?: Database['public']['Enums']['course_visibility'];
          status?: Database['public']['Enums']['course_status'];
          tags?: string[];
          cover_image_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'courses_lead_instructor_id_fkey';
            columns: ['lead_instructor_id'];
            isOneToOne: false;
            referencedRelation: 'instructors';
            referencedColumns: ['id'];
          }
        ];
      };
      instructors: {
        Row: {
          id: string;
          full_name: string;
          bio: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          full_name: string;
          bio?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          bio?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      membership_payments: {
        Row: {
          id: string;
          membership_id: string;
          amount: string;
          currency: string;
          paid_at: string;
          period_start: string;
          period_end: string;
          status: Database['public']['Enums']['payment_status'];
          provider_ref: string | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          membership_id: string;
          amount: string;
          currency?: string;
          paid_at?: string;
          period_start: string;
          period_end: string;
          status?: Database['public']['Enums']['payment_status'];
          provider_ref?: string | null;
          notes?: string | null;
        };
        Update: {
          id?: string;
          membership_id?: string;
          amount?: string;
          currency?: string;
          paid_at?: string;
          period_start?: string;
          period_end?: string;
          status?: Database['public']['Enums']['payment_status'];
          provider_ref?: string | null;
          notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'membership_payments_membership_id_fkey';
            columns: ['membership_id'];
            isOneToOne: false;
            referencedRelation: 'memberships';
            referencedColumns: ['id'];
          }
        ];
      };
      membership_types: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          billing_period: Database['public']['Enums']['billing_period'];
          access_type: Database['public']['Enums']['access_type'];
          price: string;
          currency: string;
          class_quota: number | null;
          is_active: boolean;
          created_at: string;
          trial_days: number | null;
          access_classes: boolean;
          access_courses: boolean;
          access_events: boolean;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          billing_period: Database['public']['Enums']['billing_period'];
          access_type: Database['public']['Enums']['access_type'];
          price: string;
          currency?: string;
          class_quota?: number | null;
          is_active?: boolean;
          created_at?: string;
          trial_days?: number | null;
          access_classes?: boolean;
          access_courses?: boolean;
          access_events?: boolean;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          billing_period?: Database['public']['Enums']['billing_period'];
          access_type?: Database['public']['Enums']['access_type'];
          price?: string;
          currency?: string;
          class_quota?: number | null;
          is_active?: boolean;
          created_at?: string;
          trial_days?: number | null;
          access_classes?: boolean;
          access_courses?: boolean;
          access_events?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      membership_usages: {
        Row: {
          id: string;
          membership_id: string;
          session_id: string;
          used_at: string;
          credit_delta: number;
          notes: string | null;
        };
        Insert: {
          id?: string;
          membership_id: string;
          session_id: string;
          used_at?: string;
          credit_delta?: number;
          notes?: string | null;
        };
        Update: {
          id?: string;
          membership_id?: string;
          session_id?: string;
          used_at?: string;
          credit_delta?: number;
          notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'membership_usages_membership_id_fkey';
            columns: ['membership_id'];
            isOneToOne: false;
            referencedRelation: 'memberships';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'membership_usages_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          }
        ];
      };
      memberships: {
        Row: {
          id: string;
          client_id: string;
          membership_type_id: string;
          status: Database['public']['Enums']['membership_status'];
          start_date: string;
          end_date: string;
          next_billing_date: string | null;
          auto_renew: boolean;
          assigned_session_id: string | null;
          remaining_classes: number | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          membership_type_id: string;
          status?: Database['public']['Enums']['membership_status'];
          start_date?: string;
          end_date: string;
          next_billing_date?: string | null;
          auto_renew?: boolean;
          assigned_session_id?: string | null;
          remaining_classes?: number | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          membership_type_id?: string;
          status?: Database['public']['Enums']['membership_status'];
          start_date?: string;
          end_date?: string;
          next_billing_date?: string | null;
          auto_renew?: boolean;
          assigned_session_id?: string | null;
          remaining_classes?: number | null;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'memberships_assigned_session_id_fkey';
            columns: ['assigned_session_id'];
            isOneToOne: false;
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'memberships_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'memberships_membership_type_id_fkey';
            columns: ['membership_type_id'];
            isOneToOne: false;
            referencedRelation: 'membership_types';
            referencedColumns: ['id'];
          }
        ];
      };
      qr_tokens: {
        Row: {
          booking_id: string;
          token: string;
          expires_at: string;
        };
        Insert: {
          booking_id: string;
          token: string;
          expires_at: string;
        };
        Update: {
          booking_id?: string;
          token?: string;
          expires_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'qr_tokens_booking_id_fkey';
            columns: ['booking_id'];
            isOneToOne: true;
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          }
        ];
      };
      rooms: {
        Row: {
          id: string;
          name: string;
          capacity: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          capacity: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          capacity?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      session_apparatus: {
        Row: {
          session_id: string;
          apparatus_id: string;
          quantity: number;
        };
        Insert: {
          session_id: string;
          apparatus_id: string;
          quantity: number;
        };
        Update: {
          session_id?: string;
          apparatus_id?: string;
          quantity?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'session_apparatus_apparatus_id_fkey';
            columns: ['apparatus_id'];
            isOneToOne: false;
            referencedRelation: 'apparatus';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'session_apparatus_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          }
        ];
      };
      sessions: {
        Row: {
          id: string;
          class_type_id: string;
          room_id: string;
          instructor_id: string;
          start_time: string;
          end_time: string;
          capacity: number;
          current_occupancy: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          class_type_id: string;
          room_id: string;
          instructor_id: string;
          start_time: string;
          end_time: string;
          capacity: number;
          current_occupancy?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          class_type_id?: string;
          room_id?: string;
          instructor_id?: string;
          start_time?: string;
          end_time?: string;
          capacity?: number;
          current_occupancy?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sessions_class_type_id_fkey';
            columns: ['class_type_id'];
            isOneToOne: false;
            referencedRelation: 'class_types';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sessions_instructor_id_fkey';
            columns: ['instructor_id'];
            isOneToOne: false;
            referencedRelation: 'instructors';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sessions_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: {
      [key: string]: never;
    };
    Functions: {
      renew_membership: {
        Args: {
          p_membership_id: string;
        };
        Returns: void;
      };
      set_membership_defaults: {
        Args: Record<string, never>;
        Returns: unknown;
      };
    };
    Enums: {
      access_type: 'FIXED_CLASS' | 'OPEN_CLASS';
      billing_period: 'MONTHLY' | 'ANNUAL';
      booking_status: 'CONFIRMED' | 'CANCELLED' | 'CHECKED_IN';
      client_status: 'ACTIVE' | 'PAYMENT_FAILED' | 'ON_HOLD' | 'CANCELED';
      course_status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
      course_visibility: 'PUBLIC' | 'PRIVATE';
      membership_status: 'ACTIVE' | 'INACTIVE' | 'PAUSED' | 'CANCELED';
      payment_status: 'SUCCESS' | 'FAILED' | 'REFUNDED' | 'PENDING';
    };
    CompositeTypes: {
      [key: string]: never;
    };
  };
};

export type PublicSchema = Database['public'];

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update'];
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T];


